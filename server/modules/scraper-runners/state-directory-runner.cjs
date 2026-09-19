const fs = require("fs");
const path = require("path");
const { emitProgress } = require("./bing-rss-utils.cjs");

const PLACEHOLDER_TEXT_PATTERN = /not yet configured -- selectors needed/i;

function getArgValue(flag) {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return process.argv[index + 1];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

/* ── State code ↔ state ID map ── */
const STATE_CODE_TO_ID = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia",
  hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
  ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
  mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new-hampshire",
  nj: "new-jersey", nm: "new-mexico", ny: "new-york", nc: "north-carolina",
  nd: "north-dakota", oh: "ohio", ok: "oklahoma", or: "oregon", pa: "pennsylvania",
  ri: "rhode-island", sc: "south-carolina", sd: "south-dakota", tn: "tennessee",
  tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west-virginia", wi: "wisconsin", wy: "wyoming", dc: "district-of-columbia",
};

const STATE_ID_TO_CODE = Object.fromEntries(
  Object.entries(STATE_CODE_TO_ID).map(([code, id]) => [id, code.toUpperCase()])
);

function resolveStateCatalog() {
  const catalogPath = path.resolve(__dirname, "..", "state-scrapers", "state-catalog.js");

  try {
    const moduleValue = require(catalogPath);
    return Array.isArray(moduleValue?.STATE_CATALOG) ? moduleValue.STATE_CATALOG : [];
  } catch (_error) {
    return [];
  }
}

const STATE_CATALOG = resolveStateCatalog();
const STATE_META_BY_ID = new Map(
  STATE_CATALOG.map((entry) => [cleanText(entry?.id).toLowerCase(), entry])
);

