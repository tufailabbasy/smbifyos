const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { buildCategorySearchPlan } = require("./category-search");
const {
  DEFAULT_TIMEOUT,
  createBrowser,
  createContext,
  closeResources,
  safeProgress,
  safeShouldCancel,
  safeWaitIfPaused,
} = require("../scrapers/shared");

const DEFAULT_LISTINGS_LIMIT = 120;
const MAX_LISTINGS_LIMIT = 400;
const DEFAULT_PHOTOS_LIMIT = 20;
const MAX_PHOTOS_LIMIT = 500;
const MAX_DISCOVERY_QUERIES = 12;
const SEARCH_SCROLL_WAIT_MS = 1200;
const PHOTO_SCROLL_WAIT_MS = 900;
const SEARCH_STAGNANT_LIMIT = 4;
const PHOTO_STAGNANT_LIMIT = 4;
const MIN_PHOTO_DIMENSION = 80;
const { getGmbDownloadsDir, getGmbRankTrackerDir } = require("./storage-paths");
const SERP_RESULT_LIMIT = 8;
const WEBSITE_DIRECTORY_DENYLIST = new Set([
  "facebook.com",
  "m.facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "yelp.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "thumbtack.com",
  "mapquest.com",
  "yellowpages.com",
  "bbb.org",
  "nextdoor.com",
  "superpages.com",
  "foursquare.com",
  "birdeye.com",
  "tripadvisor.com",
  "chamberofcommerce.com",
]);
const ATTRIBUTE_GROUP_PATTERNS = {
  serviceOptions: [
    /\bonline estimates?\b/i,
    /\bon[- ]site services?\b/i,
    /\bdelivery\b/i,
    /\btakeout\b/i,
    /\bdine[- ]in\b/i,
    /\bcurbside pickup\b/i,
    /\bappointments? recommended\b/i,
    /\bappointments? required\b/i,
  ],
  accessibility: [
    /\bwheelchair accessible\b/i,
    /\bwheelchair-accessible\b/i,
    /\baccessible entrance\b/i,
    /\baccessible parking\b/i,
    /\baccessible restroom\b/i,
    /\baccessible seating\b/i,
  ],
  amenities: [
    /\bwi-?fi\b/i,
    /\brestroom\b/i,
    /\bgender-neutral restroom\b/i,
    /\bpool\b/i,
    /\bbar on site\b/i,
    /\bfree wi-?fi\b/i,
  ],
  highlights: [
    /\bwomen-owned\b/i,
    /\bveteran-owned\b/i,
    /\bblack-owned\b/i,
    /\blgbtq\+?\b/i,
    /\btransgender safespace\b/i,
    /\bfamily[- ]owned\b/i,
  ],
  payments: [
    /\bcredit cards\b/i,
    /\bdebit cards\b/i,
    /\bnfc mobile payments\b/i,
    /\bchecks?\b/i,
    /\bcash only\b/i,
  ],
};

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function cleanTextLines(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizePositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numericValue), min), max);
}

function sanitizeFilePart(value = "", fallback = "item", maxLength = 60) {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function createStableHash(value = "") {
  return crypto.createHash("sha1").update(cleanText(value)).digest("hex").slice(0, 8);
}

async function ensureDirectory(directoryPath = "") {
  if (!cleanText(directoryPath)) {
    return;
  }

  await fs.mkdir(directoryPath, { recursive: true });
}

function normalizePathForUrl(value = "") {
  return cleanText(value)
    .split(path.sep)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function guessFileExtension(contentType = "", url = "") {
  const normalizedType = cleanText(contentType).toLowerCase();

  if (normalizedType.includes("png")) return ".png";
  if (normalizedType.includes("webp")) return ".webp";
  if (normalizedType.includes("gif")) return ".gif";
  if (normalizedType.includes("avif")) return ".avif";
  if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) return ".jpg";

  try {
    const pathname = new URL(cleanText(url)).pathname || "";
    const extension = path.extname(pathname).toLowerCase();
    return extension && extension.length <= 5 ? extension : ".jpg";
  } catch (error) {
    return ".jpg";
  }
}

function createDownloadContext({
  keyword = "",
  location = "",
  jobId = "",
  sessionId = "",
} = {}) {
  const resolvedSessionId =
    cleanText(jobId) ||
    cleanText(sessionId) ||
    `quick_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const sessionFolder = [
    sanitizeFilePart(resolvedSessionId, "quick-run", 40),
    sanitizeFilePart(keyword, "keyword"),
    sanitizeFilePart(location, "location"),
  ].join("__");
  const downloadRootDir = getGmbDownloadsDir();
  const downloadSessionDir = path.join(downloadRootDir, sessionFolder);

  return {
    downloadRootDir,
    downloadSessionDir,
    sessionId: resolvedSessionId,
  };
}

function createListingDownloadDirectory(downloadContext, listing = {}, listingIndex = 0) {
  const listingSlug = sanitizeFilePart(listing.name, "listing");
  const listingHash = createStableHash(
    listing.listingId || listing.locationLink || `${listing.name}|${listing.address}`
  );

  return path.join(
    downloadContext.downloadSessionDir,
    `${String(listingIndex + 1).padStart(3, "0")}__${listingSlug}__${listingHash}`
  );
}

function extractHostname(value = "") {
  try {
    return new URL(cleanText(value)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch (error) {
    return "";
  }
}

function normalizeWebsiteUrl(value = "") {
  const normalized = cleanText(value);

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(/^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`);
    url.hash = "";
    return url.toString();
  } catch (error) {
    return "";
  }
}

function resolveUrl(baseUrl = "", href = "") {
  try {
    return new URL(cleanText(href), cleanText(baseUrl)).toString();
  } catch (error) {
    return "";
  }
}

function collectUniqueStrings(values = []) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function createRankSnapshotContext({
  keyword = "",
  location = "",
  sessionId = "",
} = {}) {
  const snapshotId =
    cleanText(sessionId) ||
    `${new Date().toISOString().replace(/[:.]/g, "-")}__${createStableHash(
      `${keyword}|${location}|${Date.now()}`
    )}`;
  const snapshotDir = path.join(
    getGmbRankTrackerDir(),
    `${sanitizeFilePart(keyword, "keyword")}__${sanitizeFilePart(location, "location")}`
  );
  const snapshotPath = path.join(snapshotDir, `${snapshotId}.json`);

  return {
    snapshotId,
    snapshotDir,
    snapshotPath,
  };
}

async function saveRankSnapshot({
  keyword = "",
  location = "",
  queriesUsed = [],
  listings = [],
  serpProvider = "",
  serpResults = [],
  sessionId = "",
} = {}) {
  const snapshotContext = createRankSnapshotContext({
    keyword,
    location,
    sessionId,
  });
  const snapshotPayload = {
    snapshotId: snapshotContext.snapshotId,
    keyword: cleanText(keyword),
    location: cleanText(location),
    capturedAt: new Date().toISOString(),
    queriesUsed: Array.isArray(queriesUsed) ? queriesUsed : [],
    serpProvider: cleanText(serpProvider),
    listings: Array.isArray(listings) ? listings : [],
    serpResults: Array.isArray(serpResults) ? serpResults : [],
  };

  await ensureDirectory(snapshotContext.snapshotDir);
  await fs.writeFile(
    snapshotContext.snapshotPath,
    `${JSON.stringify(snapshotPayload, null, 2)}\n`,
    "utf8"
  );

  return {
    ...snapshotPayload,
    snapshotPath: snapshotContext.snapshotPath,
  };
}

async function downloadPhotoFile({
  photo = {},
  downloadDirectory = "",
  photoIndex = 0,
} = {}) {
  const sourceUrls = buildPhotoDownloadUrls(photo.downloadUrl || photo.url);

  if (!sourceUrls.length) {
    throw new Error("Missing source photo URL.");
  }

  await ensureDirectory(downloadDirectory);

  let response = null;
  let sourceUrl = "";
  let lastError = null;

  for (const candidateUrl of sourceUrls) {
    try {
      const candidateResponse = await fetch(candidateUrl, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });

      if (!candidateResponse.ok) {
        lastError = new Error(`Image download failed with status ${candidateResponse.status}.`);
        continue;
      }

      response = candidateResponse;
      sourceUrl = candidateUrl;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!response || !sourceUrl) {
    throw lastError || new Error("Image download failed.");
  }

  const extension = guessFileExtension(response.headers.get("content-type"), sourceUrl);
  const fileName = `photo-${String(photoIndex + 1).padStart(3, "0")}${extension}`;
  const localFilePath = path.join(downloadDirectory, fileName);
  const relativePath = path.relative(getGmbDownloadsDir(), localFilePath);
  const arrayBuffer = await response.arrayBuffer();

  await fs.writeFile(localFilePath, Buffer.from(arrayBuffer));

  return {
    ...photo,
    downloadUrl: sourceUrl,
    localFilePath,
    localUrl: `/api/gmb-photo-files/${normalizePathForUrl(relativePath)}`,
  };
}

