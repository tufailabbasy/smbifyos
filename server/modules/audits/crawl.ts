import { safeFetch as fetch } from "../../utils/safeFetch.js";
import { auditCrawlerDispatcher } from "../../utils/httpAgent.js";

export type WebsiteDeepCrawlInput = {
  website: string;
  businessName?: string;
  city?: string;
  state?: string;
  maxPages?: number;
  maxDepth?: number;
  respectRobots?: boolean;
  crawlDelayMs?: number;
  timeoutMs?: number;
  skipSitemapAudit?: boolean;
  onProgress?: (progress: {
    crawled: number;
    total: number;
    currentUrl: string;
  }) => void;
};

export type WebsiteDeepCrawlPageRole =
  | "home"
  | "contact"
  | "about"
  | "policy"
  | "service"
  | "blog"
  | "other";

export type WebsiteDeepCrawlPage = {
  url: string;
  depth: number;
  statusCode: number | null;
  wasRedirected: boolean;
  finalUrl: string;
  title: string;
  titleTagCount: number;
  metaDescription: string;
  metaDescriptionCount: number;
  h1Count: number;
  wordCount: number;
  internalLinkCount: number;
  outgoingInternalCount: number;
  incomingInternalCount: number;
  linksToBrokenPagesCount: number;
  linksToRedirectPagesCount: number;
  onlyNofollowIncoming: boolean;
  isOrphan: boolean;
  hasSchema: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  imagesCount: number;
  imagesWithoutAlt: number;
  imageAltOver100Count: number;
  canonicalUrl: string;
  canonicalTagCount: number;
  canonicalToRedirect: boolean;
  mentionsLocation: boolean;
  hasViewport: boolean;
  hasCanonical: boolean;
  noindex: boolean;
  nofollow: boolean;
  metaRefresh: boolean;
  hasCta: boolean;
  hasTrustSignal: boolean;
  hasTestimonials: boolean;
  hasAboutSignal: boolean;
  hasPolicySignal: boolean;
  hasOpenGraph: boolean;
  openGraphComplete: boolean;
  openGraphUrl: string;
  hasTwitterCard: boolean;
  twitterCardComplete: boolean;
  langAttribute: string;
  invalidLangAttribute: boolean;
  hreflangCount: number;
  invalidHreflangCount: number;
  hasXDefaultHreflang: boolean;
  hreflangMissingSelf: boolean;
  hreflangLangMismatch: boolean;
  httpsLinksToHttpCount: number;
  httpsLinksToHttpJsCount: number;
  httpsLinksToHttpCssCount: number;
  httpsLinksToHttpImageCount: number;
  // resource audit counts (populated post-crawl)
  brokenImageCount: number;
  largeImageCount: number;
  redirectedImageCount: number;
  brokenJsCount: number;
  largeJsCount: number;
  redirectedJsCount: number;
  brokenCssCount: number;
  largeCssCount: number;
  redirectedCssCount: number;
  redirectChain: boolean;
  redirectLoop: boolean;
  // sitemap audit (populated post-crawl)
  inSitemap: boolean;
  sitemapStatus: number | null;         // null = not in sitemap
  sitemapIsRedirect: boolean;
  sitemapIsNoindex: boolean;
  sitemapIsNonCanonical: boolean;
  pageRole: WebsiteDeepCrawlPageRole;
  responseTimeMs: number;
  htmlBytes: number;
  summary: string;
};

type FetchHtmlResult = {
  html: string;
  statusCode: number;
  responseTimeMs: number;
  htmlBytes: number;
  wasRedirected: boolean;
  finalUrl: string;
};

export type WebsiteDeepCrawlResult = {
  normalizedUrl: string;
  host: string;
  targetName: string;
  maxPages: number;
  pagesCrawled: number;
  pagesWithSchema: number;
  pagesWithContactSignals: number;
  pagesWithThinContent: number;
  pagesMissingTitle: number;
  pagesMissingMeta: number;
  pagesMissingH1: number;
  pagesWithCanonical: number;
  pagesWithViewport: number;
  pagesWithCta: number;
  pagesWithTrustSignals: number;
  pagesWithTestimonials: number;
  totalImagesWithoutAlt: number;
  pagesMentioningLocation: number;
  averageWordCount: number;
  averageResponseTimeMs: number;
  brokenPages: number;
  aboutPageFound: boolean;
  contactPageFound: boolean;
  policyPageFound: boolean;
  recommendations: string[];
  pages: WebsiteDeepCrawlPage[];
};

const CTA_PATTERN =
  /\b(contact us|get (a )?quote|request (a )?(quote|consultation)|book (a )?(call|consultation|demo)|schedule (a )?(call|consultation)|call now|start now|free audit|free consultation|talk to (an )?expert|send us a message)\b/i;
const TRUST_PATTERN =
  /\b(testimonial|testimonials|review|reviews|case study|case studies|certified|licensed|insured|trusted by|years of experience|since \d{4}|award|awards|our team|about us|privacy policy|terms of service)\b/i;
