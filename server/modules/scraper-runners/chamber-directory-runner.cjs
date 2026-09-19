const fs = require("fs");
const path = require("path");
const { scrapeDirectoryViaBingRss, emitProgress } = require("./bing-rss-utils.cjs");

function getArgValue(flag) {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return process.argv[index + 1];
}

function normalizeDomain(value = "") {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

async function run() {
  const inputPath = path.resolve(getArgValue("--input"));
  const outputPath = path.resolve(getArgValue("--output"));
  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const businessType = String(payload.businessType || "").trim();
  const location = String(payload.location || "").trim();
  const directoryDomain = normalizeDomain(payload.directoryDomain || "");
  const maxItems = Number(payload.maxItems || 20);

  if (!businessType || !location) {
    throw new Error("businessType and location are required");
  }

  emitProgress({ percent: 1, message: "Chamber directory discovery started", totalFound: 0 });

  const baseQuery = directoryDomain
    ? `site:${directoryDomain} ${businessType} ${location}`
    : `site:chamberofcommerce.com ${businessType} ${location}`;

  let results = await scrapeDirectoryViaBingRss({
    query: baseQuery,
    category: businessType,
    location,
    maxItems,
    domainFilters: directoryDomain ? [directoryDomain] : ["chamberofcommerce.com"],
    blockedPathIncludes: ["/search"],
  });

  if (results.length === 0 && !directoryDomain) {
    emitProgress({ percent: 55, message: "Strict chamber filter returned no rows, using broader fallback", totalFound: 0 });
    results = await scrapeDirectoryViaBingRss({
      query: `chamber of commerce ${businessType} ${location}`,
      category: businessType,
      location,
      maxItems,
      domainFilters: ["chamberofcommerce.com"],
      blockedPathIncludes: ["/search"],
    });
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  emitProgress({ percent: 100, message: `Chamber directory discovery finished with ${results.length} rows`, totalFound: results.length });
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[chamber-directory-runner] ${message}`);
  process.exit(1);
});
