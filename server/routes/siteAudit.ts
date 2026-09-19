import { safeFetch as fetch } from "../utils/safeFetch.js";
import crypto from "node:crypto";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";
import { runWebsiteDeepCrawl, type WebsiteDeepCrawlPage } from "../modules/audits/crawl.js";
import { publishSiteAuditJobUpdate } from "../modules/siteAuditRealtime.js";

type SiteAuditMode = "crawler" | "urls" | "sitemap";
type SiteAuditJobStatus = "queued" | "crawling" | "completed" | "failed";

type SiteAuditOptions = {
  max_pages: number;
  respect_robots: boolean;
  crawl_delay_ms: number;
  timeout_ms: number;
};

type SiteAuditProgress = {
  crawled: number;
  total: number;
  current_url: string;
  issues_found: number;
  percent: number;
};

type SiteAuditSummary = {
  errors: number;
  warnings: number;
  info: number;
  total_issues: number;
};

type SiteAuditPageRecord = {
  id: string;
  crawl_job_id: string;
  url: string;
  depth: number;
  status_code: number | null;
  was_redirected: boolean;
  final_url: string;
  title: string;
  title_tag_count: number;
  meta_description: string;
  meta_description_count: number;
  h1_count: number;
  word_count: number;
  internal_link_count: number;
  outgoing_internal_count: number;
  incoming_internal_count: number;
  links_to_broken_pages_count: number;
  links_to_redirect_pages_count: number;
  only_nofollow_incoming: boolean;
  is_orphan: boolean;
  has_schema: boolean;
  has_contact_signal: boolean;
  images_count: number;
  images_without_alt: number;
  image_alt_over_100_count: number;
  canonical_url: string;
  canonical_tag_count: number;
  canonical_to_redirect: boolean;
  page_summary: string;
  has_phone: boolean;
  has_email: boolean;
  mentions_location: boolean;
  has_viewport: boolean;
  has_canonical: boolean;
  noindex: boolean;
  nofollow: boolean;
  meta_refresh: boolean;
  has_cta: boolean;
  has_trust_signal: boolean;
  has_testimonials: boolean;
  has_about_signal: boolean;
  has_policy_signal: boolean;
  has_open_graph: boolean;
  open_graph_complete: boolean;
  open_graph_url: string;
  has_twitter_card: boolean;
  twitter_card_complete: boolean;
  lang_attribute: string;
  invalid_lang_attribute: boolean;
  hreflang_count: number;
  invalid_hreflang_count: number;
  has_x_default_hreflang: boolean;
  hreflang_missing_self: boolean;
  hreflang_lang_mismatch: boolean;
  https_links_to_http_count: number;
  https_links_to_http_js_count: number;
  https_links_to_http_css_count: number;
  https_links_to_http_image_count: number;
  broken_image_count: number;
  large_image_count: number;
  redirected_image_count: number;
  broken_js_count: number;
  large_js_count: number;
  redirected_js_count: number;
  broken_css_count: number;
  large_css_count: number;
  redirected_css_count: number;
  redirect_chain: boolean;
  redirect_loop: boolean;
  in_sitemap: boolean;
  sitemap_status: number | null;
  sitemap_is_redirect: boolean;
  sitemap_is_noindex: boolean;
  sitemap_is_non_canonical: boolean;
  page_role: string;
  response_time_ms: number;
  html_bytes: number;
  created_at: string;
};

type SiteAuditResult = {
  site: string;
  crawled_at: string;
  crawl_mode: SiteAuditMode;
  total_pages: number;
  health_score: number;
  summary: SiteAuditSummary;
  categories: Array<Record<string, unknown>>;
  all_pages: SiteAuditPageRecord[];
};

type SiteAuditCacheMeta = {
  key: string;
  hit: boolean;
  last_audited_at: string;
  age_ms: number;
};

