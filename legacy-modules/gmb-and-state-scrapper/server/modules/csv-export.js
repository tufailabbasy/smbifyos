const fs = require("fs/promises");
const path = require("path");
const { Parser } = require("json2csv");
const { getJob } = require("./job-manager");
const { getOutputDir } = require("./storage-paths");

const CSV_FIELDS = [
  { label: "Business Name", value: "Business Name" },
  { label: "Status", value: "Status" },
  { label: "City", value: "City" },
  { label: "State", value: "State" },
  { label: "Zip", value: "Zip" },
  { label: "Agent Name", value: "Agent Name" },
  { label: "Agent Address", value: "Agent Address" },
  { label: "Phone", value: "Phone" },
  { label: "Source URL", value: "Source URL" },
  { label: "Job ID", value: "Job ID" },
];

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function sanitizeFilePart(value = "", fallback = "unknown") {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function getTodayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function mapResultToCsvRow(result, jobId) {
  return {
    "Business Name": cleanText(result.businessName),
    Status: cleanText(result.status),
    City: cleanText(result.city),
    State: cleanText(result.state),
    Zip: cleanText(result.zip),
    "Agent Name": cleanText(result.agentName),
    "Agent Address": cleanText(result.agentAddress),
    Phone: cleanText(result.phone),
    "Source URL": cleanText(result.sourceUrl),
    "Job ID": cleanText(jobId),
  };
}

async function ensureOutputDir() {
  await fs.mkdir(getOutputDir(), { recursive: true });
}

async function generateCSV(jobId, results) {
  try {
    const normalizedJobId = cleanText(jobId);

    if (!normalizedJobId) {
      throw new Error("Missing jobId for CSV export.");
    }

    if (!Array.isArray(results)) {
      throw new Error("Results must be an array for CSV export.");
    }

    const job = getJob(normalizedJobId);
    const state = sanitizeFilePart(job?.state, "unknown-state");
    const businessType = sanitizeFilePart(
      job?.businessType,
      "unknown-business-type"
    );
    const dateStamp = getTodayStamp();
    const fileName = `${state}_${businessType}_${dateStamp}_${normalizedJobId}.csv`;
    const filePath = path.join(getOutputDir(), fileName);

    console.log(
      `[csv-export] Generating CSV for job ${normalizedJobId} with ${results.length} records`
    );

    const rows = results.map((result) => mapResultToCsvRow(result, normalizedJobId));
    const parser = new Parser({ fields: CSV_FIELDS });
    const csv = parser.parse(rows);

    await ensureOutputDir();
    await fs.writeFile(filePath, `${csv}\n`, "utf8");

    console.log(`[csv-export] Saved CSV to ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`[csv-export] Failed to generate CSV: ${error.message}`);
    throw error;
  }
}

module.exports = {
  generateCSV,
  CSV_FIELDS,
};
