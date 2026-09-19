const { chromium } = require("playwright");
let proxySupport = {
  configureFetchProxy: () => {},
  getPlaywrightProxyConfig: () => null,
};

try {
  proxySupport = require("../../../../server/modules/scraper-proxy.cjs");
} catch (error) {
  void error;
}

const { configureFetchProxy, getPlaywrightProxyConfig } = proxySupport;

const SEARCH_URL =
  "https://comptroller.texas.gov/taxes/franchise/account-status/search";
const API_SEARCH_URL =
  "https://api.comptroller.texas.gov/public-data/v1/public/franchise-tax-list";
const API_DETAIL_URL =
  "https://api.comptroller.texas.gov/public-data/v1/public/franchise-tax";
const DEFAULT_TIMEOUT = 120000;
const MAX_RESULT_PAGES = 20;

configureFetchProxy("legacy-texas");

function cleanInlineText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

function cleanTextBlock(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/Request tax clearance to reinstate entity/gi, "")
    .replace(
      /\s+\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}:\d{2})?\s*$/g,
      ""
    )
    .trim();
}

function getNonEmptyLines(value = "") {
  return cleanTextBlock(value)
    .split("\n")
    .map((line) => cleanInlineText(line))
    .filter(Boolean);
}

function normalizeStatus(value = "") {
  return cleanInlineText(value).toUpperCase();
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(value = "") {
  return escapeRegExp(value).replace(/ /g, "\\s+");
}

function buildTexasDetailUrl(taxpayerId = "") {
  const digits = String(taxpayerId ?? "").replace(/\D/g, "");
  return digits ? `${SEARCH_URL}/${digits}` : "";
}

function formatIsoDate(value = "") {
  const normalized = cleanInlineText(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return normalized;
  }

  return `${match[2]}/${match[3]}/${match[1]}`;
}

function buildZip(zip = "", zip4 = "") {
  const primaryZip = cleanInlineText(zip);
  const secondaryZip = cleanInlineText(zip4);

  if (!primaryZip) {
    return "";
  }

  return secondaryZip ? `${primaryZip}-${secondaryZip}` : primaryZip;
}

function extractFieldBlock(text = "", label = "", nextLabels = []) {
  const nextPattern = nextLabels.map((item) => labelPattern(item)).join("|");
  const pattern = new RegExp(
    `${labelPattern(label)}\\s*\\|?\\s*([\\s\\S]*?)${nextPattern ? `(?=${nextPattern}|$)` : "$"}`,
    "i"
  );
  const match = cleanTextBlock(text).match(pattern);

  return match ? cleanTextBlock(match[1]) : "";
}

function parseAddressBlock(value = "") {
  const lines = getNonEmptyLines(value);

  if (!lines.length) {
    return {
      address: "",
      city: "",
      state: "",
      zip: "",
    };
  }

  const workingLines = [...lines];

  if (
    workingLines.length >= 2 &&
    /^\d{5}(?:-\d{4})?$/.test(workingLines[workingLines.length - 1]) &&
    /,\s*[A-Z]{2}$/i.test(workingLines[workingLines.length - 2])
  ) {
    const zipLine = workingLines.pop();
    workingLines[workingLines.length - 1] =
      `${workingLines[workingLines.length - 1]} ${zipLine}`;
  }

  if (
    workingLines.length >= 2 &&
    /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(workingLines[workingLines.length - 1]) &&
    /,$/.test(workingLines[workingLines.length - 2])
  ) {
    const stateZipLine = workingLines.pop();
    workingLines[workingLines.length - 1] =
      `${workingLines[workingLines.length - 1]} ${stateZipLine}`;
  }

  const flattened = cleanInlineText(workingLines.join(" "))
    .replace(/\s+,/g, ",")
    .replace(/,\s+,/g, ", ");
  const match = flattened.match(
    /^(.*\S)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)*),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i
  );

  if (!match) {
    return {
      address: flattened,
      city: "",
      state: "",
      zip: "",
    };
  }

  return {
    address: flattened,
    city: cleanInlineText(match[2]),
    state: cleanInlineText(match[3]).toUpperCase(),
    zip: cleanInlineText(match[4]),
  };
}