type SiteAuditJob = {
  job_id: string;
  status: SiteAuditJobStatus;
  mode: SiteAuditMode;
  input: string | string[];
  options: SiteAuditOptions;
  progress: SiteAuditProgress;
  created_at: string;
  updated_at: string;
  cache: SiteAuditCacheMeta | null;
  result: SiteAuditResult | null;
  error: string | null;
};

type SiteAuditJobRow = {
  job_id: string;
  status: string;
  mode: string;
  input_json: string;
  options_json: string;
  progress_json: string;
  cache_json: string | null;
  result_json: string | null;
  error_message: string | null;
  requester_ip: string | null;
  cache_key: string;
  created_at: string;
  updated_at: string;
};

type SiteAuditCacheRow = {
  cache_key: string;
  mode: string;
  input_json: string;
  options_json: string;
  result_json: string;
  stored_at: string;
  expires_at: string;
  updated_at: string;
};

type CachedSiteAudit = {
  storedAt: number;
  result: SiteAuditResult;
};

const SITE_AUDIT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_CRAWLS_PER_IP = 3;
const PROGRESS_DB_FLUSH_INTERVAL_MS = 350;
const SITE_AUDIT_WS_PATH = "/ws/site-audit";

let runtimePrepared = false;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function normalizeWebsiteUrl(value: string): string {
  const raw = cleanText(value);
  if (!raw) {
    throw new Error("Website URL is required");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  parsed.hash = "";

  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/g, "");
  return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`;
}

function normalizeSiteAuditMode(value: unknown): SiteAuditMode {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "crawler" || normalized === "urls" || normalized === "sitemap") {
    return normalized;
  }

  throw new Error("mode must be one of: crawler, urls, sitemap");
}

function normalizeOptions(mode: SiteAuditMode, raw: unknown): SiteAuditOptions {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const maxPagesDefault = mode === "crawler" ? 120 : 500;
  const maxPages = clamp(Math.round(Number(source.max_pages) || maxPagesDefault), 1, 500);
  const crawlDelayMs = clamp(Math.round(Number(source.crawl_delay_ms) || 500), 0, 5000);
  const timeoutMs = clamp(Math.round(Number(source.timeout_ms) || 10000), 2000, 30000);

  return {
    max_pages: maxPages,
    respect_robots: parseBoolean(source.respect_robots, true),
    crawl_delay_ms: crawlDelayMs,
    timeout_ms: timeoutMs,
  };
}

function parseUrlListInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => cleanText(item))
          .filter(Boolean)
          .map((item) => normalizeWebsiteUrl(item))
      )
    );
  }

  const raw = cleanText(value);
  if (!raw) {
    return [];
  }

  const items = raw
    .split(/\r?\n|,/)
    .map((item) => cleanText(item))
    .filter(Boolean);

  return Array.from(new Set(items.map((item) => normalizeWebsiteUrl(item))));
}

function buildCacheKey(mode: SiteAuditMode, input: string | string[], options: SiteAuditOptions): string {
  return crypto
    .createHash("md5")
    .update(JSON.stringify({ mode, input, options }))
    .digest("hex");
}

function formatCacheMeta(key: string, storedAt: number): SiteAuditCacheMeta {
  return {
    key,
    hit: true,
    last_audited_at: toIso(storedAt),
    age_ms: Math.max(0, Date.now() - storedAt),
  };
}

function withFreshCacheAge(job: SiteAuditJob): SiteAuditJob {
  if (!job.cache) {
    return job;
  }

  const timestamp = Date.parse(job.cache.last_audited_at);
  if (!Number.isFinite(timestamp)) {
    return job;
  }

  return {
    ...job,
    cache: {
      ...job.cache,
      age_ms: Math.max(0, Date.now() - timestamp),
    },
  };
}

function getRequestIp(req: express.Request): string {
  const header = cleanText(req.headers["x-forwarded-for"] || "");
  if (header) {
    return header.split(",")[0].trim();
  }

  return cleanText(req.ip || req.socket.remoteAddress || "unknown");
}

function prepareRuntimeState(): void {
  if (runtimePrepared) {
    return;
  }

  runtimePrepared = true;
  const db = getDb();
  const now = nowIso();

  db.prepare(
    `UPDATE site_audit_jobs
       SET status = 'failed',
           error_message = COALESCE(error_message, 'Server restarted before crawl completed'),
           updated_at = ?
     WHERE status IN ('queued', 'crawling')`
  ).run(now);

  db.prepare("DELETE FROM site_audit_cache WHERE expires_at <= ?").run(now);
}

function rowToSiteAuditJob(row: SiteAuditJobRow): SiteAuditJob {
  const mode = normalizeSiteAuditMode(row.mode);
  const options = normalizeOptions(mode, parseJson<Record<string, unknown>>(row.options_json, {}));
  const input = parseJson<string | string[]>(row.input_json, "");
  const progress = parseJson<SiteAuditProgress>(row.progress_json, {
    crawled: 0,
    total: 0,
    current_url: "",
    issues_found: 0,
    percent: 0,
  });
  const cache = parseJson<SiteAuditCacheMeta | null>(row.cache_json, null);
  const result = parseJson<SiteAuditResult | null>(row.result_json, null);
  const status = ["queued", "crawling", "completed", "failed"].includes(row.status)
    ? (row.status as SiteAuditJobStatus)
    : "failed";

  return withFreshCacheAge({
    job_id: row.job_id,
    status,
    mode,
    input,
    options,
    progress,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cache,
    result,
    error: cleanText(row.error_message) || null,
  });
}

function upsertSiteAuditJob(job: SiteAuditJob, requesterIp: string, cacheKey: string): void {
  const db = getDb();
  const cacheJson = job.cache ? JSON.stringify(job.cache) : null;
  const resultJson = job.result ? JSON.stringify(job.result) : null;

  db.prepare(
    `INSERT INTO site_audit_jobs (
       job_id, status, mode, input_json, options_json, progress_json,
       cache_json, result_json, error_message, requester_ip, cache_key,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET
       status = excluded.status,
       mode = excluded.mode,
       input_json = excluded.input_json,
       options_json = excluded.options_json,
       progress_json = excluded.progress_json,
       cache_json = excluded.cache_json,
       result_json = excluded.result_json,
       error_message = excluded.error_message,
       requester_ip = excluded.requester_ip,
       cache_key = excluded.cache_key,
       updated_at = excluded.updated_at`
  ).run(
    job.job_id,
    job.status,
    job.mode,
    JSON.stringify(job.input),
    JSON.stringify(job.options),
    JSON.stringify(job.progress),
    cacheJson,
    resultJson,
    job.error,
    requesterIp,
    cacheKey,
    job.created_at,
    job.updated_at
  );
}

function findSiteAuditJob(jobId: string): SiteAuditJob | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         job_id, status, mode, input_json, options_json, progress_json,
         cache_json, result_json, error_message, requester_ip, cache_key,
         created_at, updated_at
       FROM site_audit_jobs
       WHERE job_id = ?`
    )
    .get(jobId) as SiteAuditJobRow | undefined;

  if (!row) {
    return null;
  }

  return rowToSiteAuditJob(row);
}

