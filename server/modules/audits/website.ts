import { safeFetch as fetch } from "../../utils/safeFetch.js";
import { auditCrawlerDispatcher } from "../../utils/httpAgent.js";

export type WebsiteAuditIssue = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type WebsiteAuditCategory = {
  key: "technical" | "content" | "trust" | "local" | "conversion";
  label: string;
  score: number;
  summary: string;
};

export type WebsiteAuditModule = {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
};

export type WebsiteAuditEvidenceHighlight = {
  label: string;
  value: string;
  detail: string;
};

export type WebsiteAuditTopPage = {
  url: string;
  pageRole: string;
  depth: number;
  statusCode: number | null;
  issueWeight: number;
  summary: string;
};

export type WebsiteAuditInput = {
  website: string;
  businessName?: string;
  city?: string;
  state?: string;
};

export type WebsiteAuditResult = {
  auditVersion?: "quick" | "advanced";
  score: number;
  verdict: "Strong" | "Needs Work" | "Urgent";
  summary: string;
  issues: WebsiteAuditIssue[];
  wins: string[];
  recommendations: string[];
  metrics: {
    normalizedUrl: string;
    title: string;
    titleLength: number;
    metaDescriptionLength: number;
    h1Count: number;
    h2Count: number;
    internalLinks: number;
    wordCount: number;
    hasViewport: boolean;
    hasCanonical: boolean;
    hasSchema: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
    imagesCount: number;
    imagesWithoutAlt: number;
    altTextCoveragePercent: number;
    mentionsLocation: boolean;
    pagesCrawled?: number;
    pagesWithSchema?: number;
    pagesWithContactSignals?: number;
    pagesWithThinContent?: number;
    pagesMissingTitle?: number;
    pagesMissingMeta?: number;
    pagesMissingH1?: number;
    pagesWithCanonical?: number;
    pagesWithViewport?: number;
    pagesWithCta?: number;
    pagesWithTrustSignals?: number;
    pagesWithTestimonials?: number;
    pagesMentioningLocation?: number;
    averageWordCount?: number;
    averageResponseTimeMs?: number;
    brokenPages?: number;
    usesHttps?: boolean;
    hasRobotsTxt?: boolean;
    hasSitemapXml?: boolean;
    sitemapReferencedInRobots?: boolean;
    aboutPageFound?: boolean;
    contactPageFound?: boolean;
    policyPageFound?: boolean;
    servicePageCount?: number;
    locationServicePages?: number;
    localBusinessSchemaDetected?: boolean;
    localBusinessSchemaCompleteness?: number;
    hasAddressSignal?: boolean;
    hasGeoSignal?: boolean;
    hasOpeningHoursSignal?: boolean;
    hasSameAsSignal?: boolean;
    hasAggregateRatingSignal?: boolean;
    faqSignalsDetected?: boolean;
    reviewPlatformMentionsCount?: number;
    reviewPlatformMentions?: string[];
    duplicateTitlePages?: number;
    potentialDoorwayRisk?: boolean;
    scoringCategoryWeights?: {
      technical: number;
      content: number;
      trust: number;
      local: number;
      conversion: number;
    };
    scoringLocalFactorWeights?: {
      entitySchema: number;
      reputation: number;
      answerReadiness: number;
      doorwayRisk: number;
    };
    // Enhanced audit fields
    responseTimeMs?: number;
    pageSizeBytes?: number;
    schemaValid?: boolean;
    schemaErrors?: string[];
    hstsHeaderPresent?: boolean;
    cspHeaderPresent?: boolean;
    xFrameHeaderPresent?: boolean;
    xContentTypeHeaderPresent?: boolean;
    // New fields
    hasOpenGraph?: boolean;
    openGraphComplete?: boolean;
    hasTwitterCard?: boolean;
    noindexDetected?: boolean;
    hasRobotsTag?: boolean;
    usesHttp2?: boolean;
    speedClass?: "fast" | "medium" | "slow";
    missingAltPercent?: number;
    hasH2?: boolean;
    langAttribute?: string;
    hasLangAttribute?: boolean;
  };
  categories?: WebsiteAuditCategory[];
  modules?: WebsiteAuditModule[];
  evidenceHighlights?: WebsiteAuditEvidenceHighlight[];
  priorityRoadmap?: string[];
  topPages?: WebsiteAuditTopPage[];
};

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

