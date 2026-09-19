function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

const { execFileSync } = require("node:child_process");

let proxySupport = {
  configureFetchProxy: () => {},
};

try {
  proxySupport = require("../scraper-proxy.cjs");
} catch (error) {
  void error;
}

proxySupport.configureFetchProxy("bing-rss-utils");

function decodeHtml(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripTags(value = "") {
  return cleanText(String(value || "").replace(/<[^>]*>/g, " "));
}

function extractTag(block = "", tagName = "") {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = String(block).match(regex);
  return decodeHtml(cleanText(match ? match[1] : ""));
}

function extractRssItems(xml = "") {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const items = [];
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || "";
    items.push({
      title: stripTags(extractTag(block, "title")),
      link: cleanText(extractTag(block, "link")),
      description: stripTags(extractTag(block, "description")),
      pubDate: cleanText(extractTag(block, "pubDate")),
    });
  }

  return items;
}

function getHost(value = "") {
  try {
    const url = new URL(value);
    return (url.hostname || "").replace(/^www\./i, "").toLowerCase();
  } catch (error) {
    void error;
    return "";
  }
}

function getPathname(value = "") {
  try {
    const url = new URL(value);
    return cleanText(url.pathname || "").toLowerCase();
  } catch (error) {
    void error;
    return "";
  }
}

function hostMatchesDomain(host = "", domain = "") {
  const normalizedHost = cleanText(host).toLowerCase();
  const normalizedDomain = cleanText(domain).toLowerCase();

  if (!normalizedHost || !normalizedDomain) {
    return false;
  }

  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function extractPhone(value = "") {
  const match = String(value || "").match(
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/
  );
  return cleanText(match ? match[0] : "");
}

function parseLocation(location = "") {
  const normalized = cleanText(location);
  const parts = normalized.split(",").map((part) => cleanText(part));
  const city = parts[0] || "";
  const state = (parts[1] || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return { state, city };
}

function normalizeBusinessName(title = "", fallback = "Business") {
  let name = cleanText(title)
    .replace(/\s*-\s*Yelp\b.*/i, "")
    .replace(/\s*\|\s*Better Business Bureau.*/i, "")
    .replace(/\s*-\s*Better Business Bureau.*/i, "")
    .replace(/\s*-\s*Yellow Pages.*/i, "")
    .replace(/\s*\|\s*Yellow Pages.*/i, "")
    .replace(/^THE BEST\s+\d+\s+/i, "")
    .replace(/^Top\s+\d+\s+/i, "")
    .replace(/\s*\(Updated.*\)$/i, "");

  if (!name) {
    name = fallback;
  }

  return name;
}

function emitProgress(progress) {
  try {
    process.stdout.write(`__PROGRESS__${JSON.stringify(progress)}\n`);
  } catch (error) {
    void error;
  }
}

async function fetchBingRss(query = "") {
  const rssUrl = `https://www.bing.com/search?format=rss&setlang=en-us&cc=us&q=${encodeURIComponent(
    cleanText(query)
  )}`;

  async function fetchWithTimeout() {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000);

    try {
      const response = await fetch(rssUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Bing RSS request failed (${response.status})`);
      }

      return response.text();
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Bing RSS request timed out after 30 seconds");
      }

      const code = error && error.cause && error.cause.code ? ` (${error.cause.code})` : "";
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}${code}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchWithTimeout();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  if (process.platform === "win32") {
    try {
      const psScript = [
        "$ProgressPreference='SilentlyContinue'",
        `$r = Invoke-WebRequest -Uri '${rssUrl.replace(/'/g, "''")}' -UseBasicParsing -TimeoutSec 30`,
        "$r.Content",
      ].join("; ");

      return execFileSync("powershell", ["-NoProfile", "-Command", psScript], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      const fallbackMessage = error instanceof Error ? error.message : String(error);
      const primaryMessage = lastError instanceof Error ? lastError.message : String(lastError || "unknown error");
      throw new Error(`Bing RSS fetch failed after retries. Primary: ${primaryMessage}. PowerShell fallback: ${fallbackMessage}`);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || "unknown error");
  throw new Error(`Bing RSS fetch failed after retries: ${message}`);
}

function toDirectoryRecords({
  items = [],
  domainFilters = [],
  requiredPathIncludes = [],
  blockedPathIncludes = [],
  fallbackLocation = "",
  category = "",
} = {}) {
  const filters = Array.isArray(domainFilters)
    ? domainFilters.map((domain) => cleanText(domain).toLowerCase()).filter(Boolean)
    : [];
  const requiredPathTokens = Array.isArray(requiredPathIncludes)
    ? requiredPathIncludes.map((token) => cleanText(token).toLowerCase()).filter(Boolean)
    : [];
  const blockedPathTokens = Array.isArray(blockedPathIncludes)
    ? blockedPathIncludes.map((token) => cleanText(token).toLowerCase()).filter(Boolean)
    : [];

  const location = parseLocation(fallbackLocation);
  const records = [];
  const seen = new Set();

  for (const item of items) {
    const link = cleanText(item.link);
    const host = getHost(link);
    const pathname = getPathname(link);

    if (filters.length > 0 && !filters.some((domain) => hostMatchesDomain(host, domain))) {
      continue;
    }

    if (requiredPathTokens.length > 0 && !requiredPathTokens.some((token) => pathname.includes(token))) {
      continue;
    }

    if (blockedPathTokens.some((token) => pathname.includes(token))) {
      continue;
    }

    const title = cleanText(item.title);
    const description = cleanText(item.description);
    const name = normalizeBusinessName(title);
    const dedupe = `${name.toLowerCase()}|${host}|${location.city.toLowerCase()}|${location.state.toLowerCase()}`;

    if (!name || seen.has(dedupe)) {
      continue;
    }

    seen.add(dedupe);

    records.push({
      id: `${host || "result"}-${records.length + 1}`,
      name,
      address: cleanText(location.city ? `${location.city}, ${location.state}` : fallbackLocation),
      phone: extractPhone(`${title} ${description}`),
      website: filters.length > 0 ? "" : link,
      rating: null,
      reviewCount: null,
      categories: [category || "General"],
      sourceUrl: link,
      snippet: description,
      host,
    });
  }

  return records;
}

async function scrapeDirectoryViaBingRss({
  query,
  category,
  location,
  maxItems = 25,
  domainFilters = [],
  requiredPathIncludes = [],
  blockedPathIncludes = [],
}) {
  emitProgress({ percent: 5, message: "Fetching search feed...", totalFound: 0 });

  const xml = await fetchBingRss(query);
  const rawItems = extractRssItems(xml);

  emitProgress({
    percent: 45,
    message: `Feed received with ${rawItems.length} raw results`,
    totalFound: rawItems.length,
  });

  let records = toDirectoryRecords({
    items: rawItems,
    domainFilters,
    requiredPathIncludes,
    blockedPathIncludes,
    fallbackLocation: location,
    category,
  });

  if (maxItems > 0) {
    records = records.slice(0, maxItems);
  }

  emitProgress({
    percent: 90,
    message: `Prepared ${records.length} cleaned records`,
    totalFound: records.length,
  });

  return records;
}

module.exports = {
  cleanText,
  emitProgress,
  extractRssItems,
  fetchBingRss,
  scrapeDirectoryViaBingRss,
};
