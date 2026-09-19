import { jsPDF } from "jspdf";
import type { SeoCrawlPage } from "./api";
import { drawFramedPdfLogo, getPdfBranding } from "./pdfBranding";

export type CrawlerReportSeverity = "error" | "warning" | "info";
export type CrawlerReportSeverityFilter = "all" | CrawlerReportSeverity;
export type CrawlerReportTab = "crawler" | "urls" | "sitemap";

export type CrawlerReportCheck = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  title: string;
  description: string;
  severity: CrawlerReportSeverity;
  affectedUrls: string[];
  count: number;
};

export type CrawlerReportSection = {
  id: string;
  title: string;
  checks: CrawlerReportCheck[];
  totalChecks: number;
  passedChecks: number;
  issueCount: number;
};

export type CrawlerReportModel = {
  generatedAt: string;
  checks: CrawlerReportCheck[];
  sections: CrawlerReportSection[];
  totals: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
    totalChecks: number;
    passedChecks: number;
    health: number;
  };
};

type CrawlerReportCompareContext = {
  currentRunAt?: string;
  baselineRunAt?: string;
};

type CheckDefinition = {
  id: string;
  sectionId: string;
  title: string;
  description: string;
  severity: CrawlerReportSeverity;
  resolveUrls: (ctx: BuildContext) => string[];
};

type BuildContext = {
  pages: SeoCrawlPage[];
  duplicateTitleUrls: Set<string>;
  duplicateDescriptionUrls: Set<string>;
};

type SectionDefinition = {
  id: string;
  title: string;
};

const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: "internal-pages", title: "Internal Pages" },
  { id: "indexability", title: "Indexability" },
  { id: "links", title: "Links" },
  { id: "redirects", title: "Redirects" },
  { id: "content", title: "Content" },
  { id: "images", title: "Images" },
  { id: "javascript", title: "JavaScript" },
  { id: "css", title: "CSS" },
  { id: "social-tags", title: "Social Tags" },
  { id: "localization", title: "Localization" },
  { id: "sitemaps", title: "Sitemaps" },
  { id: "url-issues", title: "URL Issues" },
];

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toBool(value: unknown): boolean {
  return value === true;
}

function normalizeComparableUrl(value: string): string {
  const parsed = parseUrl(value);
  if (!parsed) {
    return cleanText(value);
  }

  const pathname = parsed.pathname.endsWith("/") && parsed.pathname !== "/"
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname;

  return `${parsed.protocol}//${parsed.hostname}${pathname}${parsed.search}`;
}

function collectDuplicateUrlSet(
  pages: SeoCrawlPage[],
  valueSelector: (page: SeoCrawlPage) => string
): Set<string> {
  const map = new Map<string, string[]>();

  for (const page of pages) {
    const raw = valueSelector(page);
    const key = cleanText(raw).toLowerCase();
    if (!key) {
      continue;
    }

    const urls = map.get(key) || [];
    urls.push(page.url);
    map.set(key, urls);
  }

  const duplicates = new Set<string>();
  for (const urls of map.values()) {
    if (urls.length > 1) {
      for (const url of urls) {
        duplicates.add(url);
      }
    }
  }

  return duplicates;
}

function urlsByPredicate(ctx: BuildContext, predicate: (page: SeoCrawlPage) => boolean): string[] {
  const matched = ctx.pages.filter(predicate).map((page) => page.url);
  return unique(matched);
}

function isHttpsToHttpCanonical(page: SeoCrawlPage): boolean {
  const pageUrl = parseUrl(page.url);
  const canonicalUrl = parseUrl(cleanText(page.canonical_url));

  return Boolean(pageUrl && canonicalUrl && pageUrl.protocol === "https:" && canonicalUrl.protocol === "http:");
}

function isNotSelfReferencingCanonical(page: SeoCrawlPage): boolean {
  const canonical = cleanText(page.canonical_url);
  if (!canonical) {
    return false;
  }

  return normalizeComparableUrl(canonical) !== normalizeComparableUrl(page.url);
}

function getPathnameLength(urlValue: string): number {
  const parsed = parseUrl(urlValue);
  if (!parsed) {
    return urlValue.length;
  }

  return parsed.pathname.length;
}

function urlHasDoubleSlashInPath(urlValue: string): boolean {
  const parsed = parseUrl(urlValue);
  const pathname = parsed ? parsed.pathname : urlValue;
  return /\/\//.test(pathname);
}