function extractBusinessName(text = "") {
  const lines = getNonEmptyLines(text);
  const taxpayerIndex = lines.findIndex((line) =>
    /Texas\s+Taxpayer\s+Number/i.test(line)
  );
  const relevantLines =
    taxpayerIndex === -1 ? lines : lines.slice(Math.max(0, taxpayerIndex - 10), taxpayerIndex);
  const businessName = [...relevantLines]
    .reverse()
    .find((line) => {
      const normalized = cleanInlineText(line).replace(/\|/g, "");

      return (
        normalized &&
        !/^(franchise tax account status|taxable entity search results|page \d+ of \d+|as of:?|this (page|record)|new search|last updated|print|required applications|footer|main search|go button|find)$/i.test(
          normalized
        ) &&
        !/^[-|*]+$/.test(normalized)
      );
    });

  return cleanInlineText(businessName);
}

function extractTaxpayerIdsFromText(text = "") {
  return [...new Set((String(text).match(/\b\d{11}\b/g) || []).map((item) => item.trim()))];
}

function parseDetailText(text = "", sourceUrl = "") {
  const normalizedText = cleanTextBlock(text);
  const businessName = extractBusinessName(normalizedText);
  const mailingAddressBlock = extractFieldBlock(normalizedText, "Mailing Address", [
    "Right to Transact Business in Texas",
    "State of Formation",
    "Effective SOS Registration Date",
    "Texas SOS File Number",
    "Registered Agent Name",
  ]);
  const registeredAgentName = extractFieldBlock(
    normalizedText,
    "Registered Agent Name",
    ["Registered Office Street Address", "Last updated", "Print"]
  );
  const registeredOfficeBlock = extractFieldBlock(
    normalizedText,
    "Registered Office Street Address",
    ["Last updated", "Print", "Required Applications"]
  );
  const statusBlock = extractFieldBlock(
    normalizedText,
    "Right to Transact Business in Texas",
    [
      "State of Formation",
      "Effective SOS Registration Date",
      "Texas SOS File Number",
      "Registered Agent Name",
    ]
  );
  const filingDate = extractFieldBlock(normalizedText, "Effective SOS Registration Date", [
    "Texas SOS File Number",
    "Registered Agent Name",
    "Registered Office Street Address",
  ]);
  const mailingAddress = parseAddressBlock(mailingAddressBlock);
  const registeredOffice = parseAddressBlock(registeredOfficeBlock);

  return {
    businessName,
    status: normalizeStatus(statusBlock),
    filingDate:
      /^not registered$/i.test(cleanInlineText(filingDate))
        ? ""
        : formatIsoDate(cleanInlineText(filingDate)),
    address: mailingAddress.address,
    city: mailingAddress.city,
    state: mailingAddress.state || "TX",
    zip: mailingAddress.zip,
    agentName:
      /^not on file$/i.test(cleanInlineText(registeredAgentName))
        ? ""
        : cleanInlineText(registeredAgentName),
    agentAddress: registeredOffice.address,
    phone: "",
    sourceUrl: cleanInlineText(sourceUrl),
  };
}

