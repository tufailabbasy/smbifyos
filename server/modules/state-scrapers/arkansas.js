const {
  DEFAULT_TIMEOUT,
  cleanInlineText,
  normalizeStatus,
  parseUsAddress,
  safeProgress,
  safeWaitIfPaused,
  safeShouldCancel,
  logPageContext,
  createBrowser,
  createContext,
  closeResources,
} = require("./shared");
const {
  buildCategorySearchPlan,
  dedupeAndRankRecords,
} = require("./category-search");

const SEARCH_URL = "https://sos-corp-search.ark.org/corps";

function getTermLimit(targetLimit, collectedCount) {
  if (!Number.isFinite(targetLimit)) {
    return 75;
  }

  return Math.max(targetLimit - collectedCount, 15);
}

async function searchBusinesses(page, businessType) {
  try {
    await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });

    await page.fill("#CorporationName", businessType);
    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      }),
      page.getByRole("button", { name: /Search/i }).click(),
    ]);

    await page.locator("#corps-table").waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT,
    });
  } catch (error) {
    await logPageContext("arkansas", page, "Arkansas search failed", error);
    throw new Error(`Arkansas search failed: ${error.message}`);
  }
}

async function extractRows(page) {
  return page.evaluate(() => {
    const normalize = (value = "") =>
      String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    const rowElements = Array.from(
      window.dataTable?.activeRows || document.querySelectorAll("#corps-table tbody tr")
    );

    return rowElements
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const nameCell = row.querySelector("td.name");

        if (!nameCell || cells.length < 4) {
          return null;
        }

        return {
          businessName: normalize(nameCell.textContent),
          detailId: normalize(nameCell.id),
          city: normalize(cells[1]?.textContent),
          state: normalize(cells[2]?.textContent),
          rowStatus: normalize(cells[3]?.textContent),
        };
      })
      .filter(Boolean);
  });
}

async function fetchDetailEntries(page, detailId) {
  return page.evaluate(async (targetId) => {
    const normalize = (value = "") =>
      String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    const response = await fetch(`/corps/details?id=${encodeURIComponent(targetId)}`);

    if (!response.ok) {
      throw new Error(`Arkansas detail request failed with ${response.status}`);
    }

    const html = await response.text();
    const documentFragment = new DOMParser().parseFromString(html, "text/html");
    const entries = {};

    documentFragment.querySelectorAll(".detail-row").forEach((row) => {
      const label = normalize(
        row.querySelector(".fw-semibold, .text-muted")?.textContent
      ).replace(/:$/g, "");
      const value = normalize(row.querySelector(".flex-fill")?.textContent).replace(
        /^[\u2013\u2014-]$/g,
        ""
      );

      if (label) {
        entries[label] = value;
      }
    });

    return entries;
  }, detailId);
}

function mapDetailToRecord(row, entries) {
  const principalAddress = parseUsAddress(entries["Principal Address"], row.state || "AR");

  return {
    businessName:
      cleanInlineText(entries["Corporation Name"]) || cleanInlineText(row.businessName),
    status:
      normalizeStatus(entries.Status || row.rowStatus) || normalizeStatus(row.rowStatus),
    filingDate: cleanInlineText(entries["Date Filed"]),
    address: principalAddress.address,
    city: principalAddress.city || cleanInlineText(row.city),
    state:
      principalAddress.state || cleanInlineText(row.state).toUpperCase() || "AR",
    zip: principalAddress.zip,
    agentName: cleanInlineText(entries["Reg. Agent"]),
    agentAddress: cleanInlineText(entries["Agent Address"]),
    phone: "",
    sourceUrl: `https://sos-corp-search.ark.org/corps/details?id=${encodeURIComponent(
      row.detailId
    )}`,
  };
}

async function scrapeForTerm({
  page,
  searchTerm,
  termLimit,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const termResults = [];

  await searchBusinesses(page, searchTerm);

  const rows = await extractRows(page);

  for (const row of rows) {
    await safeWaitIfPaused("arkansas", waitIfPaused);

    if (await safeShouldCancel("arkansas", shouldCancel)) {
      break;
    }

    if (termResults.length >= termLimit) {
      break;
    }

    try {
      const entries = await fetchDetailEntries(page, row.detailId);
      termResults.push(mapDetailToRecord(row, entries));
    } catch (error) {
      termResults.push({
        businessName: cleanInlineText(row.businessName),
        status: normalizeStatus(row.rowStatus),
        filingDate: "",
        address: "",
        city: cleanInlineText(row.city),
        state: cleanInlineText(row.state).toUpperCase() || "AR",
        zip: "",
        agentName: "",
        agentAddress: "",
        phone: "",
        sourceUrl: `https://sos-corp-search.ark.org/corps/details?id=${encodeURIComponent(
          row.detailId
        )}`,
        error: true,
        errorMessage: cleanInlineText(error.message),
      });
    }
  }

  return termResults;
}

async function scrape({
  businessType,
  limit,
  onProgress,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const normalizedBusinessType = cleanInlineText(businessType);
  const numericLimit = Number(limit);
  const targetLimit =
    Number.isFinite(numericLimit) && numericLimit > 0
      ? numericLimit
      : Number.POSITIVE_INFINITY;
  const progressTotal = Number.isFinite(targetLimit) ? targetLimit : null;
  const searchPlan = buildCategorySearchPlan(normalizedBusinessType);
  let results = [];
  let browser;
  let context;
  let page;

  if (!normalizedBusinessType) {
    console.error("[arkansas] Missing businessType. Returning no results.");
    return [];
  }

  try {
    browser = await createBrowser("arkansas");
    context = await createContext(browser, {
      timezoneId: "America/Chicago",
    });
    page = await context.newPage();

    for (const searchTerm of searchPlan.terms) {
      await safeWaitIfPaused("arkansas", waitIfPaused);

      if (await safeShouldCancel("arkansas", shouldCancel)) {
        break;
      }

      console.log(
        `[arkansas] Searching Arkansas registry using keyword "${searchTerm}"`
      );

      const termResults = await scrapeForTerm({
        page,
        searchTerm,
        termLimit: getTermLimit(targetLimit, results.length),
        waitIfPaused,
        shouldCancel,
      });

      results = dedupeAndRankRecords([...results, ...termResults], searchPlan);

      await safeProgress("arkansas", onProgress, {
        scraped: results.length,
        total: progressTotal,
        records: results.slice(0, 300),
      });

      if (results.length >= targetLimit) {
        break;
      }
    }
  } catch (error) {
    console.error(`[arkansas] Arkansas scrape stopped early: ${error.message}`);
  } finally {
    await closeResources("arkansas", { page, context, browser });
  }

  console.log(
    `[arkansas] Arkansas scrape finished with ${results.length} returned records.`
  );
  return results.slice(0, targetLimit);
}

module.exports = {
  scrape,
};