function findPreviousCompletedSiteAuditJob(cacheKey: string, excludeJobId: string): SiteAuditJob | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         job_id, status, mode, input_json, options_json, progress_json,
         cache_json, result_json, error_message, requester_ip, cache_key,
         created_at, updated_at
       FROM site_audit_jobs
       WHERE cache_key = ?
         AND job_id <> ?
         AND status = 'completed'
         AND result_json IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(cacheKey, excludeJobId) as SiteAuditJobRow | undefined;

  if (!row) {
    return null;
  }

  return rowToSiteAuditJob(row);
}

function countActiveJobsForIp(ip: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM site_audit_jobs
        WHERE requester_ip = ?
          AND status IN ('queued', 'crawling')`
    )
    .get(ip) as { count: number };

  return Number(row?.count || 0);
}

function deleteExpiredCacheEntries(): void {
  const db = getDb();
  db.prepare("DELETE FROM site_audit_cache WHERE expires_at <= ?").run(nowIso());
}

function findCachedSiteAudit(cacheKey: string): CachedSiteAudit | null {
  deleteExpiredCacheEntries();

  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         cache_key, mode, input_json, options_json, result_json, stored_at, expires_at, updated_at
       FROM site_audit_cache
       WHERE cache_key = ?
       LIMIT 1`
    )
    .get(cacheKey) as SiteAuditCacheRow | undefined;

  if (!row) {
    return null;
  }

  const storedAt = Date.parse(row.stored_at);
  const parsedResult = parseJson<SiteAuditResult | null>(row.result_json, null);

  if (!Number.isFinite(storedAt) || !parsedResult) {
    db.prepare("DELETE FROM site_audit_cache WHERE cache_key = ?").run(cacheKey);
    return null;
  }

  return {
    storedAt,
    result: parsedResult,
  };
}