const CHECK_DEFINITIONS: CheckDefinition[] = [
  {
    id: "internal-4xx",
    sectionId: "internal-pages",
    title: "4XX Errors",
    description: "Pages returning 4XX client errors",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => (page.status_code || 0) >= 400 && (page.status_code || 0) < 500),
  },
  {
    id: "internal-5xx",
    sectionId: "internal-pages",
    title: "5XX Errors",
    description: "Pages returning 5XX server errors",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => (page.status_code || 0) >= 500),
  },
  {
    id: "internal-timeout",
    sectionId: "internal-pages",
    title: "Timed Out",
    description: "Pages that timed out during crawl",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => page.status_code === null),
  },
  {
    id: "internal-mixed-content",
    sectionId: "internal-pages",
    title: "Mixed Content",
    description: "HTTPS pages with HTTP resources",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => isHttpsToHttpCanonical(page)),
  },

  {
    id: "index-noindex",
    sectionId: "indexability",
    title: "Noindex Page",
    description: "Page has noindex directive",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.noindex)),
  },
  {
    id: "index-nofollow",
    sectionId: "indexability",
    title: "Nofollow Page",
    description: "Page has nofollow directive",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.nofollow)),
  },
  {
    id: "index-noindex-nofollow",
    sectionId: "indexability",
    title: "Noindex & Nofollow",
    description: "Page has both noindex and nofollow",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.noindex) && toBool(page.nofollow)),
  },
  {
    id: "index-canonical-redirect",
    sectionId: "indexability",
    title: "Canonical to Redirect",
    description: "Canonical points to a redirecting URL",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.canonical_to_redirect)),
  },
  {
    id: "index-canonical-protocol-mismatch",
    sectionId: "indexability",
    title: "Canonical HTTP/HTTPS Mismatch",
    description: "Canonical protocol differs from page",
    severity: "info",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => {
      const canonical = parseUrl(cleanText(page.canonical_url));
      const current = parseUrl(page.url);
      return Boolean(canonical && current && canonical.protocol !== current.protocol);
    }),
  },
  {
    id: "index-not-self-referencing",
    sectionId: "indexability",
    title: "Not Self-Referencing",
    description: "Canonical does not point to itself",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => isNotSelfReferencingCanonical(page)),
  },
  {
    id: "index-missing-canonical",
    sectionId: "indexability",
    title: "Missing Canonical",
    description: "No canonical tag present",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => !page.has_canonical),
  },
  {
    id: "index-multiple-canonicals",
    sectionId: "indexability",
    title: "Multiple Canonicals",
    description: "More than one canonical tag",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.canonical_tag_count) > 1),
  },

  {
    id: "links-orphan",
    sectionId: "links",
    title: "Orphan Pages",
    description: "Pages with no incoming internal links",
    severity: "error",
    resolveUrls: (ctx) =>
      urlsByPredicate(ctx, (page) =>
        typeof page.is_orphan === "boolean" ? page.is_orphan : page.depth > 0 && toNumber(page.incoming_internal_count) === 0
      ),
  },
  {
    id: "links-broken",
    sectionId: "links",
    title: "Links to Broken Pages",
    description: "Page links to 4XX/5XX pages",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.links_to_broken_pages_count) > 0),
  },
  {
    id: "links-redirects",
    sectionId: "links",
    title: "Links to Redirects",
    description: "Page links to redirecting URLs",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.links_to_redirect_pages_count) > 0),
  },
  {
    id: "links-no-outgoing",
    sectionId: "links",
    title: "No Outgoing Links",
    description: "Page has no outbound links",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.outgoing_internal_count || page.internal_link_count) === 0),
  },
  {
    id: "links-one-incoming",
    sectionId: "links",
    title: "Only 1 Incoming Link",
    description: "Page has only one internal link pointing to it",
    severity: "info",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.incoming_internal_count) === 1),
  },
  {
    id: "links-nofollow-incoming-only",
    sectionId: "links",
    title: "Nofollow Incoming Only",
    description: "All incoming links are nofollow",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.only_nofollow_incoming)),
  },
  {
    id: "links-https-to-http",
    sectionId: "links",
    title: "HTTPS Links to HTTP",
    description: "Secure page links insecure page",
    severity: "error",
    resolveUrls: (ctx) =>
      urlsByPredicate(
        ctx,
        (page) => toNumber(page.https_links_to_http_count) > 0 || isHttpsToHttpCanonical(page)
      ),
  },

  {
    id: "redirects-3xx",
    sectionId: "redirects",
    title: "3XX Redirects",
    description: "Pages that redirect",
    severity: "error",
    resolveUrls: (ctx) =>
      urlsByPredicate(
        ctx,
        (page) => ((page.status_code || 0) >= 300 && (page.status_code || 0) < 400) || toBool(page.was_redirected)
      ),
  },
  {
    id: "redirects-302",
    sectionId: "redirects",
    title: "302 Temporary",
    description: "302 redirects should usually be 301",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => page.status_code === 302),
  },
  {
    id: "redirects-chain",
    sectionId: "redirects",
    title: "Redirect Chain",
    description: "URL redirects through multiple hops",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.redirect_chain)),
  },
  {
    id: "redirects-loop",
    sectionId: "redirects",
    title: "Redirect Loop",
    description: "URL creates a redirect loop",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.redirect_loop)),
  },
  {
    id: "redirects-meta-refresh",
    sectionId: "redirects",
    title: "Meta Refresh",
    description: "Page uses meta refresh redirect",
    severity: "info",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.meta_refresh)),
  },

  {
    id: "content-missing-title",
    sectionId: "content",
    title: "Missing Title",
    description: "Page has no title tag",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => !cleanText(page.title)),
  },
  {
    id: "content-duplicate-title",
    sectionId: "content",
    title: "Duplicate Title",
    description: "Same title on multiple pages",
    severity: "warning",
    resolveUrls: (ctx) => unique(Array.from(ctx.duplicateTitleUrls)),
  },
  {
    id: "content-title-too-long",
    sectionId: "content",
    title: "Title Too Long",
    description: "Title exceeds 60 characters",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => cleanText(page.title).length > 60),
  },
  {
    id: "content-title-too-short",
    sectionId: "content",
    title: "Title Too Short",
    description: "Title under 30 characters",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => {
      const len = cleanText(page.title).length;
      return len > 0 && len < 30;
    }),
  },
  {
    id: "content-multiple-titles",
    sectionId: "content",
    title: "Multiple Titles",
    description: "More than one title tag",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.title_tag_count) > 1),
  },
  {
    id: "content-missing-description",
    sectionId: "content",
    title: "Missing Description",
    description: "No meta description",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => !cleanText(page.meta_description)),
  },
  {
    id: "content-duplicate-description",
    sectionId: "content",
    title: "Duplicate Description",
    description: "Same description on multiple pages",
    severity: "warning",
    resolveUrls: (ctx) => unique(Array.from(ctx.duplicateDescriptionUrls)),
  },
  {
    id: "content-description-too-long",
    sectionId: "content",
    title: "Description Too Long",
    description: "Description exceeds 155 characters",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => cleanText(page.meta_description).length > 155),
  },
  {
    id: "content-description-too-short",
    sectionId: "content",
    title: "Description Too Short",
    description: "Description under 70 characters",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => {
      const len = cleanText(page.meta_description).length;
      return len > 0 && len < 70;
    }),
  },
  {
    id: "content-multiple-descriptions",
    sectionId: "content",
    title: "Multiple Descriptions",
    description: "More than one meta description",
    severity: "info",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.meta_description_count) > 1),
  },
  {
    id: "content-missing-h1",
    sectionId: "content",
    title: "Missing H1",
    description: "Page has no H1 tag",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => page.h1_count === 0),
  },
  {
    id: "content-multiple-h1",
    sectionId: "content",
    title: "Multiple H1s",
    description: "Page has more than one H1",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => page.h1_count > 1),
  },
  {
    id: "content-low-word-count",
    sectionId: "content",
    title: "Low Word Count",
    description: "Page has fewer than 300 words",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => page.word_count > 0 && page.word_count < 300),
  },

  {
    id: "images-missing-alt",
    sectionId: "images",
    title: "Missing Alt Text",
    description: "Images without alt attributes",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => page.images_without_alt > 0),
  },
  {
    id: "images-alt-over-100",
    sectionId: "images",
    title: "Alt Over 100 Characters",
    description: "Alt text too long",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.image_alt_over_100_count) > 0),
  },
  {
    id: "images-broken",
    sectionId: "images",
    title: "Broken Image",
    description: "Image returns 4XX/5XX error",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.broken_image_count) > 0),
  },
  {
    id: "images-large",
    sectionId: "images",
    title: "Large Image File",
    description: "Image file over 200KB",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.large_image_count) > 0),
  },
  {
    id: "images-https-http",
    sectionId: "images",
    title: "HTTPS Links to HTTP Image",
    description: "Secure page loads insecure image",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.https_links_to_http_image_count) > 0),
  },
  {
    id: "images-redirects",
    sectionId: "images",
    title: "Image Redirects",
    description: "Image URL redirects",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.redirected_image_count) > 0),
  },

  {
    id: "javascript-broken",
    sectionId: "javascript",
    title: "Broken JavaScript",
    description: "JS file returns error",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.broken_js_count) > 0),
  },
  {
    id: "javascript-https-http",
    sectionId: "javascript",
    title: "HTTPS Links to HTTP JS",
    description: "Secure page loads insecure script",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.https_links_to_http_js_count) > 0),
  },
  {
    id: "javascript-redirects",
    sectionId: "javascript",
    title: "JavaScript Redirects",
    description: "JS file URL redirects",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.redirected_js_count) > 0),
  },
  {
    id: "javascript-large",
    sectionId: "javascript",
    title: "Large JS File",
    description: "JavaScript file over 500KB",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.large_js_count) > 0),
  },

  {
    id: "css-broken",
    sectionId: "css",
    title: "Broken CSS",
    description: "CSS file returns error",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.broken_css_count) > 0),
  },
  {
    id: "css-https-http",
    sectionId: "css",
    title: "HTTPS Links to HTTP CSS",
    description: "Secure page loads insecure stylesheet",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.https_links_to_http_css_count) > 0),
  },
  {
    id: "css-redirects",
    sectionId: "css",
    title: "CSS Redirects",
    description: "CSS file URL redirects",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.redirected_css_count) > 0),
  },
  {
    id: "css-large",
    sectionId: "css",
    title: "Large CSS File",
    description: "CSS file over 200KB",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.large_css_count) > 0),
  },

  {
    id: "social-missing-og",
    sectionId: "social-tags",
    title: "Missing Open Graph",
    description: "No Open Graph tags found",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => !toBool(page.has_open_graph)),
  },
  {
    id: "social-incomplete-og",
    sectionId: "social-tags",
    title: "Incomplete Open Graph",
    description: "Missing required OG properties",
    severity: "warning",
    resolveUrls: (ctx) =>
      urlsByPredicate(ctx, (page) => toBool(page.has_open_graph) && !toBool(page.open_graph_complete)),
  },
  {
    id: "social-og-url-mismatch",
    sectionId: "social-tags",
    title: "OG URL Mismatch",
    description: "og:url does not match canonical",
    severity: "warning",
    resolveUrls: (ctx) =>
      urlsByPredicate(ctx, (page) => {
        const ogUrl = cleanText(page.open_graph_url);
        const canonicalUrl = cleanText(page.canonical_url);
        if (!ogUrl || !canonicalUrl) {
          return false;
        }

        return normalizeComparableUrl(ogUrl) !== normalizeComparableUrl(canonicalUrl);
      }),
  },
  {
    id: "social-missing-twitter",
    sectionId: "social-tags",
    title: "Missing Twitter Card",
    description: "No Twitter Card tags found",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => !toBool(page.has_twitter_card)),
  },
  {
    id: "social-incomplete-twitter",
    sectionId: "social-tags",
    title: "Incomplete Twitter Card",
    description: "Missing required Twitter properties",
    severity: "warning",
    resolveUrls: (ctx) =>
      urlsByPredicate(ctx, (page) => toBool(page.has_twitter_card) && !toBool(page.twitter_card_complete)),
  },

  {
    id: "localization-missing-lang",
    sectionId: "localization",
    title: "Missing Lang Attribute",
    description: "HTML tag missing lang attribute",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => !cleanText(page.lang_attribute)),
  },
  {
    id: "localization-invalid-lang",
    sectionId: "localization",
    title: "Invalid Lang",
    description: "Lang attribute has invalid format",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.invalid_lang_attribute)),
  },
  {
    id: "localization-invalid-hreflang",
    sectionId: "localization",
    title: "Invalid Hreflang",
    description: "Hreflang tag has invalid format",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toNumber(page.invalid_hreflang_count) > 0),
  },
  {
    id: "localization-hreflang-missing-self",
    sectionId: "localization",
    title: "Hreflang Missing Self",
    description: "Hreflang missing self-reference",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.hreflang_missing_self)),
  },
  {
    id: "localization-missing-x-default",
    sectionId: "localization",
    title: "Missing X-Default",
    description: "Hreflang group missing x-default",
    severity: "warning",
    resolveUrls: (ctx) =>
      urlsByPredicate(ctx, (page) => toNumber(page.hreflang_count) > 0 && !toBool(page.has_x_default_hreflang)),
  },
  {
    id: "localization-hreflang-lang-mismatch",
    sectionId: "localization",
    title: "Hreflang/Lang Mismatch",
    description: "Hreflang conflicts with HTML lang",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.hreflang_lang_mismatch)),
  },

  {
    id: "sitemap-3xx",
    sectionId: "sitemaps",
    title: "3XX in Sitemap",
    description: "Sitemap contains redirecting URLs",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.in_sitemap) && toBool(page.sitemap_is_redirect)),
  },
  {
    id: "sitemap-4xx",
    sectionId: "sitemaps",
    title: "4XX in Sitemap",
    description: "Sitemap contains broken URLs",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.in_sitemap) && (page.sitemap_status || 0) >= 400 && (page.sitemap_status || 0) < 500),
  },
  {
    id: "sitemap-5xx",
    sectionId: "sitemaps",
    title: "5XX in Sitemap",
    description: "Sitemap contains server error URLs",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.in_sitemap) && (page.sitemap_status || 0) >= 500),
  },
  {
    id: "sitemap-noindex",
    sectionId: "sitemaps",
    title: "Noindex in Sitemap",
    description: "Sitemap contains noindex pages",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.in_sitemap) && toBool(page.sitemap_is_noindex)),
  },
  {
    id: "sitemap-non-canonical",
    sectionId: "sitemaps",
    title: "Non-Canonical in Sitemap",
    description: "Sitemap contains non-canonical URLs",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => toBool(page.in_sitemap) && toBool(page.sitemap_is_non_canonical)),
  },

  {
    id: "url-uppercase",
    sectionId: "url-issues",
    title: "Uppercase URLs",
    description: "URLs should be lowercase",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => /[A-Z]/.test(page.url)),
  },
  {
    id: "url-underscore",
    sectionId: "url-issues",
    title: "Underscore URLs",
    description: "URLs should use hyphens",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => /_/.test(page.url)),
  },
  {
    id: "url-too-long",
    sectionId: "url-issues",
    title: "Long URLs",
    description: "URLs over 115 characters",
    severity: "warning",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => getPathnameLength(page.url) > 115),
  },
  {
    id: "url-double-slash",
    sectionId: "url-issues",
    title: "Double Slash in URL",
    description: "URL contains // in path",
    severity: "error",
    resolveUrls: (ctx) => urlsByPredicate(ctx, (page) => urlHasDoubleSlashInPath(page.url)),
  },
];