function isAllowedOrganicResult(url = "") {
  const hostname = extractHostname(url);

  if (!hostname) {
    return false;
  }

  if (/google\./i.test(hostname)) {
    return false;
  }

  return true;
}

function isDirectoryHost(hostname = "") {
  const normalized = cleanText(hostname).toLowerCase();

  if (!normalized) {
    return false;
  }

  return [...WEBSITE_DIRECTORY_DENYLIST].some((blockedHost) => {
    const blocked = cleanText(blockedHost).toLowerCase();
    return normalized === blocked || normalized.endsWith(`.${blocked}`);
  });
}

function getBusinessIdentityTokens(value = "") {
  const STOP_TOKENS = new Set([
    "the",
    "and",
    "for",
    "inc",
    "llc",
    "co",
    "corp",
    "company",
    "services",
    "service",
    "new",
    "york",
    "ny",
    "nyc",
    "brooklyn",
    "queens",
    "manhattan",
    "bronx",
    "staten",
    "island",
    "plumbing",
    "plumber",
    "hvac",
    "electric",
    "electrician",
    "roofing",
    "roofer",
  ]);

  return collectUniqueStrings(
    cleanText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && !STOP_TOKENS.has(token))
  );
}

function isLikelyOfficialWebsite(hostname = "", listing = {}, title = "", snippet = "") {
  const tokens = getBusinessIdentityTokens(listing.name);

  if (!tokens.length) {
    return false;
  }

  const haystack = `${cleanText(title)} ${cleanText(snippet)} ${cleanText(hostname)}`.toLowerCase();

  return tokens.some((token) => haystack.includes(token));
}

function createGoogleSearchUrl(query = "", maxResults = SERP_RESULT_LIMIT) {
  return `https://www.google.com/search?q=${encodeURIComponent(
    cleanText(query)
  )}&hl=en&gl=us&pws=0&num=${Math.min(Math.max(Number(maxResults) || 10, 1), 10)}`;
}

function createBingSearchUrl(query = "", maxResults = SERP_RESULT_LIMIT) {
  return `https://www.bing.com/search?q=${encodeURIComponent(
    cleanText(query)
  )}&setlang=en-US&count=${Math.min(Math.max(Number(maxResults) || 10, 1), 10)}`;
}