function mapApiDetailToRecord(detail = {}) {
  const taxpayerId = cleanInlineText(detail.taxpayerId);
  const registeredOfficeZip = buildZip(
    detail.registeredOfficeAddressZip,
    detail.registeredOfficeAddressZip4
  );
  const mailingZip = buildZip(detail.mailingAddressZip, detail.mailingAddressZip4);
  const agentAddress = cleanInlineText(
    [
      detail.registeredOfficeAddressStreet,
      detail.registeredOfficeAddressCity && detail.registeredOfficeAddressState
        ? `${detail.registeredOfficeAddressCity}, ${detail.registeredOfficeAddressState}`
        : detail.registeredOfficeAddressCity || detail.registeredOfficeAddressState || "",
      registeredOfficeZip,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return {
    businessName: cleanInlineText(detail.name || detail.dbaName),
    status: normalizeStatus(
      detail.sosRegistrationStatus ||
        (String(detail.rightToTransactTX).toUpperCase() === "Y" ? "ACTIVE" : "NOT ACTIVE")
    ),
    filingDate: formatIsoDate(detail.effectiveSosRegistrationDate),
    address: cleanInlineText(
      [
        detail.mailingAddressStreet,
        detail.mailingAddressCity && detail.mailingAddressState
          ? `${detail.mailingAddressCity}, ${detail.mailingAddressState}`
          : detail.mailingAddressCity || detail.mailingAddressState || "",
        mailingZip,
      ]
        .filter(Boolean)
        .join(" ")
    ),
    city: cleanInlineText(detail.mailingAddressCity),
    state: cleanInlineText(detail.mailingAddressState || "TX").toUpperCase(),
    zip: mailingZip,
    agentName: cleanInlineText(
      detail.registeredAgentName || detail.officerInfo?.[0]?.AGNT_NM || ""
    ),
    agentAddress,
    phone: "",
    sourceUrl: buildTexasDetailUrl(taxpayerId),
  };
}

function createPartialRecord(partial = {}, errorMessage = "") {
  return {
    businessName: cleanInlineText(partial.businessName),
    status: cleanInlineText(partial.status),
    filingDate: cleanInlineText(partial.filingDate),
    address: cleanInlineText(partial.address),
    city: cleanInlineText(partial.city),
    state: cleanInlineText(partial.state || "TX").toUpperCase(),
    zip: cleanInlineText(partial.zip),
    agentName: cleanInlineText(partial.agentName),
    agentAddress: cleanInlineText(partial.agentAddress),
    phone: "",
    sourceUrl: cleanInlineText(partial.sourceUrl),
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
    console.error(`[texas] onProgress callback failed: ${error.message}`);
  }
}

async function safeWaitIfPaused(waitIfPaused) {
  if (typeof waitIfPaused !== "function") {
    return;
  }

  try {
    await waitIfPaused();
  } catch (error) {
    console.error(`[texas] waitIfPaused callback failed: ${error.message}`);
  }
}

async function safeShouldCancel(shouldCancel) {
  if (typeof shouldCancel !== "function") {
    return false;
  }

  try {
    return Boolean(await shouldCancel());
  } catch (error) {
    console.error(`[texas] shouldCancel callback failed: ${error.message}`);
    return false;
  }
}

async function logPageContext(page, label, error) {
  console.error(`[texas] ${label}: ${error.message}`);

  try {
    const url = page.url();
    const htmlSnippet = await page.locator("body").innerHTML();
    console.error(`[texas] Page URL: ${url}`);
    console.error(
      `[texas] HTML snippet: ${cleanInlineText(htmlSnippet).slice(0, 2000)}`
    );
  } catch (captureError) {
    console.error(
      `[texas] Failed to capture page context: ${captureError.message}`
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
  const proxy = getPlaywrightProxyConfig("legacy-texas");

  if (proxy) {
    sharedOptions.proxy = proxy;
  }

  for (const target of uniqueTargets) {
    try {
      console.log(`[texas] Launching browser using ${target || "bundled chromium"}`);

      if (target) {
        return await chromium.launch({
          ...sharedOptions,
          channel: target,
        });
      }

      return await chromium.launch(sharedOptions);
    } catch (error) {
      console.error(
        `[texas] Browser launch failed for ${target || "bundled chromium"}: ${error.message}`
      );
    }
  }

  throw new Error("Unable to launch any Chromium browser for Texas scraper.");
}

async function createContext(browser) {
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
      locale: "en-US",
      timezoneId: "America/Chicago",
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    return context;
  } catch (error) {
    throw new Error(`Failed to create Texas browser context: ${error.message}`);
  }
}

async function resolveVisibleLocator(candidates = [], label = "element") {
  for (const candidate of candidates) {
    const locator = candidate.first();

    try {
      await locator.waitFor({ state: "visible", timeout: 3000 });
      return locator;
    } catch (error) {
      void error;
    }
  }

  throw new Error(`Unable to locate ${label}.`);
}

async function getBodyText(page) {
  return cleanTextBlock(await page.locator("body").innerText());
}

async function resolveEntityNameInput(page) {
  return resolveVisibleLocator(
    [
      page.getByLabel(/Entity Name/i),
      page.locator("#entityName"),
      page.locator("input[name='entityName']"),
      page.locator("input[id*='entityName']"),
      page.locator("input[name*='name']"),
      page.locator("input[id*='name']"),
      page.locator("form input[type='text']"),
    ],
    "Texas entity name input"
  );
}

async function resolveSubmitButton(page) {
  return resolveVisibleLocator(
    [
      page.getByRole("button", { name: /^submit$/i }),
      page.locator("input[type='submit'][value*='Submit']"),
      page.locator("button[type='submit']"),
      page.locator("button").filter({ hasText: /submit/i }),
    ],
    "Texas submit button"
  );
}

function isTexasDetailUrl(url = "") {
  return /\/taxes\/franchise\/account-status\/search\/\d{9,11}(?:[/?#].*)?$/i.test(
    cleanInlineText(url)
  );
}

async function waitForTexasResults(page) {
  try {
    await page.waitForFunction(
      () => {
        const bodyText = document.body ? document.body.innerText || "" : "";
        return (
          /\/taxes\/franchise\/account-status\/search\/\d{9,11}(?:[/?#].*)?$/i.test(
            location.href
          ) ||
          bodyText.includes("Search Results") ||
          bodyText.includes("Texas Taxpayer Number") ||
          bodyText.includes("No records found") ||
          bodyText.includes("No matching") ||
          Array.from(document.querySelectorAll("a[href]")).some((anchor) =>
            anchor.href.includes("/taxes/franchise/account-status/search/")
          )
        );
      },
      { timeout: DEFAULT_TIMEOUT }
    );
  } catch (error) {
    await logPageContext(page, "Texas search results did not load", error);
    throw new Error(`Texas search results did not load: ${error.message}`);
  }
}

async function searchBusinesses(page, businessType) {
  try {
    console.log(`[texas] Opening search page: ${SEARCH_URL}`);
    await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });

    const entityNameInput = await resolveEntityNameInput(page);
    const submitButton = await resolveSubmitButton(page);
    await entityNameInput.click();
    await entityNameInput.fill(businessType);
    console.log(`[texas] Submitting search for "${businessType}"`);

    try {
      await submitButton.click({ timeout: DEFAULT_TIMEOUT });
    } catch (error) {
      console.error(
        `[texas] Submit button click failed, falling back to Enter key: ${error.message}`
      );
      await entityNameInput.press("Enter");
    }

    await waitForTexasResults(page);
    console.log(`[texas] Search results loaded: ${page.url()}`);
  } catch (error) {
    await logPageContext(page, "Texas search failed", error);
    throw new Error(`Texas search failed: ${error.message}`);
  }
}

async function extractCurrentResultUrls(page) {
  const currentUrl = cleanInlineText(page.url());

  if (isTexasDetailUrl(currentUrl)) {
    return [currentUrl];
  }

  const linkedUrls = await page.evaluate((searchUrl) => {
    return Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => {
        try {
          return new URL(anchor.getAttribute("href"), location.href).toString();
        } catch (error) {
          return "";
        }
      })
      .filter((url) => url.startsWith(`${searchUrl}/`));
  }, SEARCH_URL);

  if (linkedUrls.length) {
    return [...new Set(linkedUrls)];
  }

  const bodyText = await getBodyText(page);
  return extractTaxpayerIdsFromText(bodyText).map((taxpayerId) =>
    buildTexasDetailUrl(taxpayerId)
  );
}

async function resolveNextButton(page) {
  const candidates = [
    page.getByRole("link", { name: /^next$/i }),
    page.getByRole("button", { name: /^next$/i }),
    page.locator("a[rel='next']"),
    page.locator("button[rel='next']"),
    page.locator("a").filter({ hasText: /^next$/i }),
    page.locator("button").filter({ hasText: /^next$/i }),
  ];

  for (const candidate of candidates) {
    const locator = candidate.first();

    try {
      if (!(await locator.isVisible())) {
        continue;
      }

      if ((await locator.isDisabled?.()) === true) {
        continue;
      }

      return locator;
    } catch (error) {
      void error;
    }
  }

  return null;
}

async function collectResultUrls(page, targetLimit) {
  const collectedUrls = [];
  const seenUrls = new Set();
  const normalizedLimit = Number.isFinite(targetLimit)
    ? targetLimit
    : Number.POSITIVE_INFINITY;

  for (let pageIndex = 0; pageIndex < MAX_RESULT_PAGES; pageIndex += 1) {
    const nextUrls = await extractCurrentResultUrls(page);

    for (const nextUrl of nextUrls) {
      const normalizedUrl = cleanInlineText(nextUrl);

      if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
        continue;
      }

      seenUrls.add(normalizedUrl);
      collectedUrls.push(normalizedUrl);

      if (collectedUrls.length >= normalizedLimit) {
        return collectedUrls.slice(0, normalizedLimit);
      }
    }

    if (isTexasDetailUrl(page.url())) {
      break;
    }

    const bodyText = await getBodyText(page);
    if (/No records found|No matching/i.test(bodyText)) {
      break;
    }

    const nextButton = await resolveNextButton(page);
    if (!nextButton) {
      break;
    }

    const previousUrl = page.url();
    const previousBodyText = bodyText;
    console.log(`[texas] Moving to the next Texas results page from ${previousUrl}`);
    await nextButton.click({ timeout: DEFAULT_TIMEOUT });
    await page.waitForFunction(
      ({ expectedUrl, expectedBodyText }) => {
        const bodyTextNow = document.body ? document.body.innerText || "" : "";
        return location.href !== expectedUrl || bodyTextNow !== expectedBodyText;
      },
      {
        expectedUrl: previousUrl,
        expectedBodyText: previousBodyText,
      },
      {
        timeout: DEFAULT_TIMEOUT,
      }
    );
    await waitForTexasResults(page);
  }

  return collectedUrls;
}

async function parseDetailRecord(page) {
  const sourceUrl = cleanInlineText(page.url());
  const bodyText = await getBodyText(page);

  if (!/Texas\s+Taxpayer\s+Number/i.test(bodyText)) {
    throw new Error("Texas detail page did not contain taxpayer details.");
  }

  const record = parseDetailText(bodyText, sourceUrl);

  if (!record.businessName) {
    throw new Error("Unable to determine Texas business name from the detail page.");
  }

  return record;
}

async function queryTexasApi(apiKey, baseUrl, params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const normalizedValue = cleanInlineText(value);

    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    }
  }

  const requestUrl = `${baseUrl}?${searchParams.toString()}`;
  const response = await fetch(requestUrl, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = cleanInlineText(await response.text());
    throw new Error(
      `Texas API request failed with status ${response.status}: ${errorBody || response.statusText}`
    );
  }

  return response.json();
}