type FetchResult = {
  html: string;
  responseTimeMs: number;
  pageSizeBytes: number;
  headers: Record<string, string>;
  statusCode: number;
};

async function fetchHtml(url: string, timeoutMs = 12000): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: controller.signal,
      dispatcher: auditCrawlerDispatcher,
    } as any);

    if (!response.ok) {
      throw new Error(`Website request failed (${response.status})`);
    }

    const html = await response.text();
    const responseTimeMs = Math.round(performance.now() - startTime);
    const pageSizeBytes = Buffer.byteLength(html, "utf8");

    const headers: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      headers[key.toLowerCase()] = val;
    });

    return {
      html,
      responseTimeMs,
      pageSizeBytes,
      headers,
      statusCode: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkUrlExists(url: string, timeoutMs = 6000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SMBifyBot/1.0)",
      },
      redirect: "follow",
      signal: controller.signal,
      dispatcher: auditCrawlerDispatcher,
    } as any);
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runWebsiteAudit(input: WebsiteAuditInput): Promise<WebsiteAuditResult> {
  const normalizedUrl = normalizeWebsiteUrl(input.website);
  const parsedUrl = new URL(normalizedUrl);
  const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

  const { html, responseTimeMs, pageSizeBytes, headers } = await fetchHtml(normalizedUrl);
  const text = stripHtml(html);
  const lowerText = text.toLowerCase();

  // ── Basic on-page signals ──
  const title = matchFirst(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  const metaDescription =
    matchFirst(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i, html) ||
    matchFirst(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i, html);
  const h1Count = countMatches(/<h1\b/gi, html);
  const h2Count = countMatches(/<h2\b/gi, html);
  const viewportTag = /<meta[^>]+name=["']viewport["']/i.test(html);
  const canonicalTag = /<link[^>]+rel=["']canonical["']/i.test(html);

  // ── Language attribute ──
  const langAttribute = matchFirst(/<html[^>]+lang=["']([^"']+)["']/i, html);
  const hasLangAttribute = Boolean(langAttribute);

  // ── HTTPS ──
  const usesHttps = parsedUrl.protocol === "https:";

  // ── HTTP/2 detection (via and alt-svc headers) ──
  const viaHeader = headers["via"] || "";
  const altSvcHeader = headers["alt-svc"] || "";
  const usesHttp2 =
    viaHeader.includes("HTTP/2") ||
    viaHeader.includes("h2") ||
    altSvcHeader.includes("h2") ||
    altSvcHeader.includes("h3");

  // ── Open Graph ──
  const ogTitle =
    matchFirst(/<meta[^>]+property=["']og:title["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i, html) ||
    matchFirst(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:title["'][^>]*>/i, html);
  const ogDescription =
    matchFirst(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i, html) ||
    matchFirst(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["'][^>]*>/i, html);
  const ogImage =
    matchFirst(/<meta[^>]+property=["']og:image["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i, html) ||
    matchFirst(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:image["'][^>]*>/i, html);
  const hasOpenGraph = Boolean(ogTitle || ogDescription || ogImage);
  const openGraphComplete = Boolean(ogTitle && ogDescription && ogImage);

  // ── Twitter Card ──
  const twitterCard =
    matchFirst(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i, html) ||
    matchFirst(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']twitter:card["'][^>]*>/i, html);
  const hasTwitterCard = Boolean(twitterCard);

  // ── Noindex detection ──
  const robotsMetaContent =
    matchFirst(/<meta[^>]+name=["']robots["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i, html) ||
    matchFirst(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']robots["'][^>]*>/i, html);
  const noindexDetected = /\bnoindex\b/i.test(robotsMetaContent);
  const hasRobotsTag = Boolean(robotsMetaContent);

  // ── JSON-LD Validation ──
  let schemaValid = true;
  let schemaCompleteness = 100;
  const schemaErrors: string[] = [];
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let schemaTag = false;
  let localBusinessSchemaDetected = false;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    schemaTag = true;
    const jsonText = match[1].trim();
    try {
      const parsed = JSON.parse(jsonText);
      const checkType = (obj: any) => {
        if (obj && typeof obj === "object") {
          const type = obj["@type"];
          if (type === "LocalBusiness" || (Array.isArray(type) && type.includes("LocalBusiness"))) {
            localBusinessSchemaDetected = true;
            const missingFields = [];
            if (!obj.name) missingFields.push("name");
            if (!obj.address) missingFields.push("address");
            if (!obj.telephone) missingFields.push("telephone");
            if (!obj.geo) missingFields.push("geo coordinates");
            if (!obj.url) missingFields.push("url");
            if (!obj.openingHours && !obj.openingHoursSpecification) missingFields.push("openingHours");

            if (missingFields.length > 0) {
              schemaCompleteness = Math.max(0, 100 - missingFields.length * 16);
              schemaErrors.push(`LocalBusiness schema is missing fields: ${missingFields.join(", ")}`);
            }
          }
          for (const k in obj) {
            checkType(obj[k]);
          }
        } else if (Array.isArray(obj)) {
          obj.forEach(checkType);
        }
      };
      checkType(parsed);
    } catch {
      schemaValid = false;
      schemaErrors.push("JSON-LD structure contains invalid JSON formatting syntax.");
    }
  }

  if (!schemaTag) {
    schemaTag = /application\/ld\+json/i.test(html) || /schema\.org/i.test(html);
  }

  // ── Security Headers ──
  const hstsHeaderPresent = !!headers["strict-transport-security"];
  const cspHeaderPresent = !!headers["content-security-policy"];
  const xFrameHeaderPresent = !!headers["x-frame-options"];
  const xContentTypeHeaderPresent = !!headers["x-content-type-options"];

  // ── Contact & content signals ──
  const phonePresent = /\+?\d[\d\s().-]{7,}\d/.test(text);
  const emailPresent = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text);
  const imagesCount = countMatches(/<img\b/gi, html);
  const imagesWithAlt = countMatches(/<img\b[^>]*\balt=["'][^"']*["']/gi, html);
  const imagesWithoutAlt = Math.max(0, imagesCount - imagesWithAlt);
  const altTextCoveragePercent = imagesCount > 0 ? Math.round((imagesWithAlt / imagesCount) * 100) : 100;
  const missingAltPercent = 100 - altTextCoveragePercent;

  // ── Internal links ──
  const hrefMatches = Array.from(html.matchAll(/href=["']([^"']+)["']/gi));
  const internalLinks = hrefMatches.filter((entry) => {
    const href = cleanText(entry[1]);
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return false;
    }
    if (href.startsWith("/")) {
      return true;
    }
    try {
      return new URL(href, normalizedUrl).hostname === parsedUrl.hostname;
    } catch {
      return false;
    }
  }).length;

  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const locationTokens = [cleanText(input.city), cleanText(input.state)]
    .filter(Boolean)
    .map((token) => token.toLowerCase());
  const mentionsLocation = locationTokens.some((token) => lowerText.includes(token));

  // ── Speed class ──
  const speedClass: "fast" | "medium" | "slow" =
    responseTimeMs < 800 ? "fast" : responseTimeMs < 2000 ? "medium" : "slow";

  // ── Robots.txt & Sitemap (parallel) ──
  const [hasRobotsTxt, hasSitemapXml] = await Promise.all([
    checkUrlExists(`${origin}/robots.txt`),
    checkUrlExists(`${origin}/sitemap.xml`),
  ]);

  // ── Scoring ── (Start from 75 — stricter baseline)
  const issues: WebsiteAuditIssue[] = [];
  const wins: string[] = [];
  const recommendations: string[] = [];
  let score = 75;

  // ── HTTPS (critical) ──
  if (!usesHttps) {
    score -= 15;
    issues.push({
      severity: "high",
      title: "Site is not served over HTTPS",
      detail: "The page was fetched over HTTP, so traffic is not protected by HTTPS and browsers may show a security warning.",
    });
    recommendations.push("Install a valid SSL/TLS certificate and redirect all HTTP traffic to HTTPS.");
  } else {
    wins.push("Site is served securely over HTTPS.");
  }

  // ── Noindex ──
  if (noindexDetected) {
    score -= 20;
    issues.push({
      severity: "high",
      title: "Page is set to noindex — blocked from search engines",
      detail: "A robots meta tag with 'noindex' was detected. Search engines cannot index this page.",
    });
    recommendations.push("Remove the noindex directive from the robots meta tag unless this page should be excluded from search.");
  }

  // ── Title tag ──
  if (!title) {
    score -= 12;
    issues.push({
      severity: "high",
      title: "Title tag is missing",
      detail: "The page does not expose a reliable HTML title, which weakens relevance and click-through potential.",
    });
    recommendations.push("Add a unique title tag that clearly targets the service and location intent.");
  } else if (title.length < 30 || title.length > 65) {
    score -= 6;
    issues.push({
      severity: "medium",
      title: "Title tag length is outside the audit heuristic",
      detail: `Current title is ${title.length} characters. Search-result truncation depends on rendered width. This audit uses 30–65 characters only as a review heuristic.`,
    });
    recommendations.push("Write a concise, unique title that accurately describes the page; preview its rendered search-result width and avoid forced keywords.");
  } else {
    wins.push("Title tag length is in a healthy range (50–65 chars).");
  }

  // ── Meta description ──
  if (!metaDescription) {
    score -= 10;
    issues.push({
      severity: "medium",
      title: "Meta description is missing",
      detail: "The page is missing a meta description — Google will auto-generate one which may be off-brand.",
    });
    recommendations.push("Add a 120–155 character meta description that frames the offer, trust signals, and location value.");
  } else if (metaDescription.length < 80 || metaDescription.length > 165) {
    score -= 4;
    issues.push({
      severity: "low",
      title: "Meta description length is off target",
      detail: `Current description is ${metaDescription.length} characters. The audit uses 80–165 characters as a review heuristic; rendered snippets vary by query and device.`,
    });
  } else {
    wins.push("Meta description length is in a serviceable range.");
  }

  // ── H1 tag ──
  if (h1Count === 0) {
    score -= 10;
    issues.push({
      severity: "high",
      title: "Primary H1 heading is missing",
      detail: "No H1 heading was found. A clear primary heading helps users and crawlers understand the page structure.",
    });
    recommendations.push("Add a single strong H1 that matches the primary service intent and includes a location keyword.");
  } else if (h1Count > 1) {
    score -= 4;
    issues.push({
      severity: "low",
      title: `${h1Count} H1 headings detected — only one expected`,
      detail: "Multiple H1 headings are valid HTML, but they should be reviewed to confirm that the page hierarchy remains clear.",
    });
  } else {
    wins.push("Exactly one H1 found — correct heading hierarchy.");
  }

  // ── H2 structure ──
  if (h2Count === 0 && wordCount > 150) {
    score -= 5;
    issues.push({
      severity: "low",
      title: "No H2 headings — content lacks structure",
      detail: "Pages with content but no H2 subheadings appear unstructured to search engines and readers.",
    });
    recommendations.push("Break content into logical sections using H2 and H3 subheadings with keyword-rich labels.");
  } else if (h2Count > 0) {
    wins.push(`Page has ${h2Count} H2 subheadings — good content structure.`);
  }

  // ── Language attribute ──
  if (!hasLangAttribute) {
    score -= 3;
    issues.push({
      severity: "low",
      title: "HTML lang attribute is missing",
      detail: "The <html> element has no lang attribute. This affects accessibility and language targeting.",
    });
    recommendations.push("Add lang=\"en\" (or appropriate locale) to the <html> tag.");
  } else {
    wins.push(`HTML lang attribute is set to "${langAttribute}".`);
  }

  // ── Viewport ──
  if (!viewportTag) {
    score -= 8;
    issues.push({
      severity: "medium",
      title: "Viewport tag missing — poor mobile experience",
      detail: "Mobile viewport guidance was not detected in the page head, so the page may render poorly on mobile devices.",
    });
    recommendations.push("Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to the page head.");
  } else {
    wins.push("Viewport meta tag is correctly configured for mobile.");
  }

  // ── Canonical ──
  if (!canonicalTag) {
    score -= 4;
    issues.push({
      severity: "low",
      title: "Canonical tag missing",
      detail: "Without a canonical tag, duplicate content issues can arise if the page is accessible from multiple URLs.",
    });
  } else {
    wins.push("Canonical tag is present, helping prevent duplicate content issues.");
  }

  // ── Open Graph ──
  if (!hasOpenGraph) {
    score -= 5;
    issues.push({
      severity: "low",
      title: "Open Graph tags are missing",
      detail: "No og:title, og:description, or og:image found. Links shared on Facebook, LinkedIn, and WhatsApp will show poor previews.",
    });
    recommendations.push("Add og:title, og:description, and og:image meta tags to control social sharing appearance.");
  } else if (!openGraphComplete) {
    score -= 3;
    issues.push({
      severity: "low",
      title: "Open Graph tags are incomplete",
      detail: `Found some OG tags but missing: ${[!ogTitle && "og:title", !ogDescription && "og:description", !ogImage && "og:image"].filter(Boolean).join(", ")}.`,
    });
  } else {
    wins.push("Complete Open Graph tags configured (title, description, image).");
  }

  // ── Twitter Card ──
  if (!hasTwitterCard) {
    score -= 2;
    issues.push({
      severity: "low",
      title: "Twitter Card meta tag missing",
      detail: "Without twitter:card, X/Twitter will show a plain link instead of a rich preview card.",
    });
    recommendations.push("Add <meta name=\"twitter:card\" content=\"summary_large_image\"> plus twitter:title and twitter:description.");
  } else {
    wins.push("Twitter Card meta tag is configured.");
  }

  // ── Schema ──
  if (!schemaTag) {
    score -= 8;
    issues.push({
      severity: "medium",
      title: "Schema structured data not detected",
      detail: "No JSON-LD or schema.org markup found. Structured data enables rich snippets and stronger entity signals.",
    });
    recommendations.push("Add LocalBusiness JSON-LD schema with name, address, telephone, geo coordinates, and openingHours.");
  } else {
    wins.push("Structured data markup was detected.");
    if (!schemaValid) {
      score -= 8;
      issues.push({
        severity: "high",
        title: "Structured data contains syntax errors",
        detail: schemaErrors.join(" "),
      });
      recommendations.push("Fix the JSON-LD syntax errors — use Google's Rich Results Test to validate.");
    } else if (localBusinessSchemaDetected) {
      if (schemaCompleteness < 100) {
        score -= 4;
        issues.push({
          severity: "medium",
          title: "Incomplete LocalBusiness schema",
          detail: `LocalBusiness schema detected but missing vital fields: ${schemaErrors.join(" ")}`,
        });
        recommendations.push("Ensure LocalBusiness schema contains name, address, telephone, url, geo, and openingHours.");
      } else {
        wins.push("Complete LocalBusiness schema is properly configured.");
      }
    }
  }

  // ── Contact signals ──
  if (!phonePresent && !emailPresent) {
    score -= 10;
    issues.push({
      severity: "medium",
      title: "Contact signals are absent from the page",
      detail: "No visible phone number or email address was detected in page content.",
    });
    recommendations.push("Surface a clickable phone number prominently above the fold on every page.");
  } else {
    wins.push("Contact signal (phone or email) is visible on the page.");
  }

  // ── Thin content ──
  if (wordCount < 150) {
    score -= 12;
    issues.push({
      severity: "high",
      title: "Page content is critically thin",
      detail: `Only ~${wordCount} words detected. Pages under 150 words rarely rank for competitive local terms.`,
    });
    recommendations.push("Expand page content to at least 400 words covering services, location, trust signals, and FAQs.");
  } else if (wordCount < 300) {
    score -= 7;
    issues.push({
      severity: "medium",
      title: "Content depth is thin",
      detail: `The page exposes only ~${wordCount} words. Competitors in local search typically have 400–800 words on core pages.`,
    });
    recommendations.push("Add service-specific content — describe your process, certifications, service areas, and FAQs.");
  } else {
    wins.push(`Page content depth is reasonable (~${wordCount} words).`);
  }

  // ── Internal linking ──
  if (internalLinks < 3) {
    score -= 6;
    issues.push({
      severity: "low",
      title: "Internal linking is shallow",
      detail: `Only ${internalLinks} internal link(s) detected. Poor internal linking limits crawl depth and PageRank flow.`,
    });
    recommendations.push("Add internal links to related services, location pages, and conversion-focused pages.");
  } else {
    wins.push(`${internalLinks} internal links found — good crawlability.`);
  }

  // ── Alt text coverage ──
  if (imagesCount > 0 && missingAltPercent > 30) {
    const deduction = Math.min(8, Math.round(missingAltPercent / 12));
    score -= deduction;
    issues.push({
      severity: missingAltPercent > 60 ? "medium" : "low",
      title: `${missingAltPercent}% of images are missing alt text`,
      detail: `${imagesWithoutAlt} of ${imagesCount} images lack alt attributes — hurting accessibility and image SEO.`,
    });
    recommendations.push("Add descriptive alt text to all images, including service keywords and location context where natural.");
  } else if (imagesCount > 0) {
    wins.push(`Alt text coverage is good (${altTextCoveragePercent}% of images have alt text).`);
  }

  // ── Robots.txt ──
  if (!hasRobotsTxt) {
    score -= 4;
    issues.push({
      severity: "low",
      title: "robots.txt file not found",
      detail: "No robots.txt was found at the root. This file helps search engines navigate the site efficiently.",
    });
    recommendations.push("Create a robots.txt at your domain root and reference your sitemap.xml URL in it.");
  } else {
    wins.push("robots.txt is present and accessible.");
  }

  // ── Sitemap ──
  if (!hasSitemapXml) {
    score -= 4;
    issues.push({
      severity: "low",
      title: "sitemap.xml not found",
      detail: "No sitemap.xml detected at the domain root. Sitemaps help search engines discover all pages.",
    });
    recommendations.push("Generate and submit an XML sitemap to Google Search Console.");
  } else {
    wins.push("sitemap.xml is present at the domain root.");
  }

  // ── Location mentions ──
  if (locationTokens.length > 0 && !mentionsLocation) {
    score -= 5;
    issues.push({
      severity: "medium",
      title: "Location signals are weak",
      detail: "The provided city/state context was not found in readable page content.",
    });
    recommendations.push("Mention the target city/state naturally in the H1, introductory paragraph, and trust sections.");
  } else if (locationTokens.length > 0) {
    wins.push("Page mentions the target location context.");
  }

  // ── Response time ──
  if (responseTimeMs > 3000) {
    score -= 10;
    issues.push({
      severity: "high",
      title: "Very slow server response time",
      detail: `Server took ${responseTimeMs}ms to respond. Google's Core Web Vitals target is under 800ms TTFB.`,
    });
    recommendations.push("Upgrade hosting, enable server-side caching, or deploy a CDN (Cloudflare, Fastly).");
  } else if (responseTimeMs > 1500) {
    score -= 6;
    issues.push({
      severity: "medium",
      title: "Slow server response time",
      detail: `Server responded in ${responseTimeMs}ms. Ideal TTFB is under 800ms for competitive local pages.`,
    });
    recommendations.push("Enable caching headers, use a CDN, or optimise database queries to reduce response time.");
  } else {
    wins.push(`Fast server response time (${responseTimeMs}ms TTFB).`);
  }

  // ── Page size ──
  if (pageSizeBytes > 2000000) {
    score -= 6;
    issues.push({
      severity: "medium",
      title: "HTML page payload is very heavy",
      detail: `HTML payload is ${(pageSizeBytes / 1024 / 1024).toFixed(2)}MB — severely above the 500KB ideal.`,
    });
    recommendations.push("Minify HTML, remove inline scripts/styles, and lazy-load non-critical resources.");
  } else if (pageSizeBytes > 500000) {
    score -= 3;
    issues.push({
      severity: "low",
      title: "HTML page payload is larger than ideal",
      detail: `HTML payload is ${Math.round(pageSizeBytes / 1024)}KB — consider reducing to under 500KB.`,
    });
  } else {
    wins.push(`Page payload size is lean (${Math.round(pageSizeBytes / 1024)}KB).`);
  }

  // ── Security headers ──
  const missingSecurityHeaders: string[] = [];
  if (!hstsHeaderPresent) missingSecurityHeaders.push("Strict-Transport-Security (HSTS)");
  if (!cspHeaderPresent) missingSecurityHeaders.push("Content-Security-Policy (CSP)");
  if (!xFrameHeaderPresent) missingSecurityHeaders.push("X-Frame-Options");
  if (!xContentTypeHeaderPresent) missingSecurityHeaders.push("X-Content-Type-Options");

  if (missingSecurityHeaders.length >= 3) {
    score -= 8;
    issues.push({
      severity: "medium",
      title: "Multiple recommended security headers are missing",
      detail: `Missing: ${missingSecurityHeaders.join(", ")}. These protect against XSS, clickjacking, and MIME-type attacks.`,
    });
    recommendations.push("Configure HSTS, Content-Security-Policy, X-Frame-Options, and X-Content-Type-Options on your server.");
  } else if (missingSecurityHeaders.length > 0) {
    score -= 3;
    issues.push({
      severity: "low",
      title: "Some security headers are missing",
      detail: `Missing: ${missingSecurityHeaders.join(", ")}.`,
    });
  } else {
    wins.push("All recommended security headers are properly configured.");
  }

  // ── HTTP/2 ──
  if (!usesHttp2) {
    issues.push({
      severity: "low",
      title: "HTTP/2 not detected",
      detail: "HTTP/2 multiplexing significantly improves page load performance. HTTP/1.1 is slower for resource-heavy pages.",
    });
    recommendations.push("Enable HTTP/2 on your server or use a CDN proxy like Cloudflare which enables it automatically.");
  } else {
    wins.push("HTTP/2 is enabled for faster parallel resource loading.");
  }

  score = Math.max(0, Math.min(100, score));
  const verdict: WebsiteAuditResult["verdict"] =
    score >= 78 ? "Strong" : score >= 55 ? "Needs Work" : "Urgent";

  const summary =
    verdict === "Strong"
      ? `The website has a solid technical and content foundation (score: ${score}/100). Minor tuning will further improve local search performance.`
      : verdict === "Needs Work"
        ? `The audit found a usable structure plus several technical, content, trust, local, or conversion-readiness gaps (score: ${score}/100). Validate outcomes after each fix.`
        : `The audit found multiple high-priority gaps across technical SEO, content, and trust checks (score: ${score}/100). Prioritize verified issues and rerun the audit after changes.`;

  return {
    auditVersion: "quick",
    score,
    verdict,
    summary,
    issues,
    wins,
    recommendations,
    metrics: {
      normalizedUrl,
      title,
      titleLength: title.length,
      metaDescriptionLength: metaDescription.length,
      h1Count,
      h2Count,
      internalLinks,
      wordCount,
      hasViewport: viewportTag,
      hasCanonical: canonicalTag,
      hasSchema: schemaTag,
      hasPhone: phonePresent,
      hasEmail: emailPresent,
      imagesCount,
      imagesWithoutAlt,
      altTextCoveragePercent,
      missingAltPercent,
      mentionsLocation,
      usesHttps,
      hasRobotsTxt,
      hasSitemapXml,
      localBusinessSchemaDetected,
      localBusinessSchemaCompleteness: localBusinessSchemaDetected ? schemaCompleteness : undefined,
      responseTimeMs,
      pageSizeBytes,
      schemaValid,
      schemaErrors: schemaErrors.length > 0 ? schemaErrors : undefined,
      hstsHeaderPresent,
      cspHeaderPresent,
      xFrameHeaderPresent,
      xContentTypeHeaderPresent,
      hasOpenGraph,
      openGraphComplete,
      hasTwitterCard,
      noindexDetected,
      hasRobotsTag,
      usesHttp2,
      speedClass,
      hasH2: h2Count > 0,
      langAttribute: langAttribute || undefined,
      hasLangAttribute,
    },
  };
}