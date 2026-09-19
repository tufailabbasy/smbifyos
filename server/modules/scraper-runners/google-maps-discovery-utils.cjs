const fs = require("fs");
const path = require("path");

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function normalizePositiveInteger(value, fallback, maxValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  const safeMax = Number.isFinite(Number(maxValue)) && Number(maxValue) > 0
    ? Math.round(Number(maxValue))
    : Number.MAX_SAFE_INTEGER;

  return Math.min(safeMax, Math.max(1, Math.round(numeric)));
}

function resolveFirstExistingPath(candidates) {
  for (const candidate of candidates) {
    const raw = cleanText(candidate);
    if (!raw) continue;

    const absolute = path.resolve(raw);
    if (fs.existsSync(absolute)) {
      return absolute;
    }
  }

  return "";
}

function resolveGmbModulePath() {
  const rootHint = cleanText(
    process.env.GMB_STATE_SCRAPER_ROOT || process.env.GMB_AND_STATE_SCRAPER_ROOT
  );
  const explicitModule = cleanText(process.env.GMB_PHOTO_SCRAPER_MODULE);

  const candidates = [
    explicitModule,
    rootHint ? path.join(rootHint, "server", "modules", "gmb-photo-scraper.js") : "",
    path.resolve(__dirname, "../../../../legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(process.cwd(), "legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(__dirname, "../../../../gmb and state scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(process.cwd(), "../gmb and state scrapper/server/modules/gmb-photo-scraper.js"),
  ];

  const resolved = resolveFirstExistingPath(candidates);
  if (resolved) {
    return resolved;
  }

  throw new Error(
    `Cannot resolve gmb-photo-scraper.js. Checked paths: ${candidates
      .filter((entry) => cleanText(entry))
      .join(" | ")}`
  );
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFiniteInt(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function dedupeRecords(records, limit) {
  const maxItems = Math.max(1, Number(limit) || 1);
  const seen = new Set();
  const output = [];

  for (const record of records) {
    if (!record || typeof record !== "object") {
      continue;
    }

    const key = [
      cleanText(record.sourceUrl).toLowerCase(),
      cleanText(record.name).toLowerCase(),
      cleanText(record.address).toLowerCase(),
      cleanText(record.city).toLowerCase(),
      cleanText(record.state).toLowerCase(),
    ]
      .filter(Boolean)
      .join("|");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(record);

    if (output.length >= maxItems) {
      break;
    }
  }

  return output;
}

function mapListingToRecord(listing, options) {
  const source = listing && typeof listing === "object" ? listing : {};
  const name = cleanText(source.business_name || source.name);
  if (!name) {
    return null;
  }

  const sourceUrl = cleanText(source.locationLink || source.gmb_url || source.sourceUrl || source.url);
  const snippet = cleanText(source.snippet || source.description || source.note);
  const snippetPrefix = cleanText(options?.snippetPrefix);

  const mapped = {
    name,
    business_name: name,
    address: cleanText(source.address),
    city: cleanText(source.city),
    state: cleanText(source.state),
    zip: cleanText(source.zip),
    phone: cleanText(source.phone),
    website: cleanText(source.website),
    category: cleanText(source.category) || cleanText(options?.category),
    rating: toFiniteNumber(source.rating),
    reviewCount: toFiniteInt(source.reviewCount ?? source.reviews ?? source.visibleReviewsCount),
    sourceUrl,
    gmb_url: sourceUrl,
    snippet: [snippetPrefix, snippet].filter(Boolean).join(" | "),
    discoverySource: "google_maps_fallback",
  };

  if (typeof options?.transformRecord === "function") {
    return options.transformRecord(mapped, source);
  }

  return mapped;
}

function safeProgress(onProgress, payload) {
  if (typeof onProgress !== "function") {
    return;
  }

  try {
    onProgress(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[google-maps-discovery-utils] Progress callback failed: ${detail}`);
  }
}

async function discoverViaGoogleMaps(options) {
  const keyword = cleanText(options?.keyword);
  const location = cleanText(options?.location);
  if (!keyword || !location) {
    throw new Error("keyword and location are required");
  }

  const maxItems = normalizePositiveInteger(options?.maxItems, 20, 5000);
  const gmbModulePath = resolveGmbModulePath();
  const { searchGmbListings } = require(gmbModulePath);

  if (typeof searchGmbListings !== "function") {
    throw new Error("searchGmbListings() not available in gmb-photo-scraper module");
  }

  const previewLimit = Math.max(maxItems, 200);
  let latestPreviewRows = [];

  const result = await searchGmbListings({
    keyword,
    location,
    listingsPerQuery: Math.min(Math.max(maxItems, 20), 5000),
    onProgress: (progress) => {
      const listings = Array.isArray(progress?.listings) ? progress.listings : [];

      latestPreviewRows = dedupeRecords(
        listings
          .map((listing) => mapListingToRecord(listing, options))
          .filter(Boolean),
        previewLimit
      );

      safeProgress(options?.onProgress, {
        processedQueries: Number(progress?.processedQueries) || 0,
        totalQueries: Number(progress?.totalQueries) || 0,
        totalListings: Number(progress?.totalListings) || latestPreviewRows.length,
        previewListings: latestPreviewRows,
      });
    },
  });

  const finalListings = Array.isArray(result?.listings) ? result.listings : [];
  const finalRows = dedupeRecords(
    finalListings
      .map((listing) => mapListingToRecord(listing, options))
      .filter(Boolean),
    maxItems
  );

  if (finalRows.length > 0) {
    return finalRows;
  }

  return dedupeRecords(latestPreviewRows, maxItems);
}

module.exports = {
  cleanText,
  discoverViaGoogleMaps,
  normalizePositiveInteger,
};