export function buildCrawlerReportModel(pages: SeoCrawlPage[]): CrawlerReportModel {
  const safePages = Array.isArray(pages) ? pages : [];

  const context: BuildContext = {
    pages: safePages,
    duplicateTitleUrls: collectDuplicateUrlSet(safePages, (page) => page.title),
    duplicateDescriptionUrls: collectDuplicateUrlSet(safePages, (page) => page.meta_description),
  };

  const checks: CrawlerReportCheck[] = CHECK_DEFINITIONS.map((definition) => {
    const affectedUrls = unique(definition.resolveUrls(context));
    return {
      id: definition.id,
      sectionId: definition.sectionId,
      sectionTitle: SECTION_DEFINITIONS.find((section) => section.id === definition.sectionId)?.title || definition.sectionId,
      title: definition.title,
      description: definition.description,
      severity: definition.severity,
      affectedUrls,
      count: affectedUrls.length,
    };
  });

  const sections: CrawlerReportSection[] = SECTION_DEFINITIONS.map((section) => {
    const sectionChecks = checks.filter((check) => check.sectionId === section.id);
    const totalChecks = sectionChecks.length;
    const passedChecks = sectionChecks.filter((check) => check.count === 0).length;
    const issueCount = sectionChecks.reduce((sum, check) => sum + check.count, 0);

    return {
      id: section.id,
      title: section.title,
      checks: sectionChecks,
      totalChecks,
      passedChecks,
      issueCount,
    };
  });

  const errors = checks.filter((check) => check.severity === "error").reduce((sum, check) => sum + check.count, 0);
  const warnings = checks
    .filter((check) => check.severity === "warning")
    .reduce((sum, check) => sum + check.count, 0);
  const info = checks.filter((check) => check.severity === "info").reduce((sum, check) => sum + check.count, 0);
  const total = errors + warnings + info;

  const totalChecks = checks.length;
  const passedChecks = checks.filter((check) => check.count === 0).length;
  const health = totalChecks <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((passedChecks / totalChecks) * 100)));

  return {
    generatedAt: new Date().toISOString(),
    checks,
    sections,
    totals: {
      total,
      errors,
      warnings,
      info,
      totalChecks,
      passedChecks,
      health,
    },
  };
}