function upsertCachedSiteAudit(
  cacheKey: string,
  mode: SiteAuditMode,
  input: string | string[],
  options: SiteAuditOptions,
  result: SiteAuditResult,
  storedAtMs: number
): void {
  const db = getDb();
  const storedAt = toIso(storedAtMs);
  const expiresAt = toIso(storedAtMs + SITE_AUDIT_CACHE_TTL_MS);

  db.prepare(
    `INSERT INTO site_audit_cache (
       cache_key, mode, input_json, options_json, result_json, stored_at, expires_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       mode = excluded.mode,
       input_json = excluded.input_json,
       options_json = excluded.options_json,
       result_json = excluded.result_json,
       stored_at = excluded.stored_at,
       expires_at = excluded.expires_at,
       updated_at = excluded.updated_at`
  ).run(
    cacheKey,
    mode,
    JSON.stringify(input),
    JSON.stringify(options),
    JSON.stringify(result),
    storedAt,
    expiresAt,
    nowIso()
  );
}

function persistAndPublish(job: SiteAuditJob, requesterIp: string, cacheKey: string): void {
  upsertSiteAuditJob(job, requesterIp, cacheKey);
  publishSiteAuditJobUpdate(job as unknown as { job_id: string } & Record<string, unknown>);
}

function mapCrawlPageToRecord(page: WebsiteDeepCrawlPage, crawlJobId: string, index: number, createdAt: string): SiteAuditPageRecord {
  return {
    id: `${crawlJobId}-p${index + 1}`,
    crawl_job_id: crawlJobId,
    url: page.url,
    depth: page.depth,
    status_code: page.statusCode,
    was_redirected: page.wasRedirected,
    final_url: page.finalUrl,
    title: page.title,
    title_tag_count: page.titleTagCount,
    meta_description: page.metaDescription,
    meta_description_count: page.metaDescriptionCount,
    h1_count: page.h1Count,
    word_count: page.wordCount,
    internal_link_count: page.internalLinkCount,
    outgoing_internal_count: page.outgoingInternalCount,
    incoming_internal_count: page.incomingInternalCount,
    links_to_broken_pages_count: page.linksToBrokenPagesCount,
    links_to_redirect_pages_count: page.linksToRedirectPagesCount,
    only_nofollow_incoming: page.onlyNofollowIncoming,
    is_orphan: page.isOrphan,
    has_schema: page.hasSchema,
    has_contact_signal: page.hasPhone || page.hasEmail,
    images_count: page.imagesCount,
    images_without_alt: page.imagesWithoutAlt,
    image_alt_over_100_count: page.imageAltOver100Count,
    canonical_url: page.canonicalUrl,
    canonical_tag_count: page.canonicalTagCount,
    canonical_to_redirect: page.canonicalToRedirect,
    page_summary: page.summary,
    has_phone: page.hasPhone,
    has_email: page.hasEmail,
    mentions_location: page.mentionsLocation,
    has_viewport: page.hasViewport,
    has_canonical: page.hasCanonical,
    noindex: page.noindex,
    nofollow: page.nofollow,
    meta_refresh: page.metaRefresh,
    has_cta: page.hasCta,
    has_trust_signal: page.hasTrustSignal,
    has_testimonials: page.hasTestimonials,
    has_about_signal: page.hasAboutSignal,
    has_policy_signal: page.hasPolicySignal,
    has_open_graph: page.hasOpenGraph,
    open_graph_complete: page.openGraphComplete,
    open_graph_url: page.openGraphUrl,
    has_twitter_card: page.hasTwitterCard,
    twitter_card_complete: page.twitterCardComplete,
    lang_attribute: page.langAttribute,
    invalid_lang_attribute: page.invalidLangAttribute,
    hreflang_count: page.hreflangCount,
    invalid_hreflang_count: page.invalidHreflangCount,
    has_x_default_hreflang: page.hasXDefaultHreflang,
    hreflang_missing_self: page.hreflangMissingSelf,
    hreflang_lang_mismatch: page.hreflangLangMismatch,
    https_links_to_http_count: page.httpsLinksToHttpCount,
    https_links_to_http_js_count: page.httpsLinksToHttpJsCount,
    https_links_to_http_css_count: page.httpsLinksToHttpCssCount,
    https_links_to_http_image_count: page.httpsLinksToHttpImageCount,
    broken_image_count: page.brokenImageCount,
    large_image_count: page.largeImageCount,
    redirected_image_count: page.redirectedImageCount,
    broken_js_count: page.brokenJsCount,
    large_js_count: page.largeJsCount,
    redirected_js_count: page.redirectedJsCount,
    broken_css_count: page.brokenCssCount,
    large_css_count: page.largeCssCount,
    redirected_css_count: page.redirectedCssCount,
    redirect_chain: page.redirectChain,
    redirect_loop: page.redirectLoop,
    in_sitemap: page.inSitemap,
    sitemap_status: page.sitemapStatus,
    sitemap_is_redirect: page.sitemapIsRedirect,
    sitemap_is_noindex: page.sitemapIsNoindex,
    sitemap_is_non_canonical: page.sitemapIsNonCanonical,
    page_role: page.pageRole,
    response_time_ms: page.responseTimeMs,
    html_bytes: page.htmlBytes,
    created_at: createdAt,
  };
}

