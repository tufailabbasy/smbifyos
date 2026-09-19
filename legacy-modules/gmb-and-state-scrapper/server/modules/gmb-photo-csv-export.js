const fs = require("fs/promises");
const path = require("path");
const { Parser } = require("json2csv");
const { getOutputDir } = require("./storage-paths");

const CSV_FIELDS = [
  { label: "Query Keyword", value: "Query Keyword" },
  { label: "Query Location", value: "Query Location" },
  { label: "Job ID", value: "Job ID" },
  { label: "Job Status", value: "Job Status" },
  { label: "Best Rank", value: "Best Rank" },
  { label: "Business Name", value: "Business Name" },
  { label: "Primary Category", value: "Primary Category" },
  { label: "Subcategories", value: "Subcategories" },
  { label: "Address", value: "Address" },
  { label: "Primary Phone", value: "Primary Phone" },
  { label: "Extra Phones", value: "Extra Phones" },
  { label: "Website", value: "Website" },
  { label: "Website Domain", value: "Website Domain" },
  { label: "Emails", value: "Emails" },
  { label: "Social Profiles", value: "Social Profiles" },
  { label: "Rating", value: "Rating" },
  { label: "Reviews", value: "Reviews" },
  { label: "Owner Replies Visible", value: "Owner Replies Visible" },
  { label: "Lead Score", value: "Lead Score" },
  { label: "Lead Tier", value: "Lead Tier" },
  { label: "Requested Photos", value: "Requested Photos" },
  { label: "Saved Photos", value: "Saved Photos" },
  { label: "Download Folder", value: "Download Folder" },
  { label: "Service Options", value: "Service Options" },
  { label: "Accessibility", value: "Accessibility" },
  { label: "Amenities", value: "Amenities" },
  { label: "Highlights", value: "Highlights" },
  { label: "Payments", value: "Payments" },
  { label: "Google Maps Link", value: "Google Maps Link" },
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

function joinValues(values) {
  if (!Array.isArray(values)) {
    return cleanText(values);
  }

  return values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" | ");
}

function normalizeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : "";
}

function getListingKey(record = {}) {
  const listingId = cleanText(record.listingId);
  const placeId = cleanText(record.placeId);
  const googleId = cleanText(record.googleId);

  if (listingId) return `listing:${listingId}`;
  if (placeId) return `place:${placeId}`;
  if (googleId) return `google:${googleId}`;

  const fallback = [cleanText(record.name), cleanText(record.address)]
    .filter(Boolean)
    .join("::");

  return fallback || `row:${Math.random().toString(36).slice(2)}`;
}

function buildBaseRow(job = {}, listing = {}) {
  return {
    "Query Keyword": cleanText(job.keyword),
    "Query Location": cleanText(job.location),
    "Job ID": cleanText(job.jobId),
    "Job Status": cleanText(job.status),
    "Best Rank": normalizeNumber(listing.bestRank),
    "Business Name": cleanText(listing.name),
    "Primary Category": cleanText(listing.category),
    Subcategories: joinValues(listing.subtypes),
    Address: cleanText(listing.address),
    "Primary Phone": cleanText(listing.phone),
    "Extra Phones": joinValues(listing.extraPhones),
    Website: cleanText(listing.website),
    "Website Domain": cleanText(listing.websiteDomain),
    Emails: joinValues(listing.emails),
    "Social Profiles": joinValues(listing.socials),
    Rating: normalizeNumber(listing.rating),
    Reviews: normalizeNumber(String(listing.reviews || "").replace(/,/g, "")),
    "Owner Replies Visible": normalizeNumber(listing.ownerRepliesVisibleCount),
    "Lead Score": normalizeNumber(listing.leadScore),
    "Lead Tier": cleanText(listing.leadTier),
    "Requested Photos": normalizeNumber(job.photosPerListing),
    "Saved Photos": normalizeNumber(listing.downloadedPhotoCount || listing.photoCount),
    "Download Folder": cleanText(listing.downloadDirectory),
    "Service Options": joinValues(listing.serviceOptions),
    Accessibility: joinValues(listing.accessibility),
    Amenities: joinValues(listing.amenities),
    Highlights: joinValues(listing.highlights),
    Payments: joinValues(listing.payments),
    "Google Maps Link": cleanText(listing.locationLink),
  };
}

function buildRows(job = {}) {
  const rowsByKey = new Map();

  (Array.isArray(job.listings) ? job.listings : []).forEach((listing) => {
    rowsByKey.set(getListingKey(listing), buildBaseRow(job, listing));
  });

  (Array.isArray(job.photoItems) ? job.photoItems : []).forEach((item) => {
    const key = getListingKey(item);
    const existing = rowsByKey.get(key) || buildBaseRow(job, item);

    rowsByKey.set(key, {
      ...existing,
      ...buildBaseRow(job, item),
      "Saved Photos": normalizeNumber(item.downloadedPhotoCount || item.photoCount),
      "Download Folder": cleanText(item.downloadDirectory),
    });
  });

  return Array.from(rowsByKey.values());
}

function getTodayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureOutputDir() {
  await fs.mkdir(getOutputDir(), { recursive: true });
}

async function generateGmbPhotoCsv(job = {}) {
  const normalizedJobId = cleanText(job.jobId);

  if (!normalizedJobId) {
    throw new Error("Missing jobId for GMB CSV export.");
  }

  const fileName = `gmb_${sanitizeFilePart(job.keyword, "keyword")}_${sanitizeFilePart(
    job.location,
    "location"
  )}_${getTodayStamp()}_${sanitizeFilePart(normalizedJobId, "job")}.csv`;
  const filePath = path.join(getOutputDir(), fileName);
  const parser = new Parser({ fields: CSV_FIELDS });
  const rows = buildRows(job);
  const csv = parser.parse(rows);

  await ensureOutputDir();
  await fs.writeFile(filePath, `${csv}\n`, "utf8");

  return filePath;
}

module.exports = {
  generateGmbPhotoCsv,
};
