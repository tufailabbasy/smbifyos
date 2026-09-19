const { chromium } = require("playwright");
const {
  configureFetchProxy,
  getPlaywrightProxyConfig,
} = require("../scraper-proxy.cjs");
const {
  buildCategorySearchPlan,
  dedupeAndRankRecords,
} = require("./category-search");

const SEARCH_URL =
  "https://search.sunbiz.org/inquiry/corporationsearch/byname";
const DEFAULT_TIMEOUT = 120000;

configureFetchProxy("florida");

function getTermLimit(targetLimit, collectedCount) {
  if (!Number.isFinite(targetLimit)) {
    return 75;
  }

  return Math.max(targetLimit - collectedCount, 15);
}

function cleanInlineText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getNonEmptyLines(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function parseAddressBlock(value = "") {
  const lines = getNonEmptyLines(value).filter(
    (line) => !/^Changed:/i.test(line)
  );
  const lastLine = lines[lines.length - 1] || "";
  const match = lastLine.match(
    /^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)(?:\s+.+)?$/i
  );
  const normalizedLines = match
    ? [
        ...lines.slice(0, -1),
        `${cleanInlineText(match[1])}, ${cleanInlineText(match[2]).toUpperCase()} ${cleanInlineText(match[3])}`,
      ]
    : lines;
  const address = normalizedLines.join(", ");

  return {
    address,
    city: match ? cleanInlineText(match[1]) : "",
    state: match ? cleanInlineText(match[2]).toUpperCase() : "",
    zip: match ? cleanInlineText(match[3]) : "",
  };
}

function normalizeStatus(value = "") {
  return cleanInlineText(value).toUpperCase();
}

function findPhoneNumber(value = "") {
  const match = String(value).match(
    /(?:Phone(?: Number)?|Telephone|Tel)\s*[:#-]?\s*((?:\+?1[-.\s]*)?(?:\(\d{3}\)|\d{3})[-.\s]*\d{3}[-.\s]*\d{4})/i
  );

  return match ? cleanInlineText(match[1]) : "";
}

function createPartialRecord(row = {}, errorMessage = "") {
  return {
    businessName: cleanInlineText(row.businessName),
    status: normalizeStatus(row.rowStatus),
    filingDate: "",
    address: "",
    city: "",
    state: "FL",
    zip: "",
    agentName: "",
    agentAddress: "",
    phone: "",
    sourceUrl: cleanInlineText(row.detailUrl),
    error: true,
    errorMessage: cleanInlineText(errorMessage),
  };
}

async function safeProgress(onProgress, payload) {
  if (typeof onProgress !== "function") {
    return;
  }

  try {
    await onProgress(payload);
  } catch (error) {
    console.error(`[florida] onProgress callback failed: ${error.message}`);
  }
}

async function safeWaitIfPaused(waitIfPaused) {
  if (typeof waitIfPaused !== "function") {
    return;
  }

  try {
    await waitIfPaused();
  } catch (error) {
    console.error(`[florida] waitIfPaused callback failed: ${error.message}`);
  }
}

async function safeShouldCancel(shouldCancel) {
  if (typeof shouldCancel !== "function") {
    return false;
  }

  try {
    return Boolean(await shouldCancel());
  } catch (error) {
    console.error(`[florida] shouldCancel callback failed: ${error.message}`);
    return false;
  }
}

async function logPageContext(page, label, error) {
  console.error(`[florida] ${label}: ${error.message}`);

  try {
    const url = page.url();
    const htmlSnippet = await page.locator("body").innerHTML();
    console.error(`[florida] Page URL: ${url}`);
    console.error(
      `[florida] HTML snippet: ${cleanInlineText(htmlSnippet).slice(0, 2000)}`
    );
  } catch (captureError) {
    console.error(
      `[florida] Failed to capture page context: ${captureError.message}`
    );
  }
}

async function createBrowser() {
  const requestedChannel = cleanInlineText(
    process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome"
  );
  const launchTargets = [
    requestedChannel,
    "chrome",
    "msedge",
    "",
  ].filter((value, index, values) => value || index === values.length - 1);
  const uniqueTargets = [...new Set(launchTargets)];
  const sharedOptions = {
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    args: ["--disable-blink-features=AutomationControlled"],
  };
  const proxy = getPlaywrightProxyConfig("florida");

  if (proxy) {
    sharedOptions.proxy = proxy;
  }

  for (const target of uniqueTargets) {
    try {
      console.log(
        `[florida] Launching browser using ${target || "bundled chromium"}`
      );

      if (target) {
        return await chromium.launch({
          ...sharedOptions,
          channel: target,
        });
      }

      return await chromium.launch(sharedOptions);
    } catch (error) {
      console.error(
        `[florida] Browser launch failed for ${
          target || "bundled chromium"
        }: ${error.message}`
      );
    }
  }

  throw new Error("Unable to launch any Chromium browser for Florida scraper.");
}

async function createContext(browser) {
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    return context;
  } catch (error) {
    throw new Error(`Failed to create Florida browser context: ${error.message}`);
  }
}

