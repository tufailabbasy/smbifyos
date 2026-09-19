const {
  DEFAULT_TIMEOUT,
  cleanInlineText,
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

const SEARCH_URL =
  "https://www.njportal.com/DOR/BusinessNameSearch/Search/BusinessName";

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

    await page.fill('input[name="BusinessName"]', businessType);
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: DEFAULT_TIMEOUT }).catch(
        () => null
      ),
      page.getByRole("button", { name: /Search/i }).click(),
    ]);

    await page.locator("#DataTables_Table_0").waitFor({
      state: "visible",
      timeout: DEFAULT_TIMEOUT,
    });

    await page.selectOption('select[name="DataTables_Table_0_length"]', "100");
    await page.waitForTimeout(500);
  } catch (error) {
    await logPageContext("new-jersey", page, "New Jersey search failed", error);
    throw new Error(`New Jersey search failed: ${error.message}`);
  }
}

async function extractCurrentRows(page) {
  return page.evaluate(() => {
    const normalize = (value = "") =>
      String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    return Array.from(document.querySelectorAll("#DataTables_Table_0 tbody tr"))
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));

        if (cells.length < 5) {
          return null;
        }

        return {
          businessName: normalize(cells[0].textContent),
          entityId: normalize(cells[1].textContent),
          city: normalize(cells[2].textContent),
          entityType: normalize(cells[3].textContent),
          filingDate: normalize(cells[4].textContent),
        };
      })
      .filter(Boolean);
  });
}

async function goToNextPage(page) {
  const nextButton = page.locator("#DataTables_Table_0_next.paginate_enabled_next");

  if (!(await nextButton.count())) {
    return false;
  }

  const previousFirstRow = cleanInlineText(
    await page.locator("#DataTables_Table_0 tbody tr td").first().innerText()
  );

  await nextButton.click();
  await page.waitForFunction(
    (previousValue) => {
      const cell = document.querySelector("#DataTables_Table_0 tbody tr td");
      return Boolean(cell && cell.textContent.trim() !== previousValue);
    },
    previousFirstRow,
    {
      timeout: DEFAULT_TIMEOUT,
    }
  );

  return true;
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

  while (termResults.length < termLimit) {
    await safeWaitIfPaused("new-jersey", waitIfPaused);

    if (await safeShouldCancel("new-jersey", shouldCancel)) {
      break;
    }

    const rows = await extractCurrentRows(page);

    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      await safeWaitIfPaused("new-jersey", waitIfPaused);

      if (await safeShouldCancel("new-jersey", shouldCancel)) {
        break;
      }

      if (termResults.length >= termLimit) {
        break;
      }

      termResults.push({
        businessName: cleanInlineText(row.businessName),
        status: row.entityType
          ? `ENTITY TYPE: ${cleanInlineText(row.entityType)}`
          : "",
        filingDate: cleanInlineText(row.filingDate),
        address: "",
        city: cleanInlineText(row.city),
        state: "NJ",
        zip: "",
        agentName: "",
        agentAddress: "",
        phone: "",
        sourceUrl: SEARCH_URL,
      });
    }

    if (termResults.length >= termLimit) {
      break;
    }

    if (!(await goToNextPage(page))) {
      break;
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
  let collectedResults = [];
  let browser;
  let context;
  let page;

  if (!normalizedBusinessType) {
    console.error("[new-jersey] Missing businessType. Returning no results.");
    return [];
  }

  try {
    browser = await createBrowser("new-jersey");
    context = await createContext(browser);
    page = await context.newPage();

    for (const searchTerm of searchPlan.terms) {
      await safeWaitIfPaused("new-jersey", waitIfPaused);

      if (await safeShouldCancel("new-jersey", shouldCancel)) {
        break;
      }

      console.log(
        `[new-jersey] Searching New Jersey registry using keyword "${searchTerm}"`
      );

      const termResults = await scrapeForTerm({
        page,
        searchTerm,
        termLimit: getTermLimit(targetLimit, collectedResults.length),
        waitIfPaused,
        shouldCancel,
      });

      collectedResults = dedupeAndRankRecords(
        [...collectedResults, ...termResults],
        searchPlan
      );

      await safeProgress("new-jersey", onProgress, {
        scraped: collectedResults.length,
        total: progressTotal,
        records: collectedResults.slice(0, 300),
      });

      if (collectedResults.length >= targetLimit) {
        break;
      }
    }
  } catch (error) {
    console.error(`[new-jersey] New Jersey scrape stopped early: ${error.message}`);
  } finally {
    await closeResources("new-jersey", { page, context, browser });
  }

  console.log(
    `[new-jersey] New Jersey scrape finished with ${collectedResults.length} returned records.`
  );
  return collectedResults.slice(0, targetLimit);
}

module.exports = {
  scrape,
};