function summarizeIssues(pages: SiteAuditPageRecord[]): SiteAuditSummary {
  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const page of pages) {
    if (page.status_code === null || page.status_code >= 500) errors += 1;
    if ((page.status_code || 0) >= 400 && (page.status_code || 0) < 500) errors += 1;
    if (page.noindex) errors += 1;
    if (!cleanText(page.title)) errors += 1;
    if (page.h1_count === 0) errors += 1;
    if (page.broken_image_count > 0 || page.broken_js_count > 0 || page.broken_css_count > 0) errors += 1;
    if (page.invalid_hreflang_count > 0 || page.hreflang_lang_mismatch) errors += 1;

    if (page.images_without_alt > 0) warnings += 1;
    if (page.word_count > 0 && page.word_count < 300) warnings += 1;
    if (cleanText(page.title).length > 60 || cleanText(page.title).length < 30) warnings += 1;
    if (
      cleanText(page.meta_description).length > 155 ||
      (cleanText(page.meta_description).length > 0 && cleanText(page.meta_description).length < 70)
    ) warnings += 1;
    if (page.redirect_chain || page.redirect_loop) warnings += 1;
    if (page.links_to_redirect_pages_count > 0) warnings += 1;

    if (page.was_redirected) info += 1;
    if (page.links_to_broken_pages_count > 0) info += 1;
    if (page.internal_link_count === 0) info += 1;
  }

  return {
    errors,
    warnings,
    info,
    total_issues: errors + warnings + info,
  };
}