async function waitForResultsList(page) {
  try {
    await page.waitForFunction(
      () => {
        const rowCount = document.querySelectorAll("tr").length;
        const bodyText = document.body ? document.body.innerText : "";
        return rowCount > 1 || bodyText.includes("No records found.");
      },
      { timeout: DEFAULT_TIMEOUT }
    );
  } catch (error) {
    await logPageContext(page, "Florida results table did not load", error);
    throw new Error(`Florida results table did not load: ${error.message}`);
  }
}

async function searchBusinesses(page, businessType) {
  try {
    console.log(`[florida] Opening search page: ${SEARCH_URL}`);
    await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });

    const searchInput = page.locator("#SearchTerm");
    const searchButton = page.locator('input[type="submit"]');

    await searchInput.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT });
    await searchInput.click();
    await searchInput.fill(businessType);
    console.log(`[florida] Submitting search for "${businessType}"`);

    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      }),
      searchButton.click(),
    ]);

    await waitForResultsList(page);
    console.log(`[florida] Search results loaded: ${page.url()}`);
  } catch (error) {
    await logPageContext(page, "Florida search failed", error);
    throw new Error(`Florida search failed: ${error.message}`);
  }
}

async function extractResultRows(page) {
  try {
    return await page.evaluate(() => {
      return Array.from(document.querySelectorAll("tr"))
        .map((row) => {
          const cells = Array.from(row.querySelectorAll("td, th")).map((cell) =>
            (cell.innerText || "").trim()
          );
          const detailLink = row.querySelector("a[href*='SearchResultDetail']");

          if (cells.length < 3 || !detailLink) {
            return null;
          }

          return {
            businessName: cells[0] || "",
            documentNumber: cells[1] || "",
            rowStatus: cells[2] || "",
            detailUrl: detailLink.href || "",
          };
        })
        .filter(Boolean);
    });
  } catch (error) {
    await logPageContext(page, "Failed to read Florida results rows", error);
    return [];
  }
}

async function extractNextListHref(page) {
  try {
    const href = await page
      .locator('a[title="Next List"]')
      .first()
      .getAttribute("href");

    if (!href) {
      return "";
    }

    return new URL(href, page.url()).toString();
  } catch (error) {
    console.error(`[florida] Next page link not available: ${error.message}`);
    return "";
  }
}

