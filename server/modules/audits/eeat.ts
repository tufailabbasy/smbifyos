import { safeFetch as fetch } from "../../utils/safeFetch.js";
import { load, type CheerioAPI } from "cheerio";
import { auditCrawlerDispatcher } from "../../utils/httpAgent.js";

export type EeatCheckStatus = "pass" | "fail";

export type EeatAuditCheck = {
  id: string;
  name: string;
  description: string;
  status: EeatCheckStatus;
  result: string;
  guide_url: string;
};

export type EeatAuditCategory = {
  id: string;
  name: string;
  icon: string;
  total: number;
  passed: number;
  score_percent: number;
  checks: EeatAuditCheck[];
};

export type EeatAuditIssue = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type EeatAuditRating = "Poor" | "Needs Work" | "Good" | "Excellent";

export type EeatAuditReport = {
  domain: string;
  score: number;
  rating: EeatAuditRating;
  total_checks: number;
  passed: number;
  failed: number;
  summary: string;
  issues: EeatAuditIssue[];
  wins: string[];
  recommendations: string[];
  categories: EeatAuditCategory[];
  manual_checklist_total: number;
  checked_at: string;
  cache: {
    cached: boolean;
    cached_at: string;
    age_ms: number;
    expires_at: string;
  };
};

type LinkInfo = {
  href_raw: string;
  absolute_url: string;
  text: string;
  target: string;
  rel: string;
  class_name: string;
  style: string;
  in_footer: boolean;
  in_nav: boolean;
};

type FetchHop = {
  url: string;
  status: number;
  location: string | null;
};

type FetchChainResult = {
  ok: boolean;
  status: number | null;
  finalUrl: string;
  hops: number;
  body: string;
  error: string;
  history: FetchHop[];
  headers: Headers | null;
};

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MANUAL_CHECKLIST_TOTAL = 47;
const CACHE_TTL_MS = 60 * 60 * 1000;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function compactWhitespace(value: string): string {
  return cleanText(value).replace(/\s+/g, " ");
}

