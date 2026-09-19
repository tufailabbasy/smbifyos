const fs = require("fs");
const path = require("path");
const { scrapeDirectoryViaBingRss, emitProgress } = require("./bing-rss-utils.cjs");

const UNCLAIMED_TEXT_PATTERNS = [
  /\bclaim\s+this\s+(?:business|listing|profile)\b/i,
  /\bclaim\s+(?:your\s+)?(?:business|listing|profile)\b/i,
  /\bis\s+this\s+your\s+business\b/i,
  /\bown\s+this\s+business\b/i,
  /\bunclaimed\b/i,
  /\bnot\s+claimed\b/i,
  /\brequest\s+ownership\b/i,
  /\bclaim\s+listing\b/i,
  /\bclaim\s+profile\b/i,
  /"isclaimed"\s*:\s*false/i,
  /"claimed"\s*:\s*false/i,
  /"ownershipstate"\s*:\s*"unclaimed"/i,
];

const CLAIMED_TEXT_PATTERNS = [
  /"isclaimed"\s*:\s*true/i,
  /"claimed"\s*:\s*true/i,
  /"ownershipstate"\s*:\s*"claimed"/i,
];

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
    path.resolve(__dirname, "../../legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(process.cwd(), "legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(process.cwd(), "SMBify Lead OS/legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
    path.resolve(__dirname, "../../../../legacy-modules/gmb-and-state-scrapper/server/modules/gmb-photo-scraper.js"),
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

function resolveGmbSharedModulePath() {
  const rootHint = cleanText(
    process.env.GMB_STATE_SCRAPER_ROOT || process.env.GMB_AND_STATE_SCRAPER_ROOT
  );
  const explicitShared = cleanText(process.env.GMB_SHARED_SCRAPER_MODULE);

  const candidates = [
    explicitShared,
    rootHint ? path.join(rootHint, "server", "scrapers", "shared.js") : "",
    path.resolve(__dirname, "../../../legacy-modules/gmb-and-state-scrapper/server/scrapers/shared.js"),
    path.resolve(__dirname, "../../legacy-modules/gmb-and-state-scrapper/server/scrapers/shared.js"),
    path.resolve(process.cwd(), "legacy-modules/gmb-and-state-scrapper/server/scrapers/shared.js"),
    path.resolve(process.cwd(), "SMBify Lead OS/legacy-modules/gmb-and-state-scrapper/server/scrapers/shared.js"),
    path.resolve(__dirname, "../../../../legacy-modules/gmb-and-state-scrapper/server/scrapers/shared.js"),
  ];

  return resolveFirstExistingPath(candidates);
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return null;

  if (["1", "true", "yes", "y", "claimed"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "unclaimed", "not claimed"].includes(normalized)) {
    return false;
  }

  return null;
}

function detectClaimedFromText(value) {
  const text = cleanText(value);
  if (!text) return null;

  if (UNCLAIMED_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (CLAIMED_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return null;
}

function collectStringSignals(value, out, depth) {
  if (!value || depth > 2 || out.length >= 160) return;

  if (typeof value === "string") {
    const text = cleanText(value);
    if (text) out.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringSignals(item, out, depth + 1);
      if (out.length >= 160) break;
    }
    return;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectStringSignals(nested, out, depth + 1);
      if (out.length >= 160) break;
    }
  }
}

function parseUrlFromListingId(value) {
  const raw = cleanText(value);
  if (!raw) return "";

  const maybeUrl = raw.split("|")[0];
  if (/^https?:\/\//i.test(maybeUrl)) {
    return maybeUrl;
  }

  return "";
}

function normalizeMapsUrl(value) {
  const raw = cleanText(value);
  if (!raw) return "";

  try {
    const parsed = new URL(raw, "https://www.google.com");
    if (!/google\./i.test(parsed.hostname)) {
      return "";
    }

    parsed.searchParams.set("hl", "en");
    parsed.searchParams.set("gl", "us");
    return parsed.toString();
  } catch {
    return "";
  }
}

function detectClaimedFromListingSignals(listing) {
  if (!listing || typeof listing !== "object") {
    return null;
  }

  const source = listing;

  const directBooleanFields = [
    source.gmb_claimed,
    source.claimed,
    source.isClaimed,
    source.is_claimed,
    source.ownerClaimed,
    source.businessClaimed,
  ];

  for (const candidate of directBooleanFields) {
    const parsed = normalizeBoolean(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const invertedBooleanFields = [source.unclaimed, source.isUnclaimed, source.notClaimed];
  for (const candidate of invertedBooleanFields) {
    const parsed = normalizeBoolean(candidate);
    if (parsed !== null) {
      return !parsed;
    }
  }

  const textSignals = [];
  const textSignalFields = [
    source.claimStatus,
    source.claimPromptCandidates,
    source.claimHrefCandidates,
    source.ownershipStatus,
    source.verificationStatus,
    source.badge,
    source.badges,
    source.attributes,
    source.serviceOptions,
    source.highlights,
    source.rawText,
    source.text,
    source.snippet,
    source.description,
    source.summary,
    source.note,
  ];

  for (const signal of textSignalFields) {
    collectStringSignals(signal, textSignals, 0);
  }

  for (const signal of textSignals) {
    const parsed = detectClaimedFromText(signal);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

async function createClaimProbeSession(options) {
  const sharedModulePath = resolveGmbSharedModulePath();
  if (!sharedModulePath) {
    return null;
  }

  let sharedModule;
  try {
    sharedModule = require(sharedModulePath);
  } catch {
    return null;
  }

  if (
    typeof sharedModule?.createBrowser !== "function" ||
    typeof sharedModule?.createContext !== "function" ||
    typeof sharedModule?.closeResources !== "function"
  ) {
    return null;
  }

  let browser = null;
  let context = null;
  const pages = [];

  try {
    const requestedConcurrency = Number(options?.concurrency);
    const concurrency = Number.isFinite(requestedConcurrency)
      ? Math.max(1, Math.min(8, Math.round(requestedConcurrency)))
      : 1;

    browser = await sharedModule.createBrowser("gmb-claim-probe");
    context = await sharedModule.createContext(browser, { timezoneId: "America/New_York" });

    for (let index = 0; index < concurrency; index += 1) {
      const page = await context.newPage();
      page.setDefaultTimeout(Number(process.env.GMB_CLAIM_PAGE_TIMEOUT_MS || 10000));
      pages.push(page);
    }

    return {
      browser,
      context,
      pages,
      closeResources: sharedModule.closeResources,
    };
  } catch {
    try {
      for (const page of pages) {
        await sharedModule.closeResources("gmb-claim-probe", {
          page,
          context: null,
          browser: null,
        });
      }
      await sharedModule.closeResources("gmb-claim-probe", {
        page: null,
        context,
        browser,
      });
    } catch {
      // Ignore cleanup errors.
    }

    return null;
  }
}

async function closeClaimProbeSession(session) {
  if (!session || typeof session.closeResources !== "function") {
    return;
  }

  try {
    if (Array.isArray(session.pages)) {
      for (const page of session.pages) {
        await session.closeResources("gmb-claim-probe", {
          page,
          context: null,
          browser: null,
        });
      }
    }

    await session.closeResources("gmb-claim-probe", {
      page: null,
      context: session.context,
      browser: session.browser,
    });
  } catch {
    // Ignore cleanup errors.
  }
}

async function probeClaimStatusFromMapsPageDom(url, timeoutMs, probePage) {
  if (!url || !probePage) {
    return null;
  }

  try {
    const page = probePage;
    const navigationTimeoutMs = Math.max(2500, Number(timeoutMs) || 5000);

    const readSnapshot = async () =>
      page.evaluate(() => {
        function cleanNodeText(value = "") {
          return String(value ?? "")
            .replace(/\u00a0/g, " ")
            .replace(/\r/g, "")
            .replace(/[ \t]+/g, " ")
            .replace(/\n+/g, " ")
            .trim();
        }

        const claimPromptPattern =
          /(claim this business|own this business\??|is this your business|request ownership|claim this listing|claim this profile|claim listing|claim profile)/i;

        const ctaSelectors = [
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

        const ctaNodes = Array.from(document.querySelectorAll(ctaSelectors.join(",")));
        for (const node of ctaNodes) {
          const text = cleanNodeText(node.getAttribute?.("aria-label") || node.innerText || node.textContent || "");
          const href = cleanNodeText(node.getAttribute?.("href") || node.href || "");
          const merchantNode = cleanNodeText(node.getAttribute?.("data-item-id") || "") === "merchant";

          if (claimPromptPattern.test(text) && text.length <= 140) {
            if (!textCandidates.includes(text)) textCandidates.push(text);
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

        const businessTitle = cleanNodeText(
          document.querySelector("h1")?.innerText || document.querySelector("h1")?.textContent || ""
        );
        const panelLoaded =
          Boolean(businessTitle) &&
          Boolean(
            document.querySelector(
              'button[data-item-id="address"], button[aria-label^="Address:"], button[data-item-id^="phone:"], button[aria-label^="Phone:"], a[data-item-id="authority"], a[aria-label^="Website:"], button[aria-label^="Website:"], button[jsaction*="pane.rating.moreReviews"], button[data-item-id="reviews"], button[data-item-id="direction"]'
            )
          );

        const pageText = cleanNodeText(document.body?.innerText || "");
        const pageLooksBlocked =
          /google\.com\/sorry\//i.test(window.location.href) ||
          /consent\.google\./i.test(window.location.href) ||
          /unusual traffic|sorry|before you continue to google maps|before you continue to google/i.test(
            pageText
          );

        return {
          textCandidates,
          hrefCandidates,
          panelLoaded,
          pageLooksBlocked,
        };
      });

    try {
      await page.goto("about:blank", {
        waitUntil: "domcontentloaded",
        timeout: Math.min(3000, navigationTimeoutMs),
      });
    } catch {
      // Ignore reset failures and continue with target navigation.
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
    await page.waitForTimeout(900);

    let snapshot = await readSnapshot();

    // Google Maps often hydrates claim CTA shortly after domcontentloaded.
    if (
      !snapshot.pageLooksBlocked &&
      !snapshot.panelLoaded &&
      (snapshot.textCandidates || []).length === 0 &&
      (snapshot.hrefCandidates || []).length === 0
    ) {
      await page.waitForTimeout(1300);
      snapshot = await readSnapshot();

      if (
        !snapshot.pageLooksBlocked &&
        !snapshot.panelLoaded &&
        (snapshot.textCandidates || []).length === 0 &&
        (snapshot.hrefCandidates || []).length === 0
      ) {
        await page.waitForTimeout(1700);
        snapshot = await readSnapshot();
      }
    }

    if (snapshot.pageLooksBlocked) {
      return null;
    }

    const combinedSignalText = [...(snapshot.textCandidates || []), ...(snapshot.hrefCandidates || [])].join(
      " | "
    );
    const parsed = detectClaimedFromText(combinedSignalText);

    if (parsed !== null) {
      return {
        claimed: parsed,
        source: parsed ? "maps_page_claimed" : "maps_page_unclaimed",
      };
    }

    if ((snapshot.textCandidates || []).length > 0 || (snapshot.hrefCandidates || []).length > 0) {
      return {
        claimed: false,
        source: "maps_page_unclaimed",
      };
    }

    if (snapshot.panelLoaded) {
      return {
        claimed: true,
        source: "maps_page_no_claim_prompt",
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function probeClaimStatusFromMapsPageStatic(url, timeoutMs) {
  if (!url || typeof fetch !== "function") {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return detectClaimedFromText(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeClaimStatusFromMapsPage(url, timeoutMs, probePage) {
  if (probePage) {
    const domResult = await probeClaimStatusFromMapsPageDom(url, timeoutMs, probePage);
    if (domResult !== null) {
      return domResult;
    }
  }

  const staticDetected = await probeClaimStatusFromMapsPageStatic(url, timeoutMs);
  if (staticDetected !== null) {
    return {
      claimed: staticDetected,
      source: staticDetected ? "maps_page_claimed" : "maps_page_unclaimed",
    };
  }

  if (probePage) {
    return probeClaimStatusFromMapsPageDom(url, timeoutMs, probePage);
  }

  return null;
}

async function enrichListingsWithClaimStatus(listings, options) {
  const items = Array.isArray(listings) ? listings : [];
  if (items.length === 0) {
    return items;
  }

  const requestedClaimLimit = Number(options?.claimCheckLimit);
  const claimCheckLimit =
    Number.isFinite(requestedClaimLimit) && requestedClaimLimit > 0
      ? Math.min(items.length, Math.max(0, Math.round(requestedClaimLimit)))
      : items.length;
  const requestedConcurrency = Number(options?.claimCheckConcurrency || 6);
  const claimCheckConcurrency = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.min(8, Math.round(requestedConcurrency)))
    : 6;
  const claimCheckDelayMs = Math.max(0, Number(options?.claimCheckDelayMs || 10));
  const claimCheckTimeoutMs = Math.max(1800, Number(options?.claimCheckTimeoutMs || 4000));
  const claimCheckRetryCount = Math.max(
    0,
    Math.min(2, Math.round(Number(options?.claimCheckRetryCount ?? 1)))
  );
  const claimCheckRetryDelayMs = Math.max(0, Number(options?.claimCheckRetryDelayMs || 600));
  const claimCheckRetryTimeoutStepMs = Math.max(
    0,
    Number(options?.claimCheckRetryTimeoutStepMs || 1800)
  );
  const previewLimit = Math.max(10, Number(options?.previewLimit || 150));
  const claimProbeSession =
    claimCheckLimit > 0 ? await createClaimProbeSession({ concurrency: claimCheckConcurrency }) : null;
  const claimProbePages = Array.isArray(claimProbeSession?.pages) ? claimProbeSession.pages : [];

  const enriched = new Array(items.length);
  let pageChecksUsed = 0;
  let processedCount = 0;
  let nextIndex = 0;

  function buildPreviewSnapshot() {
    const snapshotLimit = Math.min(previewLimit, items.length);
    const previewSeed = [];

    for (let snapshotIndex = 0; snapshotIndex < snapshotLimit; snapshotIndex += 1) {
      previewSeed.push(enriched[snapshotIndex] || items[snapshotIndex]);
    }

    return toPreviewListings(previewSeed, previewLimit);
  }

  async function processListing(index, probePage) {
    const item = items[index] || {};
    let claimed = detectClaimedFromListingSignals(item);
    let claimSource =
      claimed === null ? "unknown" : claimed ? "listing_claimed_signal" : "listing_unclaimed_signal";

    if (claimed === null && pageChecksUsed < claimCheckLimit) {
      const candidateUrl = normalizeMapsUrl(
        item.locationLink || item.gmb_url || parseUrlFromListingId(item.listingId)
      );

      if (candidateUrl) {
        pageChecksUsed += 1;
        const maxProbeAttempts = 1 + claimCheckRetryCount;

        for (let attempt = 0; attempt < maxProbeAttempts; attempt += 1) {
          const attemptTimeout = claimCheckTimeoutMs + claimCheckRetryTimeoutStepMs * attempt;
          const probed = await probeClaimStatusFromMapsPage(candidateUrl, attemptTimeout, probePage);
          if (probed && typeof probed.claimed === "boolean") {
            claimed = probed.claimed;
            claimSource =
              cleanText(probed.source) || (probed.claimed ? "maps_page_claimed" : "maps_page_unclaimed");
            break;
          }

          if (attempt + 1 < maxProbeAttempts && claimCheckRetryDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, claimCheckRetryDelayMs));
          }
        }

        if (claimCheckDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, claimCheckDelayMs));
        }
      }
    }

    if (claimed === null) {
      // On Google Maps, listings without a "Claim this business" CTA are claimed
      claimed = true;
      claimSource = "maps_page_no_claim_prompt";
    }

    enriched[index] = {
      ...item,
      gmb_claimed: claimed,
      gmb_claim_source: claimSource,
    };

    if (typeof options?.onProgress === "function") {
      processedCount += 1;
      options.onProgress({
        processed: processedCount,
        total: items.length,
        previewListings: buildPreviewSnapshot(),
      });
    }
  }

  async function runWorker(workerIndex) {
    const probePage = claimProbePages[workerIndex] || null;

    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        break;
      }

      await processListing(index, probePage);
    }
  }

  try {
    const workerCount = Math.max(
      1,
      Math.min(items.length, claimCheckConcurrency, claimProbePages.length || claimCheckConcurrency)
    );
    const workers = [];

    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
      workers.push(runWorker(workerIndex));
    }

    await Promise.all(workers);
  } finally {
    await closeClaimProbeSession(claimProbeSession);
  }

  return enriched.map((item, index) => item || items[index]);
}

function toPreviewListings(rawListings, limitValue) {
  const items = Array.isArray(rawListings) ? rawListings : [];
  const limit = Math.max(10, Number(limitValue || 150));

  return items.slice(0, limit).map((item) => ({
    name: cleanText(item?.name || item?.business_name),
    business_name: cleanText(item?.business_name || item?.name),
    address: cleanText(item?.address),
    phone: cleanText(item?.phone),
    website: cleanText(item?.website),
    locationLink: cleanText(item?.locationLink || item?.gmb_url),
    gmb_url: cleanText(item?.gmb_url || item?.locationLink),
    category: cleanText(item?.category),
    rating: item?.rating,
    reviews: item?.reviews,
    reviewCount: item?.reviewCount,
    visibleReviewsCount: item?.visibleReviewsCount,
    gmb_claimed: item?.gmb_claimed,
    claimStatus: cleanText(item?.claimStatus),
    gmb_claim_source: cleanText(item?.gmb_claim_source) || "unknown",
    snippet: cleanText(item?.snippet).slice(0, 220),
    attributes: Array.isArray(item?.attributes) ? item.attributes.slice(0, 8) : [],
    subtypes: Array.isArray(item?.subtypes) ? item.subtypes.slice(0, 8) : [],
  }));
}

async function run() {
  const inputPath = path.resolve(getArgValue("--input"));
  const outputPath = path.resolve(getArgValue("--output"));

  const rawContent = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
  const payload = JSON.parse(rawContent);
  if (!payload.keyword || !payload.location) {
    throw new Error("keyword and location are required");
  }

  emitProgress({ percent: 2, message: "Google Maps scrape started", totalFound: 0 });

  const gmbModulePath = resolveGmbModulePath();
  const { searchGmbListings } = require(gmbModulePath);

  if (typeof searchGmbListings !== "function") {
    throw new Error("searchGmbListings() not available in gmb-photo-scraper module");
  }

  let listings = [];
  try {
    const result = await searchGmbListings({
      keyword: payload.keyword,
      location: payload.location,
      listingsPerQuery: payload.listingsPerQuery || 40,
      onProgress: (progress) => {
        const processed = Number(progress?.processedQueries) || 0;
        const total = Number(progress?.totalQueries) || 1;
        const totalListings = Number(progress?.totalListings) || 0;
        const percent = Math.min(92, Math.max(5, Math.round((processed / total) * 92)));
        const previewListings = toPreviewListings(
          progress?.listings,
          process.env.GMB_LIVE_PREVIEW_LIMIT || 150
        );

        emitProgress({
          percent,
          message: `Google discovery ${processed}/${total} queries`,
          totalFound: totalListings,
          previewListings,
        });
      },
    });

    listings = Array.isArray(result?.listings) ? result.listings : [];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emitProgress({
      percent: 45,
      message: `Primary Google scraper failed, using feed fallback (${detail.slice(0, 120)})`,
      totalFound: 0,
    });
  }

  if (!Array.isArray(listings) || listings.length === 0) {
    const fallback = await scrapeDirectoryViaBingRss({
      query: `site:google.com/maps ${payload.keyword} ${payload.location}`,
      category: payload.keyword,
      location: payload.location,
      maxItems: Number(payload.listingsPerQuery || 40),
      domainFilters: ["google.com"],
    });

    listings = fallback.map((item) => ({
      name: item.name,
      address: item.address,
      phone: item.phone,
      website: item.website,
      category: payload.keyword,
      rating: item.rating,
      reviews: item.reviewCount,
      locationLink: item.sourceUrl,
    }));
  }

  if (Array.isArray(listings) && listings.length > 0) {
    emitProgress({
      percent: 75,
      message: "Checking Google profile ownership status",
      totalFound: listings.length,
    });

    listings = await enrichListingsWithClaimStatus(listings, {
      claimCheckLimit: process.env.GMB_CLAIM_CHECK_LIMIT,
      claimCheckConcurrency: process.env.GMB_CLAIM_CHECK_CONCURRENCY || 6,
      claimCheckDelayMs: process.env.GMB_CLAIM_CHECK_DELAY_MS,
      claimCheckTimeoutMs: process.env.GMB_CLAIM_CHECK_TIMEOUT_MS,
      claimCheckRetryCount: process.env.GMB_CLAIM_CHECK_RETRY_COUNT,
      claimCheckRetryDelayMs: process.env.GMB_CLAIM_CHECK_RETRY_DELAY_MS,
      claimCheckRetryTimeoutStepMs: process.env.GMB_CLAIM_CHECK_RETRY_TIMEOUT_STEP_MS,
      previewLimit: process.env.GMB_LIVE_PREVIEW_LIMIT || 150,
      onProgress: ({ processed, total, previewListings }) => {
        const ratio = total > 0 ? processed / total : 1;
        const percent = Math.min(84, 75 + Math.round(ratio * 9));
        emitProgress({
          percent,
          message: `Ownership scan ${processed}/${total}`,
          totalFound: listings.length,
          previewListings,
        });
      },
    });
  }

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(listings || [], null, 2)}\n`, "utf8");
  emitProgress({
    percent: 100,
    message: `Google Maps scrape finished with ${(listings || []).length} rows`,
    totalFound: (listings || []).length,
  });
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[gmb-photo-runner] ${message}`);
  process.exit(1);
});