function titleCaseWords(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildStateNameFromId(stateId) {
  return titleCaseWords(String(stateId || "").replace(/-/g, " "));
}

function getStateMeta(stateId) {
  const normalizedStateId = cleanText(stateId).toLowerCase();
  const catalogEntry = STATE_META_BY_ID.get(normalizedStateId) || {};
  const stateCode = cleanText(catalogEntry.code || STATE_ID_TO_CODE[normalizedStateId]).toUpperCase();
  const stateName = cleanText(catalogEntry.name) || buildStateNameFromId(normalizedStateId);
  const stateStatus = cleanText(catalogEntry.status || "unknown").toLowerCase();

  return {
    id: normalizedStateId,
    code: stateCode,
    name: stateName,
    status: stateStatus,
  };
}

/** Resolve user input (e.g. "tx", "texas", "TX") to a state ID like "texas" */
function resolveStateId(input) {
  const lower = cleanText(input).toLowerCase().replace(/\s+/g, "-");
  // If it's a 2-letter code, look up
  if (lower.length === 2 && STATE_CODE_TO_ID[lower]) {
    return STATE_CODE_TO_ID[lower];
  }
  // If it already matches a state ID format (e.g. "texas", "new-york"), use directly
  return lower;
}

/** Look for the scraper file in our bundled state-scrapers directory */
function resolveStateScraperFile(stateId) {
  const scrapersDir = path.resolve(__dirname, "..", "state-scrapers");
  const scraperPath = path.join(scrapersDir, `${stateId}.js`);

  if (fs.existsSync(scraperPath)) {
    return scraperPath;
  }

  return null;
}

function isPlaceholderStateScraper(scraperFile) {
  try {
    const fileText = fs.readFileSync(scraperFile, "utf8");

    return PLACEHOLDER_TEXT_PATTERN.test(fileText);
  } catch (_error) {
    return false;
  }
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

async function scrapeViaGoogleMapsFallback(options) {
  const stateMeta = options?.stateMeta || {};
  const businessType = cleanText(options?.businessType);
  const limit = Math.max(1, Number(options?.limit) || 100);
  const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;

  const gmbModulePath = resolveGmbModulePath();
  const { searchGmbListings } = require(gmbModulePath);

  if (typeof searchGmbListings !== "function") {
    throw new Error("searchGmbListings() not available in gmb-photo-scraper module");
  }

  const stateLabel = [cleanText(stateMeta.name), cleanText(stateMeta.code)]
    .filter(Boolean)
    .join(", ");

  let lastPreviewRecords = [];
  const searchResult = await searchGmbListings({
    keyword: businessType,
    location: stateLabel,
    listingsPerQuery: Math.min(Math.max(limit, 20), 5000),
    onProgress: (progress) => {
      const listings = Array.isArray(progress?.listings) ? progress.listings : [];
      lastPreviewRecords = dedupeRecords(
        listings
          .map((listing) =>
            mapListingToStateRecord(listing, {
              stateCode: stateMeta.code,
              businessType,
            })
          )
          .filter(Boolean),
        Math.max(limit, 150)
      );

      if (onProgress) {
        const discovered = Math.min(Number(progress?.totalListings) || 0, limit);
        onProgress({
          scraped: discovered,
          total: limit,
          records: lastPreviewRecords,
        });
      }
    },
  });

  const finalListings = Array.isArray(searchResult?.listings) ? searchResult.listings : [];
  const finalRecords = dedupeRecords(
    finalListings
      .map((listing) =>
        mapListingToStateRecord(listing, {
          stateCode: stateMeta.code,
          businessType,
        })
      )
      .filter(Boolean),
    limit
  );

  if (finalRecords.length > 0) {
    return finalRecords;
  }

  return dedupeRecords(lastPreviewRecords, limit);
}

async function run() {
  const inputPath = path.resolve(getArgValue("--input"));
  const outputPath = path.resolve(getArgValue("--output"));

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!payload.state || !payload.businessType) {
    throw new Error("state and businessType are required");
  }

  const stateId = resolveStateId(payload.state);
  const stateMeta = getStateMeta(stateId);
  const targetLimit = Math.max(1, Number(payload.limit) || 100);

  emitProgress({
    percent: 1,
    message: `State directory scrape started (${stateId})`,
    totalFound: 0,
  });

  const liveProgress = ({ scraped, total, records, listings, previewListings }) => {
    const current = Number(scraped) || 0;
    const target = Number(total) || targetLimit || 1;
    const percent = Math.min(85, Math.max(5, Math.round((current / target) * 85)));
    const previewRows = Array.isArray(records)
      ? records
      : Array.isArray(previewListings)
        ? previewListings
        : Array.isArray(listings)
          ? listings
          : [];

    emitProgress({
      percent,
      message: `State registry scrape ${current}/${target}`,
      totalFound: current,
      previewListings: previewRows.slice(0, 300),
    });
  };

  const scraperFile = resolveStateScraperFile(stateId);

  let results = [];
  const placeholderScraper = scraperFile ? isPlaceholderStateScraper(scraperFile) : true;

  if (scraperFile && !placeholderScraper) {
    const scraperModule = require(scraperFile);
    if (typeof scraperModule.scrape !== "function") {
      throw new Error(`Scraper file for state "${stateId}" does not export scrape()`);
    }

    results = await scraperModule.scrape({
      businessType: payload.businessType,
      limit: targetLimit,
      onProgress: liveProgress,
    });
  }

  results = Array.isArray(results) ? results : [];

  if (!scraperFile || placeholderScraper || results.length === 0) {
    const fallbackReason = !scraperFile
      ? "missing scraper"
      : placeholderScraper
        ? "state scraper is placeholder"
        : "state scraper returned no rows";

    emitProgress({
      percent: 35,
      message: `Using Google Maps fallback (${fallbackReason})`,
      totalFound: results.length,
    });

    try {
      const fallbackResults = await scrapeViaGoogleMapsFallback({
        stateMeta,
        businessType: payload.businessType,
        limit: targetLimit,
        onProgress: liveProgress,
      });

      if (Array.isArray(fallbackResults) && fallbackResults.length > 0) {
        results = fallbackResults;
      }
    } catch (fallbackError) {
      const detail = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      emitProgress({
        percent: 85,
        message: `Fallback discovery unavailable: ${cleanText(detail).slice(0, 160)}`,
        totalFound: results.length,
      });
    }
  }

  results = Array.isArray(results) ? results : [];

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  emitProgress({
    percent: 100,
    message: `State directory scrape finished with ${results.length} rows`,
    totalFound: results.length,
  });
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[state-directory-runner] ${message}`);
  process.exit(1);
});