function countWords(value: string): number {
  const text = compactWhitespace(value);
  if (!text) {
    return 0;
  }

  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeHost(hostname: string): string {
  return cleanText(hostname).toLowerCase().replace(/^www\./i, "");
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  const normalized = pathname.replace(/\/+$/g, "");
  return normalized || "/";
}

function buildGuideUrl(checkName: string): string {
  const query = encodeURIComponent(`${checkName} SEO fix guide`);
  return `https://www.google.com/search?q=${query}`;
}

function makeCheck(args: {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  passResult: string;
  failResult: string;
}): EeatAuditCheck {
  return {
    id: args.id,
    name: args.name,
    description: args.description,
    status: args.passed ? "pass" : "fail",
    result: args.passed ? args.passResult : args.failResult,
    guide_url: buildGuideUrl(args.name),
  };
}

function makeCategory(id: string, name: string, icon: string, checks: EeatAuditCheck[]): EeatAuditCategory {
  const passed = checks.filter((item) => item.status === "pass").length;
  const total = checks.length;

  return {
    id,
    name,
    icon,
    total,
    passed,
    score_percent: total > 0 ? Math.round((passed / total) * 100) : 0,
    checks,
  };
}

function ratingFromScore(score: number): EeatAuditRating {
  if (score <= 40) return "Poor";
  if (score <= 60) return "Needs Work";
  if (score <= 80) return "Good";
  return "Excellent";
}

function resolveUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function toLower(value: string): string {
  return cleanText(value).toLowerCase();
}

function hasAddressLikeText(value: string): boolean {
  const text = compactWhitespace(value);
  if (!text) {
    return false;
  }

  const addressPattern =
    /\b\d{1,6}\s+[a-z0-9.#\-\s]{3,}(street|st\b|road|rd\b|avenue|ave\b|boulevard|blvd\b|lane|ln\b|drive|dr\b|suite|ste\b|floor|fl\b)/i;
  return addressPattern.test(text);
}

function hasPhoneLikeText(value: string): boolean {
  return /\+?[\d\s\-()]{10,}/.test(value || "");
}

function hasEmailLikeText(value: string): boolean {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value || "");
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isExternalLink(link: LinkInfo, siteHost: string): boolean {
  if (!isAbsoluteHttpUrl(link.absolute_url)) {
    return false;
  }

  try {
    const host = normalizeHost(new URL(link.absolute_url).hostname);
    return Boolean(host) && host !== normalizeHost(siteHost);
  } catch {
    return false;
  }
}

function extractSitemapUrlsFromRobots(robotsText: string, origin: string): string[] {
  const urls = new Set<string>();
  for (const line of robotsText.split(/\r?\n/)) {
    const matched = line.match(/^\s*sitemap\s*:\s*(\S+)\s*$/i);
    if (!matched) {
      continue;
    }

    const candidate = resolveUrl(matched[1], origin);
    if (candidate) {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function collectLinkDetails($: CheerioAPI, baseUrl: string): LinkInfo[] {
  const links: LinkInfo[] = [];

  $("a[href]").each((_, node) => {
    const element = $(node);
    const hrefRaw = cleanText(element.attr("href"));
    if (!hrefRaw || hrefRaw.startsWith("javascript:")) {
      return;
    }

    const absoluteUrl = resolveUrl(hrefRaw, baseUrl);
    if (!absoluteUrl) {
      return;
    }

    links.push({
      href_raw: hrefRaw,
      absolute_url: absoluteUrl,
      text: compactWhitespace(element.text()),
      target: cleanText(element.attr("target")),
      rel: toLower(element.attr("rel") || ""),
      class_name: toLower(element.attr("class") || ""),
      style: toLower(element.attr("style") || ""),
      in_footer: element.closest("footer").length > 0,
      in_nav: element.closest("nav").length > 0,
    });
  });

  return links;
}

function flattenJsonLdNodes(value: unknown, bucket: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenJsonLdNodes(item, bucket);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  bucket.push(record);

  if (record["@graph"]) {
    flattenJsonLdNodes(record["@graph"], bucket);
  }
}

function collectJsonLdNodes($: CheerioAPI): Record<string, unknown>[] {
  const bucket: Record<string, unknown>[] = [];

  $("script[type='application/ld+json']").each((_, node) => {
    const text = cleanText($(node).html() || "");
    if (!text) {
      return;
    }

    try {
      const parsed = JSON.parse(text);
      flattenJsonLdNodes(parsed, bucket);
    } catch {
      return;
    }
  });

  return bucket;
}

function nodeTypeSet(node: Record<string, unknown>): Set<string> {
  const source = node["@type"];
  const values = Array.isArray(source) ? source : [source];
  return new Set(values.map((item) => toLower(String(item || ""))).filter(Boolean));
}

function hasSchemaType(nodes: Record<string, unknown>[], typeName: string): boolean {
  const expected = toLower(typeName);
  return nodes.some((node) => nodeTypeSet(node).has(expected));
}

function hasSchemaAddress(nodes: Record<string, unknown>[]): boolean {
  return nodes.some((node) => {
    const address = node.address;
    if (!address) {
      return false;
    }

    if (typeof address === "string") {
      return Boolean(cleanText(address));
    }

    if (typeof address === "object") {
      const record = address as Record<string, unknown>;
      return Boolean(
        cleanText(record.streetAddress) ||
          cleanText(record.addressLocality) ||
          cleanText(record.addressRegion) ||
          cleanText(record.postalCode)
      );
    }

    return false;
  });
}

async function fetchChain(
  startUrl: string,
  options?: {
    method?: "GET" | "HEAD";
    includeBody?: boolean;
    timeoutMs?: number;
    maxHops?: number;
  }
): Promise<FetchChainResult> {
  const method = options?.method || "GET";
  const includeBody = options?.includeBody ?? method !== "HEAD";
  const timeoutMs = Math.max(1000, Number(options?.timeoutMs || 10_000));
  const maxHops = Math.max(0, Number(options?.maxHops || 8));

  let currentUrl = startUrl;
  const history: FetchHop[] = [];
  let hops = 0;

  while (hops <= maxHops) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
        },
        dispatcher: auditCrawlerDispatcher,
      } as any);

      const location = response.headers.get("location");
      history.push({
        url: currentUrl,
        status: response.status,
        location,
      });

      if (REDIRECT_CODES.has(response.status) && location && hops < maxHops) {
        currentUrl = resolveUrl(location, currentUrl);
        if (!currentUrl) {
          return {
            ok: false,
            status: response.status,
            finalUrl: startUrl,
            hops,
            body: "",
            error: "Redirect location could not be resolved",
            history,
            headers: response.headers,
          };
        }

        hops += 1;
        continue;
      }

      const body = includeBody ? await response.text() : "";
      return {
        ok: response.ok,
        status: response.status,
        finalUrl: currentUrl,
        hops,
        body,
        error: "",
        history,
        headers: response.headers,
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        finalUrl: currentUrl,
        hops,
        body: "",
        error: error instanceof Error ? error.message : "Request failed",
        history,
        headers: null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    status: null,
    finalUrl: currentUrl,
    hops,
    body: "",
    error: "Too many redirects",
    history,
    headers: null,
  };
}

async function fetchStatus(url: string, timeoutMs: number): Promise<FetchChainResult> {
  const head = await fetchChain(url, { method: "HEAD", includeBody: false, timeoutMs });
  if ([403, 405, 501].includes(Number(head.status || 0))) {
    return fetchChain(url, { method: "GET", includeBody: false, timeoutMs });
  }

  return head;
}

async function fetchHomepage(domain: string, timeoutMs: number): Promise<{
  homepage: FetchChainResult;
  httpsReachable: boolean;
}> {
  const httpsUrl = `https://${domain}/`;
  const httpsResult = await fetchChain(httpsUrl, { method: "GET", includeBody: true, timeoutMs });
  if (httpsResult.ok && httpsResult.body) {
    return {
      homepage: httpsResult,
      httpsReachable: true,
    };
  }

  const httpUrl = `http://${domain}/`;
  const httpResult = await fetchChain(httpUrl, { method: "GET", includeBody: true, timeoutMs });
  if (httpResult.ok && httpResult.body) {
    return {
      homepage: httpResult,
      httpsReachable: false,
    };
  }

  const reason = httpsResult.error || httpResult.error || `Could not fetch homepage for ${domain}`;
  throw new Error(reason);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const concurrency = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        break;
      }

      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  return results;
}

function buildAboutCandidates(links: LinkInfo[], origin: string): string[] {
  const candidates = new Set<string>();

  for (const link of links) {
    const href = toLower(link.href_raw);
    if (!href) {
      continue;
    }

    if (href.includes("about") || href.includes("about-us")) {
      candidates.add(link.absolute_url);
    }
  }

  candidates.add(resolveUrl("/about", origin));
  candidates.add(resolveUrl("/about-us", origin));

  return Array.from(candidates).filter(Boolean).slice(0, 8);
}

async function fetchFirstHtmlPage(urls: string[], timeoutMs: number): Promise<FetchChainResult | null> {
  for (const url of urls) {
    const result = await fetchChain(url, { method: "GET", includeBody: true, timeoutMs });
    if (result.ok && result.body) {
      return result;
    }
  }

  return null;
}

function collectImageUrls($: CheerioAPI, baseUrl: string): string[] {
  const urls = new Set<string>();

  $("img[src]").each((_, node) => {
    const src = cleanText($(node).attr("src"));
    if (!src || src.startsWith("data:")) {
      return;
    }

    const absolute = resolveUrl(src, baseUrl);
    if (!absolute) {
      return;
    }

    urls.add(absolute);
  });

  return Array.from(urls);
}

function sanitizedVisibleText(html: string): string {
  const $ = load(html);
  $("script,style,noscript").remove();
  return compactWhitespace($("body").text());
}

function hasHeadingPhrase($: CheerioAPI, phrases: string[]): boolean {
  const normalizedPhrases = phrases.map((item) => item.toLowerCase());
  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((node) => toLower($(node).text()));

  return headings.some((heading) => normalizedPhrases.some((phrase) => heading.includes(phrase)));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function boolText(value: boolean): string {
  return value ? "Yes" : "No";
}

export function sanitizeDomainInput(value: unknown): string {
  const raw = cleanText(value).toLowerCase();
  if (!raw) {
    throw new Error("Website domain is required");
  }

  if (raw.includes("://") || raw.includes("/") || raw.includes("?") || raw.includes("#")) {
    throw new Error("Only domain names are allowed (example.com)");
  }

  const normalized = raw.replace(/^\.+|\.+$/g, "");
  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new Error("Invalid domain format. Use only a domain, for example: example.com");
  }

  return normalized;
}

export async function runEeatAuditReport(input: {
  domain: string;
  timeoutMs?: number;
}): Promise<EeatAuditReport> {
  const domain = sanitizeDomainInput(input.domain);
  const timeoutMs = Math.max(1000, Number(input.timeoutMs || 10_000));

  const { homepage, httpsReachable } = await fetchHomepage(domain, timeoutMs);
  const finalUrl = homepage.finalUrl || `https://${domain}/`;
  const origin = new URL(finalUrl).origin;
  const siteHost = new URL(finalUrl).hostname;

  const homepageHtml = homepage.body;
  const $home = load(homepageHtml);
  const homeVisibleText = sanitizedVisibleText(homepageHtml);

  const allLinks = collectLinkDetails($home, finalUrl);
  const footerLinks = allLinks.filter((item) => item.in_footer);
  const navLinks = allLinks.filter((item) => item.in_nav);
  const allLinkHrefsLower = allLinks.map((item) => toLower(item.href_raw));

  const [
    robotsResult,
    sitemapDefaultStatus,
    indexPhpStatus,
    helloWorldStatus,
    samplePageStatus,
    uncategorizedStatus,
    aboutNoSlashStatus,
    aboutSlashStatus,
  ] = await Promise.all([
    fetchChain(resolveUrl("/robots.txt", origin), { method: "GET", includeBody: true, timeoutMs }),
    fetchStatus(resolveUrl("/sitemap.xml", origin), timeoutMs),
    fetchStatus(resolveUrl("/index.php", origin), timeoutMs),
    fetchStatus(resolveUrl("/hello-world/", origin), timeoutMs),
    fetchStatus(resolveUrl("/sample-page/", origin), timeoutMs),
    fetchStatus(resolveUrl("/category/uncategorized/", origin), timeoutMs),
    fetchStatus(resolveUrl("/about", origin), timeoutMs),
    fetchStatus(resolveUrl("/about/", origin), timeoutMs),
  ]);

  const robotsText = robotsResult.ok ? robotsResult.body : "";
  const robotsSitemapUrls = extractSitemapUrlsFromRobots(robotsText, origin);
  const robotsHasSitemap = robotsSitemapUrls.length > 0;

  const robotsSitemapStatuses = await mapWithConcurrency(robotsSitemapUrls.slice(0, 3), 2, async (url) =>
    fetchStatus(url, timeoutMs)
  );
  const robotsSitemapHealthy = robotsSitemapStatuses.some((item) => item.ok && Number(item.status) >= 200 && Number(item.status) < 300);

  const sitemapPresent =
    (sitemapDefaultStatus.ok && Number(sitemapDefaultStatus.status) >= 200 && Number(sitemapDefaultStatus.status) < 300) ||
    robotsSitemapHealthy;

  const aboutCandidates = buildAboutCandidates(allLinks, origin);
  const aboutPageResult = await fetchFirstHtmlPage(aboutCandidates, timeoutMs);
  const aboutHtml = aboutPageResult?.body || "";
  const aboutFound = Boolean(aboutPageResult?.ok && aboutHtml);
  const $about = load(aboutHtml || "<html><body></body></html>");
  const aboutText = compactWhitespace($about("body").text());
  const aboutLower = toLower(aboutText);

  const jsonLdNodes = [...collectJsonLdNodes($home), ...collectJsonLdNodes($about)];

  const footerElement = $home("footer").first();
  const footerHtml = footerElement.html() || "";
  const footerText = compactWhitespace(footerElement.text() || "");
  const footerLower = toLower(footerText);

  const homeTitle = compactWhitespace($home("title").first().text());
  const titleLower = toLower(homeTitle);

  const openGraphCount = $home("meta[property^='og:']").length;
  const canonicalCount = $home("link[rel='canonical'], link[rel='Canonical']").length;
  const faviconCount = $home("head link[rel*='icon' i]").length;
  const logoCount = $home("header img, nav img").length;

  const semanticCounts = {
    header: $home("header").length,
    nav: $home("nav").length,
    main: $home("main").length,
    article: $home("article").length,
    section: $home("section").length,
    footer: $home("footer").length,
  };
  const semanticPresentCount = Object.values(semanticCounts).filter((count) => count > 0).length;

  const nakedDomain = domain.replace(/^www\./i, "");
  const preferredCandidates = uniqueStrings([
    `https://${nakedDomain}/`,
    `https://www.${nakedDomain}/`,
  ]);
  const preferredStatuses = await mapWithConcurrency(preferredCandidates, 2, async (url) => fetchStatus(url, timeoutMs));

  const preferredReachable = preferredStatuses
    .map((item, index) => ({ item, url: preferredCandidates[index] }))
    .filter(({ item }) => item.ok && Number(item.status) >= 200 && Number(item.status) < 300);

  const preferredVersionPass = preferredReachable.length > 0;
  const preferredVersionResult =
    preferredReachable.length === 0
      ? "Neither www nor non-www returned 200"
      : `Reachable versions: ${preferredReachable
          .map((entry) => `${new URL(entry.url).hostname} (${entry.item.status})`)
          .join(", ")}`;

  const trailingSlashConsistent =
    aboutNoSlashStatus.status !== null &&
    aboutSlashStatus.status !== null &&
    normalizePathname(new URL(aboutNoSlashStatus.finalUrl || resolveUrl("/about", origin)).pathname) ===
      normalizePathname(new URL(aboutSlashStatus.finalUrl || resolveUrl("/about/", origin)).pathname);

  const organizationSchema = hasSchemaType(jsonLdNodes, "Organization");
  const websiteSchema = hasSchemaType(jsonLdNodes, "WebSite");
  const faqSchema = hasSchemaType(jsonLdNodes, "FAQPage");
  const siteNavigationSchema = hasSchemaType(jsonLdNodes, "SiteNavigationElement");

  const socialMatchers: Array<[string, RegExp[]]> = [
    ["twitter", [/twitter\.com/i, /x\.com/i]],
    ["facebook", [/facebook\.com/i, /fb\.com/i]],
    ["linkedin", [/linkedin\.com/i]],
    ["youtube", [/youtube\.com/i]],
    ["instagram", [/instagram\.com/i]],
    ["pinterest", [/pinterest\.com/i]],
    ["tiktok", [/tiktok\.com/i]],
  ];

  function linkMatches(link: LinkInfo, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(link.absolute_url) || pattern.test(link.href_raw));
  }

  const socialLinkCounts = Object.fromEntries(
    socialMatchers.map(([key, patterns]) => [
      key,
      allLinks.filter((link) => linkMatches(link, patterns)).length,
    ])
  ) as Record<string, number>;

  const footerSocialCount = socialMatchers.reduce(
    (sum, [, patterns]) => sum + footerLinks.filter((link) => linkMatches(link, patterns)).length,
    0
  );

  const rssFeedDetected =
    $home("link[type='application/rss+xml']").length > 0 ||
    allLinks.some((link) => /\/feed\/?$/i.test(link.href_raw) || /rss/i.test(link.href_raw));

  const footerEmails = footerLinks.filter(
    (link) => link.href_raw.toLowerCase().startsWith("mailto:") || hasEmailLikeText(link.text)
  );
  const footerPhones = footerLinks.filter((link) => hasPhoneLikeText(link.text) || link.href_raw.toLowerCase().startsWith("tel:"));
  const footerParagraphWithDescription = footerElement
    .find("p")
    .toArray()
    .some((node) => countWords($home(node).text()) >= 10);

  const footerMenuKeywordCount = ["about", "contact", "terms"].reduce((sum, keyword) => {
    const found = footerLinks.some((link) => {
      const href = toLower(link.href_raw);
      return href.includes(keyword);
    });
    return sum + (found ? 1 : 0);
  }, 0);

  const externalLinks = allLinks.filter((link) => isExternalLink(link, siteHost));
  const externalLinksWithoutBlank = externalLinks.filter((link) => toLower(link.target) !== "_blank");

  const images = $home("img").toArray();
  const imagesCount = images.length;
  const imagesWithoutAlt = images.filter((node) => !cleanText($home(node).attr("alt"))).length;
  const imageUrls = collectImageUrls($home, finalUrl).slice(0, 24);

  const imageStatuses = await mapWithConcurrency(imageUrls, 6, async (url) => fetchStatus(url, timeoutMs));
  const missingImages = imageStatuses.filter(
    (status) => !(status.ok && Number(status.status) >= 200 && Number(status.status) < 300)
  ).length;

  const searchFunctionality =
    $home("form[role='search']").length > 0 ||
    $home("input[type='search']").length > 0 ||
    $home("input[name='s']").length > 0 ||
    $home("form[action*='search' i]").length > 0;

  const backToTop =
    $home("a[href='#top'], a[href='#Top']").length > 0 ||
    $home("[id*='back-to-top' i], [class*='back-to-top' i], [class*='scroll-top' i]").length > 0 ||
    $home("[onclick*='scrollTo' i]").length > 0;

  const aboutHeadings = hasHeadingPhrase($about, ["our story", "history"]);
  const whoWeAre = hasHeadingPhrase($about, ["who we are"]);
  const whatWeDo = hasHeadingPhrase($about, ["what we do", "our services"]);

  const trustedStatement = /trusted|experts?|years of experience|certified/i.test(aboutText);
  const teamPhotos =
    $about("img").length > 0 &&
    /team|staff|meet the|leadership/i.test(aboutText);
  const mailingAddress = hasAddressLikeText(aboutText) || $about("address").length > 0;
  const socialProof = /testimonials?|reviews?|rated|awards?/i.test(aboutText);

  const aboutExternalLinks = collectLinkDetails($about, aboutPageResult?.finalUrl || finalUrl).filter((link) =>
    isExternalLink(link, siteHost)
  );
  const featuredWebsites =
    aboutExternalLinks.length > 0 ||
    /featured in|as seen on|our partners|partner websites?/i.test(aboutText);

  const homepageNoindex = $home("meta[name='robots' i]")
    .toArray()
    .some((node) => /noindex/i.test(cleanText($home(node).attr("content"))));

  const firstHeadingTag = toLower($home("h1, h2, h3, h4, h5, h6").first().prop("tagName") || "");

  const emptyHashLinksCount = allLinks.filter((link) => cleanText(link.href_raw) === "#").length;
  const readMoreLinksCount = allLinks.filter((link) => toLower(link.text) === "read more").length;

  const suspiciousLinkStyles = allLinks.filter((link) => {
    const style = link.style;
    const className = link.class_name;
    if (/text-decoration\s*:\s*none/.test(style) && /color\s*:\s*inherit/.test(style)) {
      return true;
    }

    if (className.includes("no-underline") && className.includes("text-inherit")) {
      return true;
    }

    return false;
  }).length;

  const bgImageContentBlocks = $home("[style*='background-image' i]")
    .toArray()
    .filter((node) => {
      const text = compactWhitespace($home(node).text());
      if (countWords(text) >= 12) {
        return true;
      }

      return $home(node).find("h1, h2, h3").length > 0;
    }).length;

  const sentenceHeadingsCount = $home("h1, h2, h3, h4, h5, h6")
    .toArray()
    .filter((node) => countWords($home(node).text()) >= 12).length;

  const homepageLowerHtml = toLower(homepageHtml);
  const pluginSignals: Array<[string, RegExp]> = [
    ["yoast", /yoast|wpseo/i],
    ["rankmath", /rank[-_\s]?math/i],
    ["aioseo", /all in one seo|aioseo/i],
    ["seopress", /seopress/i],
  ];
  const detectedPlugins = pluginSignals.filter(([, pattern]) => pattern.test(homepageLowerHtml)).map(([name]) => name);

  const bodyHtml = $home("body").html() || "";
  const gtmInBody = /googletagmanager\.com\/gtm\.js/i.test(bodyHtml);

  const externalWithoutNoFollow = externalLinks.filter((link) => !/nofollow/i.test(link.rel));
  const navStagingLinks = navLinks.filter((link) => /(^|\.|\/)(dev|staging|test)\.|\.local\b|localhost|:3000|:5173/i.test(link.absolute_url));
  const navNoFollowLinks = navLinks.filter((link) => /nofollow/i.test(link.rel));

  const authorityTechnical = makeCategory("authority_technical", "Authority & Technical", "shield", [
    makeCheck({
      id: "ssl_check",
      name: "SSL Certificate (HTTPS)",
      description: "Website uses secure HTTPS connection",
      passed: httpsReachable,
      passResult: "HTTPS is available",
      failResult: "HTTPS homepage did not resolve successfully",
    }),
    makeCheck({
      id: "has_favicon",
      name: "Favicon",
      description: "Head contains a favicon link",
      passed: faviconCount > 0,
      passResult: `Detected ${faviconCount} favicon link(s)`,
      failResult: "No favicon link found in page head",
    }),
    makeCheck({
      id: "has_logo",
      name: "Header or Nav Logo",
      description: "Header/nav contains a logo image",
      passed: logoCount > 0,
      passResult: `Detected ${logoCount} logo image(s) in header/nav`,
      failResult: "No logo image found in header or nav",
    }),
    makeCheck({
      id: "sitemap_present",
      name: "Sitemap Presence",
      description: "Sitemap URL resolves and is discoverable",
      passed: sitemapPresent,
      passResult: "Sitemap is reachable from /sitemap.xml or robots.txt",
      failResult: "Sitemap not reachable from /sitemap.xml or robots references",
    }),
    makeCheck({
      id: "semantic_html",
      name: "Semantic HTML",
      description: "Page uses semantic layout tags",
      passed: semanticPresentCount >= 4,
      passResult: `Semantic tags present: ${semanticPresentCount}/6`,
      failResult: `Only ${semanticPresentCount}/6 semantic tags detected`,
    }),
    makeCheck({
      id: "robots_has_sitemap",
      name: "Robots Sitemap Declaration",
      description: "robots.txt includes at least one Sitemap line",
      passed: robotsHasSitemap,
      passResult: `robots.txt contains ${robotsSitemapUrls.length} sitemap URL(s)`,
      failResult: "robots.txt does not contain a Sitemap declaration",
    }),
    makeCheck({
      id: "open_graph_tags",
      name: "Open Graph Tags",
      description: "Open Graph metadata exists",
      passed: openGraphCount > 0,
      passResult: `Detected ${openGraphCount} Open Graph tag(s)`,
      failResult: "No Open Graph tags found",
    }),
    makeCheck({
      id: "preferred_version",
      name: "Preferred Version",
      description: "www and non-www version behavior is discoverable",
      passed: preferredVersionPass,
      passResult: preferredVersionResult,
      failResult: preferredVersionResult,
    }),
    makeCheck({
      id: "trailing_slash",
      name: "Trailing Slash Consistency",
      description: "about and about/ resolve consistently",
      passed: trailingSlashConsistent,
      passResult: "About URL variants resolve consistently",
      failResult: `Inconsistent about URL behavior (${aboutNoSlashStatus.status} vs ${aboutSlashStatus.status})`,
    }),
    makeCheck({
      id: "canonical_tag",
      name: "Canonical Tag",
      description: "Canonical link tag exists",
      passed: canonicalCount > 0,
      passResult: `Detected ${canonicalCount} canonical tag(s)`,
      failResult: "Canonical tag is missing",
    }),
  ]);

  const schemaMarkup = makeCategory("schema_markup", "Schema Markup", "schema", [
    makeCheck({
      id: "organization_schema",
      name: "Organization Schema",
      description: "JSON-LD includes Organization type",
      passed: organizationSchema,
      passResult: "Organization schema detected",
      failResult: "Organization schema not detected",
    }),
    makeCheck({
      id: "website_schema",
      name: "WebSite Schema",
      description: "JSON-LD includes WebSite type",
      passed: websiteSchema,
      passResult: "WebSite schema detected",
      failResult: "WebSite schema not detected",
    }),
    makeCheck({
      id: "faq_schema",
      name: "FAQ Schema",
      description: "JSON-LD includes FAQPage type",
      passed: faqSchema,
      passResult: "FAQPage schema detected",
      failResult: "FAQPage schema not detected",
    }),
    makeCheck({
      id: "sitenavigation_schema",
      name: "Site Navigation Schema",
      description: "JSON-LD includes SiteNavigationElement type",
      passed: siteNavigationSchema,
      passResult: "SiteNavigationElement schema detected",
      failResult: "SiteNavigationElement schema not detected",
    }),
  ]);

  const eeatPages = makeCategory("eeat_pages", "EEAT Pages", "pages", [
    makeCheck({
      id: "privacy_policy",
      name: "Privacy Policy Link",
      description: "Homepage links to privacy policy",
      passed: allLinkHrefsLower.some((href) => href.includes("privacy")),
      passResult: "Privacy policy link found",
      failResult: "Privacy policy link not found on homepage",
    }),
    makeCheck({
      id: "terms_of_service",
      name: "Terms of Service Link",
      description: "Homepage links to terms page",
      passed: allLinkHrefsLower.some((href) => href.includes("terms")),
      passResult: "Terms link found",
      failResult: "Terms link not found on homepage",
    }),
    makeCheck({
      id: "about_page",
      name: "About Link",
      description: "Homepage links to About page",
      passed: allLinkHrefsLower.some((href) => href.includes("about")),
      passResult: "About link found",
      failResult: "About link not found on homepage",
    }),
    makeCheck({
      id: "contact_page",
      name: "Contact Link",
      description: "Homepage links to contact page",
      passed: allLinkHrefsLower.some((href) => href.includes("contact")),
      passResult: "Contact link found",
      failResult: "Contact link not found on homepage",
    }),
    makeCheck({
      id: "authors_team",
      name: "Author or Team Link",
      description: "Homepage links to author or team page",
      passed: allLinkHrefsLower.some((href) => href.includes("team") || href.includes("author")),
      passResult: "Author/team link found",
      failResult: "No author/team link found",
    }),
    makeCheck({
      id: "editorial_guidelines",
      name: "Editorial Guidelines Link",
      description: "Homepage links to editorial policy",
      passed: allLinkHrefsLower.some((href) => href.includes("editorial")),
      passResult: "Editorial link found",
      failResult: "Editorial guidelines link not found",
    }),
    makeCheck({
      id: "html_sitemap",
      name: "HTML Sitemap Link",
      description: "Homepage links to non-XML sitemap",
      passed: allLinkHrefsLower.some((href) => href.includes("sitemap") && !href.includes(".xml")),
      passResult: "HTML sitemap link found",
      failResult: "No HTML sitemap link found",
    }),
  ]);

  const footerEeat = makeCategory("footer_eeat", "Footer EEAT", "footer", [
    makeCheck({
      id: "copyright_notice",
      name: "Copyright Notice",
      description: "Footer contains copyright text",
      passed: /©|copyright/i.test(footerText),
      passResult: "Copyright notice found in footer",
      failResult: "No copyright notice found in footer",
    }),
    makeCheck({
      id: "copyright_year",
      name: "Copyright Year",
      description: "Footer includes recent copyright year",
      passed: /(2024|2025|2026)/.test(footerText),
      passResult: "Recent year found in footer",
      failResult: "Recent copyright year not found",
    }),
    makeCheck({
      id: "physical_address",
      name: "Physical Address",
      description: "Footer or schema exposes address",
      passed: hasAddressLikeText(footerText) || hasSchemaAddress(jsonLdNodes),
      passResult: "Address signal found",
      failResult: "No physical address signal found in footer/schema",
    }),
    makeCheck({
      id: "contact_email",
      name: "Contact Email",
      description: "Footer includes email signal",
      passed: footerEmails.length > 0 || hasEmailLikeText(footerText),
      passResult: "Email signal found in footer",
      failResult: "Email signal not found in footer",
    }),
    makeCheck({
      id: "phone_number",
      name: "Phone Number",
      description: "Footer includes phone number",
      passed: footerPhones.length > 0 || hasPhoneLikeText(footerText),
      passResult: "Phone signal found in footer",
      failResult: "Phone number not found in footer",
    }),
    makeCheck({
      id: "social_links",
      name: "Footer Social Links",
      description: "Footer links to social profiles",
      passed: footerSocialCount > 0,
      passResult: `Detected ${footerSocialCount} social footer link(s)`,
      failResult: "No social links found in footer",
    }),
    makeCheck({
      id: "dmca_badge",
      name: "DMCA Badge",
      description: "Footer references DMCA",
      passed: /dmca/i.test(footerHtml),
      passResult: "DMCA signal found",
      failResult: "DMCA signal not detected",
    }),
    makeCheck({
      id: "footer_menu_links",
      name: "Footer Menu Links",
      description: "Footer menu links include about/contact/terms",
      passed: footerMenuKeywordCount >= 2,
      passResult: `Footer contains ${footerMenuKeywordCount} of 3 expected EEAT links`,
      failResult: `Footer contains only ${footerMenuKeywordCount} of 3 expected EEAT links`,
    }),
    makeCheck({
      id: "short_description",
      name: "Footer Description",
      description: "Footer contains descriptive paragraph",
      passed: footerParagraphWithDescription,
      passResult: "Footer descriptive paragraph found",
      failResult: "Footer descriptive paragraph (10+ words) not found",
    }),
    makeCheck({
      id: "parent_company",
      name: "Parent Company Signal",
      description: "Footer indicates ownership/parent relationship",
      passed: /a subsidiary of|part of|owned by/i.test(footerLower),
      passResult: "Parent-company language found",
      failResult: "No parent-company language found",
    }),
  ]);

  const socialPresence = makeCategory("social_presence", "Social Presence", "social", [
    makeCheck({
      id: "twitter_link",
      name: "Twitter/X Link",
      description: "Site links to Twitter or X",
      passed: socialLinkCounts.twitter > 0,
      passResult: `Detected ${socialLinkCounts.twitter} Twitter/X link(s)`,
      failResult: "No Twitter/X link detected",
    }),
    makeCheck({
      id: "facebook_link",
      name: "Facebook Link",
      description: "Site links to Facebook",
      passed: socialLinkCounts.facebook > 0,
      passResult: `Detected ${socialLinkCounts.facebook} Facebook link(s)`,
      failResult: "No Facebook link detected",
    }),
    makeCheck({
      id: "linkedin_link",
      name: "LinkedIn Link",
      description: "Site links to LinkedIn",
      passed: socialLinkCounts.linkedin > 0,
      passResult: `Detected ${socialLinkCounts.linkedin} LinkedIn link(s)`,
      failResult: "No LinkedIn link detected",
    }),
    makeCheck({
      id: "youtube_link",
      name: "YouTube Link",
      description: "Site links to YouTube",
      passed: socialLinkCounts.youtube > 0,
      passResult: `Detected ${socialLinkCounts.youtube} YouTube link(s)`,
      failResult: "No YouTube link detected",
    }),
    makeCheck({
      id: "instagram_link",
      name: "Instagram Link",
      description: "Site links to Instagram",
      passed: socialLinkCounts.instagram > 0,
      passResult: `Detected ${socialLinkCounts.instagram} Instagram link(s)`,
      failResult: "No Instagram link detected",
    }),
    makeCheck({
      id: "pinterest_link",
      name: "Pinterest Link",
      description: "Site links to Pinterest",
      passed: socialLinkCounts.pinterest > 0,
      passResult: `Detected ${socialLinkCounts.pinterest} Pinterest link(s)`,
      failResult: "No Pinterest link detected",
    }),
    makeCheck({
      id: "tiktok_link",
      name: "TikTok Link",
      description: "Site links to TikTok",
      passed: socialLinkCounts.tiktok > 0,
      passResult: `Detected ${socialLinkCounts.tiktok} TikTok link(s)`,
      failResult: "No TikTok link detected",
    }),
    makeCheck({
      id: "rss_feed",
      name: "RSS Feed",
      description: "Site exposes RSS feed signal",
      passed: rssFeedDetected,
      passResult: "RSS feed signal detected",
      failResult: "RSS feed signal not detected",
    }),
  ]);

  const uxElements = makeCategory("ux_elements", "UX Elements", "ux", [
    makeCheck({
      id: "search_functionality",
      name: "Search Functionality",
      description: "Search field/form exists",
      passed: searchFunctionality,
      passResult: "Search functionality detected",
      failResult: "Search functionality not detected",
    }),
    makeCheck({
      id: "back_to_top",
      name: "Back to Top",
      description: "Back-to-top interaction exists",
      passed: backToTop,
      passResult: "Back-to-top signal detected",
      failResult: "Back-to-top signal not detected",
    }),
    makeCheck({
      id: "external_links_new_tab",
      name: "External Links Open in New Tab",
      description: "External links use target=_blank",
      passed: externalLinks.length === 0 || externalLinksWithoutBlank.length === 0,
      passResult:
        externalLinks.length === 0
          ? "No external links found"
          : "All external links open in a new tab",
      failResult: `${externalLinksWithoutBlank.length} external link(s) missing target=_blank`,
    }),
    makeCheck({
      id: "images_alt_text",
      name: "Image ALT Text",
      description: "All images contain non-empty alt text",
      passed: imagesCount === 0 || imagesWithoutAlt === 0,
      passResult:
        imagesCount === 0
          ? "No images detected"
          : `All ${imagesCount} image(s) have alt text`,
      failResult: `${imagesWithoutAlt} of ${imagesCount} image(s) are missing alt text`,
    }),
    makeCheck({
      id: "no_missing_images",
      name: "Broken Image Check",
      description: "Image URLs return successful responses",
      passed: missingImages === 0,
      passResult: `Checked ${imageUrls.length} image URL(s); no broken images detected`,
      failResult: `${missingImages} broken/missing image URL(s) detected out of ${imageUrls.length} checked`,
    }),
  ]);

  const aboutUsPage = makeCategory("about_us_page", "About Us Page", "about", [
    makeCheck({
      id: "parent_company_described",
      name: "Parent Company Description",
      description: "About page mentions ownership or company context",
      passed: /company|enterprise|owned by|subsidiary/i.test(aboutLower),
      passResult: "Ownership/company context detected on About page",
      failResult: "Ownership/company context not detected on About page",
    }),
    makeCheck({
      id: "our_story_section",
      name: "Our Story Section",
      description: "About page contains story/history section",
      passed: aboutHeadings,
      passResult: "Our story/history heading detected",
      failResult: "Our story/history heading not detected",
    }),
    makeCheck({
      id: "who_we_are_section",
      name: "Who We Are Section",
      description: "About page contains who-we-are section",
      passed: whoWeAre,
      passResult: "Who-we-are heading detected",
      failResult: "Who-we-are section not detected",
    }),
    makeCheck({
      id: "what_we_do_section",
      name: "What We Do Section",
      description: "About page contains what-we-do/services section",
      passed: whatWeDo,
      passResult: "What-we-do/services heading detected",
      failResult: "What-we-do/services section not detected",
    }),
    makeCheck({
      id: "trusted_source_statement",
      name: "Trusted Source Statement",
      description: "About page includes trust/expertise statement",
      passed: trustedStatement,
      passResult: "Trust/expertise statement detected",
      failResult: "Trust/expertise statement not detected",
    }),
    makeCheck({
      id: "team_photos",
      name: "Team Photos",
      description: "About page includes team imagery",
      passed: teamPhotos,
      passResult: "Team photo signal detected",
      failResult: "Team photo signal not detected",
    }),
    makeCheck({
      id: "mailing_address",
      name: "Mailing Address",
      description: "About page includes mailing address",
      passed: mailingAddress,
      passResult: "Mailing address detected",
      failResult: "Mailing address not detected",
    }),
    makeCheck({
      id: "social_proof",
      name: "Social Proof",
      description: "About page references testimonials/reviews/awards",
      passed: socialProof,
      passResult: "Social proof signal detected",
      failResult: "Social proof signal not detected",
    }),
    makeCheck({
      id: "featured_websites",
      name: "Featured Websites",
      description: "About page shows external featured/partner references",
      passed: featuredWebsites,
      passResult: "Featured/partner website signal detected",
      failResult: "Featured/partner website signal not detected",
    }),
  ]);

  const homepageChecks = makeCategory("homepage_checks", "Homepage Checks", "home", [
    makeCheck({
      id: "index_php_redirect",
      name: "index.php Redirect",
      description: "index.php redirects to homepage",
      passed:
        Boolean(indexPhpStatus.history[0] && REDIRECT_CODES.has(indexPhpStatus.history[0].status)) &&
        normalizePathname(new URL(indexPhpStatus.finalUrl || origin).pathname) ===
          normalizePathname(new URL(finalUrl).pathname),
      passResult: "index.php redirects to homepage",
      failResult: `index.php redirect behavior not confirmed (status: ${indexPhpStatus.status ?? "n/a"})`,
    }),
    makeCheck({
      id: "homepage_not_noindexed",
      name: "Homepage Indexability",
      description: "Homepage is not noindexed",
      passed: !homepageNoindex,
      passResult: "Homepage does not contain noindex",
      failResult: "Homepage contains noindex robots directive",
    }),
    makeCheck({
      id: "homepage_title_not_home",
      name: "Homepage Title Quality",
      description: "Homepage title is not generic Home/Homepage",
      passed: Boolean(titleLower) && titleLower !== "home" && titleLower !== "homepage",
      passResult: `Homepage title is descriptive: ${homeTitle}`,
      failResult: "Homepage title is generic or missing",
    }),
    makeCheck({
      id: "homepage_content_visible",
      name: "Homepage Content Depth",
      description: "Homepage visible text exceeds 200 words",
      passed: countWords(homeVisibleText) > 200,
      passResult: `Visible text count: ${countWords(homeVisibleText)} words`,
      failResult: `Visible text count is low: ${countWords(homeVisibleText)} words`,
    }),
    makeCheck({
      id: "no_redirect_chains",
      name: "Redirect Chain",
      description: "Homepage resolves with maximum one redirect",
      passed: homepage.hops <= 1,
      passResult: `Homepage redirect hops: ${homepage.hops}`,
      failResult: `Homepage redirects too many times (${homepage.hops} hops)`,
    }),
  ]);

  const onSiteChecks = makeCategory("eeat_onsite_check", "EEAT On-Site Check", "onsite", [
    makeCheck({
      id: "default_content_removed",
      name: "Default Content Removed",
      description: "hello-world and sample-page return 404/4xx",
      passed:
        (Number(helloWorldStatus.status || 0) >= 400 || Number(helloWorldStatus.status || 0) === 0) &&
        (Number(samplePageStatus.status || 0) >= 400 || Number(samplePageStatus.status || 0) === 0),
      passResult: `hello-world: ${helloWorldStatus.status ?? "n/a"}, sample-page: ${samplePageStatus.status ?? "n/a"}`,
      failResult: `Default content might still exist (hello-world: ${helloWorldStatus.status ?? "n/a"}, sample-page: ${samplePageStatus.status ?? "n/a"})`,
    }),
    makeCheck({
      id: "uncategorized_removed",
      name: "Uncategorized Removed",
      description: "category/uncategorized returns 404/4xx",
      passed: Number(uncategorizedStatus.status || 0) >= 400 || Number(uncategorizedStatus.status || 0) === 0,
      passResult: `uncategorized URL status: ${uncategorizedStatus.status ?? "n/a"}`,
      failResult: `uncategorized URL seems live (status: ${uncategorizedStatus.status ?? "n/a"})`,
    }),
    makeCheck({
      id: "no_read_more",
      name: "No Read More Links",
      description: "No anchor text exactly equals read more",
      passed: readMoreLinksCount === 0,
      passResult: "No read-more link text found",
      failResult: `${readMoreLinksCount} read-more link(s) found`,
    }),
    makeCheck({
      id: "no_h2_before_h1",
      name: "Heading Order",
      description: "First heading in DOM is H1",
      passed: firstHeadingTag === "h1",
      passResult: "First heading is H1",
      failResult: firstHeadingTag
        ? `First heading is ${firstHeadingTag.toUpperCase()}, not H1`
        : "No headings found",
    }),
    makeCheck({
      id: "no_empty_hash_links",
      name: "No Empty Hash Links",
      description: "No href=# links",
      passed: emptyHashLinksCount === 0,
      passResult: "No empty hash links found",
      failResult: `${emptyHashLinksCount} empty hash link(s) found`,
    }),
    makeCheck({
      id: "links_look_like_links",
      name: "Links Look Like Links",
      description: "Link styling is not hidden or ambiguous",
      passed: suspiciousLinkStyles <= Math.max(1, Math.round(allLinks.length * 0.2)),
      passResult: "Most links appear visibly styled as links",
      failResult: `${suspiciousLinkStyles} link(s) use potentially hidden link styling`,
    }),
    makeCheck({
      id: "no_bg_image_content",
      name: "No Background Image Critical Content",
      description: "No major text blocks embedded in background-image elements",
      passed: bgImageContentBlocks === 0,
      passResult: "No critical text blocks detected in background-image elements",
      failResult: `${bgImageContentBlocks} background-image block(s) may contain critical text`,
    }),
    makeCheck({
      id: "no_sentence_headings",
      name: "No Sentence-Length Headings",
      description: "Heading lines remain under 12 words",
      passed: sentenceHeadingsCount === 0,
      passResult: "All headings are concise",
      failResult: `${sentenceHeadingsCount} heading(s) appear sentence-like`,
    }),
    makeCheck({
      id: "no_duplicate_plugins",
      name: "No Duplicate SEO Plugins",
      description: "Avoid multiple SEO plugin footprints",
      passed: detectedPlugins.length <= 1,
      passResult:
        detectedPlugins.length === 0
          ? "No SEO plugin footprint detected"
          : `Single SEO plugin footprint: ${detectedPlugins[0]}`,
      failResult: `Multiple SEO plugin footprints detected: ${detectedPlugins.join(", ")}`,
    }),
    makeCheck({
      id: "gtm_not_in_body",
      name: "GTM Not in Body",
      description: "GTM script is not injected inside body markup",
      passed: !gtmInBody,
      passResult: "No GTM script detected in body markup",
      failResult: "GTM script detected in body markup",
    }),
    makeCheck({
      id: "external_links_not_all_nofollow",
      name: "External Links Not All Nofollow",
      description: "At least one external link is followable",
      passed: externalLinks.length === 0 || externalWithoutNoFollow.length > 0,
      passResult:
        externalLinks.length === 0
          ? "No external links detected"
          : `${externalWithoutNoFollow.length} external link(s) are not nofollow`,
      failResult: "All external links are marked nofollow",
    }),
    makeCheck({
      id: "no_staging_urls",
      name: "No Staging URLs",
      description: "Navigation should not link to staging/dev URLs",
      passed: navStagingLinks.length === 0,
      passResult: "No staging/dev links detected in navigation",
      failResult: `${navStagingLinks.length} staging/dev navigation link(s) detected`,
    }),
    makeCheck({
      id: "menu_not_nofollow",
      name: "Menu Links Not Nofollow",
      description: "Navigation links should not be nofollow",
      passed: navNoFollowLinks.length === 0,
      passResult: "Navigation links are followable",
      failResult: `${navNoFollowLinks.length} navigation link(s) marked nofollow`,
    }),
    makeCheck({
      id: "robots_sitemap_not_broken",
      name: "Robots Sitemap Health",
      description: "Sitemap URL declared in robots.txt returns 200",
      passed: robotsHasSitemap && robotsSitemapHealthy,
      passResult: "Robots-declared sitemap URL is reachable",
      failResult: robotsHasSitemap
        ? "Robots-declared sitemap URL is not returning 200"
        : "robots.txt has no sitemap declaration",
    }),
  ]);

  const categories = [
    authorityTechnical,
    schemaMarkup,
    eeatPages,
    footerEeat,
    socialPresence,
    uxElements,
    aboutUsPage,
    homepageChecks,
    onSiteChecks,
  ];

  const totalChecks = categories.reduce((sum, category) => sum + category.total, 0);
  const passedChecks = categories.reduce((sum, category) => sum + category.passed, 0);
  const failedChecks = Math.max(0, totalChecks - passedChecks);
  const score = Math.round((passedChecks / Math.max(1, totalChecks)) * 100);
  const rating = ratingFromScore(score);

  const allChecks = categories.flatMap((category) => category.checks);
  const passedCheckItems = allChecks.filter((item) => item.status === "pass");
  const failedCheckItems = allChecks.filter((item) => item.status === "fail");

  const highSeverityIds = new Set([
    "ssl_check",
    "sitemap_present",
    "homepage_not_noindexed",
    "robots_sitemap_not_broken",
    "default_content_removed",
    "no_h2_before_h1",
  ]);

  const issues: EeatAuditIssue[] = failedCheckItems.map((item) => ({
    severity: highSeverityIds.has(item.id) ? "high" : "medium",
    title: item.name,
    detail: item.result,
  }));

  const wins = passedCheckItems.slice(0, 20).map((item) => `${item.name}: ${item.result}`);

  const recommendations = failedCheckItems
    .slice(0, 12)
    .map((item) => `Fix ${item.name.toLowerCase()}: ${item.description}.`);

  const checkedAt = new Date().toISOString();

  return {
    domain,
    score,
    rating,
    total_checks: totalChecks,
    passed: passedChecks,
    failed: failedChecks,
    summary: `${passedChecks}/${totalChecks} automated EEAT checks passed for ${domain}.`,
    issues,
    wins,
    recommendations,
    categories,
    manual_checklist_total: MANUAL_CHECKLIST_TOTAL,
    checked_at: checkedAt,
    cache: {
      cached: false,
      cached_at: checkedAt,
      age_ms: 0,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    },
  };
}