async function parseDetailRecord(page, row) {
  try {
    await page.waitForSelector(".searchResultDetail", {
      timeout: DEFAULT_TIMEOUT,
    });

    const detail = await page.evaluate(() => {
      const detailRoot = document.querySelector(".searchResultDetail");
      const filingSection = detailRoot?.querySelector(
        ".detailSection.filingInformation div"
      );
      const filingInfo = {};

      if (filingSection) {
        for (const label of filingSection.querySelectorAll("label")) {
          const key = (label.innerText || "").trim();
          const value = label.nextElementSibling
            ? (label.nextElementSibling.innerText || "").trim()
            : "";
          filingInfo[key] = value;
        }
      }

      const sections = Array.from(
        detailRoot?.querySelectorAll(".detailSection") || []
      );
      const findSection = (headingText) =>
        sections.find((section) => {
          const heading = section.querySelector("span");
          return ((heading && heading.innerText) || "").trim() === headingText;
        });

      const principalSection = findSection("Principal Address");
      const agentSection = findSection("Registered Agent Name & Address");
      const corporationSection = detailRoot?.querySelector(
        ".detailSection.corporationName"
      );
      const corporationParagraphs = corporationSection
        ? Array.from(corporationSection.querySelectorAll("p")).map((node) =>
            (node.innerText || "").trim()
          )
        : [];
      const agentSpans = agentSection
        ? Array.from(agentSection.children).filter(
            (node) => node.tagName === "SPAN"
          )
        : [];

      const principalAddress = principalSection?.querySelector("div")
        ? principalSection.querySelector("div").innerText || ""
        : "";
      const agentAddress = agentSection?.querySelector("div")
        ? agentSection.querySelector("div").innerText || ""
        : "";
      const agentName =
        agentSpans.length > 1 ? agentSpans[1].innerText || "" : "";

      return {
        businessName:
          corporationParagraphs[corporationParagraphs.length - 1] || "",
        status: filingInfo["Status"] || "",
        filingDate: filingInfo["Date Filed"] || "",
        address: principalAddress,
        state: filingInfo["State"] || "",
        agentName,
        agentAddress,
        phone: document.body ? document.body.innerText || "" : "",
        sourceUrl: location.href,
      };
    });

    const principalAddress = parseAddressBlock(detail.address);
    const agentAddress = parseAddressBlock(detail.agentAddress);

    return {
      businessName: cleanInlineText(detail.businessName || row.businessName),
      status: normalizeStatus(detail.status),
      filingDate: cleanInlineText(detail.filingDate),
      address: principalAddress.address,
      city: principalAddress.city,
      state:
        normalizeStatus(detail.state) || principalAddress.state || "FL",
      zip: principalAddress.zip,
      agentName: cleanInlineText(detail.agentName),
      agentAddress: agentAddress.address,
      phone: findPhoneNumber(detail.phone),
      sourceUrl: cleanInlineText(detail.sourceUrl),
    };
  } catch (error) {
    await logPageContext(
      page,
      `Failed to parse Florida detail record for ${row.businessName}`,
      error
    );
    throw new Error(
      `Failed to parse Florida detail record for ${row.businessName}: ${error.message}`
    );
  }
}

async function returnToResultsList(page, fallbackUrl) {
  try {
    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      }),
      page.goBack(),
    ]);
  } catch (error) {
    console.error(
      `[florida] Browser history navigation failed, using direct return: ${error.message}`
    );

    await page.goto(fallbackUrl, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
  }

  await waitForResultsList(page);
}

