const { chromium } = require("playwright");
const {
  configureFetchProxy,
  getPlaywrightProxyConfig,
} = require("../scraper-proxy.cjs");

const DEFAULT_TIMEOUT = 120000;

configureFetchProxy("state-scrapers");

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

function normalizeEmptyValue(value = "") {
  const normalized = cleanInlineText(value).replace(/[\u2013\u2014]/g, "-");

  if (/^(?:-|n\/a|na|none)$/i.test(normalized)) {
    return "";
  }

  return normalized;
}

function parseUsAddress(value = "", defaultState = "") {
  const normalizedDefaultState = cleanInlineText(defaultState).toUpperCase();
  const normalized = normalizeEmptyValue(
    String(value ?? "")
      .replace(/,\s*(?:United States|USA|US)\b\.?/gi, "")
      .replace(/\b(?:United States|USA|US)\b\.?$/i, "")
      .replace(/,\s*([A-Z]{2})\s*,\s*\1\s+(\d{5}(?:-\d{4})?)/i, ", $1 $2")
      .replace(/\s+,/g, ",")
      .replace(/,\s*,/g, ", ")
  );

  if (!normalized) {
    return {
      address: "",
      city: "",
      state: normalizedDefaultState,
      zip: "",
    };
  }

  const working = cleanInlineText(normalized.replace(/;\s*/g, ", ")).replace(
    /,\s*$/g,
    ""
  );
  let match = working.match(
    /^(.*?)(?:,\s*|\s+)([A-Za-z][A-Za-z .'-]*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i
  );

  if (!match) {
    match = working.match(
      /^(.*?)(?:,\s*|\s+)([A-Za-z][A-Za-z .'-]*?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i
    );
  }

  if (!match) {
    return {
      address: working,
      city: "",
      state: normalizedDefaultState,
      zip: "",
    };
  }

  const street = cleanInlineText(match[1]).replace(/,\s*$/g, "");
  const city = cleanInlineText(match[2]).replace(/,\s*$/g, "");
  const state = cleanInlineText(match[3]).toUpperCase();
  const zip = cleanInlineText(match[4]);

  return {
    address: cleanInlineText(`${street}, ${city}, ${state} ${zip}`),
    city,
    state,
    zip,
  };
}

function resolveUrl(baseUrl = "", href = "") {
  const normalizedHref = cleanInlineText(href);

  if (!normalizedHref) {
    return "";
  }

  try {
    return new URL(normalizedHref, baseUrl).toString();
  } catch (error) {
    return normalizedHref;
  }
}

async function safeProgress(label, onProgress, payload) {
  if (typeof onProgress !== "function") {
    return;
  }

  try {
    await onProgress(payload);
  } catch (error) {
    console.error(`[${label}] onProgress callback failed: ${error.message}`);
  }
}

async function safeWaitIfPaused(label, waitIfPaused) {
  if (typeof waitIfPaused !== "function") {
    return;
  }

  try {
    await waitIfPaused();
  } catch (error) {
    console.error(`[${label}] waitIfPaused callback failed: ${error.message}`);
  }
}

async function safeShouldCancel(label, shouldCancel) {
  if (typeof shouldCancel !== "function") {
    return false;
  }

  try {
    return Boolean(await shouldCancel());
  } catch (error) {
    console.error(`[${label}] shouldCancel callback failed: ${error.message}`);
    return false;
  }
}

async function logPageContext(label, page, message, error) {
  console.error(`[${label}] ${message}: ${error.message}`);

  try {
    console.error(`[${label}] Page URL: ${page.url()}`);
    const snippet = cleanInlineText(await page.locator("body").innerHTML());
    console.error(`[${label}] HTML snippet: ${snippet.slice(0, 2000)}`);
  } catch (captureError) {
    console.error(
      `[${label}] Failed to capture page context: ${captureError.message}`
    );
  }
}

async function createBrowser(label) {
  const requestedChannel = cleanInlineText(
    process.env.PLAYWRIGHT_BROWSER_CHANNEL || "chrome"
  );
  const launchTargets = [requestedChannel, "chrome", "msedge", ""].filter(
    (value, index, values) => value || index === values.length - 1
  );
  const uniqueTargets = [...new Set(launchTargets)];
  const sharedOptions = {
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    args: ["--disable-blink-features=AutomationControlled"],
  };
  const proxy = getPlaywrightProxyConfig(label);

  if (proxy) {
    sharedOptions.proxy = proxy;
  }

  for (const target of uniqueTargets) {
    try {
      console.log(
        `[${label}] Launching browser using ${target || "bundled chromium"}`
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
        `[${label}] Browser launch failed for ${
          target || "bundled chromium"
        }: ${error.message}`
      );
    }
  }

  throw new Error(`Unable to launch any Chromium browser for ${label}.`);
}

async function createContext(browser, { timezoneId = "America/New_York" } = {}) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
    locale: "en-US",
    timezoneId,
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  return context;
}

async function closeResources(label, { page, context, browser }) {
  try {
    if (page) {
      await page.close();
    }
  } catch (error) {
    console.error(`[${label}] Failed to close page: ${error.message}`);
  }

  try {
    if (context) {
      await context.close();
    }
  } catch (error) {
    console.error(`[${label}] Failed to close browser context: ${error.message}`);
  }

  try {
    if (browser) {
      await browser.close();
    }
  } catch (error) {
    console.error(`[${label}] Failed to close browser: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_TIMEOUT,
  cleanInlineText,
  cleanTextBlock,
  getNonEmptyLines,
  normalizeStatus,
  normalizeEmptyValue,
  parseUsAddress,
  resolveUrl,
  safeProgress,
  safeWaitIfPaused,
  safeShouldCancel,
  logPageContext,
  createBrowser,
  createContext,
  closeResources,
};