function createDuckDuckGoSearchUrl(query = "") {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanText(query))}`;
}

function unwrapDuckDuckGoUrl(value = "") {
  const normalized = cleanText(value);

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);

    if (/duckduckgo\.com$/i.test(url.hostname) && url.pathname === "/l/") {
      return cleanText(url.searchParams.get("uddg"));
    }

    return normalized;
  } catch (error) {
    return normalized;
  }
}

async function searchGoogleOrganicResultsWithPage(page, query, maxResults = SERP_RESULT_LIMIT) {
  await gotoMapsPage(page, createGoogleSearchUrl(query, maxResults), "google search");
  await page.waitForFunction(
    () => {
      return (
        Boolean(document.querySelector("#search a h3")) ||
        Boolean(document.querySelector('a[data-ved] h3')) ||
        /did not match any documents/i.test(document.body?.innerText || "")
      );
    },
    { timeout: 20000 }
  );

  const rawResults = await page
    .evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a"));

      return anchors
        .map((anchor) => {
          const titleNode = anchor.querySelector("h3");

          if (!titleNode) {
            return null;
          }

          const title = String(titleNode.innerText || titleNode.textContent || "").trim();
          const url = String(anchor.href || "").trim();
          const block = anchor.closest("div.g") || anchor.closest('[data-snc]') || anchor.parentElement;
          const blockText = String(block?.innerText || "").trim();
          const snippet = blockText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => line !== title)
            .slice(0, 3)
            .join(" ");

          return {
            title,
            url,
            snippet,
          };
        })
        .filter(Boolean);
    })
    .catch(() => []);

  const seen = new Set();

  return rawResults
    .filter((result) => {
      const normalizedUrl = cleanText(result.url);
      const dedupeKey = normalizedUrl.toLowerCase();

      if (!result.title || !isAllowedOrganicResult(normalizedUrl) || seen.has(dedupeKey)) {
        return false;
      }

      seen.add(dedupeKey);
      return true;
    })
    .slice(0, maxResults)
    .map((result, index) => ({
      rank: index + 1,
      title: cleanText(result.title),
      url: cleanText(result.url),
      snippet: cleanText(result.snippet),
      domain: extractHostname(result.url),
    }));
}

async function searchBingOrganicResultsWithPage(page, query, maxResults = SERP_RESULT_LIMIT) {
  await page.goto(createBingSearchUrl(query, maxResults), {
    waitUntil: "domcontentloaded",
    timeout: DEFAULT_TIMEOUT,
  });
  await page.waitForFunction(
    () => {
      return (
        Boolean(document.querySelector("li.b_algo h2 a")) ||
        /There are no results for/i.test(document.body?.innerText || "")
      );
    },
    { timeout: 20000 }
  );

  const rawResults = await page
    .evaluate(() => {
      return Array.from(document.querySelectorAll("li.b_algo")).map((item) => {
        const anchor = item.querySelector("h2 a");
        const snippet = item.querySelector(".b_caption p");

        return {
          title: String(anchor?.innerText || "").trim(),
          url: String(anchor?.href || "").trim(),
          snippet: String(snippet?.innerText || "").trim(),
        };
      });
    })
    .catch(() => []);

  const seen = new Set();

  return rawResults
    .filter((result) => {
      const normalizedUrl = cleanText(result.url);
      const dedupeKey = normalizedUrl.toLowerCase();

      if (!result.title || !isAllowedOrganicResult(normalizedUrl) || seen.has(dedupeKey)) {
        return false;
      }

      seen.add(dedupeKey);
      return true;
    })
    .slice(0, maxResults)
    .map((result, index) => ({
      rank: index + 1,
      title: cleanText(result.title),
      url: cleanText(result.url),
      snippet: cleanText(result.snippet),
      domain: extractHostname(result.url),
    }));
}

async function searchDuckDuckGoOrganicResultsWithPage(page, query, maxResults = SERP_RESULT_LIMIT) {
  await page.goto(createDuckDuckGoSearchUrl(query), {
    waitUntil: "load",
    timeout: DEFAULT_TIMEOUT,
  });
  await page.waitForFunction(
    () => {
      return (
        Boolean(document.querySelector(".result")) ||
        /No results/i.test(document.body?.innerText || "")
      );
    },
    { timeout: 20000 }
  );

  const rawResults = await page
    .evaluate(() => {
      return Array.from(document.querySelectorAll(".result")).map((item) => ({
        title: String(
          item.querySelector(".result__title")?.innerText ||
            item.querySelector(".result__a")?.innerText ||
            ""
        ).trim(),
        url: String(item.querySelector(".result__title a, .result__a")?.href || "").trim(),
        snippet: String(item.querySelector(".result__snippet")?.innerText || "").trim(),
      }));
    })
    .catch(() => []);

  const seen = new Set();

  return rawResults
    .map((result) => ({
      ...result,
      url: unwrapDuckDuckGoUrl(result.url),
    }))
    .filter((result) => {
      const normalizedUrl = cleanText(result.url);
      const dedupeKey = normalizedUrl.toLowerCase();

      if (!result.title || !isAllowedOrganicResult(normalizedUrl) || seen.has(dedupeKey)) {
        return false;
      }

      seen.add(dedupeKey);
      return true;
    })
    .slice(0, maxResults)
    .map((result, index) => ({
      rank: index + 1,
      title: cleanText(result.title),
      url: cleanText(result.url),
      snippet: cleanText(result.snippet),
      domain: extractHostname(result.url),
    }));
}

async function searchWebOrganicResultsWithPage(page, query, maxResults = SERP_RESULT_LIMIT) {
  try {
    const googleResults = await searchGoogleOrganicResultsWithPage(page, query, maxResults);

    if (googleResults.length) {
      return {
        provider: "google",
        blocked: false,
        results: googleResults,
      };
    }
  } catch (error) {
    if (!/blocked|unusual traffic|not a robot/i.test(cleanText(error.message))) {
      void error;
    }
  }

  const duckDuckGoResults = await searchDuckDuckGoOrganicResultsWithPage(
    page,
    query,
    maxResults
  ).catch(() => []);

  return {
    provider: duckDuckGoResults.length ? "duckduckgo" : "none",
    blocked: true,
    results: duckDuckGoResults,
  };
}

function chooseWebsiteCandidate(results = [], listing = {}) {
  const normalizedBusinessName = cleanText(listing.name).toLowerCase();

  for (const result of results) {
    const url = normalizeWebsiteUrl(result.url);
    const hostname = extractHostname(url);

    if (!url || !hostname || isDirectoryHost(hostname)) {
      continue;
    }

    const titleHaystack = `${cleanText(result.title)} ${cleanText(result.snippet)}`.toLowerCase();

    if (
      (!normalizedBusinessName || titleHaystack.includes(normalizedBusinessName)) &&
      isLikelyOfficialWebsite(hostname, listing, result.title, result.snippet)
    ) {
      return {
        website: url,
        source: "",
        searchResult: result,
      };
    }

    if (isLikelyOfficialWebsite(hostname, listing, result.title, result.snippet)) {
      return {
        website: url,
        source: "",
        searchResult: result,
      };
    }
  }

  const fallback = results.find((result) => {
    const hostname = extractHostname(result.url);
    return hostname && !isDirectoryHost(hostname) && isLikelyOfficialWebsite(hostname, listing, result.title, result.snippet);
  });

  return fallback
    ? {
        website: normalizeWebsiteUrl(fallback.url),
        source: "",
        searchResult: fallback,
      }
    : {
        website: "",
        source: "",
        searchResult: null,
      };
}

async function findWebsiteForListingWithPage(page, listing = {}, keyword = "", location = "") {
  const existingWebsite = normalizeWebsiteUrl(listing.website);

  if (existingWebsite) {
    return {
      website: existingWebsite,
      source: "gmb",
      searchQuery: "",
      searchResults: [],
      searchResult: null,
    };
  }

  const searchQuery = [
    `"${cleanText(listing.name)}"`,
    cleanText(listing.address || location),
    cleanText(keyword),
    "official site",
  ]
    .filter(Boolean)
    .join(" ");
  const webSearch = await searchWebOrganicResultsWithPage(page, searchQuery, 6);
  const searchResults = webSearch.results;
  const candidate = chooseWebsiteCandidate(searchResults, listing);

  return {
    website: candidate.website,
    source: candidate.website ? candidate.source || `${webSearch.provider}_search` : "",
    provider: webSearch.provider,
    searchQuery,
    searchResults,
    searchResult: candidate.searchResult,
  };
}

async function fetchTextResponse(url = "") {
  const normalizedUrl = normalizeWebsiteUrl(url);

  if (!normalizedUrl) {
    return {
      url: "",
      html: "",
      status: 0,
    };
  }

  const response = await fetch(normalizedUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  return {
    url: response.url || normalizedUrl,
    html: await response.text(),
    status: response.status,
  };
}

function extractEmailsFromHtml(html = "") {
  return collectUniqueStrings(
    [...String(html).matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(
      (match) => match[0]
    )
  ).filter((email) => !/\.(png|jpg|jpeg|gif|webp)$/i.test(email));
}

function extractPhonesFromText(text = "") {
  return collectUniqueStrings(
    [...String(text).matchAll(/(?:\+?1[\s./-]?)?(?:\(?\d{3}\)?[\s./-]?)\d{3}[\s./-]?\d{4}/g)].map(
      (match) => match[0]
    )
  );
}

function extractSocialLinks(html = "", baseUrl = "") {
  const links = [...String(html).matchAll(/href=["']([^"'#]+)["']/gi)].map((match) =>
    resolveUrl(baseUrl, match[1])
  );

  return collectUniqueStrings(
    links.filter((url) => /(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok)/i.test(url))
  );
}

function extractRelevantSubtypes(attributeTexts = [], category = "") {
  const normalizedCategory = cleanText(category).toLowerCase();

  return attributeTexts
    .filter((text) => {
      const normalized = cleanText(text).toLowerCase();

      if (!normalized || normalized === normalizedCategory) {
        return false;
      }

      if (
        /\b(?:website|directions|share|call|reviews?|photos?|save|send|nearby|from the business)\b/i.test(
          normalized
        )
      ) {
        return false;
      }

      if (
        Object.values(ATTRIBUTE_GROUP_PATTERNS).some((patterns) =>
          patterns.some((pattern) => pattern.test(normalized))
        )
      ) {
        return false;
      }

      return normalized.length <= 32 && /^[a-z0-9 '&/-]+$/i.test(normalized);
    })
    .slice(0, 5);
}

function classifyAttributeTexts(values = [], category = "") {
  const attributeTexts = collectUniqueStrings(values).slice(0, 200);
  const grouped = {
    attributes: attributeTexts,
    serviceOptions: [],
    accessibility: [],
    amenities: [],
    highlights: [],
    payments: [],
    subtypes: [],
  };

  attributeTexts.forEach((text) => {
    Object.entries(ATTRIBUTE_GROUP_PATTERNS).forEach(([groupName, patterns]) => {
      if (patterns.some((pattern) => pattern.test(text))) {
        grouped[groupName].push(text);
      }
    });
  });

  grouped.serviceOptions = collectUniqueStrings(grouped.serviceOptions);
  grouped.accessibility = collectUniqueStrings(grouped.accessibility);
  grouped.amenities = collectUniqueStrings(grouped.amenities);
  grouped.highlights = collectUniqueStrings(grouped.highlights);
  grouped.payments = collectUniqueStrings(grouped.payments);
  grouped.subtypes = extractRelevantSubtypes(attributeTexts, category);

  return grouped;
}

async function enrichWebsiteContactData(website = "") {
  const normalizedWebsite = normalizeWebsiteUrl(website);

  if (!normalizedWebsite) {
    return {
      website: "",
      domain: "",
      emails: [],
      extraPhones: [],
      socials: [],
      pagesScanned: [],
    };
  }

  const visited = new Set();
  const pagesToVisit = [normalizedWebsite];
  const pagesScanned = [];
  const emails = new Set();
  const phones = new Set();
  const socials = new Set();

  while (pagesToVisit.length && pagesScanned.length < 3) {
    const nextUrl = pagesToVisit.shift();
    const dedupeKey = cleanText(nextUrl).toLowerCase();

    if (!nextUrl || visited.has(dedupeKey)) {
      continue;
    }

    visited.add(dedupeKey);

    try {
      const pageResponse = await fetchTextResponse(nextUrl);
      const html = pageResponse.html || "";
      const text = String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");

      pagesScanned.push(pageResponse.url || nextUrl);
      extractEmailsFromHtml(html).forEach((email) => emails.add(email));
      extractPhonesFromText(`${text} ${html}`).forEach((phone) => phones.add(phone));
      extractSocialLinks(html, pageResponse.url || nextUrl).forEach((url) => socials.add(url));

      const candidateLinks = [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
        .map((match) => resolveUrl(pageResponse.url || nextUrl, match[1]))
        .filter((url) => extractHostname(url) === extractHostname(pageResponse.url || nextUrl))
        .filter((url) => /(contact|about|about-us|get-in-touch|support|location|locations)/i.test(url))
        .slice(0, 4);

      candidateLinks.forEach((url) => {
        const key = cleanText(url).toLowerCase();

        if (!visited.has(key) && !pagesToVisit.some((item) => cleanText(item).toLowerCase() === key)) {
          pagesToVisit.push(url);
        }
      });
    } catch (error) {
      void error;
    }
  }

  return {
    website: normalizedWebsite,
    domain: extractHostname(normalizedWebsite),
    emails: [...emails],
    extraPhones: [...phones],
    socials: [...socials],
    pagesScanned,
  };
}

function buildLeadScore(listing = {}, requestedPhotosPerListing = DEFAULT_PHOTOS_LIMIT) {
  const reasons = [];
  let score = 0;
  const reviewCount = Number(String(listing.reviews || "0").replace(/,/g, "")) || 0;
  const rating = Number(listing.rating) || 0;
  const downloadedPhotoCount = Number(listing.downloadedPhotoCount || listing.photoCount || 0);
  const hasWebsite = Boolean(cleanText(listing.website));
  const emailCount = Array.isArray(listing.emails) ? listing.emails.length : 0;
  const socialCount = Array.isArray(listing.socials) ? listing.socials.length : 0;
  const visibleReviewsCount = Number(listing.visibleReviewsCount || 0);
  const ownerRepliesVisibleCount = Number(listing.ownerRepliesVisibleCount || 0);

  if (!hasWebsite) {
    score += 30;
    reasons.push("No website on listing");
  } else if (cleanText(listing.websiteSource) === "google_search") {
    score += 16;
    reasons.push("Website missing on GMB and only found via Google search");
  }

  if (emailCount === 0) {
    score += 18;
    reasons.push("No email found");
  }

  if (reviewCount > 0 && reviewCount < 20) {
    score += reviewCount < 5 ? 18 : 12;
    reasons.push("Low review count");
  }

  if (rating > 0 && rating < 4.2) {
    score += rating < 3.8 ? 16 : 10;
    reasons.push("Rating below target");
  }

  if (visibleReviewsCount > 0 && ownerRepliesVisibleCount === 0) {
    score += 10;
    reasons.push("No visible owner replies");
  }

  if (downloadedPhotoCount > 0 && downloadedPhotoCount < Math.min(8, requestedPhotosPerListing)) {
    score += 8;
    reasons.push("Low photo coverage");
  }

  if (socialCount === 0) {
    score += 6;
    reasons.push("No social profiles found");
  }

  const normalizedScore = Math.min(100, score);
  const tier = normalizedScore >= 70 ? "high" : normalizedScore >= 40 ? "medium" : "low";

  return {
    leadScore: normalizedScore,
    leadTier: tier,
    leadReasons: reasons,
  };
}

async function extractVisibleReviewSignals(page, locationLink = "") {
  try {
    const reviewTab = page.getByRole("tab", { name: /^reviews for/i });

    if ((await reviewTab.count()) === 0) {
      return {
        visibleReviewsCount: 0,
        ownerRepliesVisibleCount: 0,
      };
    }

    await reviewTab.first().click({ timeout: 2000 });
    await page.waitForTimeout(1200);

    const signals = await page
      .evaluate(() => {
        const reviewCards = Array.from(document.querySelectorAll("[data-review-id]"));
        const ownerRepliesVisibleCount = reviewCards.filter((card) =>
          /response from the owner|owner response/i.test(card.innerText || "")
        ).length;

        return {
          visibleReviewsCount: reviewCards.length,
          ownerRepliesVisibleCount,
        };
      })
      .catch(() => ({
        visibleReviewsCount: 0,
        ownerRepliesVisibleCount: 0,
      }));

    if (cleanText(locationLink)) {
      await gotoMapsPage(page, locationLink, "review signal reset");
    }

    return signals;
  } catch (error) {
    if (cleanText(locationLink)) {
      try {
        await gotoMapsPage(page, locationLink, "review signal recovery");
      } catch (recoveryError) {
        void recoveryError;
      }
    }

    return {
      visibleReviewsCount: 0,
      ownerRepliesVisibleCount: 0,
    };
  }
}

function extractPhoneNumber(value = "") {
  const match = cleanText(value).match(
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/
  );

  return cleanText(match?.[0]);
}

function extractReviewCount(value = "") {
  const text = cleanText(value);
  const match = text.match(/([\d,]+)\s+reviews?/i) || text.match(/\(([0-9,]+)\)/) || text.match(/\b([0-9,]+)\s*$/);
  return cleanText(match?.[1]).replace(/,/g, "");
}

function extractRating(value = "") {
  const text = cleanText(value);
  const match = text.match(/([\d.]+)\s*stars?/i) || text.match(/\b([1-5]\.[0-9])\b/) || text.match(/^([1-5]\.[0-9])$/);
  return cleanText(match?.[1]) || cleanText(text.match(/^[\d.]+$/)?.[0]) || "";
}

function parseCardInfo(infoText = "") {
  const lines = cleanTextLines(infoText);
  let category = "";
  let address = "";
  let phone = "";
  let hours = "";

  lines.forEach((line) => {
    if (!phone) {
      phone = extractPhoneNumber(line);
    }

    const parts = line
      .split("·")
      .map((part) => cleanText(part))
      .filter(Boolean);

    parts.forEach((part) => {
      const lowered = part.toLowerCase();

      if (!hours && /\b(?:open|closed|hours)\b/i.test(part)) {
        hours = part;
        return;
      }

      if (
        !address &&
        /\d/.test(part) &&
        /[a-z]/i.test(part) &&
        !/\b(?:reviews?|stars?)\b/i.test(part)
      ) {
        address = part;
        return;
      }

      if (
        !category &&
        !/\d/.test(part) &&
        !/\b(?:website|directions|reviews?|stars?|open|closed|hours)\b/i.test(part) &&
        lowered.length <= 48
      ) {
        category = part;
      }
    });
  });

  return {
    category,
    address,
    phone,
    hours,
  };
}

function singularizeTerm(value = "") {
  const normalized = cleanText(value);

  if (!normalized || normalized.includes(" ")) {
    return "";
  }

  if (/ies$/i.test(normalized)) {
    return normalized.replace(/ies$/i, "y");
  }

  if (/sses$/i.test(normalized)) {
    return normalized.replace(/es$/i, "");
  }

  if (/s$/i.test(normalized) && !/ss$/i.test(normalized)) {
    return normalized.slice(0, -1);
  }

  return "";
}

function pluralizeTerm(value = "") {
  const normalized = cleanText(value);

  if (!normalized || normalized.includes(" ")) {
    return "";
  }

  if (/s$/i.test(normalized)) {
    return "";
  }

  if (/y$/i.test(normalized) && !/[aeiou]y$/i.test(normalized)) {
    return normalized.replace(/y$/i, "ies");
  }

  if (/(s|x|z|ch|sh)$/i.test(normalized)) {
    return `${normalized}es`;
  }

  if (/ing$/i.test(normalized)) {
    return "";
  }

  return `${normalized}s`;
}

function buildKeywordVariants(keyword = "") {
  const plan = buildCategorySearchPlan(cleanText(keyword), { maxTerms: 6 });
  const variants = [];
  const seen = new Set();

  function addVariant(value) {
    const normalized = cleanText(value);
    const dedupeKey = normalized.toLowerCase();

    if (!normalized || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    variants.push(normalized);
  }

  addVariant(plan.original);
  (plan.terms || []).forEach(addVariant);
  [plan.original, ...(plan.terms || [])].forEach((term) => {
    addVariant(singularizeTerm(term));
    addVariant(pluralizeTerm(term));
  });

  return variants.slice(0, 8);
}

function buildDiscoveryQueries({
  keyword = "",
  location = "",
  maxQueries = MAX_DISCOVERY_QUERIES,
} = {}) {
  const normalizedKeyword = cleanText(keyword);
  const normalizedLocation = cleanText(location);
  const variants = buildKeywordVariants(normalizedKeyword);
  const queries = [];
  const seen = new Set();

  function addQuery(value) {
    const normalized = cleanText(value);
    const dedupeKey = normalized.toLowerCase();

    if (!normalized || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    queries.push(normalized);
  }

  variants.forEach((term) => {
    addQuery(`${term} in ${normalizedLocation}`);
    addQuery(`${term} ${normalizedLocation}`);
    addQuery(`${normalizedLocation} ${term}`);
  });

  addQuery(`${normalizedKeyword} near ${normalizedLocation}`);
  addQuery(`${normalizedKeyword} services ${normalizedLocation}`);

  return queries.slice(0, Math.max(1, maxQueries));
}

function ensureEnglishMapsUrl(value = "") {
  const normalized = cleanText(value);

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized, "https://www.google.com");

    if (!/google\./i.test(url.hostname)) {
      return normalized;
    }

    url.searchParams.set("hl", "en");
    url.searchParams.set("gl", "us");
    return url.toString();
  } catch (error) {
    return normalized;
  }
}

function createMapsSearchUrl(query = "") {
  return `https://www.google.com/maps/search/${encodeURIComponent(
    cleanText(query)
  )}?hl=en&gl=us`;
}

function normalizeMapsUrlForKey(value = "") {
  const normalized = cleanText(value);

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized, "https://www.google.com");
    return `${url.origin}${url.pathname}`.replace(/\/+$/g, "");
  } catch (error) {
    return normalized.toLowerCase();
  }
}

function extractGoogleId(value = "") {
  const normalized = cleanText(value);
  const match = normalized.match(/!1s([^!]+)/);
  return cleanText(match?.[1]);
}

function createListingKey(listing = {}) {
  const normalizedUrl = normalizeMapsUrlForKey(listing.locationLink);
  const name = cleanText(listing.name).toLowerCase();
  const address = cleanText(listing.address).toLowerCase();

  return [normalizedUrl, name, address].filter(Boolean).join("|");
}

function mergeListingRecords(existing = {}, incoming = {}) {
  const merged = {
    ...existing,
    ...incoming,
  };

  [
    "name",
    "address",
    "phone",
    "website",
    "locationLink",
    "googleId",
    "placeId",
    "rating",
    "reviews",
    "category",
    "hours",
    "claimStatus",
    "websiteSource",
    "websiteSearchQuery",
    "websiteDomain",
  ].forEach((field) => {
    const existingValue = cleanText(existing[field]);
    const incomingValue = cleanText(incoming[field]);
    merged[field] = incomingValue || existingValue || "";
  });
  ["visibleReviewsCount", "ownerRepliesVisibleCount"].forEach((field) => {
    const incomingValue = Number(incoming[field]);
    const existingValue = Number(existing[field]);

    if (Number.isFinite(incomingValue) && incomingValue >= 0) {
      merged[field] = incomingValue;
    } else if (Number.isFinite(existingValue) && existingValue >= 0) {
      merged[field] = existingValue;
    } else {
      merged[field] = 0;
    }
  });

  merged.locationLink = ensureEnglishMapsUrl(merged.locationLink);
  merged.googleId = cleanText(merged.googleId) || extractGoogleId(merged.locationLink);
  merged.placeId = cleanText(merged.placeId) || merged.googleId;
  merged.listingId = cleanText(existing.listingId || incoming.listingId) || createListingKey(merged);
  merged.matchedQueries = [
    ...new Set([
      ...(Array.isArray(existing.matchedQueries) ? existing.matchedQueries : []),
      ...(Array.isArray(incoming.matchedQueries) ? incoming.matchedQueries : []),
    ]),
  ];
  merged.rankings = [
    ...(Array.isArray(existing.rankings) ? existing.rankings : []),
    ...(Array.isArray(incoming.rankings) ? incoming.rankings : []),
  ]
    .reduce((result, ranking) => {
      const query = cleanText(ranking?.query);
      const rank = Number(ranking?.rank);

      if (!query || !Number.isFinite(rank) || rank <= 0) {
        return result;
      }

      const existingRanking = result.find((item) => item.query === query);

      if (!existingRanking) {
        result.push({ query, rank });
      } else {
        existingRanking.rank = Math.min(existingRanking.rank, rank);
      }

      return result;
    }, [])
    .sort((left, right) => left.rank - right.rank);
  const bestRank = merged.rankings.reduce(
    (best, ranking) => Math.min(best, Number(ranking.rank) || Infinity),
    Infinity
  );
  merged.bestRank = Number.isFinite(bestRank) ? bestRank : "";
  [
    "attributes",
    "claimPromptCandidates",
    "claimHrefCandidates",
    "serviceOptions",
    "accessibility",
    "amenities",
    "highlights",
    "payments",
    "subtypes",
    "emails",
    "extraPhones",
    "socials",
    "pagesScanned",
  ].forEach((field) => {
    merged[field] = collectUniqueStrings([
      ...(Array.isArray(existing[field]) ? existing[field] : []),
      ...(Array.isArray(incoming[field]) ? incoming[field] : []),
    ]);
  });

  return merged;
}

function canonicalizePhotoUrl(value = "") {
  const normalized = cleanText(value);

  if (!normalized) {
    return "";
  }

  return normalized
    .split("?")[0]
    .replace(/=[^/?#]+$/i, "")
    .replace(/#.*$/g, "");
}

function buildPhotoDownloadUrls(value = "") {
  const normalized = cleanText(value);

  if (!normalized) {
    return [];
  }

  const withoutHash = normalized.replace(/#.*$/g, "");

  if (!/(googleusercontent\.com|ggpht\.com)/i.test(withoutHash)) {
    return [withoutHash];
  }

  const withoutQuery = withoutHash.split("?")[0];
  const baseUrl = withoutQuery.replace(/=[^/?#]+$/i, "");

  return [...new Set([
    `${baseUrl}=s0-d`,
    `${baseUrl}=s0`,
    `${baseUrl}=s4096`,
    `${baseUrl}=w4096-h4096-k-no`,
    `${baseUrl}=d`,
    withoutQuery,
    withoutHash,
  ])].filter(Boolean);
}

function extractPhotoSizeScore(value = "") {
  const normalized = cleanText(value);
  const widthHeightMatch = normalized.match(/=w(\d+)-h(\d+)/i);

  if (widthHeightMatch) {
    return Number(widthHeightMatch[1]) * Number(widthHeightMatch[2]);
  }

  const singleSizeMatch = normalized.match(/=s(\d+)/i);

  if (singleSizeMatch) {
    return Number(singleSizeMatch[1]) * Number(singleSizeMatch[1]);
  }

  return 0;
}

function chooseBetterPhoto(left = {}, right = {}) {
  const leftScore =
    Number(left.width || 0) * Number(left.height || 0) + extractPhotoSizeScore(left.url);
  const rightScore =
    Number(right.width || 0) * Number(right.height || 0) + extractPhotoSizeScore(right.url);

  return rightScore > leftScore ? right : left;
}

function normalizePhotoTag(tag = "") {
  const normalized = cleanText(tag).toLowerCase();

  if (!normalized || normalized === "all") {
    return "All";
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function assertGoogleNotBlocked(page, label) {
  const currentUrl = cleanText(page.url());
  const bodyText = cleanText(await page.locator("body").innerText().catch(() => ""));
  const combined = `${currentUrl} ${bodyText}`.toLowerCase();

  if (
    combined.includes("/sorry") ||
    combined.includes("unusual traffic") ||
    combined.includes("not a robot") ||
    combined.includes("detected unusual traffic")
  ) {
    throw new Error(`Google Maps blocked the browser during ${label}. Try again after a short wait.`);
  }
}

async function dismissGoogleUi(page) {
  const candidates = [
    page.getByRole("button", { name: /^accept all$/i }),
    page.getByRole("button", { name: /^i agree$/i }),
    page.getByRole("button", { name: /^accept$/i }),
    page.getByRole("button", { name: /^not now$/i }),
  ];

  for (const candidate of candidates) {
    try {
      if ((await candidate.count()) > 0) {
        await candidate.first().click({ timeout: 1500 });
        await page.waitForTimeout(600);
      }
    } catch (error) {
      void error;
    }
  }
}

async function waitForSearchSurface(page) {
  await page.waitForFunction(
    () => {
      const bodyText = document.body?.innerText || "";
      return (
        Boolean(document.querySelector('[role="feed"]')) ||
        Boolean(document.querySelector('[role="article"]')) ||
        Boolean(document.querySelector('a[href*="/maps/place/"]')) ||
        Boolean(document.querySelector("h1")) ||
        /no results|did not match any/i.test(bodyText)
      );
    },
    { timeout: 20000 }
  );
}

async function collectVisibleSearchListings(page, query) {
  const cards = await page
    .evaluate(() => {
      return Array.from(document.querySelectorAll('[role="article"]')).map((card) => {
        const link = card.querySelector('a[href*="/maps/place/"]');
        const nameNode =
          card.querySelector(".qBF1Pd") ||
          link ||
          card.querySelector('[aria-label][href*="/maps/place/"]');
        const ratingNode = card.querySelector('[role="img"][aria-label*="stars"]');
        const reviewNode = card.querySelector('[role="img"][aria-label*="reviews"]');
        const allInfoNodes = Array.from(card.querySelectorAll(".W4Efsd"));
        const infoText = allInfoNodes.map((n) => n.innerText?.trim()).filter(Boolean).join("\n");
        const websiteLink =
          card.querySelector('a[aria-label*=" website" i]') ||
          card.querySelector('a[aria-label^="Visit " i]') ||
          card.querySelector('a[data-value="Website"]');

        return {
          name:
            nameNode?.innerText?.trim() ||
            nameNode?.getAttribute?.("aria-label")?.trim() ||
            "",
          locationLink: link?.href || "",
          ratingText:
            card.querySelector(".MW4etd")?.textContent?.trim() ||
            ratingNode?.getAttribute?.("aria-label")?.trim() ||
            "",
          reviewsText: reviewNode?.getAttribute?.("aria-label")?.trim() || "",
          infoText: infoText || card.innerText || "",
          text: card.innerText || "",
          website: websiteLink?.href || "",
        };
      });
    })
    .catch(() => []);

  return cards
    .map((card) => {
      const parsedInfo = parseCardInfo(`${card.infoText}\n${card.text}`);
      const reviews = extractReviewCount(card.reviewsText || card.text);
      const rating = extractRating(card.ratingText);
      const name = cleanText(card.name);
      const locationLink = ensureEnglishMapsUrl(card.locationLink);
      const googleId = extractGoogleId(locationLink);

      return {
        listingId: createListingKey({
          name,
          address: parsedInfo.address,
          locationLink,
        }),
        name,
        address: parsedInfo.address,
        phone: parsedInfo.phone,
        website: cleanText(card.website),
        locationLink,
        googleId,
        placeId: googleId,
        rating,
        reviews,
        category: parsedInfo.category,
        hours: parsedInfo.hours,
        matchedQueries: [cleanText(query)],
        rawText: cleanText(card.text),
      };
    })
    .filter((card) => {
      if (!card.name || !card.locationLink) {
        return false;
      }

      if (/\bsponsored\b/i.test(card.rawText)) {
        return false;
      }

      return true;
    })
    .map(({ rawText, ...card }) => card);
}

async function extractDetailSnapshot(page, seedListing = {}) {
  const snapshot = await page.evaluate(() => {
    function cleanNodeText(value = "") {
      return String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();
    }

    function firstText(selectors = []) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);

        if (!node) {
          continue;
        }

        const value =
          node.innerText ||
          node.textContent ||
          node.getAttribute("aria-label") ||
          node.getAttribute("content") ||
          "";
        const normalized = cleanNodeText(value);

        if (normalized) {
          return normalized;
        }
      }

      return "";
    }

    function firstHref(selectors = []) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        const href = cleanNodeText(node?.href || node?.getAttribute?.("href") || "");

        if (href) {
          return href;
        }
      }

      return "";
    }

    function firstAria(selectors = []) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        const value = cleanNodeText(node?.getAttribute?.("aria-label") || "");

        if (value) {
          return value;
        }
      }

      return "";
    }

    const addressAria = firstAria([
      'button[data-item-id="address"]',
      'button[aria-label^="Address:"]',
    ]);
    const phoneAria = firstAria([
      'button[data-item-id^="phone:"]',
      'button[aria-label^="Phone:"]',
    ]);
    const ratingAria = firstAria(['span[role="img"][aria-label*="stars"]']);
    const reviewsText = firstText([
      'button[jsaction*="pane.reviewChart.moreReviews"]',
      'button[role="tab"][aria-label^="Reviews for"]',
      'span[role="img"][aria-label*="reviews"]',
    ]);
    const attributeCandidates = Array.from(
      document.querySelectorAll("button, span, div[role='button'], li")
    )
      .map((node) => cleanNodeText(node.innerText || node.textContent || ""))
      .filter(Boolean)
      .filter((value) => value.length <= 80)
      .slice(0, 400);

    const claimPromptPattern =
      /(claim this business|own this business\??|is this your business|request ownership|claim this listing|claim this profile|claim listing|claim profile)/i;

    const claimCtaSelectors = [
      'div.Io6YTe',
      'div[class*="Io6YTe"]',
      'span.Io6YTe',
      'a[data-item-id="merchant"]',
      'button[data-item-id="merchant"]',
      '[data-item-id="merchant"]',
      'a[aria-label*="Claim this business" i]',
      'a[aria-label*="Own this business" i]',
      'button[aria-label*="Claim this business" i]',
      'button[aria-label*="Own this business" i]',
      'div[aria-label*="Claim this business" i]',
      'a[href*="business.google.com"]',
      'a[href*="/business/manage"]',
      'a[role="button"]',
    ];

    const textCandidates = [];
    const hrefCandidates = [];

    const claimCtaNodes = Array.from(document.querySelectorAll(claimCtaSelectors.join(",")));
    for (const node of claimCtaNodes) {
      const promptText = cleanNodeText(
        node.getAttribute?.("aria-label") || node.innerText || node.textContent || ""
      );
      const href = cleanNodeText(node.getAttribute("href") || node.href || "");
      const merchantNode = cleanNodeText(node.getAttribute?.("data-item-id") || "") === "merchant";

      if (claimPromptPattern.test(promptText) && promptText.length <= 140) {
        if (!textCandidates.includes(promptText)) textCandidates.push(promptText);
      }

      if (merchantNode || href.includes("business.google.com") || href.includes("/business/manage")) {
        if (href && !hrefCandidates.includes(href)) hrefCandidates.push(href);
        if (!textCandidates.includes("Claim this business")) textCandidates.push("Claim this business");
      }
    }

    // Also check any general elements on the details pane containing the exact text
    const generalNodes = Array.from(document.querySelectorAll('.Io6YTe, button, a, [role="button"]'));
    for (const node of generalNodes) {
      const text = cleanNodeText(node.innerText || node.textContent || "");
      if (claimPromptPattern.test(text) && text.length <= 100) {
        if (!textCandidates.includes(text)) textCandidates.push(text);
      }
    }

    const claimPromptCandidates = textCandidates.slice(0, 30);
    const claimHrefCandidates = hrefCandidates.slice(0, 30);
    const claimStatus = claimPromptCandidates[0] || claimHrefCandidates[0] || "";

    return {
      name: firstText(["h1"]),
      address:
        cleanNodeText(addressAria.replace(/^Address:\s*/i, "")) ||
        firstText(['button[data-item-id="address"]']),
      phone:
        cleanNodeText(phoneAria.replace(/^Phone:\s*/i, "")) ||
        firstText(['button[data-item-id^="phone:"]']),
      website: firstHref(['a[data-item-id="authority"]', '[data-item-id="authority"] a']),
      rating: cleanNodeText(
        firstText([".F7nice .MW4etd", 'span[role="img"][aria-label*="stars"]'])
      ),
      ratingAria,
      reviews: reviewsText,
      category: firstText([
        'button[jsaction*="pane.rating.category"]',
        'button[aria-label*="category"]',
      ]),
      hours: firstText(['div[aria-label*="Hours"]', '[data-item-id="oh"]']),
      claimStatus,
      claimPromptCandidates,
      claimHrefCandidates,
      attributeCandidates,
      locationLink: window.location.href,
    };
  });

  const rating = extractRating(snapshot.rating || snapshot.ratingAria);
  const reviews = extractReviewCount(snapshot.reviews);
  const locationLink = ensureEnglishMapsUrl(snapshot.locationLink || seedListing.locationLink);
  const googleId = extractGoogleId(locationLink || seedListing.locationLink);
  const classifiedAttributes = classifyAttributeTexts(
    Array.isArray(snapshot.attributeCandidates) ? snapshot.attributeCandidates : [],
    snapshot.category
  );
  const hasClaimPrompt =
    (Array.isArray(snapshot.claimPromptCandidates) && snapshot.claimPromptCandidates.length > 0) ||
    (Array.isArray(snapshot.claimHrefCandidates) && snapshot.claimHrefCandidates.length > 0) ||
    Boolean(cleanText(snapshot.claimStatus));

  return mergeListingRecords(seedListing, {
    listingId:
      cleanText(seedListing.listingId) ||
      createListingKey({
        name: snapshot.name || seedListing.name,
        address: snapshot.address || seedListing.address,
        locationLink,
      }),
    name: cleanText(snapshot.name),
    address: cleanText(snapshot.address),
    phone: extractPhoneNumber(snapshot.phone) || cleanText(snapshot.phone),
    website: cleanText(snapshot.website),
    locationLink,
    googleId,
    placeId: googleId,
    rating,
    reviews,
    category: cleanText(snapshot.category),
    hours: cleanText(snapshot.hours),
    gmb_claimed: !hasClaimPrompt,
    claimed: !hasClaimPrompt,
    isClaimed: !hasClaimPrompt,
    gmb_claim_source: hasClaimPrompt ? "maps_page_unclaimed" : "maps_page_claimed",
    claimStatus: cleanText(snapshot.claimStatus),
    claimPromptCandidates: Array.isArray(snapshot.claimPromptCandidates)
      ? snapshot.claimPromptCandidates
      : [],
    claimHrefCandidates: Array.isArray(snapshot.claimHrefCandidates)
      ? snapshot.claimHrefCandidates
      : [],
    attributes: classifiedAttributes.attributes,
    serviceOptions: classifiedAttributes.serviceOptions,
    accessibility: classifiedAttributes.accessibility,
    amenities: classifiedAttributes.amenities,
    highlights: classifiedAttributes.highlights,
    payments: classifiedAttributes.payments,
    subtypes: classifiedAttributes.subtypes,
  });
}

async function collectPhotoCandidates(page) {
  return page
    .evaluate(() => {
      const candidates = [];

      function addCandidate(url, width, height) {
        const normalizedUrl = String(url ?? "").trim();

        if (!normalizedUrl) {
          return;
        }

        candidates.push({
          url: normalizedUrl,
          width: Number(width) || 0,
          height: Number(height) || 0,
        });
      }

      document.querySelectorAll("img").forEach((node) => {
        addCandidate(
          node.currentSrc || node.src,
          node.naturalWidth || node.width,
          node.naturalHeight || node.height
        );
      });

      document.querySelectorAll('[style*="background"]').forEach((node) => {
        const backgroundImage = window.getComputedStyle(node).backgroundImage || "";
        const matches = backgroundImage.match(/url\(["']?(https?:[^"')]+)["']?\)/gi) || [];
        const rect = node.getBoundingClientRect();

        matches.forEach((match) => {
          const urlMatch = match.match(/url\(["']?(https?:[^"')]+)["']?\)/i);
          addCandidate(urlMatch?.[1], rect.width, rect.height);
        });
      });

      return candidates;
    })
    .catch(() => []);
}

async function openPhotoGallery(page, tag = "all") {
  const buttonCandidates = [
    page.getByRole("button", { name: /see photos/i }),
    page.locator('button[aria-label^="Photo of"]'),
    page.locator('button[aria-label*=" photos"]'),
  ];

  let clicked = false;

  for (const locator of buttonCandidates) {
    try {
      if ((await locator.count()) > 0) {
        await locator.first().click({ timeout: 2500 });
        clicked = true;
        break;
      }
    } catch (error) {
      void error;
    }
  }

  if (!clicked) {
    return false;
  }

  await page.waitForTimeout(1400);

  const tagLabel = normalizePhotoTag(tag);

  if (tagLabel !== "All") {
    try {
      const tab = page.getByRole("tab", { name: new RegExp(`^${tagLabel}$`, "i") });

      if ((await tab.count()) > 0) {
        await tab.first().click({ timeout: 1500 });
        await page.waitForTimeout(700);
      }
    } catch (error) {
      void error;
    }
  }

  return true;
}

async function gotoMapsPage(page, url, label) {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: DEFAULT_TIMEOUT,
  });
  await dismissGoogleUi(page);
  await assertGoogleNotBlocked(page, label);
}

async function searchGmbListings({
  keyword = "",
  location = "",
  listingsPerQuery = DEFAULT_LISTINGS_LIMIT,
  sessionId = "",
  onProgress,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const normalizedKeyword = cleanText(keyword);
  const normalizedLocation = cleanText(location);
  const normalizedListingsPerQuery = normalizePositiveInteger(
    listingsPerQuery,
    DEFAULT_LISTINGS_LIMIT,
    {
      min: 1,
      max: MAX_LISTINGS_LIMIT,
    }
  );
  const queriesUsed = buildDiscoveryQueries({
    keyword: normalizedKeyword,
    location: normalizedLocation,
  });

  let browser = null;
  let context = null;
  let page = null;
  let serpPage = null;
  const listingsMap = new Map();
  let processedQueries = 0;

  try {
    browser = await createBrowser("gmb-photo-scraper");
    context = await createContext(browser, { timezoneId: "America/New_York" });
    page = await context.newPage();
    serpPage = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    serpPage.setDefaultTimeout(DEFAULT_TIMEOUT);

    for (const query of queriesUsed) {
      await safeWaitIfPaused("gmb-photo-scraper", waitIfPaused);

      if (await safeShouldCancel("gmb-photo-scraper", shouldCancel)) {
        break;
      }

      await gotoMapsPage(page, createMapsSearchUrl(query), "listing discovery");
      await waitForSearchSurface(page);

      let queryListings = [];
      let queryOrderedKeys = [];
      let stagnantPasses = 0;
      const maxScrolls = Math.min(
        80,
        Math.max(12, Math.ceil(normalizedListingsPerQuery / 4))
      );

      for (let scrollIndex = 0; scrollIndex < maxScrolls; scrollIndex += 1) {
        await safeWaitIfPaused("gmb-photo-scraper", waitIfPaused);

        if (await safeShouldCancel("gmb-photo-scraper", shouldCancel)) {
          break;
        }

        const currentUrl = cleanText(page.url());
        const appearsToBeDetailPage =
          currentUrl.includes("/maps/place/") && (await page.locator("h1").count()) > 0;

        if (appearsToBeDetailPage) {
          const snapshot = await extractDetailSnapshot(page, {
            matchedQueries: [query],
            rankings: [{ query, rank: 1 }],
          });

          if (snapshot.name && snapshot.locationLink) {
            queryListings = [snapshot];
            queryOrderedKeys = [createListingKey(snapshot)];
          }

          break;
        }

        const visibleListings = await collectVisibleSearchListings(page, query);
        visibleListings.forEach((listing) => {
          const key = createListingKey(listing);
          const rank = queryOrderedKeys.includes(key)
            ? queryOrderedKeys.indexOf(key) + 1
            : queryOrderedKeys.push(key);
          const existing = listingsMap.get(key);
          listingsMap.set(
            key,
            mergeListingRecords(existing, {
              ...listing,
              rankings: [{ query, rank }],
            })
          );
        });

        const nextQueryListings = queryOrderedKeys
          .map((key) => listingsMap.get(key))
          .filter(Boolean)
          .slice(0, normalizedListingsPerQuery);

        if (nextQueryListings.length <= queryListings.length) {
          stagnantPasses += 1;
        } else {
          stagnantPasses = 0;
          queryListings = nextQueryListings;
        }

        if (queryListings.length >= normalizedListingsPerQuery || stagnantPasses >= SEARCH_STAGNANT_LIMIT) {
          break;
        }

        const didScroll = await page.evaluate(() => {
          const feed = document.querySelector('[role="feed"]');

          if (!feed) {
            return false;
          }

          feed.scrollTop = feed.scrollHeight;
          return true;
        });

        if (!didScroll) {
          break;
        }

        await page.waitForTimeout(SEARCH_SCROLL_WAIT_MS);
      }

      processedQueries += 1;

      await safeProgress("gmb-photo-scraper", onProgress, {
        processedQueries,
        totalQueries: queriesUsed.length,
        totalListings: listingsMap.size,
        serpResults: [],
        queriesUsed,
        listings: [...listingsMap.values()],
      });

      await sleep(250);
    }

    const serpQuery = `${normalizedKeyword} ${normalizedLocation}`;
    const webSerp = await searchWebOrganicResultsWithPage(serpPage, serpQuery, SERP_RESULT_LIMIT);
    const serpResults = webSerp.results;
    const rankSnapshot = await saveRankSnapshot({
      keyword: normalizedKeyword,
      location: normalizedLocation,
      queriesUsed,
      listings: [...listingsMap.values()],
      serpProvider: webSerp.provider,
      serpResults,
      sessionId,
    });

    return {
      keyword: normalizedKeyword,
      location: normalizedLocation,
      serpQuery,
      serpProvider: webSerp.provider,
      serpResults,
      snapshotCapturedAt: rankSnapshot.capturedAt,
      rankSnapshotId: rankSnapshot.snapshotId,
      rankSnapshotPath: rankSnapshot.snapshotPath,
      queriesUsed,
      processedQueries,
      totalListings: listingsMap.size,
      listings: [...listingsMap.values()],
    };
  } finally {
    await closeResources("gmb-photo-scraper", { page: serpPage, context: null, browser: null });
    await closeResources("gmb-photo-scraper", { page, context, browser });
  }
}

async function extractGmbListingPhotos({
  listings = [],
  photosPerListing = DEFAULT_PHOTOS_LIMIT,
  tag = "all",
  keyword = "",
  location = "",
  jobId = "",
  sessionId = "",
  onProgress,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const normalizedPhotosPerListing = normalizePositiveInteger(
    photosPerListing,
    DEFAULT_PHOTOS_LIMIT,
    {
      min: 1,
      max: MAX_PHOTOS_LIMIT,
    }
  );
  const normalizedListings = Array.isArray(listings)
    ? listings.map((listing) => ({
        ...listing,
        locationLink: ensureEnglishMapsUrl(listing.locationLink),
      }))
    : [];
  const downloadContext = createDownloadContext({
    keyword,
    location,
    jobId,
    sessionId,
  });

  let browser = null;
  let context = null;
  let page = null;
  let serpPage = null;
  const items = [];

  try {
    await ensureDirectory(downloadContext.downloadSessionDir);
    browser = await createBrowser("gmb-photo-scraper-photos");
    context = await createContext(browser, { timezoneId: "America/New_York" });
    page = await context.newPage();
    serpPage = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    serpPage.setDefaultTimeout(DEFAULT_TIMEOUT);

    for (let index = 0; index < normalizedListings.length; index += 1) {
      await safeWaitIfPaused("gmb-photo-scraper-photos", waitIfPaused);

      if (await safeShouldCancel("gmb-photo-scraper-photos", shouldCancel)) {
        break;
      }

      const seedListing = normalizedListings[index] || {};
      const baseItem = mergeListingRecords({}, seedListing);
      const locationLink = ensureEnglishMapsUrl(baseItem.locationLink);

      if (!locationLink) {
        items.push({
          ...baseItem,
          photos: [],
          photoCount: 0,
          errorMessage: "Missing Google Maps listing URL.",
        });

        await safeProgress("gmb-photo-scraper-photos", onProgress, {
          processedListings: items.length,
          totalListings: normalizedListings.length,
          totalPhotos: items.reduce((sum, item) => sum + Number(item.photoCount || 0), 0),
          items,
        });

        continue;
      }

      let detailSnapshot = baseItem;
      const photosByCanonicalUrl = new Map();
      let errorMessage = "";

      try {
        await gotoMapsPage(page, locationLink, "photo extraction");
        detailSnapshot = await extractDetailSnapshot(page, baseItem);
        const reviewSignals = await extractVisibleReviewSignals(page, locationLink);
        detailSnapshot = mergeListingRecords(detailSnapshot, reviewSignals);
        await assertGoogleNotBlocked(page, "photo extraction");

        const websiteDiscovery = await findWebsiteForListingWithPage(
          serpPage,
          detailSnapshot,
          keyword,
          location
        );
        const websiteToEnrich = websiteDiscovery.website || detailSnapshot.website;
        const websiteContactData = await enrichWebsiteContactData(websiteToEnrich);

        detailSnapshot = mergeListingRecords(detailSnapshot, {
          website: websiteToEnrich,
          websiteSource: websiteDiscovery.source || (cleanText(detailSnapshot.website) ? "gmb" : ""),
          websiteSearchQuery: websiteDiscovery.searchQuery || "",
          websiteDomain: websiteContactData.domain,
          emails: websiteContactData.emails,
          extraPhones: websiteContactData.extraPhones.filter(
            (phone) => phone !== cleanText(detailSnapshot.phone)
          ),
          socials: websiteContactData.socials,
          pagesScanned: websiteContactData.pagesScanned,
        });

        const opened = await openPhotoGallery(page, tag);

        if (opened) {
          let stagnantPasses = 0;
          const maxScrolls = Math.min(
            120,
            Math.max(16, Math.ceil(normalizedPhotosPerListing / 2))
          );

          for (let scrollIndex = 0; scrollIndex < maxScrolls; scrollIndex += 1) {
            await safeWaitIfPaused("gmb-photo-scraper-photos", waitIfPaused);

            if (await safeShouldCancel("gmb-photo-scraper-photos", shouldCancel)) {
              break;
            }

            const previousSize = photosByCanonicalUrl.size;
            const candidates = await collectPhotoCandidates(page);

            candidates.forEach((candidate) => {
              const url = cleanText(candidate.url);
              const canonicalUrl = canonicalizePhotoUrl(url);

              if (
                !canonicalUrl ||
                !/(googleusercontent\.com|ggpht\.com)/i.test(url) ||
                Number(candidate.width || 0) < MIN_PHOTO_DIMENSION ||
                Number(candidate.height || 0) < MIN_PHOTO_DIMENSION
              ) {
                return;
              }

              const existing = photosByCanonicalUrl.get(canonicalUrl);
              const normalizedCandidate = {
                url,
                thumbnailUrl: url,
                downloadUrl: buildPhotoDownloadUrls(url)[0] || url,
                width: Number(candidate.width) || 0,
                height: Number(candidate.height) || 0,
                uploadedAt: "",
                author: "",
              };

              photosByCanonicalUrl.set(
                canonicalUrl,
                existing ? chooseBetterPhoto(existing, normalizedCandidate) : normalizedCandidate
              );
            });

            if (photosByCanonicalUrl.size >= normalizedPhotosPerListing) {
              break;
            }

            if (photosByCanonicalUrl.size === previousSize) {
              stagnantPasses += 1;
            } else {
              stagnantPasses = 0;
            }

            if (stagnantPasses >= PHOTO_STAGNANT_LIMIT) {
              break;
            }

            await page.mouse.wheel(0, 1500);
            await page.waitForTimeout(PHOTO_SCROLL_WAIT_MS);
          }
        }
      } catch (error) {
        errorMessage = cleanText(error.message);
      }

      const photos = [...photosByCanonicalUrl.values()]
        .sort((left, right) => {
          const leftScore =
            Number(left.width || 0) * Number(left.height || 0) + extractPhotoSizeScore(left.url);
          const rightScore =
            Number(right.width || 0) * Number(right.height || 0) + extractPhotoSizeScore(right.url);

          return rightScore - leftScore;
        })
        .slice(0, normalizedPhotosPerListing)
        .map(({ width, height, ...photo }) => photo);
      const downloadDirectory = createListingDownloadDirectory(
        downloadContext,
        detailSnapshot,
        index
      );
      const downloadedPhotos = [];

      for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 1) {
        const photo = photos[photoIndex];

        try {
          downloadedPhotos.push(
            await downloadPhotoFile({
              photo,
              downloadDirectory,
              photoIndex,
            })
          );
        } catch (downloadError) {
          downloadedPhotos.push({
            ...photo,
            localFilePath: "",
            localUrl: "",
            downloadError: cleanText(downloadError.message),
          });

          if (!errorMessage) {
            errorMessage = cleanText(downloadError.message);
          }
        }
      }

      items.push({
        ...detailSnapshot,
        photos: downloadedPhotos,
        photoCount: downloadedPhotos.length,
        downloadedPhotoCount: downloadedPhotos.filter((photo) => cleanText(photo.localFilePath)).length,
        downloadDirectory,
        ...buildLeadScore(
          {
            ...detailSnapshot,
            downloadedPhotoCount: downloadedPhotos.filter((photo) =>
              cleanText(photo.localFilePath)
            ).length,
            photoCount: downloadedPhotos.length,
          },
          normalizedPhotosPerListing
        ),
        errorMessage,
      });

      await safeProgress("gmb-photo-scraper-photos", onProgress, {
        processedListings: items.length,
        totalListings: normalizedListings.length,
        totalPhotos: items.reduce((sum, item) => sum + Number(item.photoCount || 0), 0),
        downloadedPhotos: items.reduce(
          (sum, item) => sum + Number(item.downloadedPhotoCount || 0),
          0
        ),
        downloadRootDir: downloadContext.downloadRootDir,
        downloadSessionDir: downloadContext.downloadSessionDir,
        items,
      });

      await sleep(250);
    }

    return {
      photosPerListing: normalizedPhotosPerListing,
      tag: cleanText(tag) || "all",
      downloadRootDir: downloadContext.downloadRootDir,
      downloadSessionDir: downloadContext.downloadSessionDir,
      totalListings: items.length,
      totalPhotos: items.reduce((sum, item) => sum + Number(item.photoCount || 0), 0),
      downloadedPhotos: items.reduce(
        (sum, item) => sum + Number(item.downloadedPhotoCount || 0),
        0
      ),
      items,
    };
  } finally {
    await closeResources("gmb-photo-scraper-photos", { page: serpPage, context: null, browser: null });
    await closeResources("gmb-photo-scraper-photos", { page, context, browser });
  }
}

module.exports = {
  buildDiscoveryQueries,
  searchGmbListings,
  extractGmbListingPhotos,
  DEFAULT_LISTINGS_LIMIT,
  MAX_LISTINGS_LIMIT,
  DEFAULT_PHOTOS_LIMIT,
  MAX_PHOTOS_LIMIT,
};