function computeHealthScore(totalPages: number, summary: SiteAuditSummary): number {
  const totalChecks = Math.max(1, totalPages * 12);
  const score = ((totalChecks - summary.errors) / totalChecks) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function fetchXml(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "SiteAuditBot/1.0",
        Accept: "application/xml,text/xml,text/plain,*/*",
      },
    });

    if (!response.ok) {
      throw new Error(`Sitemap request failed (${response.status})`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function extractSitemapUrls(
  sitemapUrl: string,
  timeoutMs: number,
  visited = new Set<string>(),
  depth = 0
): Promise<string[]> {
  if (depth > 4) {
    return [];
  }

  const normalized = normalizeWebsiteUrl(sitemapUrl);
  if (!normalized.toLowerCase().endsWith(".xml")) {
    throw new Error("URL must end with .xml");
  }

  if (visited.has(normalized)) {
    return [];
  }

  visited.add(normalized);
  const xml = await fetchXml(normalized, timeoutMs);
  const locs = Array.from(xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)).map((match) => cleanText(match[1]));

  if (/\<sitemapindex[\s>]/i.test(xml)) {
    const nestedSitemapUrls = locs.filter((loc) => loc.toLowerCase().endsWith(".xml"));
    const nestedResults = await Promise.all(
      nestedSitemapUrls.slice(0, 25).map((nestedUrl) => extractSitemapUrls(nestedUrl, timeoutMs, visited, depth + 1))
    );

    return Array.from(new Set(nestedResults.flat().map((url) => normalizeWebsiteUrl(url))));
  }

  const pageUrls = locs
    .filter((loc) => !loc.toLowerCase().endsWith(".xml"))
    .map((loc) => normalizeWebsiteUrl(loc));

  return Array.from(new Set(pageUrls));
}

async function crawlSpecificUrls(args: {
  urls: string[];
  options: SiteAuditOptions;
  progressCallback: (progress: SiteAuditProgress) => void;
}): Promise<WebsiteDeepCrawlPage[]> {
  const pages: WebsiteDeepCrawlPage[] = [];

  for (let index = 0; index < args.urls.length; index += 1) {
    const url = args.urls[index];

    args.progressCallback({
      crawled: index,
      total: args.urls.length,
      current_url: url,
      issues_found: 0,
      percent: args.urls.length > 0 ? Math.round((index / args.urls.length) * 100) : 0,
    });

    const crawl = await runWebsiteDeepCrawl({
      website: url,
      maxPages: 1,
      maxDepth: 0,
      respectRobots: args.options.respect_robots,
      crawlDelayMs: 0,
      timeoutMs: args.options.timeout_ms,
      skipSitemapAudit: true,
    });

    if (crawl.pages.length > 0) {
      pages.push(crawl.pages[0]);
    }

    if (args.options.crawl_delay_ms > 0 && index < args.urls.length - 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, args.options.crawl_delay_ms);
      });
    }
  }

  return pages;
}

