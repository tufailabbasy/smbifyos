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
} = require("../modules/category-search");

const SEARCH_URL = "https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx";

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

    await page.check("#MainContent_rdoByEntityName");
    await page.fill("#MainContent_txtEntityName", businessType);
    await page.selectOption("#MainContent_ddBeginsWithEntityName", {
      label: "Full text",
    });

    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      }),
      page.locator("#MainContent_btnSearch").click(),
    ]);

    await page
      .waitForFunction(
        () => {
          const bodyText = document.body ? document.body.innerText || "" : "";

          return (
            Boolean(
              document.querySelector(
                "#MainContent_SearchControl_grdSearchResultsEntity"
              )
            ) || /No records found/i.test(bodyText)
          );
        },
        { timeout: DEFAULT_TIMEOUT }
      )
      .catch(() => null);
  } catch (error) {
    await logPageContext("rhode-island", page, "Rhode Island search failed", error);
    throw new Error(`Rhode Island search failed: ${error.message}`);
  }
}

async function extractResultRows(page) {
  return page.evaluate(() => {
    const normalize = (value = "") =>
      String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    return Array.from(
      document.querySelectorAll(
        "#MainContent_SearchControl_grdSearchResultsEntity tr.GridRow, #MainContent_SearchControl_grdSearchResultsEntity tr.GridAltRow"
      )
    )
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const detailLink = row.querySelector('a[href*="CorpSummary.aspx"]');

        if (cells.length < 5 || !detailLink) {
          return null;
        }

        return {
          businessName: normalize(cells[0].textContent),
          inactiveStatus: normalize(cells[3].textContent),
          addressText: normalize(cells[4].innerText),
          detailUrl: new URL(detailLink.getAttribute("href"), location.href).toString(),
        };
      })
      .filter(Boolean);
  });
}