async function scrapeViaApi({
  apiKey,
  businessType,
  targetLimit,
  progressTotal,
  onProgress,
  waitIfPaused,
  shouldCancel,
} = {}) {
  console.log("[texas] Attempting Texas scrape through the official Comptroller API.");
  const searchPayload = await queryTexasApi(apiKey, API_SEARCH_URL, {
    name: businessType,
  });
  const searchResults = Array.isArray(searchPayload?.data) ? searchPayload.data : [];
  const validResults = searchResults
    .map((item) => ({
      ...item,
      taxpayerId: String(item?.taxpayerId ?? "").replace(/\D/g, ""),
    }))
    .filter((item) => item.taxpayerId.length === 11);

  if (!validResults.length && searchResults.length) {
    throw new Error(
      "Texas API search returned results without 11-digit taxpayer IDs, so browser fallback is required."
    );
  }

  const cappedResults = validResults.slice(
    0,
    Number.isFinite(targetLimit) ? targetLimit : validResults.length
  );
  const results = [];

  for (const [index, item] of cappedResults.entries()) {
    await safeWaitIfPaused(waitIfPaused);

    if (await safeShouldCancel(shouldCancel)) {
      console.log(
        `[texas] Cancellation requested during Texas API scraping after ${results.length} records.`
      );
      break;
    }

    const detailPayload = await queryTexasApi(
      apiKey,
      `${API_DETAIL_URL}/${item.taxpayerId}`,
      {}
    );
    const detailRecord = detailPayload?.data || {};
    const mappedRecord = mapApiDetailToRecord(detailRecord);

    results.push(mappedRecord);
    console.log(
      `[texas] API record ${index + 1}/${cappedResults.length}: ${mappedRecord.businessName}`
    );
    await safeProgress(onProgress, {
      scraped: results.length,
      total: progressTotal,
    });
  }

  return results;
}