export function filterSectionsForView(
  report: CrawlerReportModel,
  tab: CrawlerReportTab,
  severityFilter: CrawlerReportSeverityFilter
): CrawlerReportSection[] {
  const urlFocusedSectionIds = new Set([
    "indexability",
    "links",
    "redirects",
    "content",
    "images",
    "javascript",
    "css",
    "social-tags",
    "localization",
    "url-issues",
  ]);

  const tabFiltered = report.sections.filter((section) => {
    if (tab === "crawler") {
      return true;
    }

    if (tab === "urls") {
      return urlFocusedSectionIds.has(section.id);
    }

    return section.id === "sitemaps";
  });

  if (severityFilter === "all") {
    return tabFiltered;
  }

  const filtered = tabFiltered
    .map((section) => {
      const checks = section.checks.filter((check) => check.severity === severityFilter);
      const totalChecks = checks.length;
      const passedChecks = checks.filter((check) => check.count === 0).length;
      const issueCount = checks.reduce((sum, check) => sum + check.count, 0);

      return {
        ...section,
        checks,
        totalChecks,
        passedChecks,
        issueCount,
      };
    })
    .filter((section) => section.checks.length > 0);

  return filtered;
}

export function downloadCrawlerReportCsv(
  report: CrawlerReportModel,
  sections: CrawlerReportSection[],
  targetName: string
): void {
  const headers = ["Section", "Check", "Severity", "Count", "Description", "Affected URLs"];
  const rows = sections.flatMap((section) =>
    section.checks.map((check) => [
      section.title,
      check.title,
      check.severity,
      String(check.count),
      check.description,
      check.affectedUrls.join(" | "),
    ])
  );

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${slugify(targetName || "website")}-audit-checks.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);

  void report;
}