async function scrapeForTerm({
  page,
  searchTerm,
  termLimit,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const termResults = [];
  let cancellationRequested = false;

  await searchBusinesses(page, searchTerm);

  let hasMorePages = true;

  while (hasMorePages && termResults.length < termLimit) {
    await safeWaitIfPaused(waitIfPaused);

    if (await safeShouldCancel(shouldCancel)) {
      cancellationRequested = true;
      break;
    }

    const listUrl = page.url();
    const rows = await extractResultRows(page);

    if (!rows.length) {
      console.log("[florida] No Florida result rows found on this page.");
      break;
    }

    console.log(
      `[florida] Processing ${rows.length} result rows from ${listUrl}`
    );

    for (const row of rows) {
      await safeWaitIfPaused(waitIfPaused);

      if (await safeShouldCancel(shouldCancel)) {
        cancellationRequested = true;
        break;
      }

      if (termResults.length >= termLimit) {
        break;
      }

      console.log(
        `[florida] Opening detail page for ${row.businessName} (${row.rowStatus})`
      );

      try {
        await page.goto(row.detailUrl, {
          waitUntil: "domcontentloaded",
          timeout: DEFAULT_TIMEOUT,
        });

        const record = await parseDetailRecord(page, row);

        termResults.push(record);
        console.log(
          `[florida] Kept ${record.status || "UNKNOWN"} record ${termResults.length}: ${record.businessName}`
        );

        if (await safeShouldCancel(shouldCancel)) {
          cancellationRequested = true;
          break;
        }
      } catch (error) {
        const partialRecord = createPartialRecord(row, error.message);
        termResults.push(partialRecord);

        console.error(
          `[florida] Added partial record for ${row.businessName} after detail failure.`
        );

        if (await safeShouldCancel(shouldCancel)) {
          cancellationRequested = true;
          break;
        }

        if (termResults.length >= termLimit) {
          break;
        }
      } finally {
        if (termResults.length < termLimit) {
          await returnToResultsList(page, listUrl);
        }
      }
    }

    if (cancellationRequested) {
      break;
    }

    if (termResults.length >= termLimit) {
      break;
    }

    const nextListHref = await extractNextListHref(page);

    if (!nextListHref || nextListHref === page.url()) {
      console.log("[florida] No additional Florida result pages found.");
      hasMorePages = false;
      continue;
    }

    if (await safeShouldCancel(shouldCancel)) {
      cancellationRequested = true;
      break;
    }

    console.log(`[florida] Moving to next Florida results page: ${nextListHref}`);
    await page.goto(nextListHref, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
    await waitForResultsList(page);
  }

  return {
    cancellationRequested,
    termResults,
  };
}

async function scrape({
  businessType,
  limit,
  onProgress,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const numericLimit = Number(limit);
  const targetLimit =
    Number.isFinite(numericLimit) && numericLimit > 0
      ? numericLimit
      : Number.POSITIVE_INFINITY;
  const progressTotal = Number.isFinite(targetLimit) ? targetLimit : null;
  const targetLabel = Number.isFinite(targetLimit)
    ? String(targetLimit)
    : "all available";
  const normalizedBusinessType = cleanInlineText(businessType);
  const searchPlan = buildCategorySearchPlan(normalizedBusinessType);
  let results = [];
  let cancellationRequested = false;
  let browser;
  let context;
  let page;

  if (!normalizedBusinessType) {
    console.error("[florida] Missing businessType. Returning no results.");
    return [];
  }

  try {
    console.log(
      `[florida] Starting Florida scrape for "${normalizedBusinessType}" with limit ${targetLabel}`
    );
    browser = await createBrowser();
    context = await createContext(browser);
    page = await context.newPage();

    for (const searchTerm of searchPlan.terms) {
      await safeWaitIfPaused(waitIfPaused);

      if (await safeShouldCancel(shouldCancel)) {
        cancellationRequested = true;
        break;
      }

      console.log(
        `[florida] Searching Florida registry using keyword "${searchTerm}"`
      );

      const termOutcome = await scrapeForTerm({
        page,
        searchTerm,
        termLimit: getTermLimit(targetLimit, results.length),
        waitIfPaused,
        shouldCancel,
      });

      if (termOutcome.cancellationRequested) {
        cancellationRequested = true;
      }

      results = dedupeAndRankRecords(
        [...results, ...termOutcome.termResults],
        searchPlan
      );

      await safeProgress(onProgress, {
        scraped: results.length,
        total: progressTotal,
        records: results.slice(0, 300),
      });

      if (cancellationRequested || results.length >= targetLimit) {
        break;
      }
    }

    if (cancellationRequested) {
      console.log(
        `[florida] Cancellation requested. Returning ${results.length} partial Florida records.`
      );
    }
  } catch (error) {
    console.error(`[florida] Scrape stopped early: ${error.message}`);
  } finally {
    try {
      if (page) {
        await page.close();
      }
    } catch (error) {
      console.error(`[florida] Failed to close page: ${error.message}`);
    }

    try {
      if (context) {
        await context.close();
      }
    } catch (error) {
      console.error(`[florida] Failed to close browser context: ${error.message}`);
    }

    try {
      if (browser) {
        await browser.close();
      }
    } catch (error) {
      console.error(`[florida] Failed to close browser: ${error.message}`);
    }
  }

  console.log(
    `[florida] Florida scrape finished with ${results.length} returned records.`
  );
  return results.slice(0, targetLimit);
}

module.exports = {
  scrape,
};