async function scrapeViaBrowser({
  businessType,
  targetLimit,
  targetLabel,
  progressTotal,
  onProgress,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const results = [];
  let browser;
  let context;
  let page;

  try {
    console.log(
      `[texas] Starting Texas scrape for "${businessType}" with limit ${targetLabel}`
    );
    browser = await createBrowser();
    context = await createContext(browser);
    page = await context.newPage();

    await searchBusinesses(page, businessType);
    const resultUrls = await collectResultUrls(page, targetLimit);

    if (!resultUrls.length) {
      console.log(`[texas] No Texas detail URLs found for "${businessType}".`);
      return [];
    }

    console.log(
      `[texas] Collected ${resultUrls.length} Texas detail URL${
        resultUrls.length === 1 ? "" : "s"
      } for parsing.`
    );

    for (const [index, resultUrl] of resultUrls.entries()) {
      await safeWaitIfPaused(waitIfPaused);

      if (await safeShouldCancel(shouldCancel)) {
        console.log(
          `[texas] Cancellation requested before Texas detail record ${index + 1}.`
        );
        break;
      }

      try {
        await page.goto(resultUrl, {
          waitUntil: "domcontentloaded",
          timeout: DEFAULT_TIMEOUT,
        });

        const record = await parseDetailRecord(page);
        results.push(record);
        console.log(
          `[texas] Parsed Texas record ${index + 1}/${resultUrls.length}: ${record.businessName}`
        );
      } catch (error) {
        const pageText = page ? await getBodyText(page).catch(() => "") : "";
        const partialRecord = createPartialRecord(
          {
            businessName: extractBusinessName(pageText),
            sourceUrl: resultUrl,
            status: extractFieldBlock(
              pageText,
              "Right to Transact Business in Texas",
              [
                "State of Formation",
                "Effective SOS Registration Date",
                "Texas SOS File Number",
              ]
            ),
          },
          error.message
        );

        results.push(partialRecord);
        console.error(
          `[texas] Added partial record for ${partialRecord.businessName || resultUrl} after detail failure.`
        );
      }

      await safeProgress(onProgress, {
        scraped: results.length,
        total: progressTotal,
      });

      if (results.length >= targetLimit) {
        break;
      }
    }
  } catch (error) {
    console.error(`[texas] Texas scrape stopped early: ${error.message}`);
  } finally {
    try {
      if (page) {
        await page.close();
      }
    } catch (error) {
      console.error(`[texas] Failed to close page: ${error.message}`);
    }

    try {
      if (context) {
        await context.close();
      }
    } catch (error) {
      console.error(`[texas] Failed to close browser context: ${error.message}`);
    }

    try {
      if (browser) {
        await browser.close();
      }
    } catch (error) {
      console.error(`[texas] Failed to close browser: ${error.message}`);
    }
  }

  return results.slice(0, targetLimit);
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
  const targetLabel = Number.isFinite(targetLimit)
    ? String(targetLimit)
    : "all available";
  const apiKey = cleanInlineText(process.env.TEXAS_COMPTROLLER_API_KEY);

  if (!normalizedBusinessType) {
    console.error("[texas] Missing businessType. Returning no results.");
    return [];
  }

  if (apiKey) {
    try {
      const apiResults = await scrapeViaApi({
        apiKey,
        businessType: normalizedBusinessType,
        targetLimit,
        progressTotal,
        onProgress,
        waitIfPaused,
        shouldCancel,
      });

      if (apiResults.length || (await safeShouldCancel(shouldCancel))) {
        console.log(
          `[texas] Texas API scrape finished with ${apiResults.length} returned records.`
        );
        return apiResults.slice(0, targetLimit);
      }
    } catch (error) {
      console.error(
        `[texas] Official Texas API mode failed, falling back to browser scraping: ${error.message}`
      );
    }
  }

  const browserResults = await scrapeViaBrowser({
    businessType: normalizedBusinessType,
    targetLimit,
    targetLabel,
    progressTotal,
    onProgress,
    waitIfPaused,
    shouldCancel,
  });

  console.log(
    `[texas] Texas browser scrape finished with ${browserResults.length} returned records.`
  );
  return browserResults.slice(0, targetLimit);
}

module.exports = {
  scrape,
  __internal: {
    parseDetailText,
    parseAddressBlock,
    extractBusinessName,
    extractTaxpayerIdsFromText,
    mapApiDetailToRecord,
  },
};