function buildIssueCountByUrl(report: CrawlerReportModel): Map<string, number> {
  const countByUrl = new Map<string, number>();
  for (const check of report.checks) {
    if (check.count <= 0) {
      continue;
    }

    for (const url of check.affectedUrls) {
      const current = countByUrl.get(url) || 0;
      countByUrl.set(url, current + 1);
    }
  }

  return countByUrl;
}

function buildCheckCountById(report: CrawlerReportModel): Map<string, number> {
  const countById = new Map<string, number>();
  for (const check of report.checks) {
    countById.set(check.id, check.count);
  }

  return countById;
}

function formatDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}

function formatTimestampForExport(value: string | undefined): string {
  const parsed = Date.parse(cleanText(value));
  if (!Number.isFinite(parsed)) {
    return "--";
  }

  return new Date(parsed).toLocaleString();
}

export function downloadScreamingFrogCsv(
  pages: SeoCrawlPage[],
  report: CrawlerReportModel,
  targetName: string,
  previousReport?: CrawlerReportModel,
  compareContext?: CrawlerReportCompareContext
): void {
  const issueCountByUrl = buildIssueCountByUrl(report);
  const previousIssueCountByUrl = previousReport ? buildIssueCountByUrl(previousReport) : null;
  const currentRunAt = formatTimestampForExport(compareContext?.currentRunAt || report.generatedAt);
  const baselineRunAt = previousReport
    ? formatTimestampForExport(compareContext?.baselineRunAt || previousReport.generatedAt)
    : "--";
  const headers = [
    "URL",
    "Status Code",
    "Title",
    "Meta Description",
    "H1 Count",
    "Word Count",
    "Canonical",
    "Noindex",
    "Response Time (ms)",
    "Issue Count",
    ...(previousIssueCountByUrl ? ["Previous Issue Count", "Issue Delta", "Current Run At", "Baseline Run At"] : []),
  ];

  const rows = pages.map((page) => {
    const currentIssueCount = issueCountByUrl.get(page.url) || 0;
    const row: Array<string | number> = [
      page.url,
      page.status_code ?? "",
      cleanText(page.title),
      cleanText(page.meta_description),
      page.h1_count ?? 0,
      page.word_count ?? 0,
      cleanText(page.canonical_url),
      page.noindex ? "Yes" : "No",
      page.response_time_ms ?? "",
      currentIssueCount,
    ];

    if (previousIssueCountByUrl) {
      const previousIssueCount = previousIssueCountByUrl.get(page.url) || 0;
      row.push(previousIssueCount, currentIssueCount - previousIssueCount, currentRunAt, baselineRunAt);
    }

    return row;
  });

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${slugify(targetName || "website")}-screaming-frog-style.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function suggestFixForCheck(check: CrawlerReportCheck): string {
  if (check.id.includes("4xx") || check.id.includes("broken")) {
    return "Update internal links, restore missing URLs, or implement correct 301 redirects.";
  }

  if (check.id.includes("5xx") || check.id.includes("timeout")) {
    return "Investigate server stability and optimize slow templates or APIs affecting crawl responses.";
  }

  if (check.id.includes("title") || check.id.includes("meta") || check.id.includes("h1")) {
    return "Add unique metadata and heading structure aligned to page intent and keywords.";
  }

  if (check.id.includes("canonical")) {
    return "Set one canonical per page and ensure it points to the final preferred URL.";
  }

  if (check.id.includes("alt") || check.id.includes("image")) {
    return "Add descriptive alt text and compress or modernize oversized image assets.";
  }

  if (check.id.includes("sitemap")) {
    return "Keep only indexable canonical URLs in XML sitemaps and return 200 status for each entry.";
  }

  return "Review the flagged pages and resolve this issue based on SEO best-practice for this check.";
}

function buildIssueDetailForUrl(check: CrawlerReportCheck, page: SeoCrawlPage | undefined): string {
  if (!page) {
    return check.description;
  }

  if (check.id === "internal-4xx" || check.id === "internal-5xx") {
    return `HTTP status ${page.status_code ?? "unknown"} returned for this page.`;
  }

  if (check.id === "content-missing-title") {
    return "Title tag is missing or empty.";
  }

  if (check.id === "content-missing-meta") {
    return "Meta description is missing or empty.";
  }

  if (check.id === "content-missing-h1") {
    return "No H1 tag was detected on this page.";
  }

  if (check.id === "images-missing-alt") {
    return `${page.images_without_alt || 0} image(s) are missing alt text.`;
  }

  if (check.id === "index-noindex") {
    return "Page carries a noindex directive.";
  }

  return cleanText(page.page_summary) || check.description;
}

export function downloadCrawlerIssueCsv(
  sections: CrawlerReportSection[],
  pages: SeoCrawlPage[],
  targetName: string,
  previousReport?: CrawlerReportModel,
  compareContext?: CrawlerReportCompareContext
): void {
  const pageByUrl = new Map(pages.map((page) => [page.url, page]));
  const previousCheckCountById = previousReport ? buildCheckCountById(previousReport) : null;
  const currentRunAt = formatTimestampForExport(compareContext?.currentRunAt || "");
  const baselineRunAt = formatTimestampForExport(compareContext?.baselineRunAt || "");
  const headers = [
    "Category",
    "Issue",
    "Severity",
    "Affected URL",
    "Status Code",
    "Issue Detail",
    "Fix Suggestion",
    ...(previousCheckCountById ? ["Previous Issue Count", "Issue Delta", "Current Run At", "Baseline Run At"] : []),
  ];

  const rows: Array<Array<string | number>> = [];
  for (const section of sections) {
    for (const check of section.checks) {
      if (check.count <= 0) {
        continue;
      }

      for (const url of check.affectedUrls) {
        const page = pageByUrl.get(url);
        const row: Array<string | number> = [
          section.title,
          check.title,
          check.severity,
          url,
          page?.status_code ?? "",
          buildIssueDetailForUrl(check, page),
          suggestFixForCheck(check),
        ];

        if (previousCheckCountById) {
          const previousIssueCount = previousCheckCountById.get(check.id) || 0;
          row.push(previousIssueCount, check.count - previousIssueCount, currentRunAt, baselineRunAt);
        }

        rows.push(row);
      }
    }
  }

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${slugify(targetName || "website")}-issues.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export function downloadCrawlerReportJson(
  report: CrawlerReportModel,
  pages: SeoCrawlPage[],
  targetName: string
): void {
  const payload = {
    target: targetName,
    generatedAt: report.generatedAt,
    totals: report.totals,
    sections: report.sections,
    pages,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${slugify(targetName || "website")}-full-audit-report.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function slugify(value: string): string {
  const text = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return text || "report";
}

export async function downloadCrawlerReportPdf(
  report: CrawlerReportModel,
  sections: CrawlerReportSection[],
  targetName: string,
  targetUrl: string,
  previousReport?: CrawlerReportModel,
  compareContext?: CrawlerReportCompareContext
): Promise<void> {
  const branding = await getPdfBranding();
  const agencyName = cleanText(branding.agencyName) || "SMBify OS";

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 42;
  const lineWidth = pageWidth - marginX * 2;
  let y = 46;

  function ensureSpace(lines: number, lineHeight: number): void {
    if (y + lines * lineHeight > pageHeight - 40) {
      doc.addPage();
      y = 46;
    }
  }

  function writeText(
    text: string,
    size = 11,
    bold = false,
    options?: { color?: [number, number, number]; x?: number }
  ): void {
    const x = options?.x ?? marginX;
    const width = Math.max(120, pageWidth - x - marginX);
    const lines = doc.splitTextToSize(text, width);
    const lineHeight = size + 4;
    ensureSpace(lines.length, lineHeight);

    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const color = options?.color || [15, 23, 42];
    doc.setTextColor(color[0], color[1], color[2]);

    for (const line of lines) {
      doc.text(line, x, y);
      y += lineHeight;
    }
  }

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 102, "F");

  let headerTextX = marginX;
  if (drawFramedPdfLogo(doc, branding.logoDataUrl, marginX, 34, 34)) {
    headerTextX = marginX + 48;
  }

  y = 48;
  writeText(`${agencyName} Website Audit Report`, 18, true, {
    color: [255, 255, 255],
    x: headerTextX,
  });
  writeText(`Target: ${targetName || "Website"}`, 10, false, {
    color: [255, 255, 255],
    x: headerTextX,
  });
  writeText(`URL: ${targetUrl || "--"}`, 10, false, {
    color: [255, 255, 255],
    x: headerTextX,
  });
  writeText(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, 10, false, {
    color: [255, 255, 255],
    x: headerTextX,
  });

  y = Math.max(y + 6, 122);

  const currentRunAt = formatTimestampForExport(compareContext?.currentRunAt || report.generatedAt);
  writeText(`Current run timestamp: ${currentRunAt}`, 10, false);
  y += 6;

  writeText(`Health: ${report.totals.health}%`, 12, true);
  writeText(`Errors: ${report.totals.errors} | Warnings: ${report.totals.warnings} | Info: ${report.totals.info}`, 10, false);
  writeText(`Checks Passed: ${report.totals.passedChecks}/${report.totals.totalChecks}`, 10, false);

  const previousCheckCountById = previousReport ? buildCheckCountById(previousReport) : null;
  if (previousReport) {
    const baselineRunAt = formatTimestampForExport(compareContext?.baselineRunAt || previousReport.generatedAt);
    const healthDelta = report.totals.health - previousReport.totals.health;
    const issueDelta = report.totals.total - previousReport.totals.total;

    writeText(`Baseline run timestamp: ${baselineRunAt}`, 10, false);
    writeText(
      `Compare vs previous: Health ${previousReport.totals.health}% -> ${report.totals.health}% (${formatDelta(healthDelta)})`,
      10,
      false
    );
    writeText(
      `Total issues ${previousReport.totals.total} -> ${report.totals.total} (${formatDelta(issueDelta)})`,
      10,
      false
    );
  }

  y += 10;

  for (const section of sections) {
    writeText(section.title, 13, true);
    writeText(`${section.passedChecks}/${section.totalChecks} checks passed | ${section.issueCount} issues`, 9, false);

    for (const check of section.checks) {
      const severity = check.severity.toUpperCase();
      if (previousCheckCountById) {
        const previousCount = previousCheckCountById.get(check.id) || 0;
        const delta = check.count - previousCount;
        writeText(
          `[${severity}] ${check.title} - Current: ${check.count} | Previous: ${previousCount} | Delta: ${formatDelta(delta)}`,
          10,
          true
        );
      } else {
        writeText(`[${severity}] ${check.title} - ${check.count} pages`, 10, true);
      }

      writeText(check.description, 9, false);

      if (check.affectedUrls.length > 0) {
        const sample = check.affectedUrls.slice(0, 3);
        for (const url of sample) {
          writeText(`- ${url}`, 8, false);
        }
        if (check.affectedUrls.length > sample.length) {
          writeText(`- +${check.affectedUrls.length - sample.length} more`, 8, false);
        }
      }

      y += 4;
    }

    y += 4;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${agencyName} | Page ${i}/${pages}`, marginX, pageHeight - 18);
  }

  doc.save(`${slugify(targetName || "website")}-audit-report.pdf`);
}