const TESTIMONIAL_PATTERN = /\b(testimonial|testimonials|review|reviews|case study|case studies|success stories)\b/i;
const ABOUT_PATTERN = /\b(about us|our story|who we are|meet the team|our team)\b/i;
const POLICY_PATTERN = /\b(privacy policy|terms of service|terms and conditions|refund policy)\b/i;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWebsiteUrl(value: string): string {
  const raw = cleanText(value);
  if (!raw) {
    throw new Error("Website URL is required");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  parsed.hash = "";
  return parsed.toString();
}

function canonicalizeUrl(value: string, baseUrl: string): string {
  const parsed = new URL(value, baseUrl);
  parsed.hash = "";

  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

function stripHtml(value: string): string {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(regex: RegExp, value: string): string {
  const matched = value.match(regex);
  return cleanText(matched?.[1] || "");
}

function countMatches(regex: RegExp, value: string): number {
  return value.match(regex)?.length || 0;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRobotsDisallowRules(robotsText: string): string[] {
  const lines = robotsText.split(/\r?\n/);
  const rules: string[] = [];
  let inWildcardUserAgent = false;

  for (const line of lines) {
    const normalized = cleanText(line.replace(/#.*$/, ""));
    if (!normalized) {
      continue;
    }

    const uaMatch = normalized.match(/^user-agent\s*:\s*(.+)$/i);
    if (uaMatch) {
      inWildcardUserAgent = cleanText(uaMatch[1]) === "*";
      continue;
    }

    if (!inWildcardUserAgent) {
      continue;
    }

    const disallowMatch = normalized.match(/^disallow\s*:\s*(.+)$/i);
    if (!disallowMatch) {
      continue;
    }

    const value = cleanText(disallowMatch[1]);
    if (!value) {
      continue;
    }

    rules.push(value);
  }

  return rules;
}

async function fetchRobotsDisallowRules(startUrl: string, timeoutMs: number): Promise<string[]> {
  try {
    const robotsUrl = new URL("/robots.txt", startUrl).toString();
    const fetched = await fetchHtml(robotsUrl, timeoutMs);
    if (fetched.statusCode < 200 || fetched.statusCode >= 300 || !cleanText(fetched.html)) {
      return [];
    }

    return parseRobotsDisallowRules(fetched.html);
  } catch {
    return [];
  }
}

function isPathBlockedByRobots(pathname: string, disallowRules: string[]): boolean {
  const normalizedPath = cleanText(pathname) || "/";
  if (disallowRules.length === 0) {
    return false;
  }

  for (const rule of disallowRules) {
    if (rule === "/") {
      return true;
    }

    if (rule !== "/" && normalizedPath.startsWith(rule)) {
      return true;
    }
  }

  return false;
}

function extractMetaContent(html: string, key: string, attribute: "name" | "property"): string {
  const direct = new RegExp(
    `<meta[^>]+${attribute}=["']${key}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
    "i"
  );
  const inverted = new RegExp(
    `<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+${attribute}=["']${key}["'][^>]*>`,
    "i"
  );

  return matchFirst(direct, html) || matchFirst(inverted, html);
}

function tokenizeDirectives(value: string): Set<string> {
  return new Set(
    cleanText(value)
      .toLowerCase()
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

async function fetchHtml(
  url: string,
  timeoutMs = 12000
): Promise<FetchHtmlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
      redirect: "follow",
      signal: controller.signal,
      dispatcher: auditCrawlerDispatcher,
    } as any);

    const html = await response.text().catch(() => "");

    return {
      html,
      statusCode: response.status,
      responseTimeMs: Date.now() - startedAt,
      htmlBytes: Buffer.byteLength(html, "utf8"),
      wasRedirected: response.redirected,
      finalUrl: cleanText(response.url) || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function detectPageRole(url: string): WebsiteDeepCrawlPageRole {
  try {
    const pathname = new URL(url).pathname.toLowerCase();

    if (pathname === "/" || pathname === "") {
      return "home";
    }
    if (/(^|\/)(contact|book|quote|get-started|consultation)(\/|$)/i.test(pathname)) {
      return "contact";
    }
    if (/(^|\/)(about|team|company|our-story)(\/|$)/i.test(pathname)) {
      return "about";
    }
    if (/(^|\/)(privacy|terms|policy|refund)(\/|$)/i.test(pathname)) {
      return "policy";
    }
    if (/(^|\/)(services?|solutions?|locations?|service-area[s]?)(\/|$)/i.test(pathname)) {
      return "service";
    }
    if (/(^|\/)(blog|news|articles?|posts?)(\/|$)/i.test(pathname)) {
      return "blog";
    }
  } catch {
    return "other";
  }

  return "other";
}

function isCrawlableUrl(url: URL, host: string): boolean {
  if (url.hostname !== host) {
    return false;
  }

  const href = url.toString().toLowerCase();
  if (
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.includes("/cdn-cgi/") ||
    /\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|rar|mp4|mp3|avi|mov|webm|css|js|xml|json|txt|ico)$/i.test(url.pathname)
  ) {
    return false;
  }

  return true;
}

type ExtractedLinkSignals = {
  internalLinks: string[];
  internalNofollowLinks: string[];
  httpsToHttpLinkCount: number;
  httpsToHttpJsCount: number;
  httpsToHttpCssCount: number;
  httpsToHttpImageCount: number;
  imageAltOver100Count: number;
  imageUrls: string[];
  jsUrls: string[];
  cssUrls: string[];
};

function isValidLangToken(value: string): boolean {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "x-default") {
    return true;
  }

  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normalized);
}

function extractHreflangSignals(html: string, currentUrl: string): {
  hreflangCount: number;
  invalidHreflangCount: number;
  hasXDefaultHreflang: boolean;
  hreflangMissingSelf: boolean;
  hreflangLangMismatch: boolean;
} {
  const normalizedCurrent = canonicalizeUrl(currentUrl, currentUrl);
  const alternateTags = Array.from(html.matchAll(/<link\b[^>]*>/gi)).map((entry) => entry[0]);
  const hreflangValues: string[] = [];
  const hreflangHrefs: string[] = [];

  for (const tag of alternateTags) {
    const rel = matchFirst(/rel=["']([^"']+)["']/i, tag).toLowerCase();
    if (!rel.includes("alternate")) {
      continue;
    }

    const hreflang = matchFirst(/hreflang=["']([^"']+)["']/i, tag).toLowerCase();
    const href = matchFirst(/href=["']([^"']+)["']/i, tag);
    if (!hreflang) {
      continue;
    }

    hreflangValues.push(hreflang);
    if (href) {
      try {
        hreflangHrefs.push(canonicalizeUrl(href, currentUrl));
      } catch {
        continue;
      }
    }
  }

  const langAttribute = matchFirst(/<html[^>]+lang=["']([^"']+)["']/i, html).toLowerCase();
  const langBase = cleanText(langAttribute).split("-")[0] || "";
  const invalidHreflangCount = hreflangValues.filter((value) => !isValidLangToken(value)).length;
  const hasXDefaultHreflang = hreflangValues.includes("x-default");
  const hreflangMissingSelf =
    hreflangValues.length > 0 && !hreflangHrefs.some((href) => canonicalizeUrl(href, currentUrl) === normalizedCurrent);
  const hreflangLangMismatch =
    hreflangValues.length > 0 &&
    Boolean(langBase) &&
    !hreflangValues.some((value) => value === "x-default" || value.split("-")[0] === langBase);

  return {
    hreflangCount: hreflangValues.length,
    invalidHreflangCount,
    hasXDefaultHreflang,
    hreflangMissingSelf,
    hreflangLangMismatch,
  };
}

function extractLinkSignals(html: string, currentUrl: string, host: string): ExtractedLinkSignals {
  const internalLinks = new Set<string>();
  const internalNofollowLinks = new Set<string>();
  const imageUrlSet = new Set<string>();
  const jsUrlSet = new Set<string>();
  const cssUrlSet = new Set<string>();
  const isHttpsPage = currentUrl.toLowerCase().startsWith("https://");
  let httpsToHttpLinkCount = 0;
  let httpsToHttpJsCount = 0;
  let httpsToHttpCssCount = 0;
  let httpsToHttpImageCount = 0;

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0] || "";
    const href = cleanText(match[1]);
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    if (isHttpsPage && href.toLowerCase().startsWith("http://")) {
      httpsToHttpLinkCount += 1;
    }

    try {
      const normalized = canonicalizeUrl(href, currentUrl);
      const url = new URL(normalized);
      if (!isCrawlableUrl(url, host)) {
        continue;
      }

      internalLinks.add(normalized);
      if (/rel=["'][^"']*nofollow[^"']*["']/i.test(tag)) {
        internalNofollowLinks.add(normalized);
      }
    } catch {
      continue;
    }
  }

  for (const match of html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
    const src = cleanText(match[1]);
    if (isHttpsPage && src.toLowerCase().startsWith("http://")) {
      httpsToHttpJsCount += 1;
      httpsToHttpLinkCount += 1;
    }
    try {
      const abs = new URL(src, currentUrl).toString();
      if (abs.startsWith("http")) jsUrlSet.add(abs);
    } catch { /* skip */ }
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0] || "";
    const rel = matchFirst(/rel=["']([^"']+)["']/i, tag).toLowerCase();
    const href = matchFirst(/href=["']([^"']+)["']/i, tag);
    if (!rel.includes("stylesheet") || !href) {
      continue;
    }

    if (isHttpsPage && href.toLowerCase().startsWith("http://")) {
      httpsToHttpCssCount += 1;
      httpsToHttpLinkCount += 1;
    }
    try {
      const abs = new URL(href, currentUrl).toString();
      if (abs.startsWith("http")) cssUrlSet.add(abs);
    } catch { /* skip */ }
  }

  let imageAltOver100Count = 0;
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0] || "";
    const src = matchFirst(/src=["']([^"']+)["']/i, tag);
    const alt = matchFirst(/alt=["']([^"']*)["']/i, tag);

    if (cleanText(alt).length > 100) {
      imageAltOver100Count += 1;
    }

    if (isHttpsPage && cleanText(src).toLowerCase().startsWith("http://")) {
      httpsToHttpImageCount += 1;
      httpsToHttpLinkCount += 1;
    }

    if (cleanText(src)) {
      try {
        const abs = new URL(src, currentUrl).toString();
        if (abs.startsWith("http")) imageUrlSet.add(abs);
      } catch { /* skip */ }
    }
  }

  return {
    internalLinks: Array.from(internalLinks),
    internalNofollowLinks: Array.from(internalNofollowLinks),
    httpsToHttpLinkCount,
    httpsToHttpJsCount,
    httpsToHttpCssCount,
    httpsToHttpImageCount,
    imageAltOver100Count,
    imageUrls: Array.from(imageUrlSet),
    jsUrls: Array.from(jsUrlSet),
    cssUrls: Array.from(cssUrlSet),
  };
}

function summarizePage(page: Omit<WebsiteDeepCrawlPage, "summary">): string {
  const parts: string[] = [];

  if (!page.title) {
    parts.push("missing title");
  }
  if (!page.metaDescription) {
    parts.push("missing meta description");
  }
  if (page.h1Count === 0) {
    parts.push("missing H1");
  }
  if (page.wordCount < 250) {
    parts.push(`thin content (${page.wordCount} words)`);
  }
  if (!page.hasSchema) {
    parts.push("no schema detected");
  }
  if (!page.hasPhone && !page.hasEmail) {
    parts.push("weak contact signal");
  }
  if (page.imagesWithoutAlt > 0) {
    parts.push(`${page.imagesWithoutAlt} images missing alt`);
  }
  if ((page.pageRole === "home" || page.pageRole === "service") && !page.hasCta) {
    parts.push("weak CTA coverage");
  }
  if ((page.pageRole === "home" || page.pageRole === "about") && !page.hasTrustSignal) {
    parts.push("limited trust proof");
  }

  if (parts.length === 0) {
    return "Page shows a balanced technical and content baseline for local search.";
  }

  return parts.join(", ");
}

function analyzePage(options: {
  html: string;
  url: string;
  depth: number;
  statusCode: number;
  wasRedirected: boolean;
  finalUrl: string;
  locationTokens: string[];
  responseTimeMs: number;
  htmlBytes: number;
}): WebsiteDeepCrawlPage & { discoveredLinks: string[]; discoveredNofollowLinks: string[]; imageUrls: string[]; jsUrls: string[]; cssUrls: string[] } {
  const { html, url, depth, statusCode, wasRedirected, finalUrl, locationTokens, responseTimeMs, htmlBytes } =
    options;
  const text = stripHtml(html);
  const lowerText = text.toLowerCase();
  const parsedUrl = new URL(url);
  const title = matchFirst(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  const titleTagCount = countMatches(/<title\b/gi, html);
  const metaDescription = extractMetaContent(html, "description", "name");
  const metaDescriptionCount = countMatches(/<meta[^>]+name=["']description["'][^>]*>/gi, html);
  const canonicalTagCount = countMatches(/<link[^>]+rel=["']canonical["'][^>]*>/gi, html);
  const canonicalRaw = matchFirst(/<link[^>]+rel=["']canonical["'][^>]+href=["']([\s\S]*?)["'][^>]*>/i, html);
  let canonicalUrl = "";
  if (canonicalRaw) {
    try {
      canonicalUrl = canonicalizeUrl(canonicalRaw, url);
    } catch {
      canonicalUrl = canonicalRaw;
    }
  }
  const h1Count = countMatches(/<h1\b/gi, html);
  const imagesCount = countMatches(/<img\b/gi, html);
  const imagesWithAlt = countMatches(/<img\b[^>]*\balt=["'][^"']*["']/gi, html);
  const imagesWithoutAlt = Math.max(0, imagesCount - imagesWithAlt);
  const linkSignals = extractLinkSignals(html, url, parsedUrl.hostname);
  const internalLinkCount = linkSignals.internalLinks.length;
  const hreflangSignals = extractHreflangSignals(html, url);

  const robotsDirectives = new Set<string>();
  for (const match of html.matchAll(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/gi)) {
    for (const token of tokenizeDirectives(match[1] || "")) {
      robotsDirectives.add(token);
    }
  }
  const noindex = robotsDirectives.has("noindex");
  const nofollow = robotsDirectives.has("nofollow");
  const metaRefresh = /<meta[^>]+http-equiv=["']refresh["'][^>]*>/i.test(html);

  const ogTags = new Set(
    Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](og:[^"']+)["'][^>]*>/gi)).map((entry) =>
      cleanText(entry[1]).toLowerCase()
    )
  );
  const hasOpenGraph = ogTags.size > 0;
  const openGraphComplete = ["og:title", "og:description", "og:image", "og:url"].every((key) => ogTags.has(key));
  const openGraphUrl = extractMetaContent(html, "og:url", "property");

  const twitterTags = new Set(
    Array.from(html.matchAll(/<meta[^>]+(?:property|name)=["'](twitter:[^"']+)["'][^>]*>/gi)).map((entry) =>
      cleanText(entry[1]).toLowerCase()
    )
  );
  const hasTwitterCard = twitterTags.size > 0;
  const twitterCardComplete = ["twitter:card", "twitter:title", "twitter:description"].every((key) =>
    twitterTags.has(key)
  );

  const langAttribute = matchFirst(/<html[^>]+lang=["']([^"']+)["']/i, html).toLowerCase();
  const invalidLangAttribute = Boolean(langAttribute) && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(langAttribute);

  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const hasSchema = /application\/ld\+json/i.test(html) || /schema\.org/i.test(html);
  const hasPhone = /\+?\d[\d\s().-]{7,}\d/.test(text);
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  const mentionsLocation = locationTokens.some((token) => lowerText.includes(token));
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasCanonical = canonicalTagCount > 0 && Boolean(canonicalUrl);
  const hasCta = CTA_PATTERN.test(text);
  const hasTrustSignal = TRUST_PATTERN.test(text);
  const hasTestimonials = TESTIMONIAL_PATTERN.test(text);
  const hasAboutSignal = ABOUT_PATTERN.test(text);
  const hasPolicySignal = POLICY_PATTERN.test(text);
  const pageRole = detectPageRole(url);
  const discoveredLinks = linkSignals.internalLinks;
  const discoveredNofollowLinks = linkSignals.internalNofollowLinks;

  const page: Omit<WebsiteDeepCrawlPage, "summary"> = {
    url,
    depth,
    statusCode,
    wasRedirected,
    finalUrl,
    title,
    titleTagCount,
    metaDescription,
    metaDescriptionCount,
    h1Count,
    wordCount,
    internalLinkCount,
    outgoingInternalCount: internalLinkCount,
    incomingInternalCount: 0,
    linksToBrokenPagesCount: 0,
    linksToRedirectPagesCount: 0,
    onlyNofollowIncoming: false,
    isOrphan: false,
    hasSchema,
    hasPhone,
    hasEmail,
    imagesCount,
    imagesWithoutAlt,
    imageAltOver100Count: linkSignals.imageAltOver100Count,
    canonicalUrl,
    canonicalTagCount,
    canonicalToRedirect: false,
    mentionsLocation,
    hasViewport,
    hasCanonical,
    noindex,
    nofollow,
    metaRefresh,
    hasCta,
    hasTrustSignal,
    hasTestimonials,
    hasAboutSignal,
    hasPolicySignal,
    hasOpenGraph,
    openGraphComplete,
    openGraphUrl,
    hasTwitterCard,
    twitterCardComplete,
    langAttribute,
    invalidLangAttribute,
    hreflangCount: hreflangSignals.hreflangCount,
    invalidHreflangCount: hreflangSignals.invalidHreflangCount,
    hasXDefaultHreflang: hreflangSignals.hasXDefaultHreflang,
    hreflangMissingSelf: hreflangSignals.hreflangMissingSelf,
    hreflangLangMismatch: hreflangSignals.hreflangLangMismatch,
    httpsLinksToHttpCount: linkSignals.httpsToHttpLinkCount,
    httpsLinksToHttpJsCount: linkSignals.httpsToHttpJsCount,
    httpsLinksToHttpCssCount: linkSignals.httpsToHttpCssCount,
    httpsLinksToHttpImageCount: linkSignals.httpsToHttpImageCount,
    brokenImageCount: 0,
    largeImageCount: 0,
    redirectedImageCount: 0,
    brokenJsCount: 0,
    largeJsCount: 0,
    redirectedJsCount: 0,
    brokenCssCount: 0,
    largeCssCount: 0,
    redirectedCssCount: 0,
    redirectChain: false,
    redirectLoop: false,
    inSitemap: false,
    sitemapStatus: null,
    sitemapIsRedirect: false,
    sitemapIsNoindex: false,
    sitemapIsNonCanonical: false,
    pageRole,
    responseTimeMs,
    htmlBytes,
  };

  return {
    ...page,
    summary: summarizePage(page),
    discoveredLinks,
    discoveredNofollowLinks,
    imageUrls: linkSignals.imageUrls,
    jsUrls: linkSignals.jsUrls,
    cssUrls: linkSignals.cssUrls,
  };
}

// --- Resource HEAD-check helpers ---

type HeadCheckResult = {
  status: number;
  contentLength: number;
  wasRedirected: boolean;
};

const headCheckCache = new Map<string, HeadCheckResult>();

async function headCheckResource(url: string, timeoutMs = 6000): Promise<HeadCheckResult> {
  const cached = headCheckCache.get(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SMBifyLeadAuditor/1.0)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const result: HeadCheckResult = {
      status: response.status,
      contentLength: Number(response.headers.get("content-length") || 0),
      wasRedirected: response.redirected,
    };
    headCheckCache.set(url, result);
    return result;
  } catch {
    const result: HeadCheckResult = { status: 0, contentLength: 0, wasRedirected: false };
    headCheckCache.set(url, result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function auditResourcesForPage(
  imageUrls: string[],
  jsUrls: string[],
  cssUrls: string[],
  timeoutMs: number
): Promise<{
  brokenImageCount: number;
  largeImageCount: number;
  redirectedImageCount: number;
  brokenJsCount: number;
  largeJsCount: number;
  redirectedJsCount: number;
  brokenCssCount: number;
  largeCssCount: number;
  redirectedCssCount: number;
}> {
  // Limit per-page to avoid hammering
  const imgSlice = imageUrls.slice(0, 30);
  const jsSlice = jsUrls.slice(0, 20);
  const cssSlice = cssUrls.slice(0, 15);

  const allUrls = [...imgSlice, ...jsSlice, ...cssSlice];
  const results = await Promise.all(allUrls.map((u) => headCheckResource(u, timeoutMs)));
  const resultMap = new Map<string, HeadCheckResult>();
  allUrls.forEach((u, i) => resultMap.set(u, results[i]));

  let brokenImageCount = 0, largeImageCount = 0, redirectedImageCount = 0;
  for (const url of imgSlice) {
    const r = resultMap.get(url)!;
    if (r.status >= 400 || r.status === 0) brokenImageCount++;
    if (r.contentLength > 200 * 1024) largeImageCount++;
    if (r.wasRedirected) redirectedImageCount++;
  }

  let brokenJsCount = 0, largeJsCount = 0, redirectedJsCount = 0;
  for (const url of jsSlice) {
    const r = resultMap.get(url)!;
    if (r.status >= 400 || r.status === 0) brokenJsCount++;
    if (r.contentLength > 500 * 1024) largeJsCount++;
    if (r.wasRedirected) redirectedJsCount++;
  }

  let brokenCssCount = 0, largeCssCount = 0, redirectedCssCount = 0;
  for (const url of cssSlice) {
    const r = resultMap.get(url)!;
    if (r.status >= 400 || r.status === 0) brokenCssCount++;
    if (r.contentLength > 200 * 1024) largeCssCount++;
    if (r.wasRedirected) redirectedCssCount++;
  }

  return {
    brokenImageCount, largeImageCount, redirectedImageCount,
    brokenJsCount, largeJsCount, redirectedJsCount,
    brokenCssCount, largeCssCount, redirectedCssCount,
  };
}

// --- Redirect chain / loop detection ---

async function detectRedirectChainOrLoop(
  url: string,
  timeoutMs = 8000
): Promise<{ isChain: boolean; isLoop: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const seen = new Set<string>();
  let current = url;
  let hops = 0;

  try {
    while (hops < 10) {
      if (seen.has(current)) return { isChain: hops > 1, isLoop: true };
      seen.add(current);

      const response = await fetch(current, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SMBifyLeadAuditor/1.0)" },
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = cleanText(response.headers.get("location") || "");
        if (!location) break;
        try {
          current = new URL(location, current).toString();
        } catch {
          break;
        }
        hops++;
      } else {
        break;
      }
    }
  } catch {
    // timeout or network
  } finally {
    clearTimeout(timeout);
  }

  return { isChain: hops > 1, isLoop: false };
}

// --- Sitemap fetch + parse ---

type SitemapUrl = {
  loc: string;
};

async function fetchSitemapUrls(baseUrl: string, timeoutMs = 10000): Promise<SitemapUrl[]> {
  const sitemapCandidates = [
    new URL("/sitemap.xml", baseUrl).toString(),
    new URL("/sitemap_index.xml", baseUrl).toString(),
  ];

  for (const sitemapUrl of sitemapCandidates) {
    try {
      const fetched = await fetchHtml(sitemapUrl, timeoutMs);
      if (fetched.statusCode >= 200 && fetched.statusCode < 300 && fetched.html.includes("<urlset") || fetched.html.includes("<sitemapindex")) {
        const urls: SitemapUrl[] = [];

        // If it's an index, extract nested sitemap hrefs, but only fetch the first one
        if (fetched.html.includes("<sitemapindex")) {
          const nestedLocs = Array.from(fetched.html.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi))
            .map((m) => cleanText(m[1]))
            .filter((l) => l.endsWith(".xml"));

          if (nestedLocs.length > 0) {
            try {
              const nested = await fetchHtml(nestedLocs[0], timeoutMs);
              if (nested.statusCode >= 200 && nested.statusCode < 300) {
                for (const m of nested.html.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
                  const loc = cleanText(m[1]);
                  if (loc && loc.startsWith("http")) urls.push({ loc });
                }
              }
            } catch { /* skip nested */ }
          }
        } else {
          for (const m of fetched.html.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
            const loc = cleanText(m[1]);
            if (loc && loc.startsWith("http")) urls.push({ loc });
          }
        }

        return urls.slice(0, 500);
      }
    } catch { /* try next */ }
  }

  return [];
}

function buildRecommendations(result: Omit<WebsiteDeepCrawlResult, "recommendations" | "pages">): string[] {
  const recommendations: string[] = [];

  if (result.pagesMissingTitle > 0) {
    recommendations.push("Standardize unique title tags across crawlable service and location pages.");
  }
  if (result.pagesMissingMeta > 0) {
    recommendations.push("Backfill meta descriptions so search snippets are controlled site-wide.");
  }
  if (result.pagesMissingH1 > 0) {
    recommendations.push("Fix pages missing a single clear H1 so topical focus is obvious to users and crawlers.");
  }
  if (result.pagesWithThinContent > 0) {
    recommendations.push("Expand thin pages with service specifics, proof, FAQs, and local context before pushing outreach or ads.");
  }
  if (result.pagesWithSchema < result.pagesCrawled) {
    recommendations.push("Roll out schema coverage beyond the homepage so more crawlable pages reinforce entity and service context.");
  }
  if (result.totalImagesWithoutAlt > 0) {
    recommendations.push("Add alt text to image-heavy pages to clean up accessibility and image-search relevance.");
  }
  if (result.pagesWithContactSignals < result.pagesCrawled) {
    recommendations.push("Expose clear contact signals on deeper pages, not only on the homepage or contact page.");
  }
  if (result.pagesMentioningLocation === 0) {
    recommendations.push("Add natural city/state mentions to service pages so local intent is reinforced across the crawl depth.");
  }
  if (result.pagesWithCta < Math.max(1, Math.ceil(result.pagesCrawled / 2))) {
    recommendations.push("Strengthen visible calls to action on core pages so visitors can move from audit to inquiry without friction.");
  }
  if (!result.aboutPageFound || !result.policyPageFound) {
    recommendations.push("Fill trust gaps with clearer About, privacy, and policy coverage across the public site.");
  }
  if (result.brokenPages > 0) {
    recommendations.push("Repair broken or failed pages first so the crawl path is stable before deeper content work.");
  }
  if (result.averageResponseTimeMs > 1800) {
    recommendations.push("Improve response time on key pages because slow pages compound both UX and crawl efficiency issues.");
  }

  return recommendations;
}

export async function runWebsiteDeepCrawl(input: WebsiteDeepCrawlInput): Promise<WebsiteDeepCrawlResult> {
  const normalizedUrl = normalizeWebsiteUrl(input.website);
  const startUrl = canonicalizeUrl(normalizedUrl, normalizedUrl);
  const host = new URL(startUrl).hostname;
  const maxPages = Math.max(1, Math.min(500, Math.round(Number(input.maxPages) || 10)));
  const maxDepth = Math.max(0, Math.min(4, Math.round(Number(input.maxDepth) || 2)));
  const respectRobots = input.respectRobots === true;
  const crawlDelayMs = Math.max(0, Math.min(5000, Math.round(Number(input.crawlDelayMs) || 0)));
  const timeoutMs = Math.max(2000, Math.min(30000, Math.round(Number(input.timeoutMs) || 12000)));
  const enableSitemapAudit = input.skipSitemapAudit !== true;
  const locationTokens = [cleanText(input.city), cleanText(input.state)]
    .filter(Boolean)
    .map((token) => token.toLowerCase());

  const robotsDisallowRules = respectRobots ? await fetchRobotsDisallowRules(startUrl, timeoutMs) : [];

  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const visited = new Set<string>();
  const pages: WebsiteDeepCrawlPage[] = [];
  const outgoingLinksByPage = new Map<string, string[]>();
  const outgoingNofollowLinksByPage = new Map<string, Set<string>>();
  const pageResourceUrls = new Map<string, { imageUrls: string[]; jsUrls: string[]; cssUrls: string[] }>();

  while (queue.length > 0 && pages.length < maxPages) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    if (respectRobots) {
      try {
        const currentPath = new URL(current.url).pathname || "/";
        if (isPathBlockedByRobots(currentPath, robotsDisallowRules)) {
          continue;
        }
      } catch {
        // Skip malformed URLs.
      }
    }

    if (visited.has(current.url)) {
      continue;
    }

    visited.add(current.url);
    input.onProgress?.({
      crawled: pages.length,
      total: Math.max(queue.length + pages.length + 1, pages.length + 1),
      currentUrl: current.url,
    });

    try {
      const fetched = await fetchHtml(current.url, timeoutMs);
      const analyzed = analyzePage({
        html: fetched.html,
        url: current.url,
        depth: current.depth,
        statusCode: fetched.statusCode,
        wasRedirected: fetched.wasRedirected,
        finalUrl: fetched.finalUrl,
        locationTokens,
        responseTimeMs: fetched.responseTimeMs,
        htmlBytes: fetched.htmlBytes,
      });

      const { discoveredLinks, discoveredNofollowLinks, imageUrls, jsUrls, cssUrls, ...savedPage } = analyzed;
      pages.push(savedPage);
      outgoingLinksByPage.set(savedPage.url, discoveredLinks);
      outgoingNofollowLinksByPage.set(savedPage.url, new Set(discoveredNofollowLinks));
      pageResourceUrls.set(savedPage.url, { imageUrls, jsUrls, cssUrls });

      if (current.depth < maxDepth) {
        for (const nextUrl of discoveredLinks) {
          if (respectRobots) {
            try {
              const nextPath = new URL(nextUrl).pathname || "/";
              if (isPathBlockedByRobots(nextPath, robotsDisallowRules)) {
                continue;
              }
            } catch {
              continue;
            }
          }

          if (!visited.has(nextUrl)) {
            queue.push({ url: nextUrl, depth: current.depth + 1 });
          }
        }
      }
    } catch (error) {
      pages.push({
        url: current.url,
        depth: current.depth,
        statusCode: null,
        wasRedirected: false,
        finalUrl: current.url,
        title: "",
        titleTagCount: 0,
        metaDescription: "",
        metaDescriptionCount: 0,
        h1Count: 0,
        wordCount: 0,
        internalLinkCount: 0,
        outgoingInternalCount: 0,
        incomingInternalCount: 0,
        linksToBrokenPagesCount: 0,
        linksToRedirectPagesCount: 0,
        onlyNofollowIncoming: false,
        isOrphan: false,
        hasSchema: false,
        hasPhone: false,
        hasEmail: false,
        imagesCount: 0,
        imagesWithoutAlt: 0,
        imageAltOver100Count: 0,
        canonicalUrl: "",
        canonicalTagCount: 0,
        canonicalToRedirect: false,
        mentionsLocation: false,
        hasViewport: false,
        hasCanonical: false,
        noindex: false,
        nofollow: false,
        metaRefresh: false,
        hasCta: false,
        hasTrustSignal: false,
        hasTestimonials: false,
        hasAboutSignal: false,
        hasPolicySignal: false,
        hasOpenGraph: false,
        openGraphComplete: false,
        openGraphUrl: "",
        hasTwitterCard: false,
        twitterCardComplete: false,
        langAttribute: "",
        invalidLangAttribute: false,
        hreflangCount: 0,
        invalidHreflangCount: 0,
        hasXDefaultHreflang: false,
        hreflangMissingSelf: false,
        hreflangLangMismatch: false,
        httpsLinksToHttpCount: 0,
        httpsLinksToHttpJsCount: 0,
        httpsLinksToHttpCssCount: 0,
        httpsLinksToHttpImageCount: 0,
        brokenImageCount: 0,
        largeImageCount: 0,
        redirectedImageCount: 0,
        brokenJsCount: 0,
        largeJsCount: 0,
        redirectedJsCount: 0,
        brokenCssCount: 0,
        largeCssCount: 0,
        redirectedCssCount: 0,
        redirectChain: false,
        redirectLoop: false,
        inSitemap: false,
        sitemapStatus: null,
        sitemapIsRedirect: false,
        sitemapIsNoindex: false,
        sitemapIsNonCanonical: false,
        pageRole: detectPageRole(current.url),
        responseTimeMs: 0,
        htmlBytes: 0,
        summary: error instanceof Error ? error.message : "Page fetch failed",
      });
      outgoingLinksByPage.set(current.url, []);
      outgoingNofollowLinksByPage.set(current.url, new Set<string>());
    }

    if (crawlDelayMs > 0 && queue.length > 0) {
      await delay(crawlDelayMs);
    }
  }

  const normalizedPageMap = new Map<string, WebsiteDeepCrawlPage>();
  const incomingCounts = new Map<string, number>();
  const incomingFollowCounts = new Map<string, number>();
  const incomingNofollowCounts = new Map<string, number>();

  for (const page of pages) {
    try {
      normalizedPageMap.set(canonicalizeUrl(page.url, page.url), page);
    } catch {
      normalizedPageMap.set(cleanText(page.url), page);
    }
  }

  for (const page of pages) {
    const outgoingLinks = outgoingLinksByPage.get(page.url) || [];
    const nofollowLinks = outgoingNofollowLinksByPage.get(page.url) || new Set<string>();
    let linksToBroken = 0;
    let linksToRedirect = 0;

    for (const link of outgoingLinks) {
      let normalizedLink = cleanText(link);
      try {
        normalizedLink = canonicalizeUrl(link, page.url);
      } catch {
        normalizedLink = cleanText(link);
      }

      const target = normalizedPageMap.get(normalizedLink);
      if (!target) {
        continue;
      }

      incomingCounts.set(normalizedLink, (incomingCounts.get(normalizedLink) || 0) + 1);
      if (nofollowLinks.has(link)) {
        incomingNofollowCounts.set(normalizedLink, (incomingNofollowCounts.get(normalizedLink) || 0) + 1);
      } else {
        incomingFollowCounts.set(normalizedLink, (incomingFollowCounts.get(normalizedLink) || 0) + 1);
      }

      if (target.statusCode === null || target.statusCode >= 400) {
        linksToBroken += 1;
      }

      if (((target.statusCode || 0) >= 300 && (target.statusCode || 0) < 400) || target.wasRedirected) {
        linksToRedirect += 1;
      }
    }

    page.linksToBrokenPagesCount = linksToBroken;
    page.linksToRedirectPagesCount = linksToRedirect;
    page.outgoingInternalCount = outgoingLinks.length;
  }

  for (const page of pages) {
    let key = cleanText(page.url);
    try {
      key = canonicalizeUrl(page.url, page.url);
    } catch {
      key = cleanText(page.url);
    }

    const incoming = incomingCounts.get(key) || 0;
    const incomingFollow = incomingFollowCounts.get(key) || 0;
    const incomingNofollow = incomingNofollowCounts.get(key) || 0;

    page.incomingInternalCount = incoming;
    page.onlyNofollowIncoming = incoming > 0 && incomingFollow === 0 && incomingNofollow > 0;
    page.isOrphan = page.depth > 0 && incoming === 0;

    if (cleanText(page.canonicalUrl)) {
      let canonicalKey = cleanText(page.canonicalUrl);
      try {
        canonicalKey = canonicalizeUrl(page.canonicalUrl, page.url);
      } catch {
        canonicalKey = cleanText(page.canonicalUrl);
      }

      const canonicalTarget = normalizedPageMap.get(canonicalKey);
      page.canonicalToRedirect = Boolean(
        canonicalTarget &&
          (((canonicalTarget.statusCode || 0) >= 300 && (canonicalTarget.statusCode || 0) < 400) ||
            canonicalTarget.wasRedirected)
      );
    }
  }

  // --- Resource audit pass: HEAD-check images/JS/CSS on each page ---
  headCheckCache.clear();
  for (const page of pages) {
    const resources = pageResourceUrls.get(page.url);
    if (resources && (resources.imageUrls.length > 0 || resources.jsUrls.length > 0 || resources.cssUrls.length > 0)) {
      const audit = await auditResourcesForPage(resources.imageUrls, resources.jsUrls, resources.cssUrls, timeoutMs);
      page.brokenImageCount = audit.brokenImageCount;
      page.largeImageCount = audit.largeImageCount;
      page.redirectedImageCount = audit.redirectedImageCount;
      page.brokenJsCount = audit.brokenJsCount;
      page.largeJsCount = audit.largeJsCount;
      page.redirectedJsCount = audit.redirectedJsCount;
      page.brokenCssCount = audit.brokenCssCount;
      page.largeCssCount = audit.largeCssCount;
      page.redirectedCssCount = audit.redirectedCssCount;
    }
  }
  headCheckCache.clear();

  // --- Redirect chain/loop detection for redirected pages ---
  const redirectedPages = pages.filter((p) => p.wasRedirected || ((p.statusCode || 0) >= 300 && (p.statusCode || 0) < 400));
  for (const page of redirectedPages.slice(0, 20)) {
    const result = await detectRedirectChainOrLoop(page.url, timeoutMs);
    page.redirectChain = result.isChain;
    page.redirectLoop = result.isLoop;
  }

  // --- Sitemap audit pass ---
  const sitemapUrls = enableSitemapAudit ? await fetchSitemapUrls(startUrl, timeoutMs) : [];
  if (sitemapUrls.length > 0) {
    const sitemapLocSet = new Set(sitemapUrls.map((s) => {
      try { return canonicalizeUrl(s.loc, s.loc); } catch { return cleanText(s.loc); }
    }));

    for (const page of pages) {
      let pageKey = cleanText(page.url);
      try { pageKey = canonicalizeUrl(page.url, page.url); } catch { /* keep */ }

      if (sitemapLocSet.has(pageKey)) {
        page.inSitemap = true;
        page.sitemapStatus = page.statusCode;
        page.sitemapIsRedirect = page.wasRedirected || ((page.statusCode || 0) >= 300 && (page.statusCode || 0) < 400);
        page.sitemapIsNoindex = page.noindex;
        page.sitemapIsNonCanonical = Boolean(page.hasCanonical && page.canonicalUrl && (() => {
          try {
            return canonicalizeUrl(page.canonicalUrl, page.url) !== pageKey;
          } catch { return false; }
        })());
      }
    }

    // Also flag sitemap URLs that weren't crawled by checking their status
    for (const sUrl of sitemapUrls) {
      let sKey: string;
      try { sKey = canonicalizeUrl(sUrl.loc, sUrl.loc); } catch { sKey = cleanText(sUrl.loc); }

      const existingPage = normalizedPageMap.get(sKey);
      if (!existingPage) {
        // URL in sitemap but not crawled - still need to mark for sitemap checks
        // We only mark crawled pages, so skip uncrawled ones
      }
    }
  }

  const pagesCrawled = pages.length;
  const pagesWithSchema = pages.filter((page) => page.hasSchema).length;
  const pagesWithContactSignals = pages.filter((page) => page.hasPhone || page.hasEmail).length;
  const pagesWithThinContent = pages.filter((page) => page.wordCount > 0 && page.wordCount < 250).length;
  const pagesMissingTitle = pages.filter((page) => !page.title).length;
  const pagesMissingMeta = pages.filter((page) => !page.metaDescription).length;
  const pagesMissingH1 = pages.filter((page) => page.h1Count === 0).length;
  const pagesWithCanonical = pages.filter((page) => page.hasCanonical).length;
  const pagesWithViewport = pages.filter((page) => page.hasViewport).length;
  const pagesWithCta = pages.filter((page) => page.hasCta).length;
  const pagesWithTrustSignals = pages.filter((page) => page.hasTrustSignal).length;
  const pagesWithTestimonials = pages.filter((page) => page.hasTestimonials).length;
  const totalImagesWithoutAlt = pages.reduce((sum, page) => sum + page.imagesWithoutAlt, 0);
  const pagesMentioningLocation = pages.filter((page) => page.mentionsLocation).length;
  const averageWordCount =
    pagesCrawled === 0 ? 0 : Math.round(pages.reduce((sum, page) => sum + page.wordCount, 0) / pagesCrawled);
  const averageResponseTimeMs =
    pagesCrawled === 0
      ? 0
      : Math.round(
          pages.reduce((sum, page) => sum + Math.max(0, page.responseTimeMs || 0), 0) /
            pagesCrawled
        );
  const brokenPages = pages.filter((page) => page.statusCode === null || page.statusCode >= 400).length;
  const aboutPageFound = pages.some((page) => page.pageRole === "about" || page.hasAboutSignal);
  const contactPageFound = pages.some(
    (page) => page.pageRole === "contact" || page.hasPhone || page.hasEmail
  );
  const policyPageFound = pages.some((page) => page.pageRole === "policy" || page.hasPolicySignal);

  const baseResult = {
    normalizedUrl: startUrl,
    host,
    targetName: cleanText(input.businessName) || startUrl,
    maxPages,
    pagesCrawled,
    pagesWithSchema,
    pagesWithContactSignals,
    pagesWithThinContent,
    pagesMissingTitle,
    pagesMissingMeta,
    pagesMissingH1,
    pagesWithCanonical,
    pagesWithViewport,
    pagesWithCta,
    pagesWithTrustSignals,
    pagesWithTestimonials,
    totalImagesWithoutAlt,
    pagesMentioningLocation,
    averageWordCount,
    averageResponseTimeMs,
    brokenPages,
    aboutPageFound,
    contactPageFound,
    policyPageFound,
  };

  return {
    ...baseResult,
    recommendations: buildRecommendations(baseResult),
    pages,
  };
}