async function buildSiteAuditResult(args: {
  jobId: string;
  mode: SiteAuditMode;
  input: string | string[];
  options: SiteAuditOptions;
  progressCallback: (progress: SiteAuditProgress) => void;
}): Promise<SiteAuditResult> {
  const createdAt = nowIso();
  let pages: WebsiteDeepCrawlPage[] = [];
  let siteLabel = "";

  if (args.mode === "crawler") {
    const website = normalizeWebsiteUrl(String(args.input));
    siteLabel = website;

    const crawl = await runWebsiteDeepCrawl({
      website,
      maxPages: args.options.max_pages,
      maxDepth: 4,
      respectRobots: args.options.respect_robots,
      crawlDelayMs: args.options.crawl_delay_ms,
      timeoutMs: args.options.timeout_ms,
      onProgress: (progress) => {
        args.progressCallback({
          crawled: progress.crawled,
          total: Math.max(1, progress.total),
          current_url: progress.currentUrl,
          issues_found: 0,
          percent: Math.max(0, Math.min(100, Math.round((progress.crawled / Math.max(1, progress.total)) * 100))),
        });
      },
    });

    pages = crawl.pages;
  } else if (args.mode === "urls") {
    const urls = (Array.isArray(args.input) ? args.input : parseUrlListInput(args.input)).slice(0, args.options.max_pages);
    if (urls.length === 0) {
      throw new Error("At least one valid URL is required");
    }

    siteLabel = urls[0];
    pages = await crawlSpecificUrls({
      urls,
      options: args.options,
      progressCallback: args.progressCallback,
    });
  } else {
    const sitemapUrl = normalizeWebsiteUrl(String(args.input));
    if (!sitemapUrl.toLowerCase().endsWith(".xml")) {
      throw new Error("Sitemap URL must end with .xml");
    }

    const sitemapUrls = await extractSitemapUrls(sitemapUrl, args.options.timeout_ms);
    const crawlUrls = sitemapUrls.slice(0, args.options.max_pages);
    if (crawlUrls.length === 0) {
      throw new Error("No crawlable URLs were found in sitemap");
    }

    siteLabel = sitemapUrl;
    pages = await crawlSpecificUrls({
      urls: crawlUrls,
      options: args.options,
      progressCallback: args.progressCallback,
    });
  }

  const allPages = pages.map((page, index) => mapCrawlPageToRecord(page, args.jobId, index, createdAt));
  const summary = summarizeIssues(allPages);
  const healthScore = computeHealthScore(allPages.length, summary);

  return {
    site: siteLabel,
    crawled_at: createdAt,
    crawl_mode: args.mode,
    total_pages: allPages.length,
    health_score: healthScore,
    summary,
    categories: [],
    all_pages: allPages,
  };
}

function createInitialJob(mode: SiteAuditMode, input: string | string[], options: SiteAuditOptions): SiteAuditJob {
  const timestamp = nowIso();
  return {
    job_id: uuidv4(),
    status: "queued",
    mode,
    input,
    options,
    progress: {
      crawled: 0,
      total: 0,
      current_url: "",
      issues_found: 0,
      percent: 0,
    },
    created_at: timestamp,
    updated_at: timestamp,
    cache: null,
    result: null,
    error: null,
  };
}

export const siteAuditRouter = express.Router();