async function extractDetailPayload(page) {
  return page.evaluate(() => {
    const text = (selector) =>
      (document.querySelector(selector)?.textContent || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    return {
      businessName: text("#MainContent_lblEntityNameHeader") || text("#MainContent_lblEntityName"),
      filingDate: text("#MainContent_lblOrganisationDate") || text("#MainContent_lblEffectiveDate"),
      principalStreet: text("#MainContent_lblPrincipleStreet"),
      principalCity: text("#MainContent_lblPrincipleCity"),
      principalState: text("#MainContent_lblPrincipleState"),
      principalZip: text("#MainContent_lblPrincipleZip"),
      agentName: text("#MainContent_lblResidentAgentName"),
      agentStreet: text("#MainContent_lblResidentStreet"),
      agentCity: text("#MainContent_lblResidentCity"),
      agentState: text("#MainContent_lblResidentState"),
      agentZip: text("#MainContent_lblResidentZip"),
    };
  });
}

function mapDetailToRecord(row, detailPayload) {
  const listAddress = parseUsAddress(row.addressText, "RI");
  const principalCity = cleanInlineText(detailPayload.principalCity).replace(/,\s*$/g, "");
  const principalState = cleanInlineText(detailPayload.principalState).toUpperCase();
  const principalZip = cleanInlineText(detailPayload.principalZip);
  const principalAddress = cleanInlineText(
    [
      cleanInlineText(detailPayload.principalStreet),
      principalCity && principalState
        ? `${principalCity}, ${principalState} ${principalZip}`.trim()
        : "",
    ]
      .filter(Boolean)
      .join(", ")
  );
  const agentCity = cleanInlineText(detailPayload.agentCity).replace(/,\s*$/g, "");
  const agentState = cleanInlineText(detailPayload.agentState).toUpperCase();
  const agentZip = cleanInlineText(detailPayload.agentZip);
  const agentAddress = cleanInlineText(
    [
      cleanInlineText(detailPayload.agentStreet),
      agentCity && agentState ? `${agentCity}, ${agentState} ${agentZip}`.trim() : "",
    ]
      .filter(Boolean)
      .join(", ")
  );

  return {
    businessName:
      cleanInlineText(detailPayload.businessName) || cleanInlineText(row.businessName),
    status: normalizeStatus(row.inactiveStatus || "ACTIVE"),
    filingDate: cleanInlineText(detailPayload.filingDate),
    address: principalAddress || listAddress.address,
    city: principalCity || listAddress.city,
    state: principalState || listAddress.state || "RI",
    zip: principalZip || listAddress.zip,
    agentName: cleanInlineText(detailPayload.agentName),
    agentAddress: agentAddress,
    phone: "",
    sourceUrl: cleanInlineText(row.detailUrl),
  };
}

async function goToNextPage(page, nextPageNumber) {
  const previousFirstRow = cleanInlineText(
    await page
      .locator("#MainContent_SearchControl_grdSearchResultsEntity tr.GridRow td:nth-child(2), #MainContent_SearchControl_grdSearchResultsEntity tr.GridAltRow td:nth-child(2)")
      .first()
      .innerText()
  );

  await page.evaluate((pageNumber) => {
    window.__doPostBack(
      "ctl00$MainContent$SearchControl$grdSearchResultsEntity",
      `Page$${pageNumber}`
    );
  }, String(nextPageNumber));

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(
    (previousValue) => {
      const selector =
        "#MainContent_SearchControl_grdSearchResultsEntity tr.GridRow td:nth-child(2), " +
        "#MainContent_SearchControl_grdSearchResultsEntity tr.GridAltRow td:nth-child(2)";
      const cell = document.querySelector(selector);
      return Boolean(cell && cell.textContent.trim() !== previousValue);
    },
    previousFirstRow,
    {
      timeout: DEFAULT_TIMEOUT,
    }
  );
}

async function scrapeForTerm({
  listPage,
  detailPage,
  searchTerm,
  termLimit,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const termResults = [];
  let currentPageNumber = 1;

  await searchBusinesses(listPage, searchTerm);

  while (termResults.length < termLimit) {
    await safeWaitIfPaused("rhode-island", waitIfPaused);

    if (await safeShouldCancel("rhode-island", shouldCancel)) {
      break;
    }

    const rows = await extractResultRows(listPage);

    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      await safeWaitIfPaused("rhode-island", waitIfPaused);

      if (await safeShouldCancel("rhode-island", shouldCancel)) {
        break;
      }

      if (termResults.length >= termLimit) {
        break;
      }

      try {
        await detailPage.goto(row.detailUrl, {
          waitUntil: "domcontentloaded",
          timeout: DEFAULT_TIMEOUT,
        });

        const detailPayload = await extractDetailPayload(detailPage);
        termResults.push(mapDetailToRecord(row, detailPayload));
      } catch (error) {
        const listAddress = parseUsAddress(row.addressText, "RI");

        termResults.push({
          businessName: cleanInlineText(row.businessName),
          status: normalizeStatus(row.inactiveStatus || "ACTIVE"),
          filingDate: "",
          address: listAddress.address,
          city: listAddress.city,
          state: listAddress.state || "RI",
          zip: listAddress.zip,
          agentName: "",
          agentAddress: "",
          phone: "",
          sourceUrl: cleanInlineText(row.detailUrl),
          error: true,
          errorMessage: cleanInlineText(error.message),
        });
      }
    }

    if (termResults.length >= termLimit) {
      break;
    }

    const nextPageNumber = currentPageNumber + 1;
    const hasNextPage = await listPage.evaluate((pageNumber) => {
      const hrefNeedle = `Page$${pageNumber}`;
      return Array.from(document.querySelectorAll("a")).some((anchor) =>
        (anchor.getAttribute("href") || "").includes(hrefNeedle)
      );
    }, nextPageNumber);

    if (!hasNextPage) {
      break;
    }

    await goToNextPage(listPage, nextPageNumber);
    currentPageNumber = nextPageNumber;
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
  let listPage;
  let detailPage;

  if (!normalizedBusinessType) {
    console.error("[rhode-island] Missing businessType. Returning no results.");
    return [];
  }

  try {
    browser = await createBrowser("rhode-island");
    context = await createContext(browser);
    listPage = await context.newPage();
    detailPage = await context.newPage();

    for (const searchTerm of searchPlan.terms) {
      await safeWaitIfPaused("rhode-island", waitIfPaused);

      if (await safeShouldCancel("rhode-island", shouldCancel)) {
        break;
      }

      console.log(
        `[rhode-island] Searching Rhode Island registry using keyword "${searchTerm}"`
      );

      const termResults = await scrapeForTerm({
        listPage,
        detailPage,
        searchTerm,
        termLimit: getTermLimit(targetLimit, results.length),
        waitIfPaused,
        shouldCancel,
      });

      results = dedupeAndRankRecords([...results, ...termResults], searchPlan);

      await safeProgress("rhode-island", onProgress, {
        scraped: results.length,
        total: progressTotal,
      });

      if (results.length >= targetLimit) {
        break;
      }
    }
  } catch (error) {
    console.error(
      `[rhode-island] Rhode Island scrape stopped early: ${error.message}`
    );
  } finally {
    await closeResources("rhode-island", {
      page: detailPage,
      context: null,
      browser: null,
    });
    await closeResources("rhode-island", {
      page: listPage,
      context,
      browser,
    });
  }

  console.log(
    `[rhode-island] Rhode Island scrape finished with ${results.length} returned records.`
  );
  return results.slice(0, targetLimit);
}

module.exports = {
  scrape,
};
