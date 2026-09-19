let proxyCursor = Math.floor(Math.random() * 1000);
let fetchProxyConfigured = false;
let fetchProxyLoggedUnsupported = false;

function cleanText(value = "") {
  return String(value ?? "").trim();
}

function splitProxyList(value = "") {
  return cleanText(value)
    .split(/[\n,;]+/g)
    .map((entry) => cleanText(entry))
    .filter(Boolean);
}

function normalizeHostPortAuthProxy(value = "") {
  const raw = cleanText(value);
  if (!raw || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return "";
  }

  const parts = raw.split(":");
  if (parts.length < 4) {
    return "";
  }

  const host = cleanText(parts.shift());
  const port = cleanText(parts.shift());
  const username = parts.shift() || "";
  const password = parts.join(":");

  if (!host || !/^\d{1,5}$/.test(port) || !username || !password) {
    return "";
  }

  return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function normalizeProxyUrl(value = "") {
  const raw = cleanText(value);
  if (!raw) {
    return "";
  }

  const normalizedHostPortAuth = normalizeHostPortAuthProxy(raw);
  return normalizedHostPortAuth || (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`);
}

function getProxyUrls() {
  const urls = [
    ...splitProxyList(process.env.SCRAPER_PROXY_URLS),
    ...splitProxyList(process.env.SCRAPER_PROXY_URL),
  ];
  const seen = new Set();

  return urls
    .map((entry) => normalizeProxyUrl(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
}

function pickProxyUrl() {
  const proxies = getProxyUrls();
  if (!proxies.length) {
    return "";
  }

  const proxyUrl = proxies[proxyCursor % proxies.length];
  proxyCursor += 1;
  return proxyUrl;
}

function maskProxyUrl(value = "") {
  const normalized = normalizeProxyUrl(value);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    if (url.username || url.password) {
      url.username = "***";
      url.password = "***";
    }

    return url.toString().replace(/\/$/g, "");
  } catch (error) {
    return normalized.replace(/\/\/([^:@\s]+):([^@\s]+)@/g, "//***:***@");
  }
}

function getPlaywrightProxyConfig(label = "scraper") {
  const proxyUrl = pickProxyUrl();
  if (!proxyUrl) {
    return null;
  }

  try {
    const url = new URL(proxyUrl);
    const username = decodeURIComponent(url.username || "");
    const password = decodeURIComponent(url.password || "");
    url.username = "";
    url.password = "";

    const proxy = {
      server: url.toString().replace(/\/$/g, ""),
    };
    const bypass = cleanText(process.env.SCRAPER_PROXY_BYPASS);

    if (username) {
      proxy.username = username;
    }

    if (password) {
      proxy.password = password;
    }

    if (bypass) {
      proxy.bypass = bypass;
    }

    console.log(`[${label}] Using scraper proxy ${maskProxyUrl(proxyUrl)}`);
    return proxy;
  } catch (error) {
    console.error(
      `[${label}] Ignoring invalid SCRAPER_PROXY_URL value: ${error.message}`
    );
    return null;
  }
}

function isFetchProxySupported(proxyUrl = "") {
  try {
    const protocol = new URL(proxyUrl).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:";
  } catch (error) {
    return false;
  }
}

function configureFetchProxy(label = "scraper") {
  if (fetchProxyConfigured) {
    return;
  }

  const proxyUrl = pickProxyUrl();
  if (!proxyUrl) {
    return;
  }

  if (!isFetchProxySupported(proxyUrl)) {
    if (!fetchProxyLoggedUnsupported) {
      console.warn(
        `[${label}] Fetch proxy skipped for ${maskProxyUrl(
          proxyUrl
        )}; Node fetch proxy supports http/https proxies. Browser scraping can still use this proxy.`
      );
      fetchProxyLoggedUnsupported = true;
    }
    return;
  }

  try {
    const { ProxyAgent, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    fetchProxyConfigured = true;
    console.log(`[${label}] Node fetch requests will use proxy ${maskProxyUrl(proxyUrl)}`);
  } catch (error) {
    console.error(
      `[${label}] Failed to configure Node fetch proxy ${maskProxyUrl(
        proxyUrl
      )}: ${error.message}`
    );
  }
}

module.exports = {
  configureFetchProxy,
  getPlaywrightProxyConfig,
  getProxyUrls,
  maskProxyUrl,
  normalizeProxyUrl,
};
