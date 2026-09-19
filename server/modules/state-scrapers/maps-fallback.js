const fs = require("fs");
const path = require("path");

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function normalizePositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numericValue), min), max);
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
    path.resolve(__dirname, "../../../legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(process.cwd(), "legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(__dirname, "../../../gmb and state scrapper/server/modules/gmb-photo-scraper.js"),
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

function parseAddressParts(address, fallbackStateCode) {
  const normalized = cleanText(address);
  const withComma = normalized.match(
    /^(.*?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i
  );
  if (withComma) {
    return {
      city: cleanText(withComma[2]),
      state: cleanText(withComma[3]).toUpperCase(),
      zip: cleanText(withComma[4]),
    };
  }

  const noComma = normalized.match(
    /^(.*?)([A-Z][A-Za-z .'-]+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
  );
  if (noComma) {
    return {
      city: cleanText(noComma[2]),
      state: cleanText(noComma[3]).toUpperCase(),
      zip: cleanText(noComma[4]),
    };
  }

  return {
    city: "",
    state: cleanText(fallbackStateCode).toUpperCase(),
    zip: "",
  };
}

function mapListingToStateRecord(listing, options) {
  const stateCode = cleanText(options?.stateCode).toUpperCase();
  const businessType = cleanText(options?.businessType);
  const businessName = cleanText(listing?.business_name || listing?.name);
  if (!businessName) {
    return null;
  }

  const address = cleanText(listing?.address);
  const parsed = parseAddressParts(address, stateCode);
  const website = cleanText(listing?.website);

  return {
    businessName,
    status: "",
    filingDate: "",
    address,
    city: cleanText(listing?.city) || parsed.city,
    state: cleanText(listing?.state).toUpperCase() || parsed.state || stateCode,
    zip: cleanText(listing?.zip) || parsed.zip,
    agentName: "",
    agentAddress: "",
    phone: cleanText(listing?.phone),
    website,
    category: cleanText(listing?.category) || businessType,
    sourceUrl: cleanText(listing?.locationLink || listing?.gmb_url || listing?.sourceUrl),
    gmb_rating: listing?.rating ?? null,
    gmb_review_count: listing?.reviews ?? listing?.reviewCount ?? listing?.visibleReviewsCount ?? null,
    dataSource: "google_maps_fallback",
  };
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
      cleanText(record.businessName).toLowerCase(),
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

async function safeProgress(onProgress, payload) {
  if (typeof onProgress !== "function") {
    return;
  }

  try {
    await onProgress(payload);
  } catch (error) {
    console.error(`[state-maps-fallback] onProgress failed: ${error.message}`);
  }
}

async function scrapeStateViaGoogleMapsFallback({
  stateId,
  stateCode,
  stateName,
  businessType,
  limit,
  onProgress,
} = {}) {
  const normalizedBusinessType = cleanText(businessType);
  if (!normalizedBusinessType) {
    return [];
  }

  const targetLimit = normalizePositiveInteger(limit, 50, { min: 1, max: 5000 });
  const gmbModulePath = resolveGmbModulePath();
  const { searchGmbListings } = require(gmbModulePath);

  if (typeof searchGmbListings !== "function") {
    throw new Error("searchGmbListings() not available in gmb-photo-scraper module");
  }

  const locationLabel = [cleanText(stateName), cleanText(stateCode).toUpperCase()]
    .filter(Boolean)
    .join(", ");
  const stateLabel = cleanText(stateId || stateName || stateCode || "state");

  let latestPreviewRecords = [];
  const result = await searchGmbListings({
    keyword: normalizedBusinessType,
    location: locationLabel,
    listingsPerQuery: Math.min(Math.max(targetLimit, 20), 5000),
    onProgress: async (progress) => {
      const listings = Array.isArray(progress?.listings) ? progress.listings : [];
      latestPreviewRecords = dedupeRecords(
        listings
          .map((listing) =>
            mapListingToStateRecord(listing, {
              stateCode,
              businessType: normalizedBusinessType,
            })
          )
          .filter(Boolean),
        Math.max(targetLimit, 150)
      );

      await safeProgress(onProgress, {
        scraped: Math.min(Number(progress?.totalListings) || latestPreviewRecords.length, targetLimit),
        total: targetLimit,
        records: latestPreviewRecords,
        message: `${stateLabel} Google Maps fallback discovery`,
      });
    },
  });

  const listings = Array.isArray(result?.listings) ? result.listings : [];
  const finalRecords = dedupeRecords(
    listings
      .map((listing) =>
        mapListingToStateRecord(listing, {
          stateCode,
          businessType: normalizedBusinessType,
        })
      )
      .filter(Boolean),
    targetLimit
  );

  if (finalRecords.length > 0) {
    return finalRecords;
  }

  return dedupeRecords(latestPreviewRecords, targetLimit);
}

module.exports = {
  scrapeStateViaGoogleMapsFallback,
};