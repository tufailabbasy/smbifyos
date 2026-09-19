import { safeFetch as fetch } from "../../utils/safeFetch.js";
import {
  runWebsiteDeepCrawl,
  type WebsiteDeepCrawlPage,
  type WebsiteDeepCrawlResult,
} from "./crawl.js";
import type {
  WebsiteAuditCategory,
  WebsiteAuditEvidenceHighlight,
  WebsiteAuditInput,
  WebsiteAuditIssue,
  WebsiteAuditModule,
  WebsiteAuditResult,
  WebsiteAuditTopPage,
} from "./website.js";

export type AdvancedWebsiteAuditInput = WebsiteAuditInput & {
  maxPages?: number;
  maxDepth?: number;
  scoringConfig?: unknown;
};

export type AdvancedWebsiteAuditRun = {
  audit: WebsiteAuditResult;
  crawl: WebsiteDeepCrawlResult;
};

type ResourceFetchResult = {
  ok: boolean;
  statusCode: number | null;
  text: string;
};

type IndexabilitySignals = {
  usesHttps: boolean;
  hasRobotsTxt: boolean;
  hasSitemapXml: boolean;
  sitemapReferencedInRobots: boolean;
};

type LocalEntitySignals = {
  localBusinessSchemaDetected: boolean;
  localBusinessSchemaCompleteness: number;
  hasAddressSignal: boolean;
  hasGeoSignal: boolean;
  hasOpeningHoursSignal: boolean;
  hasTelephoneSignal: boolean;
  hasSameAsSignal: boolean;
  hasAggregateRatingSignal: boolean;
  hasFaqSignal: boolean;
  reviewPlatformMentions: string[];
};

export type AdvancedWebsiteScoringConfig = {
  categoryWeights: {
    technical: number;
    content: number;
    trust: number;
    local: number;
    conversion: number;
  };
  localFactorWeights: {
    entitySchema: number;
    reputation: number;
    answerReadiness: number;
    doorwayRisk: number;
  };
};

export const DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG: AdvancedWebsiteScoringConfig = {
  categoryWeights: {
    technical: 0.24,
    content: 0.17,
    trust: 0.22,
    local: 0.22,
    conversion: 0.15,
  },
  localFactorWeights: {
    entitySchema: 1,
    reputation: 1,
    answerReadiness: 1,
    doorwayRisk: 1,
  },
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function clampCategoryWeight(value: unknown, fallback: number, min = 0.01, max = 5): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

function clampLocalFactorWeight(value: unknown, fallback: number, min = 0.4, max = 2.5): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeAdvancedWebsiteScoringConfig(input: unknown): AdvancedWebsiteScoringConfig {
  const source = isObjectRecord(input) ? input : {};
  const rawCategoryWeights = isObjectRecord(source.categoryWeights) ? source.categoryWeights : {};
  const rawLocalFactorWeights = isObjectRecord(source.localFactorWeights) ? source.localFactorWeights : {};

  const categoryWeights = {
    technical: clampCategoryWeight(
      rawCategoryWeights.technical,
      DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.categoryWeights.technical
    ),
    content: clampCategoryWeight(
      rawCategoryWeights.content,
      DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.categoryWeights.content
    ),
    trust: clampCategoryWeight(
      rawCategoryWeights.trust,
      DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.categoryWeights.trust
    ),
    local: clampCategoryWeight(rawCategoryWeights.local, DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.categoryWeights.local),
    conversion: clampCategoryWeight(
      rawCategoryWeights.conversion,
      DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.categoryWeights.conversion
    ),
  };

  const total =
    categoryWeights.technical +
    categoryWeights.content +
    categoryWeights.trust +
    categoryWeights.local +
    categoryWeights.conversion;
  const safeTotal = total > 0 ? total : 1;

  return {
    categoryWeights: {
      technical: categoryWeights.technical / safeTotal,
      content: categoryWeights.content / safeTotal,
      trust: categoryWeights.trust / safeTotal,
      local: categoryWeights.local / safeTotal,
      conversion: categoryWeights.conversion / safeTotal,
    },
    localFactorWeights: {
      entitySchema: clampLocalFactorWeight(
        rawLocalFactorWeights.entitySchema,
        DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.localFactorWeights.entitySchema
      ),
      reputation: clampLocalFactorWeight(
        rawLocalFactorWeights.reputation,
        DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.localFactorWeights.reputation
      ),
      answerReadiness: clampLocalFactorWeight(
        rawLocalFactorWeights.answerReadiness,
        DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.localFactorWeights.answerReadiness
      ),
      doorwayRisk: clampLocalFactorWeight(
        rawLocalFactorWeights.doorwayRisk,
        DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG.localFactorWeights.doorwayRisk
      ),
    },
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratio(count: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return count / total;
}

function percent(count: number, total: number): number {
  return Math.round(ratio(count, total) * 100);
}

function moduleStatus(score: number): WebsiteAuditModule["status"] {
  if (score >= 80) {
    return "pass";
  }
  if (score >= 60) {
    return "warning";
  }
  return "fail";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTypeSet(value: unknown): Set<string> {
  if (Array.isArray(value)) {
    return new Set(value.map((item) => cleanText(item).toLowerCase()).filter(Boolean));
  }

  const single = cleanText(value).toLowerCase();
  return single ? new Set([single]) : new Set<string>();
}

function flattenJsonLdNodes(value: unknown, target: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      flattenJsonLdNodes(entry, target);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  target.push(value);

  if (value["@graph"]) {
    flattenJsonLdNodes(value["@graph"], target);
  }
}

function collectJsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];

  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = cleanText(match[1]);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      flattenJsonLdNodes(parsed, nodes);
    } catch {
      continue;
    }
  }

  return nodes;
}

function hasAddressValue(value: unknown): boolean {
  if (!value) {
    return false;
  }

  if (typeof value === "string") {
    return Boolean(cleanText(value));
  }

  if (isRecord(value)) {
    return Boolean(
      cleanText(value.streetAddress) ||
        cleanText(value.addressLocality) ||
        cleanText(value.addressRegion) ||
        cleanText(value.postalCode)
    );
  }

  return false;
}

function hasGeoValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Boolean(cleanText(value.latitude) && cleanText(value.longitude));
}

function hasOpeningHoursValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }

  return Boolean(cleanText(value));
}

function hasAggregateRatingValue(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Boolean(
    cleanText(value.ratingValue) || cleanText(value.reviewCount) || cleanText(value.ratingCount)
  );
}

function reviewPlatformMentionsFromHtml(html: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    ["Google", /(google\.[a-z.]+\/maps|g\.page\/)\b/i],
    ["Facebook", /facebook\.com\//i],
    ["Yelp", /yelp\.com\//i],
    ["BBB", /bbb\.org\//i],
    ["Apple Maps", /(maps\.apple\.com|apple\.com\/maps)\b/i],
    ["Tripadvisor", /tripadvisor\./i],
    ["Trustpilot", /trustpilot\.com\//i],
  ];

  return patterns
    .filter(([, regex]) => regex.test(html))
    .map(([label]) => label);
}

function inspectLocalEntitySignalsFromHtml(html: string): LocalEntitySignals {
  const nodes = collectJsonLdNodes(html);
  const localNodes = nodes.filter((node) => {
    const types = normalizeTypeSet(node["@type"]);
    const hasLocalBusinessType = Array.from(types).some((type) => type.includes("localbusiness"));
    if (hasLocalBusinessType) {
      return true;
    }

    return Boolean(cleanText(node.name)) && hasAddressValue(node.address);
  });

  const hasAddressSignal = localNodes.some((node) => hasAddressValue(node.address));
  const hasGeoSignal = localNodes.some((node) => hasGeoValue(node.geo));
  const hasOpeningHoursSignal = localNodes.some(
    (node) => hasOpeningHoursValue(node.openingHoursSpecification) || hasOpeningHoursValue(node.openingHours)
  );
  const hasTelephoneSignal = localNodes.some((node) => Boolean(cleanText(node.telephone)));
  const hasSameAsSignal = localNodes.some(
    (node) => Array.isArray(node.sameAs) && (node.sameAs as unknown[]).length > 0
  );
  const hasAggregateRatingSignal = localNodes.some((node) => hasAggregateRatingValue(node.aggregateRating));
  const hasFaqSchemaSignal = nodes.some((node) => {
    const types = normalizeTypeSet(node["@type"]);
    return types.has("faqpage") || types.has("question");
  });
  const hasFaqCopySignal = /\bfaq\b|frequently asked questions?/i.test(html);
  const reviewPlatformMentions = reviewPlatformMentionsFromHtml(html);

  const completenessSignals = [
    hasAddressSignal,
    hasGeoSignal,
    hasOpeningHoursSignal,
    hasTelephoneSignal,
    hasSameAsSignal,
    hasAggregateRatingSignal,
  ];
  const localBusinessSchemaDetected = localNodes.length > 0;
  const localBusinessSchemaCompleteness = localBusinessSchemaDetected
    ? Math.round((completenessSignals.filter(Boolean).length / completenessSignals.length) * 100)
    : 0;

  return {
    localBusinessSchemaDetected,
    localBusinessSchemaCompleteness,
    hasAddressSignal,
    hasGeoSignal,
    hasOpeningHoursSignal,
    hasTelephoneSignal,
    hasSameAsSignal,
    hasAggregateRatingSignal,
    hasFaqSignal: hasFaqSchemaSignal || hasFaqCopySignal,
    reviewPlatformMentions,
  };
}

async function fetchOptionalText(url: string, timeoutMs = 9000): Promise<ResourceFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
    });

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        text: "",
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      text: await response.text(),
    };
  } catch {
    return {
      ok: false,
      statusCode: null,
      text: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRootUrl(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

async function inspectIndexability(startUrl: string): Promise<IndexabilitySignals> {
  const rootUrl = normalizeRootUrl(startUrl);
  const robotsUrl = new URL("/robots.txt", rootUrl).toString();
  const sitemapUrl = new URL("/sitemap.xml", rootUrl).toString();
  const robotsResult = await fetchOptionalText(robotsUrl);
  const sitemapResult = await fetchOptionalText(sitemapUrl);
  const sitemapRefs = Array.from(robotsResult.text.matchAll(/^sitemap:\s*(.+)$/gim))
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  let hasSitemapXml =
    sitemapResult.ok && /<(urlset|sitemapindex)\b/i.test(sitemapResult.text);

  if (!hasSitemapXml) {
    for (const ref of sitemapRefs.slice(0, 3)) {
      try {
        const resolved = new URL(ref, rootUrl).toString();
        const fetched = await fetchOptionalText(resolved);
        if (fetched.ok && /<(urlset|sitemapindex)\b/i.test(fetched.text)) {
          hasSitemapXml = true;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  return {
    usesHttps: startUrl.startsWith("https://"),
    hasRobotsTxt: robotsResult.ok,
    hasSitemapXml,
    sitemapReferencedInRobots: sitemapRefs.length > 0,
  };
}

async function inspectLocalEntitySignals(startUrl: string): Promise<LocalEntitySignals> {
  const rootUrl = normalizeRootUrl(startUrl);
  const homeResult = await fetchOptionalText(rootUrl);

  if (!homeResult.ok || !homeResult.text) {
    return {
      localBusinessSchemaDetected: false,
      localBusinessSchemaCompleteness: 0,
      hasAddressSignal: false,
      hasGeoSignal: false,
      hasOpeningHoursSignal: false,
      hasTelephoneSignal: false,
      hasSameAsSignal: false,
      hasAggregateRatingSignal: false,
      hasFaqSignal: false,
      reviewPlatformMentions: [],
    };
  }

  return inspectLocalEntitySignalsFromHtml(homeResult.text);
}

function buildCategory(
  key: WebsiteAuditCategory["key"],
  label: string,
  score: number,
  summary: string
): WebsiteAuditCategory {
  return {
    key,
    label,
    score: clampScore(score),
    summary,
  };
}

function pageIssueWeight(page: WebsiteDeepCrawlPage): number {
  let weight = 0;

  if (page.statusCode === null || page.statusCode >= 400) weight += 4;
  if (!page.title) weight += 3;
  if (!page.metaDescription) weight += 2;
  if (page.h1Count === 0) weight += 2;
  if (!page.hasCanonical) weight += 1;
  if (!page.hasViewport) weight += 1;
  if (page.wordCount > 0 && page.wordCount < 250) weight += 2;
  if (!page.hasSchema) weight += 1;
  if (!page.hasPhone && !page.hasEmail) weight += 1;
  if ((page.pageRole === "home" || page.pageRole === "service") && !page.hasCta) weight += 2;
  if ((page.pageRole === "home" || page.pageRole === "about") && !page.hasTrustSignal) weight += 1;
  if (page.imagesWithoutAlt > 0) weight += 1;

  return weight;
}

function topProblemPages(pages: WebsiteDeepCrawlPage[]): WebsiteAuditTopPage[] {
  return pages
    .map((page) => ({
      url: page.url,
      pageRole: page.pageRole,
      depth: page.depth,
      statusCode: page.statusCode,
      issueWeight: pageIssueWeight(page),
      summary: page.summary,
    }))
    .filter((page) => page.issueWeight > 0)
    .sort((left, right) => right.issueWeight - left.issueWeight || left.depth - right.depth)
    .slice(0, 5);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function buildSummary(args: {
  targetName: string;
  pagesCrawled: number;
  verdict: WebsiteAuditResult["verdict"];
  weakestCategory: WebsiteAuditCategory;
}): string {
  const { targetName, pagesCrawled, verdict, weakestCategory } = args;

  if (verdict === "Strong") {
    return `${targetName} has a credible site foundation across ${pagesCrawled} crawled pages, but ${weakestCategory.label.toLowerCase()} is still the clearest upgrade opportunity.`;
  }

  if (verdict === "Needs Work") {
    return `${targetName} has usable structure, but the crawl sample shows its weakest coverage in ${weakestCategory.label.toLowerCase()}.`;
  }

  return `${targetName} is missing multiple core signals across ${pagesCrawled} crawled pages, and ${weakestCategory.label.toLowerCase()} is the biggest reason the site still feels underpowered.`;
}

export async function runAdvancedWebsiteAudit(
  input: AdvancedWebsiteAuditInput
): Promise<AdvancedWebsiteAuditRun> {
  const crawl = await runWebsiteDeepCrawl({
    website: input.website,
    businessName: input.businessName,
    city: input.city,
    state: input.state,
    maxPages: input.maxPages,
    maxDepth: input.maxDepth,
  });

  const indexability = await inspectIndexability(crawl.normalizedUrl);
  const localEntity = await inspectLocalEntitySignals(crawl.normalizedUrl);
  const pagesCrawled = Math.max(1, crawl.pagesCrawled);
  const homePage = crawl.pages.find((page) => page.pageRole === "home") || crawl.pages[0];
  const servicePageCount = crawl.pages.filter((page) => page.pageRole === "service").length;
  const locationServicePages = crawl.pages.filter(
    (page) => page.pageRole === "service" && page.mentionsLocation
  ).length;
  const thinLocationServicePages = crawl.pages.filter(
    (page) => page.pageRole === "service" && page.mentionsLocation && page.wordCount > 0 && page.wordCount < 220
  ).length;
  const normalizedTitles = crawl.pages.map((page) => cleanText(page.title).toLowerCase()).filter(Boolean);
  const duplicateTitlePages = Math.max(0, normalizedTitles.length - new Set(normalizedTitles).size);
  const duplicateTitleCoverage = ratio(duplicateTitlePages, pagesCrawled);
  const potentialDoorwayRisk = thinLocationServicePages >= 2 && duplicateTitleCoverage >= 0.25;
  const reviewPlatformCount = localEntity.reviewPlatformMentions.length;
  const contactCoverage = ratio(crawl.pagesWithContactSignals, pagesCrawled);
  const schemaCoverage = ratio(crawl.pagesWithSchema, pagesCrawled);
  const localCoverage = ratio(crawl.pagesMentioningLocation, pagesCrawled);
  const ctaCoverage = ratio(crawl.pagesWithCta, pagesCrawled);
  const trustCoverage = ratio(crawl.pagesWithTrustSignals, pagesCrawled);
  const thinCoverage = ratio(crawl.pagesWithThinContent, pagesCrawled);
  const titleGap = ratio(crawl.pagesMissingTitle, pagesCrawled);
  const metaGap = ratio(crawl.pagesMissingMeta, pagesCrawled);
  const h1Gap = ratio(crawl.pagesMissingH1, pagesCrawled);
  const canonicalGap = 1 - ratio(crawl.pagesWithCanonical, pagesCrawled);
  const viewportGap = 1 - ratio(crawl.pagesWithViewport, pagesCrawled);
  const brokenCoverage = ratio(crawl.brokenPages, pagesCrawled);
  const lowInternalLinksCoverage = ratio(
    crawl.pages.filter((page) => page.internalLinkCount < 3).length,
    pagesCrawled
  );
  const homeHasContactSignal = Boolean(homePage?.hasPhone || homePage?.hasEmail);
  const homeHasLocation = Boolean(homePage?.mentionsLocation);
  const homeHasCta = Boolean(homePage?.hasCta);
  const scoringConfig = normalizeAdvancedWebsiteScoringConfig(input.scoringConfig);
  const categoryWeights = scoringConfig.categoryWeights;
  const localFactorWeights = scoringConfig.localFactorWeights;

  const technicalScore = clampScore(
    100 -
      titleGap * 20 -
      metaGap * 16 -
      h1Gap * 12 -
      canonicalGap * 10 -
      viewportGap * 8 -
      brokenCoverage * 20 -
        duplicateTitleCoverage * (10 * localFactorWeights.doorwayRisk) -
        (potentialDoorwayRisk ? 8 * localFactorWeights.doorwayRisk : 0) -
      (!indexability.usesHttps ? 8 : 0) -
      (!indexability.hasRobotsTxt ? 6 : 0) -
      (!indexability.hasSitemapXml ? 6 : 0) -
      (crawl.averageResponseTimeMs > 2200 ? 8 : crawl.averageResponseTimeMs > 1600 ? 4 : 0)
  );

  const contentScore = clampScore(
    100 -
      thinCoverage * 32 -
      (crawl.averageWordCount < 300 ? 18 : crawl.averageWordCount < 450 ? 8 : 0) -
      lowInternalLinksCoverage * 12 -
      metaGap * 10 -
      titleGap * 8 -
        (!localEntity.hasFaqSignal ? 6 * localFactorWeights.answerReadiness : 0)
  );

  const trustScore = clampScore(
    100 -
      (1 - contactCoverage) * 24 -
      (1 - schemaCoverage) * 18 -
      (!localEntity.localBusinessSchemaDetected ? 14 * localFactorWeights.entitySchema : 0) -
      (localEntity.localBusinessSchemaDetected
        ? Math.max(0, 100 - localEntity.localBusinessSchemaCompleteness) * 0.18 * localFactorWeights.entitySchema
        : 0) -
      (!crawl.aboutPageFound ? 14 : 0) -
      (!crawl.policyPageFound ? 12 : 0) -
      (crawl.pagesWithTestimonials === 0 ? 8 : 0) -
      (!localEntity.hasAggregateRatingSignal && crawl.pagesWithTestimonials === 0
        ? 8 * localFactorWeights.reputation
        : 0) -
      (reviewPlatformCount === 0
        ? 10 * localFactorWeights.reputation
        : reviewPlatformCount < 2
          ? 6 * localFactorWeights.reputation
          : 0) -
      (!homeHasContactSignal ? 10 : 0)
  );

  const localScore = clampScore(
    100 -
      (1 - localCoverage) * 24 -
      (1 - schemaCoverage) * 8 -
        (!localEntity.localBusinessSchemaDetected ? 16 * localFactorWeights.entitySchema : 0) -
        (!localEntity.hasAddressSignal ? 10 * localFactorWeights.entitySchema : 0) -
        (!localEntity.hasGeoSignal ? 6 * localFactorWeights.entitySchema : 0) -
        (!localEntity.hasOpeningHoursSignal ? 6 * localFactorWeights.entitySchema : 0) -
        (!localEntity.hasSameAsSignal ? 4 * localFactorWeights.entitySchema : 0) -
      (!crawl.contactPageFound ? 10 : 0) -
      (!homeHasLocation ? 10 : 0) -
      (locationServicePages === 0 ? 12 : locationServicePages < 2 ? 6 : 0) -
        (reviewPlatformCount === 0 ? 8 * localFactorWeights.reputation : 0)
  );

  const conversionScore = clampScore(
    100 -
      (1 - ctaCoverage) * 28 -
      (1 - contactCoverage) * 20 -
      (!crawl.contactPageFound ? 14 : 0) -
      (!homeHasCta ? 12 : 0) -
      (!localEntity.hasAggregateRatingSignal && crawl.pagesWithTestimonials === 0
        ? 6 * localFactorWeights.reputation
        : 0) -
      (!localEntity.hasFaqSignal ? 4 * localFactorWeights.answerReadiness : 0) -
      (crawl.averageResponseTimeMs > 2200 ? 10 : crawl.averageResponseTimeMs > 1600 ? 5 : 0) -
      (crawl.brokenPages > 0 ? 8 : 0)
  );

  const categories: WebsiteAuditCategory[] = [
    buildCategory(
      "technical",
      "Technical Health",
      technicalScore,
      `${crawl.pagesMissingTitle + crawl.pagesMissingMeta + crawl.pagesMissingH1} structural gaps found across titles, meta, and headings.`
    ),
    buildCategory(
      "content",
      "Content Depth",
      contentScore,
      `${crawl.pagesWithThinContent} thin page(s) and an average of ${crawl.averageWordCount} words per crawled page.`
    ),
    buildCategory(
      "trust",
      "Trust / EEAT",
      trustScore,
      `${percent(crawl.pagesWithContactSignals, pagesCrawled)}% contact coverage, ${localEntity.localBusinessSchemaCompleteness}% entity-schema completeness, and ${reviewPlatformCount} linked review platform(s).`
    ),
    buildCategory(
      "local",
      "Local Signals",
      localScore,
      `${percent(crawl.pagesMentioningLocation, pagesCrawled)}% location coverage with ${locationServicePages} location-reinforced service page(s).`
    ),
    buildCategory(
      "conversion",
      "Conversion Readiness",
      conversionScore,
      `${percent(crawl.pagesWithCta, pagesCrawled)}% of crawled pages expose a clear action cue.`
    ),
  ];

  const weightedScore =
    technicalScore * categoryWeights.technical +
    contentScore * categoryWeights.content +
    trustScore * categoryWeights.trust +
    localScore * categoryWeights.local +
    conversionScore * categoryWeights.conversion;
  const score = clampScore(weightedScore);
  const verdict: WebsiteAuditResult["verdict"] =
    score >= 78 ? "Strong" : score >= 56 ? "Needs Work" : "Urgent";
  const sortedCategories = [...categories].sort((left, right) => left.score - right.score);
  const weakestCategory = sortedCategories[0];

  const typedIssues: WebsiteAuditIssue[] = [];

  if (crawl.brokenPages > 0) {
    typedIssues.push({
      severity: "high",
      title: "Crawl health is unstable",
      detail: `Broken or failed pages were detected in the crawl sample (${crawl.brokenPages}).`,
    });
  }

  if (titleGap >= 0.35 || metaGap >= 0.35 || h1Gap >= 0.35) {
    typedIssues.push({
      severity: typedIssues.length === 0 && verdict === "Urgent" ? "high" : "medium",
      title: "On-page structure is uneven",
      detail: "On-page structure is inconsistent across key pages, which weakens topical clarity.",
    });
  }

  if (thinCoverage >= 0.35) {
    typedIssues.push({
      severity: "medium",
      title: "Content depth is too thin",
      detail: `Thin content is widespread, with ${crawl.pagesWithThinContent} page(s) under the depth threshold.`,
    });
  }

  if (!indexability.hasRobotsTxt || !indexability.hasSitemapXml) {
    typedIssues.push({
      severity: "medium",
      title: "Index control is incomplete",
      detail: "Index control basics are incomplete because robots.txt or sitemap coverage is missing.",
    });
  }

  if (trustScore < 65) {
    typedIssues.push({
      severity: "medium",
      title: "Trust signals are weak",
      detail: "The crawler found limited explicit trust signals across the sampled pages.",
    });
  }

  if (localScore < 65) {
    typedIssues.push({
      severity: "medium",
      title: "Local signals are underpowered",
      detail: "Local intent reinforcement is weak, so service plus city relevance is not obvious enough.",
    });
  }

  if (!localEntity.localBusinessSchemaDetected || localEntity.localBusinessSchemaCompleteness < 60) {
    typedIssues.push({
      severity: "high",
      title: "LocalBusiness entity schema is incomplete",
      detail:
        "Google-supported local business fields are missing or incomplete, which weakens relevance and prominence signals.",
    });
  }

  if (reviewPlatformCount < 2) {
    typedIssues.push({
      severity: "medium",
      title: "Reputation footprint is too narrow",
      detail:
        "The site does not clearly connect to enough trusted review ecosystems, limiting consumer and AI confidence.",
    });
  }

  if (!localEntity.hasFaqSignal) {
    typedIssues.push({
      severity: "low",
      title: "Answer-engine readiness is limited",
      detail:
        "FAQ or Q&A style answer content was not detected, reducing visibility opportunities in AI-assisted local discovery.",
    });
  }

  if (potentialDoorwayRisk) {
    typedIssues.push({
      severity: "high",
      title: "Potential doorway-page pattern detected",
      detail:
        "Location service pages appear too thin or repetitive, which can trigger spam-like doorway quality signals.",
    });
  }

  if (conversionScore < 65) {
    typedIssues.push({
      severity: "medium",
      title: "Conversion intent is undersupported",
      detail: "The crawler found limited explicit calls to action or contact paths across the sampled pages.",
    });
  }

  if (homePage && homePage.imagesWithoutAlt > 2) {
    typedIssues.push({
      severity: "medium",
      title: "Multiple images are missing alt text",
      detail: `${homePage.imagesWithoutAlt} image(s) on the homepage lack descriptive alt attributes, hurting accessibility and image SEO.`,
    });
  }

  if (crawl.averageResponseTimeMs > 2200) {
    typedIssues.push({
      severity: "high",
      title: "Page load speed is critically slow",
      detail: `Average server response is ${crawl.averageResponseTimeMs}ms — well above the 1500ms threshold. This impacts user experience and crawl budget.`,
    });
  } else if (crawl.averageResponseTimeMs > 1600) {
    typedIssues.push({
      severity: "medium",
      title: "Page response time is above recommended threshold",
      detail: `Average crawler response time was ${crawl.averageResponseTimeMs}ms. Validate user experience with field Core Web Vitals or a controlled performance test before estimating impact.`,
    });
  }

  if (!indexability.usesHttps) {
    typedIssues.push({
      severity: "high",
      title: "Site is not using HTTPS",
      detail: "The sampled site loads over HTTP, so transport is not protected and browsers may show a security warning.",
    });
  }

  if (!homeHasCta) {
    typedIssues.push({
      severity: "medium",
      title: "Homepage is missing a clear call-to-action",
      detail: "No visible CTA was detected on the homepage. Visitors need a clear next step to convert into leads.",
    });
  }

  if (!homeHasContactSignal) {
    typedIssues.push({
      severity: "medium",
      title: "Homepage does not display contact information",
      detail: "Phone or email is not prominently visible on the homepage, reducing trust and making the business harder to reach.",
    });
  }

  if (!homeHasLocation) {
    typedIssues.push({
      severity: "low",
      title: "Homepage does not reinforce local context",
      detail: "City or service area is not mentioned on the homepage, weakening local search relevance for geo-targeted queries.",
    });
  }

  if (lowInternalLinksCoverage > 0.4) {
    typedIssues.push({
      severity: "medium",
      title: "Internal linking is weak across the site",
      detail: `${Math.round(lowInternalLinksCoverage * pagesCrawled)} of ${pagesCrawled} crawled pages have fewer than 3 internal links, reducing crawl depth and equity flow.`,
    });
  }

  if (crawl.pagesWithTestimonials === 0) {
    typedIssues.push({
      severity: "low",
      title: "No testimonials or social proof detected",
      detail: "The site does not display any customer testimonials, reviews, or social proof elements that help build visitor confidence.",
    });
  }

  if (!crawl.aboutPageFound) {
    typedIssues.push({
      severity: "low",
      title: "No About page found in the crawl",
      detail: "An About page can give users clear ownership, experience, and business-identity information; its value should be assessed from the page content, not its presence alone.",
    });
  }

  if (!crawl.contactPageFound) {
    typedIssues.push({
      severity: "medium",
      title: "No dedicated Contact page found",
      detail: "A Contact page is a core trust signal for local businesses. Missing it makes the business harder to reach and weakens local SEO.",
    });
  }

  if (!crawl.policyPageFound) {
    typedIssues.push({
      severity: "low",
      title: "No Privacy Policy or Terms page detected",
      detail: "Privacy and terms pages are expected by both users and search engines. Missing them can lower trust and may violate regulations.",
    });
  }

  if (duplicateTitlePages > 1) {
    typedIssues.push({
      severity: duplicateTitlePages > 3 ? "high" : "medium",
      title: "Duplicate title tags detected across pages",
      detail: `${duplicateTitlePages} pages share the same title tag, creating keyword cannibalization and confusing search engines about which page to rank.`,
    });
  }

  if (viewportGap > 0.3) {
    typedIssues.push({
      severity: "medium",
      title: "Viewport meta tag missing on multiple pages",
      detail: `${Math.round(viewportGap * pagesCrawled)} page(s) lack the viewport meta tag and won't render correctly on mobile devices.`,
    });
  }

  if (canonicalGap > 0.3) {
    typedIssues.push({
      severity: "low",
      title: "Canonical tags are missing on many pages",
      detail: `${Math.round(canonicalGap * pagesCrawled)} page(s) lack a canonical tag, which can lead to duplicate content indexing issues.`,
    });
  }

  if (schemaCoverage < 0.3) {
    typedIssues.push({
      severity: "medium",
      title: "Structured data coverage is very low",
      detail: `Only ${percent(crawl.pagesWithSchema, pagesCrawled)}% of crawled pages include any schema markup, limiting rich snippet eligibility.`,
    });
  }

  if (typedIssues.length === 0) {
    typedIssues.push({
      severity: "low",
      title: "No major blockers detected",
      detail: "The crawl sample did not surface any hard-stop issues, so this audit is mostly about incremental improvement.",
    });
  }

  const wins = uniqueStrings(
    [
      indexability.usesHttps ? "The site is already running on HTTPS." : "",
      schemaCoverage >= 0.5 ? "Structured data appears on a meaningful share of crawled pages." : "",
      localEntity.localBusinessSchemaDetected
        ? `LocalBusiness schema is present with ${localEntity.localBusinessSchemaCompleteness}% core-field completeness.`
        : "",
      contactCoverage >= 0.6 ? "Contact signals are visible on a healthy portion of crawled pages." : "",
      crawl.aboutPageFound && crawl.contactPageFound
        ? "Core trust pages like About and Contact are present in the crawl path."
        : "",
      reviewPlatformCount >= 2
        ? `Reputation footprint extends to ${reviewPlatformCount} review channel(s): ${localEntity.reviewPlatformMentions.join(", ")}.`
        : "",
      localEntity.hasFaqSignal
        ? "FAQ-style answer content is present, which supports AI-assisted local discovery journeys."
        : "",
      ctaCoverage >= 0.5 ? "Calls to action are visible on multiple crawled pages." : "",
      localCoverage >= 0.45 ? "Location context shows up across a reasonable share of the site." : "",
      crawl.averageWordCount >= 450
        ? `Average content depth is workable at roughly ${crawl.averageWordCount} words per page.`
        : "",
      crawl.brokenPages === 0 ? "No broken pages were detected — the site loads reliably." : "",
      crawl.averageResponseTimeMs <= 1200 ? `Page speed is excellent at ${crawl.averageResponseTimeMs}ms average response time.` : "",
      homeHasCta ? "The homepage includes a visible call-to-action guiding visitors toward conversion." : "",
      homeHasContactSignal ? "Contact information is prominently displayed on the homepage." : "",
      homeHasLocation ? "The homepage reinforces local context with city/area mentions." : "",
      crawl.pagesWithTestimonials > 0 ? `Social proof content was found on ${crawl.pagesWithTestimonials} page(s).` : "",
      duplicateTitlePages === 0 ? "All crawled pages have unique title tags with no cannibalization risk." : "",
      viewportGap < 0.1 ? "Mobile viewport tags are properly set across all crawled pages." : "",
    ].filter(Boolean) as string[]
  ).slice(0, 8);

  const recommendations = uniqueStrings(
    [
      technicalScore < 78
        ? "Clean up crawl and on-page structure first: titles, meta descriptions, H1 coverage, canonicals, and failed pages."
        : "",
      contentScore < 78
        ? "Expand thin service pages with proof, FAQs, offer detail, and stronger internal linking."
        : "",
      trustScore < 78
        ? "Strengthen trust with clearer About, privacy, policy, testimonial, and schema coverage."
        : "",
      localScore < 78
        ? "Thread city and state intent more clearly through service pages, schema, and contact context."
        : "",
      !localEntity.localBusinessSchemaDetected || localEntity.localBusinessSchemaCompleteness < 80
        ? "Implement full LocalBusiness schema with name, address, geo, opening hours, telephone, sameAs, and aggregate rating fields where applicable."
        : "",
      reviewPlatformCount < 2
        ? "Expand review ecosystem visibility beyond one platform, and link trusted profiles like Google, Facebook, Yelp, BBB, or Apple Maps from the site."
        : "",
      !localEntity.hasFaqSignal
        ? "Add concise FAQ and service Q&A sections so both users and AI answer engines can extract clear local intent answers."
        : "",
      potentialDoorwayRisk
        ? "Consolidate repetitive location/service pages and expand them with unique proof, media, and local specifics to avoid doorway-like patterns."
        : "",
      conversionScore < 78
        ? "Add clearer CTA blocks and inquiry paths on the homepage and service pages."
        : "",
      "Build a monthly review cadence: target fresh, authentic reviews and respond quickly with personalized replies on every major review platform.",
      crawl.averageResponseTimeMs > 1800
        ? "Reduce page weight and response time on slow pages before layering more SEO work on top."
        : "",
      !indexability.hasRobotsTxt
        ? "Publish a clean robots.txt so crawl guidance is explicit instead of implied."
        : "",
      !indexability.hasSitemapXml
        ? "Expose a valid sitemap so indexable URLs are easier for search engines to discover and refresh."
        : "",
    ].filter(Boolean) as string[]
  ).slice(0, 7);

  const modules: WebsiteAuditModule[] = [
    {
      label: "Crawlability & Index Control",
      status: moduleStatus(technicalScore),
      detail: `Robots: ${indexability.hasRobotsTxt ? "yes" : "no"} | Sitemap: ${indexability.hasSitemapXml ? "yes" : "no"} | Broken pages: ${crawl.brokenPages}`,
    },
    {
      label: "On-Page Structure",
      status: moduleStatus(100 - (titleGap * 40 + metaGap * 30 + h1Gap * 30)),
      detail: `${crawl.pagesMissingTitle} missing titles, ${crawl.pagesMissingMeta} missing meta descriptions, ${crawl.pagesMissingH1} missing H1 pages, ${duplicateTitlePages} duplicate-title pages.`,
    },
    {
      label: "Content Depth",
      status: moduleStatus(contentScore),
      detail: `${crawl.pagesWithThinContent} thin pages with an average of ${crawl.averageWordCount} words and weak internal linking on ${Math.round(lowInternalLinksCoverage * pagesCrawled)} page(s).`,
    },
    {
      label: "Trust / EEAT",
      status: moduleStatus(trustScore),
      detail: `About page: ${crawl.aboutPageFound ? "yes" : "no"} | Policy page: ${crawl.policyPageFound ? "yes" : "no"} | Testimonials detected: ${crawl.pagesWithTestimonials > 0 ? "yes" : "no"}.`,
    },
    {
      label: "Local SEO Coverage",
      status: moduleStatus(localScore),
      detail: `${crawl.pagesMentioningLocation}/${pagesCrawled} pages mention location context, with ${locationServicePages} local service page(s) and ${servicePageCount} service URL(s) total.`,
    },
    {
      label: "Entity Schema Completeness (2026)",
      status: moduleStatus(localEntity.localBusinessSchemaCompleteness),
      detail: `LocalBusiness schema detected: ${localEntity.localBusinessSchemaDetected ? "yes" : "no"} | completeness: ${localEntity.localBusinessSchemaCompleteness}% | address: ${localEntity.hasAddressSignal ? "yes" : "no"} | geo: ${localEntity.hasGeoSignal ? "yes" : "no"}.`,
    },
    {
      label: "Reputation Footprint",
      status: moduleStatus(
        clampScore(
          100 -
            (reviewPlatformCount === 0 ? 40 : reviewPlatformCount === 1 ? 24 : reviewPlatformCount === 2 ? 10 : 0) -
            (!localEntity.hasAggregateRatingSignal && crawl.pagesWithTestimonials === 0 ? 18 : 0)
        )
      ),
      detail: `${reviewPlatformCount} linked review platform(s): ${
        reviewPlatformCount > 0 ? localEntity.reviewPlatformMentions.join(", ") : "none"
      }. AggregateRating schema: ${localEntity.hasAggregateRatingSignal ? "yes" : "no"}.`,
    },
    {
      label: "AI / Answer Readiness",
      status: moduleStatus(
        clampScore(100 - (!localEntity.hasFaqSignal ? 28 : 0) - (potentialDoorwayRisk ? 16 : 0) - (1 - localCoverage) * 20)
      ),
      detail: `FAQ signal: ${localEntity.hasFaqSignal ? "yes" : "no"} | doorway risk: ${potentialDoorwayRisk ? "elevated" : "low"} | location coverage: ${percent(crawl.pagesMentioningLocation, pagesCrawled)}%.`,
    },
    {
      label: "Conversion Readiness",
      status: moduleStatus(conversionScore),
      detail: `${crawl.pagesWithCta}/${pagesCrawled} pages show a CTA and ${crawl.pagesWithContactSignals}/${pagesCrawled} pages expose phone or email.`,
    },
  ];

  const evidenceHighlights: WebsiteAuditEvidenceHighlight[] = [
    {
      label: "Pages Crawled",
      value: String(crawl.pagesCrawled),
      detail: `Same-host pages sampled for this audit run.`,
    },
    {
      label: "Robots / Sitemap",
      value: `${indexability.hasRobotsTxt ? "Yes" : "No"} / ${indexability.hasSitemapXml ? "Yes" : "No"}`,
      detail: indexability.sitemapReferencedInRobots
        ? "Sitemap is referenced inside robots.txt."
        : "Robots did not expose a sitemap reference.",
    },
    {
      label: "Entity Schema",
      value: `${localEntity.localBusinessSchemaCompleteness}%`,
      detail: `LocalBusiness schema detected: ${localEntity.localBusinessSchemaDetected ? "yes" : "no"}. Address: ${localEntity.hasAddressSignal ? "yes" : "no"}, geo: ${localEntity.hasGeoSignal ? "yes" : "no"}, hours: ${localEntity.hasOpeningHoursSignal ? "yes" : "no"}.`,
    },
    {
      label: "Contact Coverage",
      value: `${percent(crawl.pagesWithContactSignals, pagesCrawled)}%`,
      detail: `${crawl.pagesWithContactSignals} page(s) expose a visible phone or email signal.`,
    },
    {
      label: "Location Coverage",
      value: `${percent(crawl.pagesMentioningLocation, pagesCrawled)}%`,
      detail: `${crawl.pagesMentioningLocation} page(s) reinforce the city/state context.`,
    },
    {
      label: "Local Service Pages",
      value: String(locationServicePages),
      detail: `${locationServicePages} service page(s) combine service intent with explicit location context.`,
    },
    {
      label: "Review Channels",
      value: String(reviewPlatformCount),
      detail:
        reviewPlatformCount > 0
          ? `Linked profiles detected on ${localEntity.reviewPlatformMentions.join(", ")}.`
          : "No major review platform links were detected in homepage content.",
    },
    {
      label: "Thin Content",
      value: String(crawl.pagesWithThinContent),
      detail: `Average readable copy per page is ${crawl.averageWordCount} words.`,
    },
    {
      label: "CTA Coverage",
      value: `${percent(crawl.pagesWithCta, pagesCrawled)}%`,
      detail: `${crawl.pagesWithCta} page(s) include a visible action cue.`,
    },
    {
      label: "Trust Signals",
      value: `${percent(crawl.pagesWithTrustSignals, pagesCrawled)}%`,
      detail: `${crawl.pagesWithTrustSignals} page(s) surfaced proof-oriented trust language.`,
    },
    {
      label: "FAQ / Answers",
      value: localEntity.hasFaqSignal ? "Yes" : "No",
      detail: "FAQ or Q&A style content helps answer-engine and AI summary visibility in local journeys.",
    },
    {
      label: "Doorway Risk",
      value: potentialDoorwayRisk ? "Elevated" : "Low",
      detail: `${duplicateTitlePages} duplicate-title page(s) and ${thinLocationServicePages} thin location-service page(s) were detected.`,
    },
    {
      label: "Avg Response",
      value: `${crawl.averageResponseTimeMs} ms`,
      detail: `${crawl.brokenPages} page(s) failed or returned a broken response.`,
    },
  ];

  const priorityRoadmap = uniqueStrings(
    [
      crawl.brokenPages > 0
        ? "Repair failed or broken pages first so the site can be crawled and trusted consistently."
        : "",
      !localEntity.localBusinessSchemaDetected || localEntity.localBusinessSchemaCompleteness < 80
        ? "Ship complete LocalBusiness schema (address, geo, hours, phone, sameAs, and ratings fields) on key location pages."
        : "",
      potentialDoorwayRisk
        ? "Consolidate weak location pages and expand each remaining location URL with unique, evidence-backed local service content."
        : "",
      sortedCategories[0]
        ? `Lift ${sortedCategories[0].label.toLowerCase()} next, because it is the current score bottleneck.`
        : "",
      sortedCategories[1]
        ? `Then fix ${sortedCategories[1].label.toLowerCase()} so the site stops leaking relevance and trust.`
        : "",
      sortedCategories[2]
        ? `Use the final phase to improve ${sortedCategories[2].label.toLowerCase()} and tighten lead capture.`
        : "",
    ].filter(Boolean) as string[]
  ).slice(0, 3);

  const summary = buildSummary({
    targetName: crawl.targetName,
    pagesCrawled,
    verdict,
    weakestCategory,
  });

  const audit: WebsiteAuditResult = {
    auditVersion: "advanced",
    score,
    verdict,
    summary,
    issues: typedIssues,
    wins,
    recommendations,
    metrics: {
      normalizedUrl: crawl.normalizedUrl,
      title: cleanText(homePage?.title),
      titleLength: cleanText(homePage?.title).length,
      metaDescriptionLength: cleanText(homePage?.metaDescription).length,
      h1Count: homePage?.h1Count || 0,
      internalLinks: homePage?.internalLinkCount || 0,
      wordCount: homePage?.wordCount || 0,
      hasViewport: Boolean(homePage?.hasViewport),
      hasCanonical: Boolean(homePage?.hasCanonical),
      hasSchema: Boolean(homePage?.hasSchema),
      hasPhone: Boolean(homePage?.hasPhone),
      hasEmail: Boolean(homePage?.hasEmail),
      imagesCount: homePage?.imagesCount || 0,
      imagesWithoutAlt: homePage?.imagesWithoutAlt || 0,
      mentionsLocation: Boolean(homePage?.mentionsLocation),
      pagesCrawled: crawl.pagesCrawled,
      pagesWithSchema: crawl.pagesWithSchema,
      pagesWithContactSignals: crawl.pagesWithContactSignals,
      pagesWithThinContent: crawl.pagesWithThinContent,
      pagesMissingTitle: crawl.pagesMissingTitle,
      pagesMissingMeta: crawl.pagesMissingMeta,
      pagesMissingH1: crawl.pagesMissingH1,
      pagesWithCanonical: crawl.pagesWithCanonical,
      pagesWithViewport: crawl.pagesWithViewport,
      pagesWithCta: crawl.pagesWithCta,
      pagesWithTrustSignals: crawl.pagesWithTrustSignals,
      pagesWithTestimonials: crawl.pagesWithTestimonials,
      pagesMentioningLocation: crawl.pagesMentioningLocation,
      averageWordCount: crawl.averageWordCount,
      averageResponseTimeMs: crawl.averageResponseTimeMs,
      brokenPages: crawl.brokenPages,
      usesHttps: indexability.usesHttps,
      hasRobotsTxt: indexability.hasRobotsTxt,
      hasSitemapXml: indexability.hasSitemapXml,
      sitemapReferencedInRobots: indexability.sitemapReferencedInRobots,
      aboutPageFound: crawl.aboutPageFound,
      contactPageFound: crawl.contactPageFound,
      policyPageFound: crawl.policyPageFound,
      servicePageCount,
      locationServicePages,
      localBusinessSchemaDetected: localEntity.localBusinessSchemaDetected,
      localBusinessSchemaCompleteness: localEntity.localBusinessSchemaCompleteness,
      hasAddressSignal: localEntity.hasAddressSignal,
      hasGeoSignal: localEntity.hasGeoSignal,
      hasOpeningHoursSignal: localEntity.hasOpeningHoursSignal,
      hasSameAsSignal: localEntity.hasSameAsSignal,
      hasAggregateRatingSignal: localEntity.hasAggregateRatingSignal,
      faqSignalsDetected: localEntity.hasFaqSignal,
      reviewPlatformMentionsCount: reviewPlatformCount,
      reviewPlatformMentions: localEntity.reviewPlatformMentions,
      duplicateTitlePages,
      potentialDoorwayRisk,
      scoringCategoryWeights: categoryWeights,
      scoringLocalFactorWeights: localFactorWeights,
      // New fields (computed from home page)
      h2Count: homePage ? (homePage as any).h2Count ?? 0 : 0,
      altTextCoveragePercent: homePage && homePage.imagesCount > 0
        ? Math.round(((homePage.imagesCount - homePage.imagesWithoutAlt) / homePage.imagesCount) * 100)
        : 100,
    },
    categories,
    modules,
    evidenceHighlights,
    priorityRoadmap,
    topPages: topProblemPages(crawl.pages),
  };

  return {
    audit,
    crawl,
  };
}