siteAuditRouter.post("/site-audit", async (req, res) => {
  try {
    prepareRuntimeState();

    const mode = normalizeSiteAuditMode(req.body?.mode);
    const options = normalizeOptions(mode, req.body?.options);
    const force = parseBoolean(req.body?.force, false);
    const requesterIp = getRequestIp(req);

    const normalizedInput: string | string[] = (() => {
      if (mode === "crawler") {
        return normalizeWebsiteUrl(cleanText(req.body?.input));
      }

      if (mode === "urls") {
        const urls = parseUrlListInput(req.body?.input);
        if (urls.length === 0) {
          throw new Error("Please provide at least one valid URL");
        }
        return urls;
      }

      const sitemapUrl = normalizeWebsiteUrl(cleanText(req.body?.input));
      if (!sitemapUrl.toLowerCase().endsWith(".xml")) {
        throw new Error("Sitemap URL must end with .xml");
      }
      return sitemapUrl;
    })();

    const cacheKey = buildCacheKey(mode, normalizedInput, options);

    if (!force) {
      const cached = findCachedSiteAudit(cacheKey);
      if (cached) {
        const cachedJob = createInitialJob(mode, normalizedInput, options);
        cachedJob.status = "completed";
        cachedJob.progress = {
          crawled: cached.result.total_pages,
          total: cached.result.total_pages,
          current_url: "",
          issues_found: cached.result.summary.total_issues,
          percent: 100,
        };
        cachedJob.cache = formatCacheMeta(cacheKey, cached.storedAt);
        cachedJob.result = {
          ...cached.result,
          crawled_at: toIso(cached.storedAt),
        };
        cachedJob.updated_at = nowIso();

        persistAndPublish(cachedJob, requesterIp, cacheKey);

        res.status(201).json({
          job_id: cachedJob.job_id,
          status: cachedJob.status,
          progress: cachedJob.progress,
          cache: cachedJob.cache,
          ws_path: SITE_AUDIT_WS_PATH,
        });
        return;
      }
    }

    if (countActiveJobsForIp(requesterIp) >= MAX_CONCURRENT_CRAWLS_PER_IP) {
      res.status(429).json({
        error: "Maximum 3 concurrent site audits are allowed per user.",
      });
      return;
    }

    const job = createInitialJob(mode, normalizedInput, options);
    persistAndPublish(job, requesterIp, cacheKey);

    void (async () => {
      let liveJob: SiteAuditJob = {
        ...job,
        status: "crawling",
        updated_at: nowIso(),
      };
      persistAndPublish(liveJob, requesterIp, cacheKey);

      let lastFlushAt = 0;

      try {
        const result = await buildSiteAuditResult({
          jobId: liveJob.job_id,
          mode,
          input: normalizedInput,
          options,
          progressCallback: (progress) => {
            liveJob = {
              ...liveJob,
              progress,
              updated_at: nowIso(),
            };

            const now = Date.now();
            if (now - lastFlushAt >= PROGRESS_DB_FLUSH_INTERVAL_MS) {
              persistAndPublish(liveJob, requesterIp, cacheKey);
              lastFlushAt = now;
            }
          },
        });

        const storedAt = Date.now();
        liveJob = {
          ...liveJob,
          status: "completed",
          progress: {
            crawled: result.total_pages,
            total: result.total_pages,
            current_url: "",
            issues_found: result.summary.total_issues,
            percent: 100,
          },
          result,
          error: null,
          updated_at: nowIso(),
        };

        persistAndPublish(liveJob, requesterIp, cacheKey);
        upsertCachedSiteAudit(cacheKey, mode, normalizedInput, options, result, storedAt);
      } catch (error) {
        liveJob = {
          ...liveJob,
          status: "failed",
          error: error instanceof Error ? error.message : "Site audit failed",
          updated_at: nowIso(),
        };

        persistAndPublish(liveJob, requesterIp, cacheKey);
      }
    })();

    res.status(202).json({
      job_id: job.job_id,
      status: job.status,
      progress: job.progress,
      cache: null,
      ws_path: SITE_AUDIT_WS_PATH,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start site audit";
    res.status(400).json({ error: message });
  }
});

siteAuditRouter.get("/site-audit/:jobId", (req, res) => {
  try {
    prepareRuntimeState();

    const jobId = cleanText(req.params.jobId);
    if (!jobId) {
      res.status(400).json({ error: "jobId is required" });
      return;
    }

    const job = findSiteAuditJob(jobId);
    if (!job) {
      res.status(404).json({ error: "Site audit job not found" });
      return;
    }

    res.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load site audit job";
    res.status(500).json({ error: message });
  }
});

siteAuditRouter.get("/site-audit/:jobId/compare", (req, res) => {
  try {
    prepareRuntimeState();

    const jobId = cleanText(req.params.jobId);
    if (!jobId) {
      res.status(400).json({ error: "jobId is required" });
      return;
    }

    const currentJob = findSiteAuditJob(jobId);
    if (!currentJob) {
      res.status(404).json({ error: "Site audit job not found" });
      return;
    }

    const db = getDb();
    const currentRow = db
      .prepare("SELECT cache_key FROM site_audit_jobs WHERE job_id = ? LIMIT 1")
      .get(jobId) as { cache_key: string } | undefined;

    const cacheKey = cleanText(currentRow?.cache_key);
    if (!cacheKey) {
      res.status(404).json({ error: "No previous cached run found for this audit input yet." });
      return;
    }

    const previousJob = findPreviousCompletedSiteAuditJob(cacheKey, jobId);
    if (!previousJob) {
      res.status(404).json({ error: "No previous cached run found for this audit input yet." });
      return;
    }

    res.json({
      current: currentJob,
      previous: previousJob,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load site audit comparison";
    res.status(500).json({ error: message });
  }
});
