import express from "express";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";
import { generateAiText } from "../modules/ai/providers.js";
import {
  DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG,
  normalizeAdvancedWebsiteScoringConfig,
  runAdvancedWebsiteAudit,
  type AdvancedWebsiteScoringConfig,
} from "../modules/audits/advancedWebsite.js";
import { runWebsiteDeepCrawl, type WebsiteDeepCrawlResult } from "../modules/audits/crawl.js";
import { runGmbAudit, type GmbAuditResult } from "../modules/audits/gmb.js";
import { runWebsiteAudit, type WebsiteAuditResult } from "../modules/audits/website.js";
import { generateGeoGridAudit, type GeoGridResult } from "../modules/audits/geoGrid.js";
import { generateCompetitorBenchmark, type CompetitorBenchmarkReport } from "../modules/audits/competitorBenchmark.js";
import { generateNapAudit, type NapAuditReport } from "../modules/audits/napChecker.js";
import { generateReviewSentimentAnalysis, type ReviewSentimentReport } from "../modules/audits/reviewSentiment.js";
import { executeRecurringClientAudits, getRecurringAuditStatus } from "../modules/audits/recurringAudits.js";
import {
  listEarningsByCurrency,
  listRecentFinanceEntries,
  listRecurringRevenueByCurrency,
  resolveFinancePeriod,
} from "../modules/finance/reporting.js";
import { addLeadActivity, updateLeadScore } from "../modules/leads/repository.js";

type SeoClientRow = {
  id: string;
  name: string;
  primary_contact: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  lifecycle_stage: string;
  notes: string | null;
  default_currency: string;
  created_at: string;
  updated_at: string;
  business_count: number;
  active_orders: number;
  monthly_budget_total: number | null;
};

type SeoBusinessRow = {
  id: string;
  client_id: string;
  client_name: string;
  lead_id: string | null;
  name: string;
  website: string | null;
  gmb_url: string | null;
  city: string | null;
  state: string | null;
  service_type: string | null;
  package_type: string | null;
  monthly_budget: number | null;
  currency: string;
  billing_cycle: string;
  order_status: string;
  assigned_team_member: string | null;
  start_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_gmb_audit_score: number | null;
  last_website_audit_score: number | null;
};

type AuditRow = {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  business_id: string | null;
  audit_type: string;
  score: number | null;
  verdict: string | null;
  data_json: string | null;
  ai_insights_json: string | null;
  target_name: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

type CrawlJobRow = {
  id: string;
  audit_scope: string;
  target_name: string | null;
  start_url: string;
  host: string;
  status: string;
  max_pages: number;
  pages_crawled: number;
  issue_count: number;
  summary_json: string | null;
  ai_insights_json: string | null;
  created_at: string;
  updated_at: string;
};

type CrawlPageRow = {
  id: string;
  crawl_job_id: string;
  url: string;
  depth: number;
  status_code: number | null;
  title: string | null;
  meta_description: string | null;
  h1_count: number;
  word_count: number;
  internal_link_count: number;
  has_schema: number;
  has_contact_signal: number;
  images_count: number;
  images_without_alt: number;
  canonical_url: string | null;
  page_summary: string | null;
  raw_metrics_json: string | null;
  created_at: string;
};

type LeadSeedRow = {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  gmb_url: string | null;
  gmb_claimed: number;
  gmb_rating: number | null;
  gmb_review_count: number | null;
  gmb_profile_incomplete: number;
  citations_found: number;
  phone: string | null;
  email: string | null;
};

type BusinessSeedRow = {
  id: string;
  client_id: string;
  lead_id: string | null;
  name: string;
  website: string | null;
  gmb_url: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
};

type AuditScoringSettingsRow = {
  advanced_website_scoring_config: string | null;
};

const EMAIL_SENDER_PROVIDER_PRESETS = [
  "Gmail",
  "Outlook",
  "Yahoo",
  "SendGrid",
  "Mailgun",
  "Amazon SES",
  "Custom",
];

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return null;

  const normalized = cleanText(value).toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return null;
}

function hasOwnValue(record: unknown, key: string): boolean {
  return Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key));
}

function normalizeCurrency(value: unknown, fallback = "USD"): string {
  const normalized = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 8);
  return normalized || fallback;
}

function normalizeBillingCycle(value: unknown): string {
  const normalized = cleanText(value).toLowerCase();
  return ["monthly", "quarterly", "yearly", "one-time"].includes(normalized) ? normalized : "monthly";
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ensureSettingsSeedRow(): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO app_settings (id) VALUES (1)").run();
}

function readAdvancedWebsiteScoringConfigFromSettings(): AdvancedWebsiteScoringConfig {
  ensureSettingsSeedRow();
  const db = getDb();
  const row = db
    .prepare("SELECT advanced_website_scoring_config FROM app_settings WHERE id = 1")
    .get() as AuditScoringSettingsRow | undefined;

  const parsed = parseJson<unknown>(row?.advanced_website_scoring_config || null, null);
  if (!parsed) {
    return normalizeAdvancedWebsiteScoringConfig(DEFAULT_ADVANCED_WEBSITE_SCORING_CONFIG);
  }

  return normalizeAdvancedWebsiteScoringConfig(parsed);
}

function writeAdvancedWebsiteScoringConfigToSettings(config: AdvancedWebsiteScoringConfig): void {
  ensureSettingsSeedRow();
  const db = getDb();

  db.prepare(
    `UPDATE app_settings
     SET advanced_website_scoring_config = ?,
         updated_at = datetime('now')
     WHERE id = 1`
  ).run(JSON.stringify(config));
}

function mergeAdvancedWebsiteScoringConfig(
  current: AdvancedWebsiteScoringConfig,
  incoming: unknown
): AdvancedWebsiteScoringConfig {
  const source = isObjectRecord(incoming) ? incoming : {};
  const categoryWeightsPatch = isObjectRecord(source.categoryWeights) ? source.categoryWeights : {};
  const localFactorWeightsPatch = isObjectRecord(source.localFactorWeights) ? source.localFactorWeights : {};

  return normalizeAdvancedWebsiteScoringConfig({
    categoryWeights: {
      ...current.categoryWeights,
      ...categoryWeightsPatch,
    },
    localFactorWeights: {
      ...current.localFactorWeights,
      ...localFactorWeightsPatch,
    },
  });
}

function rowToSeoClient(row: SeoClientRow) {
  return {
    id: row.id,
    name: row.name,
    primary_contact: row.primary_contact || "",
    contact_email: row.contact_email || "",
    contact_phone: row.contact_phone || "",
    lifecycle_stage: row.lifecycle_stage,
    notes: row.notes || "",
    default_currency: normalizeCurrency(row.default_currency),
    business_count: Number(row.business_count || 0),
    active_orders: Number(row.active_orders || 0),
    monthly_budget_total: Number(row.monthly_budget_total || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToSeoBusiness(row: SeoBusinessRow) {
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.client_name,
    lead_id: row.lead_id || "",
    name: row.name,
    website: row.website || "",
    gmb_url: row.gmb_url || "",
    city: row.city || "",
    state: row.state || "",
    service_type: row.service_type || "",
    package_type: row.package_type || "",
    monthly_budget: row.monthly_budget,
    currency: normalizeCurrency(row.currency),
    billing_cycle: normalizeBillingCycle(row.billing_cycle),
    order_status: row.order_status,
    assigned_team_member: row.assigned_team_member || "",
    start_date: row.start_date || "",
    notes: row.notes || "",
    last_gmb_audit_score: row.last_gmb_audit_score,
    last_website_audit_score: row.last_website_audit_score,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToAudit(row: AuditRow) {
  const result = parseJson<Record<string, unknown>>(row.data_json, {});
  const issueCount = Array.isArray(result.issues) ? result.issues.length : 0;
  const winCount = Array.isArray(result.wins) ? result.wins.length : 0;

  return {
    id: row.id,
    lead_id: row.lead_id || "",
    client_id: row.client_id || "",
    business_id: row.business_id || "",
    audit_type: row.audit_type,
    score: row.score,
    verdict: row.verdict || "",
    target_name: row.target_name || "Audit target",
    status: row.status || "completed",
    summary: typeof result.summary === "string" ? result.summary : "",
    issue_count: issueCount,
    win_count: winCount,
    ai_insights: parseJson<Record<string, unknown> | null>(row.ai_insights_json, null),
    result,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

function rowToCrawlJob(row: CrawlJobRow) {
  return {
    id: row.id,
    audit_scope: row.audit_scope,
    target_name: row.target_name || row.start_url,
    start_url: row.start_url,
    host: row.host,
    status: row.status,
    max_pages: Number(row.max_pages || 0),
    pages_crawled: Number(row.pages_crawled || 0),
    issue_count: Number(row.issue_count || 0),
    summary: parseJson<Record<string, unknown>>(row.summary_json, {}),
    ai_insights: parseJson<Record<string, unknown> | null>(row.ai_insights_json, null),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToCrawlPage(row: CrawlPageRow) {
  const raw = parseJson<Record<string, unknown>>(row.raw_metrics_json, {});

  return {
    id: row.id,
    crawl_job_id: row.crawl_job_id,
    url: row.url,
    depth: Number(row.depth || 0),
    status_code: row.status_code,
    was_redirected: Boolean(raw.wasRedirected),
    final_url: cleanText(raw.finalUrl) || row.url,
    title: row.title || "",
    title_tag_count: Number(raw.titleTagCount || 0),
    meta_description: row.meta_description || "",
    meta_description_count: Number(raw.metaDescriptionCount || 0),
    h1_count: Number(row.h1_count || 0),
    word_count: Number(row.word_count || 0),
    internal_link_count: Number(row.internal_link_count || 0),
    outgoing_internal_count: Number(raw.outgoingInternalCount || 0),
    incoming_internal_count: Number(raw.incomingInternalCount || 0),
    links_to_broken_pages_count: Number(raw.linksToBrokenPagesCount || 0),
    links_to_redirect_pages_count: Number(raw.linksToRedirectPagesCount || 0),
    only_nofollow_incoming: Boolean(raw.onlyNofollowIncoming),
    is_orphan: Boolean(raw.isOrphan),
    has_schema: row.has_schema === 1,
    has_contact_signal: row.has_contact_signal === 1,
    images_count: Number(row.images_count || 0),
    images_without_alt: Number(row.images_without_alt || 0),
    image_alt_over_100_count: Number(raw.imageAltOver100Count || 0),
    canonical_url: row.canonical_url || "",
    canonical_tag_count: Number(raw.canonicalTagCount || 0),
    canonical_to_redirect: Boolean(raw.canonicalToRedirect),
    page_summary: row.page_summary || "",
    has_phone: Boolean(raw.hasPhone),
    has_email: Boolean(raw.hasEmail),
    mentions_location: Boolean(raw.mentionsLocation),
    has_viewport: Boolean(raw.hasViewport),
    has_canonical: Boolean(raw.hasCanonical),
    noindex: Boolean(raw.noindex),
    nofollow: Boolean(raw.nofollow),
    meta_refresh: Boolean(raw.metaRefresh),
    has_cta: Boolean(raw.hasCta),
    has_trust_signal: Boolean(raw.hasTrustSignal),
    has_testimonials: Boolean(raw.hasTestimonials),
    has_about_signal: Boolean(raw.hasAboutSignal),
    has_policy_signal: Boolean(raw.hasPolicySignal),
    has_open_graph: Boolean(raw.hasOpenGraph),
    open_graph_complete: Boolean(raw.openGraphComplete),
    open_graph_url: cleanText(raw.openGraphUrl),
    has_twitter_card: Boolean(raw.hasTwitterCard),
    twitter_card_complete: Boolean(raw.twitterCardComplete),
    lang_attribute: cleanText(raw.langAttribute),
    invalid_lang_attribute: Boolean(raw.invalidLangAttribute),
    hreflang_count: Number(raw.hreflangCount || 0),
    invalid_hreflang_count: Number(raw.invalidHreflangCount || 0),
    has_x_default_hreflang: Boolean(raw.hasXDefaultHreflang),
    hreflang_missing_self: Boolean(raw.hreflangMissingSelf),
    hreflang_lang_mismatch: Boolean(raw.hreflangLangMismatch),
    https_links_to_http_count: Number(raw.httpsLinksToHttpCount || 0),
    https_links_to_http_js_count: Number(raw.httpsLinksToHttpJsCount || 0),
    https_links_to_http_css_count: Number(raw.httpsLinksToHttpCssCount || 0),
    https_links_to_http_image_count: Number(raw.httpsLinksToHttpImageCount || 0),
    broken_image_count: Number(raw.brokenImageCount || 0),
    large_image_count: Number(raw.largeImageCount || 0),
    redirected_image_count: Number(raw.redirectedImageCount || 0),
    broken_js_count: Number(raw.brokenJsCount || 0),
    large_js_count: Number(raw.largeJsCount || 0),
    redirected_js_count: Number(raw.redirectedJsCount || 0),
    broken_css_count: Number(raw.brokenCssCount || 0),
    large_css_count: Number(raw.largeCssCount || 0),
    redirected_css_count: Number(raw.redirectedCssCount || 0),
    redirect_chain: Boolean(raw.redirectChain),
    redirect_loop: Boolean(raw.redirectLoop),
    in_sitemap: Boolean(raw.inSitemap),
    sitemap_status: raw.sitemapStatus != null ? Number(raw.sitemapStatus) : null,
    sitemap_is_redirect: Boolean(raw.sitemapIsRedirect),
    sitemap_is_noindex: Boolean(raw.sitemapIsNoindex),
    sitemap_is_non_canonical: Boolean(raw.sitemapIsNonCanonical),
    page_role: cleanText(raw.pageRole) || "other",
    response_time_ms: Number(raw.responseTimeMs || 0),
    html_bytes: Number(raw.htmlBytes || 0),
    created_at: row.created_at,
  };
}

function getCrawlJobById(crawlJobId: string): CrawlJobRow | undefined {
  if (!crawlJobId) return undefined;

  const db = getDb();
  return db.prepare("SELECT * FROM audit_crawl_jobs WHERE id = ?").get(crawlJobId) as CrawlJobRow | undefined;
}

function listCrawlPages(crawlJobId: string): CrawlPageRow[] {
  if (!crawlJobId) return [];

  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM audit_crawl_pages
       WHERE crawl_job_id = ?
       ORDER BY depth ASC, datetime(created_at) ASC`
    )
    .all(crawlJobId) as CrawlPageRow[];
}

function getLeadSeed(leadId: string): LeadSeedRow | undefined {
  if (!leadId) return undefined;

  const db = getDb();
  return db
    .prepare(
      `SELECT id, business_name, city, state, website, gmb_url, gmb_claimed, gmb_rating,
              gmb_review_count, gmb_profile_incomplete, citations_found, phone, email
       FROM leads
       WHERE id = ?`
    )
    .get(leadId) as LeadSeedRow | undefined;
}

function getBusinessSeed(businessId: string): BusinessSeedRow | undefined {
  if (!businessId) return undefined;

  const db = getDb();
  return db
    .prepare(
      `SELECT id, client_id, lead_id, name, website, gmb_url, city, state, notes
       FROM client_businesses
       WHERE id = ?`
    )
    .get(businessId) as BusinessSeedRow | undefined;
}

function getClientDefaults(clientId: string): { id: string; name: string; default_currency: string } | undefined {
  if (!clientId) return undefined;

  const db = getDb();
  return db
    .prepare("SELECT id, name, default_currency FROM seo_clients WHERE id = ?")
    .get(clientId) as { id: string; name: string; default_currency: string } | undefined;
}

function getBusinessFinanceDefaults(businessId: string) {
  if (!businessId) return undefined;

  const db = getDb();
  return db
    .prepare(
      `SELECT
         b.id,
         b.client_id,
         b.name,
         COALESCE(NULLIF(b.currency, ''), NULLIF(c.default_currency, ''), 'USD') as currency
       FROM client_businesses b
       INNER JOIN seo_clients c ON c.id = b.client_id
       WHERE b.id = ?`
    )
    .get(businessId) as { id: string; client_id: string; name: string; currency: string } | undefined;
}

function getFinanceEntryById(entryId: string) {
  if (!entryId) return undefined;

  const db = getDb();
  return db
    .prepare(
      `SELECT
         f.id,
         f.client_id,
         COALESCE(c.name, '') as client_name,
         COALESCE(f.business_id, '') as business_id,
         COALESCE(b.name, '') as business_name,
         COALESCE(f.label, '') as label,
         f.amount,
         f.currency,
         f.entry_type,
         f.entry_date,
         COALESCE(f.notes, '') as notes,
         f.created_at
       FROM finance_entries f
       INNER JOIN seo_clients c ON c.id = f.client_id
       LEFT JOIN client_businesses b ON b.id = f.business_id
       WHERE f.id = ?`
    )
    .get(entryId) as {
      id: string;
      client_id: string;
      client_name: string;
      business_id: string;
      business_name: string;
      label: string;
      amount: number | null;
      currency: string;
      entry_type: string;
      entry_date: string;
      notes: string;
      created_at: string;
    } | undefined;
}

function findLeadByWebsiteOrName(website?: string, businessName?: string): LeadSeedRow | undefined {
  const db = getDb();
  const cleanedWebsite = cleanText(website);
  const cleanedName = cleanText(businessName);

  if (cleanedWebsite) {
    try {
      const withProtocol = /^https?:\/\//i.test(cleanedWebsite) ? cleanedWebsite : `https://${cleanedWebsite}`;
      const host = new URL(withProtocol).hostname.replace(/^www\./i, "").toLowerCase();
      if (host) {
        const matched = db.prepare(
          `SELECT id, business_name, city, state, website, gmb_url, gmb_claimed, gmb_rating,
                  gmb_review_count, gmb_profile_incomplete, citations_found, phone, email
           FROM leads
           WHERE website IS NOT NULL AND website <> ''
             AND LOWER(REPLACE(REPLACE(REPLACE(COALESCE(website, ''), 'https://', ''), 'http://', ''), 'www.', '')) LIKE ?
           ORDER BY datetime(created_at) DESC
           LIMIT 1`
        ).get(`${host}%`) as LeadSeedRow | undefined;

        if (matched) return matched;
      }
    } catch {
      // ignore url parsing error
    }
  }

  if (cleanedName) {
    const matched = db.prepare(
      `SELECT id, business_name, city, state, website, gmb_url, gmb_claimed, gmb_rating,
              gmb_review_count, gmb_profile_incomplete, citations_found, phone, email
       FROM leads
       WHERE LOWER(business_name) = LOWER(?)
       ORDER BY datetime(created_at) DESC
       LIMIT 1`
    ).get(cleanedName) as LeadSeedRow | undefined;

    if (matched) return matched;
  }

  return undefined;
}

function buildGmbAuditInput(body: Record<string, unknown>) {
  const businessSeed = getBusinessSeed(cleanText(body.business_id));
  let leadSeed = getLeadSeed(cleanText(body.lead_id) || cleanText(businessSeed?.lead_id));

  const businessName =
    cleanText(body.business_name) || cleanText(businessSeed?.name) || cleanText(leadSeed?.business_name);

  if (!leadSeed && (businessName || cleanText(body.website))) {
    leadSeed = findLeadByWebsiteOrName(cleanText(body.website), businessName);
  }

  if (!businessName) {
    throw new Error("business_name is required to run a GMB audit");
  }

  return {
    clientId: cleanText(body.client_id) || cleanText(businessSeed?.client_id),
    businessId: cleanText(body.business_id) || cleanText(businessSeed?.id),
    leadId: cleanText(body.lead_id) || cleanText(leadSeed?.id),
    targetName: businessName,
    input: {
      businessName,
      city: cleanText(body.city) || cleanText(businessSeed?.city) || cleanText(leadSeed?.city),
      state: cleanText(body.state) || cleanText(businessSeed?.state) || cleanText(leadSeed?.state),
      website: cleanText(body.website) || cleanText(businessSeed?.website) || cleanText(leadSeed?.website),
      gmbUrl: cleanText(body.gmb_url) || cleanText(businessSeed?.gmb_url) || cleanText(leadSeed?.gmb_url),
      gmbClaimed: toBoolean(body.gmb_claimed) ?? (leadSeed ? Boolean(leadSeed.gmb_claimed) : null),
      gmbRating: nullableNumber(body.gmb_rating) ?? leadSeed?.gmb_rating ?? null,
      gmbReviewCount: nullableNumber(body.gmb_review_count) ?? leadSeed?.gmb_review_count ?? null,
      gmbProfileIncomplete:
        toBoolean(body.gmb_profile_incomplete) ?? (leadSeed ? Boolean(leadSeed.gmb_profile_incomplete) : null),
      citationsFound: toBoolean(body.citations_found) ?? (leadSeed ? Boolean(leadSeed.citations_found) : null),
      phone: cleanText(body.phone) || cleanText(leadSeed?.phone),
      email: cleanText(body.email) || cleanText(leadSeed?.email),
    },
  };
}

function buildWebsiteAuditInput(body: Record<string, unknown>) {
  const businessSeed = getBusinessSeed(cleanText(body.business_id));
  let leadSeed = getLeadSeed(cleanText(body.lead_id) || cleanText(businessSeed?.lead_id));

  const website =
    cleanText(body.website) || cleanText(businessSeed?.website) || cleanText(leadSeed?.website);
  const businessName =
    cleanText(body.business_name) || cleanText(businessSeed?.name) || cleanText(leadSeed?.business_name);

  if (!leadSeed && (website || businessName)) {
    leadSeed = findLeadByWebsiteOrName(website, businessName);
  }

  if (!website) {
    throw new Error("website is required to run a website audit");
  }

  return {
    clientId: cleanText(body.client_id) || cleanText(businessSeed?.client_id),
    businessId: cleanText(body.business_id) || cleanText(businessSeed?.id),
    leadId: cleanText(body.lead_id) || cleanText(leadSeed?.id),
    targetName: businessName || website,
    input: {
      website,
      businessName: businessName || leadSeed?.business_name || website,
      city: cleanText(body.city) || cleanText(businessSeed?.city) || cleanText(leadSeed?.city),
      state: cleanText(body.state) || cleanText(businessSeed?.state) || cleanText(leadSeed?.state),
    },
  };
}

function insertAuditRecord(args: {
  clientId?: string;
  businessId?: string;
  leadId?: string;
  auditType: string;
  targetName: string;
  verdict: string;
  score: number;
  result: GmbAuditResult | WebsiteAuditResult;
}) {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO audits (
      id, lead_id, client_id, business_id, audit_type, score, verdict,
      data_json, ai_insights_json, target_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    nullableText(args.leadId),
    nullableText(args.clientId),
    nullableText(args.businessId),
    args.auditType,
    args.score,
    args.verdict,
    JSON.stringify(args.result),
    null,
    args.targetName,
    "completed",
    now,
    now
  );

  if (args.businessId) {
    if (args.auditType === "website") {
      db.prepare("UPDATE client_businesses SET last_website_audit_score = ?, updated_at = ? WHERE id = ?")
        .run(args.score, now, args.businessId);
    } else if (args.auditType === "gmb" || args.auditType === "gmb_advanced") {
      db.prepare("UPDATE client_businesses SET last_gmb_audit_score = ?, updated_at = ? WHERE id = ?")
        .run(args.score, now, args.businessId);
    }
  }
  if (args.leadId) {
    const scoreLabel = Number.isFinite(args.score) ? String(args.score) : "N/A";
    const auditLabel = args.auditType.toUpperCase();


    try {
      addLeadActivity(
        args.leadId,
        `${args.auditType}_audit_completed`,
        `${auditLabel} audit completed with score ${scoreLabel}`,
        {
          audit_id: id,
          audit_type: args.auditType,
          score: args.score,
          verdict: args.verdict,
          target_name: args.targetName,
        }
      );
    } catch (error) {
      console.warn("Failed to append lead audit activity", error);
    }

    try {
      updateLeadScore(args.leadId);
    } catch (error) {
      console.warn("Failed to update lead score on audit completion:", error);
    }
  }

  const row = db
    .prepare(
      `SELECT id, lead_id, client_id, business_id, audit_type, score, verdict, data_json,
              ai_insights_json, target_name, status, created_at, updated_at
       FROM audits
       WHERE id = ?`
    )
    .get(id) as AuditRow;

  return rowToAudit(row);
}

function insertCrawlJobRecord(args: { targetName: string; crawl: WebsiteDeepCrawlResult }) {
  const db = getDb();
  const crawlJobId = uuidv4();
  const now = new Date().toISOString();
  const issueCount =
    args.crawl.pagesMissingTitle +
    args.crawl.pagesMissingMeta +
    args.crawl.pagesMissingH1 +
    args.crawl.pagesWithThinContent +
    args.crawl.brokenPages;
  const { pages, ...summary } = args.crawl;

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO audit_crawl_jobs (
        id,
        audit_scope,
        target_name,
        start_url,
        host,
        status,
        max_pages,
        pages_crawled,
        issue_count,
        summary_json,
        ai_insights_json,
        created_at,
        updated_at
      ) VALUES (?, 'website', ?, ?, ?, 'completed', ?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      crawlJobId,
      args.targetName,
      args.crawl.normalizedUrl,
      args.crawl.host,
      args.crawl.maxPages,
      args.crawl.pagesCrawled,
      issueCount,
      JSON.stringify(summary),
      now,
      now
    );

    const insertPage = db.prepare(
      `INSERT INTO audit_crawl_pages (
        id,
        crawl_job_id,
        url,
        depth,
        status_code,
        title,
        meta_description,
        h1_count,
        word_count,
        internal_link_count,
        has_schema,
        has_contact_signal,
        images_count,
        images_without_alt,
        canonical_url,
        page_summary,
        raw_metrics_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const page of pages) {
      insertPage.run(
        uuidv4(),
        crawlJobId,
        page.url,
        page.depth,
        page.statusCode,
        page.title || null,
        page.metaDescription || null,
        page.h1Count,
        page.wordCount,
        page.internalLinkCount,
        page.hasSchema ? 1 : 0,
        page.hasPhone || page.hasEmail ? 1 : 0,
        page.imagesCount,
        page.imagesWithoutAlt,
        page.canonicalUrl || null,
        page.summary,
        JSON.stringify({
          wasRedirected: page.wasRedirected,
          finalUrl: page.finalUrl,
          titleTagCount: page.titleTagCount,
          metaDescriptionCount: page.metaDescriptionCount,
          outgoingInternalCount: page.outgoingInternalCount,
          incomingInternalCount: page.incomingInternalCount,
          linksToBrokenPagesCount: page.linksToBrokenPagesCount,
          linksToRedirectPagesCount: page.linksToRedirectPagesCount,
          onlyNofollowIncoming: page.onlyNofollowIncoming,
          isOrphan: page.isOrphan,
          imageAltOver100Count: page.imageAltOver100Count,
          canonicalTagCount: page.canonicalTagCount,
          canonicalToRedirect: page.canonicalToRedirect,
          hasPhone: page.hasPhone,
          hasEmail: page.hasEmail,
          mentionsLocation: page.mentionsLocation,
          hasViewport: page.hasViewport,
          hasCanonical: page.hasCanonical,
          noindex: page.noindex,
          nofollow: page.nofollow,
          metaRefresh: page.metaRefresh,
          hasCta: page.hasCta,
          hasTrustSignal: page.hasTrustSignal,
          hasTestimonials: page.hasTestimonials,
          hasAboutSignal: page.hasAboutSignal,
          hasPolicySignal: page.hasPolicySignal,
          hasOpenGraph: page.hasOpenGraph,
          openGraphComplete: page.openGraphComplete,
          openGraphUrl: page.openGraphUrl,
          hasTwitterCard: page.hasTwitterCard,
          twitterCardComplete: page.twitterCardComplete,
          langAttribute: page.langAttribute,
          invalidLangAttribute: page.invalidLangAttribute,
          hreflangCount: page.hreflangCount,
          invalidHreflangCount: page.invalidHreflangCount,
          hasXDefaultHreflang: page.hasXDefaultHreflang,
          hreflangMissingSelf: page.hreflangMissingSelf,
          hreflangLangMismatch: page.hreflangLangMismatch,
          httpsLinksToHttpCount: page.httpsLinksToHttpCount,
          httpsLinksToHttpJsCount: page.httpsLinksToHttpJsCount,
          httpsLinksToHttpCssCount: page.httpsLinksToHttpCssCount,
          httpsLinksToHttpImageCount: page.httpsLinksToHttpImageCount,
          brokenImageCount: page.brokenImageCount,
          largeImageCount: page.largeImageCount,
          redirectedImageCount: page.redirectedImageCount,
          brokenJsCount: page.brokenJsCount,
          largeJsCount: page.largeJsCount,
          redirectedJsCount: page.redirectedJsCount,
          brokenCssCount: page.brokenCssCount,
          largeCssCount: page.largeCssCount,
          redirectedCssCount: page.redirectedCssCount,
          redirectChain: page.redirectChain,
          redirectLoop: page.redirectLoop,
          inSitemap: page.inSitemap,
          sitemapStatus: page.sitemapStatus,
          sitemapIsRedirect: page.sitemapIsRedirect,
          sitemapIsNoindex: page.sitemapIsNoindex,
          sitemapIsNonCanonical: page.sitemapIsNonCanonical,
          pageRole: page.pageRole,
          responseTimeMs: page.responseTimeMs,
          htmlBytes: page.htmlBytes,
        }),
        now
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const savedJob = getCrawlJobById(crawlJobId);
  return {
    job: savedJob ? rowToCrawlJob(savedJob) : null,
    pages: listCrawlPages(crawlJobId).map(rowToCrawlPage),
  };
}

export const seoRouter = express.Router();

seoRouter.get("/overview", (_req, res) => {
  try {
    const db = getDb();
    const currentMonth = resolveFinancePeriod({ range: "month" });
    const totalClients =
      (db.prepare("SELECT COUNT(*) as count FROM seo_clients").get() as { count: number }).count || 0;
    const activeBusinesses =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM client_businesses WHERE LOWER(COALESCE(order_status, 'active')) NOT IN ('archived', 'cancelled', 'completed')"
        )
        .get() as { count: number }).count || 0;
    const monthlyBudget =
      (db.prepare("SELECT COALESCE(SUM(monthly_budget), 0) as value FROM client_businesses").get() as { value: number })
        .value || 0;
    const monthlyBudgetByCurrency = listRecurringRevenueByCurrency();
    const auditsThisMonth =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM audits WHERE audit_type IN ('gmb', 'gmb_advanced', 'website', 'eeat') AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
        )
        .get() as { count: number }).count || 0;
    const activeCampaigns =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM campaigns WHERE LOWER(COALESCE(status, 'draft')) NOT IN ('completed', 'cancelled', 'archived')"
        )
        .get() as { count: number }).count || 0;
    const smtpAccounts =
      (db.prepare("SELECT COUNT(*) as count FROM smtp_accounts WHERE is_active = 1").get() as { count: number }).count || 0;
    const templateCount =
      (db.prepare("SELECT COUNT(*) as count FROM campaign_templates").get() as { count: number }).count || 0;
    const currentMonthEarningsByCurrency = listEarningsByCurrency({
      startDate: currentMonth.startDate,
      endDate: currentMonth.endDate,
    });

    res.json({
      totalClients,
      activeBusinesses,
      monthlyBudget,
      monthlyBudgetByCurrency,
      auditsThisMonth,
      activeCampaigns,
      smtpAccounts,
      templateCount,
      currentMonth,
      currentMonthEarningsByCurrency,
    });
  } catch (error) {
    console.error("Failed to load SEO overview", error);
    res.status(500).json({ error: "Failed to load SEO overview" });
  }
});

seoRouter.get("/clients", (req, res) => {
  try {
    const db = getDb();
    const query = cleanText(req.query.query).toLowerCase();
    const where = query
      ? `WHERE LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.primary_contact, '')) LIKE ? OR LOWER(COALESCE(c.contact_email, '')) LIKE ?`
      : "";
    const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];

    const rows = db
      .prepare(
        `SELECT
          c.*, 
          COUNT(DISTINCT b.id) as business_count,
          SUM(CASE WHEN LOWER(COALESCE(b.order_status, 'active')) NOT IN ('archived', 'cancelled', 'completed') THEN 1 ELSE 0 END) as active_orders,
          COALESCE(SUM(b.monthly_budget), 0) as monthly_budget_total
         FROM seo_clients c
         LEFT JOIN client_businesses b ON b.client_id = c.id
         ${where}
         GROUP BY c.id
         ORDER BY datetime(c.updated_at) DESC, datetime(c.created_at) DESC`
      )
      .all(...params) as SeoClientRow[];

    res.json({ items: rows.map(rowToSeoClient) });
  } catch (error) {
    console.error("Failed to load SEO clients", error);
    res.status(500).json({ error: "Failed to load SEO clients" });
  }
});

seoRouter.post("/clients", (req, res) => {
  try {
    const name = cleanText(req.body?.name);
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO seo_clients (
        id, name, primary_contact, contact_email, contact_phone, lifecycle_stage,
        notes, default_currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      nullableText(req.body?.primary_contact),
      nullableText(req.body?.contact_email),
      nullableText(req.body?.contact_phone),
      nullableText(req.body?.lifecycle_stage) || "active",
      nullableText(req.body?.notes),
      normalizeCurrency(req.body?.default_currency),
      now,
      now
    );

    const row = db
      .prepare(
        `SELECT c.*, 0 as business_count, 0 as active_orders, 0 as monthly_budget_total
         FROM seo_clients c
         WHERE c.id = ?`
      )
      .get(id) as SeoClientRow;

    res.status(201).json(rowToSeoClient(row));
  } catch (error) {
    console.error("Failed to create SEO client", error);
    res.status(500).json({ error: "Failed to create SEO client" });
  }
});

seoRouter.patch("/clients/:id", (req, res) => {
  try {
    const clientId = cleanText(req.params.id);
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM seo_clients WHERE id = ?")
      .get(clientId) as Omit<SeoClientRow, "business_count" | "active_orders" | "monthly_budget_total"> | undefined;

    if (!existing) {
      res.status(404).json({ error: "SEO client not found" });
      return;
    }

    const next = {
      name: hasOwnValue(req.body, "name") ? cleanText(req.body?.name) : existing.name,
      primary_contact: hasOwnValue(req.body, "primary_contact")
        ? nullableText(req.body?.primary_contact)
        : existing.primary_contact,
      contact_email: hasOwnValue(req.body, "contact_email")
        ? nullableText(req.body?.contact_email)
        : existing.contact_email,
      contact_phone: hasOwnValue(req.body, "contact_phone")
        ? nullableText(req.body?.contact_phone)
        : existing.contact_phone,
      lifecycle_stage: hasOwnValue(req.body, "lifecycle_stage")
        ? nullableText(req.body?.lifecycle_stage) || "active"
        : existing.lifecycle_stage,
      notes: hasOwnValue(req.body, "notes") ? nullableText(req.body?.notes) : existing.notes,
      default_currency: hasOwnValue(req.body, "default_currency")
        ? normalizeCurrency(req.body?.default_currency, normalizeCurrency(existing.default_currency))
        : normalizeCurrency(existing.default_currency),
    };

    if (!next.name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    db.prepare(
      `UPDATE seo_clients SET
        name = ?,
        primary_contact = ?,
        contact_email = ?,
        contact_phone = ?,
        lifecycle_stage = ?,
        notes = ?,
        default_currency = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      next.name,
      next.primary_contact,
      next.contact_email,
      next.contact_phone,
      next.lifecycle_stage,
      next.notes,
      next.default_currency,
      new Date().toISOString(),
      clientId
    );

    const row = db
      .prepare(
        `SELECT
          c.*, 
          COUNT(DISTINCT b.id) as business_count,
          SUM(CASE WHEN LOWER(COALESCE(b.order_status, 'active')) NOT IN ('archived', 'cancelled', 'completed') THEN 1 ELSE 0 END) as active_orders,
          COALESCE(SUM(b.monthly_budget), 0) as monthly_budget_total
         FROM seo_clients c
         LEFT JOIN client_businesses b ON b.client_id = c.id
         WHERE c.id = ?
         GROUP BY c.id`
      )
      .get(clientId) as SeoClientRow;

    res.json(rowToSeoClient(row));
  } catch (error) {
    console.error("Failed to update SEO client", error);
    res.status(500).json({ error: "Failed to update SEO client" });
  }
});

seoRouter.get("/businesses", (req, res) => {
  try {
    const db = getDb();
    const query = cleanText(req.query.query).toLowerCase();
    const clientId = cleanText(req.query.clientId);
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (query) {
      clauses.push(
        `(LOWER(b.name) LIKE ? OR LOWER(COALESCE(b.city, '')) LIKE ? OR LOWER(COALESCE(b.service_type, '')) LIKE ? OR LOWER(c.name) LIKE ?)`
      );
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }

    if (clientId) {
      clauses.push("b.client_id = ?");
      params.push(clientId);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const rows = db
      .prepare(
        `SELECT
          b.*, 
          c.name as client_name,
          (
            SELECT a.score
            FROM audits a
            WHERE a.business_id = b.id AND a.audit_type = 'gmb'
            ORDER BY datetime(a.created_at) DESC
            LIMIT 1
          ) as last_gmb_audit_score,
          (
            SELECT a.score
            FROM audits a
            WHERE a.business_id = b.id AND a.audit_type = 'website'
            ORDER BY datetime(a.created_at) DESC
            LIMIT 1
          ) as last_website_audit_score
         FROM client_businesses b
         INNER JOIN seo_clients c ON c.id = b.client_id
         ${where}
         ORDER BY datetime(b.updated_at) DESC, datetime(b.created_at) DESC`
      )
      .all(...params) as SeoBusinessRow[];

    res.json({ items: rows.map(rowToSeoBusiness) });
  } catch (error) {
    console.error("Failed to load client businesses", error);
    res.status(500).json({ error: "Failed to load client businesses" });
  }
});

seoRouter.post("/businesses", (req, res) => {
  try {
    const clientId = cleanText(req.body?.client_id);
    const name = cleanText(req.body?.name);

    if (!clientId) {
      res.status(400).json({ error: "client_id is required" });
      return;
    }

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const db = getDb();
    const client = getClientDefaults(clientId);
    if (!client) {
      res.status(404).json({ error: "SEO client not found" });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO client_businesses (
        id, client_id, lead_id, name, website, gmb_url, city, state, service_type,
        package_type, monthly_budget, currency, billing_cycle, order_status, assigned_team_member,
        start_date, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      clientId,
      nullableText(req.body?.lead_id),
      name,
      nullableText(req.body?.website),
      nullableText(req.body?.gmb_url),
      nullableText(req.body?.city),
      nullableText(req.body?.state),
      nullableText(req.body?.service_type),
      nullableText(req.body?.package_type),
      nullableNumber(req.body?.monthly_budget),
      normalizeCurrency(req.body?.currency, normalizeCurrency(client.default_currency)),
      normalizeBillingCycle(req.body?.billing_cycle),
      nullableText(req.body?.order_status) || "active",
      nullableText(req.body?.assigned_team_member),
      nullableText(req.body?.start_date),
      nullableText(req.body?.notes),
      now,
      now
    );

    const row = db
      .prepare(
        `SELECT
          b.*, 
          c.name as client_name,
          NULL as last_gmb_audit_score,
          NULL as last_website_audit_score
         FROM client_businesses b
         INNER JOIN seo_clients c ON c.id = b.client_id
         WHERE b.id = ?`
      )
      .get(id) as SeoBusinessRow;

    res.status(201).json(rowToSeoBusiness(row));
  } catch (error) {
    console.error("Failed to create client business", error);
    res.status(500).json({ error: "Failed to create client business" });
  }
});

seoRouter.patch("/businesses/:id", (req, res) => {
  try {
    const businessId = cleanText(req.params.id);
    const db = getDb();
    const existing = db.prepare("SELECT * FROM client_businesses WHERE id = ?").get(businessId) as Omit<SeoBusinessRow, "client_name" | "last_gmb_audit_score" | "last_website_audit_score"> | undefined;

    if (!existing) {
      res.status(404).json({ error: "Client business not found" });
      return;
    }

    const next = {
      client_id: hasOwnValue(req.body, "client_id") ? cleanText(req.body?.client_id) : existing.client_id,
      lead_id: hasOwnValue(req.body, "lead_id") ? nullableText(req.body?.lead_id) : existing.lead_id,
      name: hasOwnValue(req.body, "name") ? cleanText(req.body?.name) : existing.name,
      website: hasOwnValue(req.body, "website") ? nullableText(req.body?.website) : existing.website,
      gmb_url: hasOwnValue(req.body, "gmb_url") ? nullableText(req.body?.gmb_url) : existing.gmb_url,
      city: hasOwnValue(req.body, "city") ? nullableText(req.body?.city) : existing.city,
      state: hasOwnValue(req.body, "state") ? nullableText(req.body?.state) : existing.state,
      service_type: hasOwnValue(req.body, "service_type") ? nullableText(req.body?.service_type) : existing.service_type,
      package_type: hasOwnValue(req.body, "package_type") ? nullableText(req.body?.package_type) : existing.package_type,
      monthly_budget: hasOwnValue(req.body, "monthly_budget") ? nullableNumber(req.body?.monthly_budget) : existing.monthly_budget,
      currency: hasOwnValue(req.body, "currency")
        ? normalizeCurrency(req.body?.currency, normalizeCurrency(existing.currency))
        : normalizeCurrency(existing.currency),
      billing_cycle: hasOwnValue(req.body, "billing_cycle")
        ? normalizeBillingCycle(req.body?.billing_cycle)
        : normalizeBillingCycle(existing.billing_cycle),
      order_status: hasOwnValue(req.body, "order_status") ? nullableText(req.body?.order_status) || "active" : existing.order_status,
      assigned_team_member: hasOwnValue(req.body, "assigned_team_member") ? nullableText(req.body?.assigned_team_member) : existing.assigned_team_member,
      start_date: hasOwnValue(req.body, "start_date") ? nullableText(req.body?.start_date) : existing.start_date,
      notes: hasOwnValue(req.body, "notes") ? nullableText(req.body?.notes) : existing.notes,
    };

    if (!next.client_id || !next.name) {
      res.status(400).json({ error: "client_id and name are required" });
      return;
    }

    const client = getClientDefaults(next.client_id);
    if (!client) {
      res.status(404).json({ error: "SEO client not found" });
      return;
    }

    if (!next.currency) {
      next.currency = normalizeCurrency(client.default_currency);
    }

    db.prepare(
      `UPDATE client_businesses SET
        client_id = ?,
        lead_id = ?,
        name = ?,
        website = ?,
        gmb_url = ?,
        city = ?,
        state = ?,
        service_type = ?,
        package_type = ?,
        monthly_budget = ?,
        currency = ?,
        billing_cycle = ?,
        order_status = ?,
        assigned_team_member = ?,
        start_date = ?,
        notes = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      next.client_id,
      next.lead_id,
      next.name,
      next.website,
      next.gmb_url,
      next.city,
      next.state,
      next.service_type,
      next.package_type,
      next.monthly_budget,
      next.currency,
      next.billing_cycle,
      next.order_status,
      next.assigned_team_member,
      next.start_date,
      next.notes,
      new Date().toISOString(),
      businessId
    );

    const row = db
      .prepare(
        `SELECT
          b.*, 
          c.name as client_name,
          (
            SELECT a.score
            FROM audits a
            WHERE a.business_id = b.id AND a.audit_type = 'gmb'
            ORDER BY datetime(a.created_at) DESC
            LIMIT 1
          ) as last_gmb_audit_score,
          (
            SELECT a.score
            FROM audits a
            WHERE a.business_id = b.id AND a.audit_type = 'website'
            ORDER BY datetime(a.created_at) DESC
            LIMIT 1
          ) as last_website_audit_score
         FROM client_businesses b
         INNER JOIN seo_clients c ON c.id = b.client_id
         WHERE b.id = ?`
      )
      .get(businessId) as SeoBusinessRow;

    res.json(rowToSeoBusiness(row));
  } catch (error) {
    console.error("Failed to update client business", error);
    res.status(500).json({ error: "Failed to update client business" });
  }
});

seoRouter.get("/audits", (req, res) => {
  try {
    const db = getDb();
    const auditType = cleanText(req.query.auditType);
    const businessId = cleanText(req.query.businessId);
    const leadId = cleanText(req.query.leadId);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 24));
    const clauses = ["audit_type IN ('gmb', 'gmb_advanced', 'website', 'eeat')"];
    const params: Array<string | number> = [];

    if (auditType) {
      clauses.push("audit_type = ?");
      params.push(auditType);
    }

    if (businessId) {
      clauses.push("business_id = ?");
      params.push(businessId);
    }

    if (leadId) {
      clauses.push("lead_id = ?");
      params.push(leadId);
    }

    params.push(limit);

    const rows = db
      .prepare(
        `SELECT id, lead_id, client_id, business_id, audit_type, score, verdict, data_json,
                ai_insights_json, target_name, status, created_at, updated_at
         FROM audits
         WHERE ${clauses.join(" AND ")}
         ORDER BY datetime(created_at) DESC
         LIMIT ?`
      )
      .all(...params) as AuditRow[];

    res.json({ items: rows.map(rowToAudit) });
  } catch (error) {
    console.error("Failed to load audits", error);
    res.status(500).json({ error: "Failed to load audits" });
  }
});

/* ── PATCH /audits/:id — update audit fields (score, verdict, findings, etc.) ── */
seoRouter.patch("/audits/:id", (req, res) => {
  try {
    const auditId = cleanText(req.params.id);
    if (!auditId) {
      res.status(400).json({ error: "Audit id is required" });
      return;
    }

    const db = getDb();
    const existing = db
      .prepare(
        `SELECT id, lead_id, client_id, business_id, audit_type, score, verdict, data_json,
                ai_insights_json, target_name, status, created_at, updated_at
         FROM audits WHERE id = ?`
      )
      .get(auditId) as AuditRow | undefined;

    if (!existing) {
      res.status(404).json({ error: "Audit not found" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const existingData = parseJson<Record<string, unknown>>(existing.data_json, {});

    // Allow updating top-level fields
    const score = hasOwnValue(body, "score") ? Number(body.score) : existing.score;
    const verdict = hasOwnValue(body, "verdict") ? cleanText(body.verdict) : existing.verdict;
    const targetName = hasOwnValue(body, "target_name") ? cleanText(body.target_name) : existing.target_name;

    // Allow updating nested data fields
    const updatedData = { ...existingData };
    if (hasOwnValue(body, "headline")) updatedData.headline = cleanText(body.headline);
    if (hasOwnValue(body, "executiveSummary")) updatedData.executiveSummary = cleanText(body.executiveSummary);
    if (hasOwnValue(body, "summary")) updatedData.summary = cleanText(body.summary);
    if (hasOwnValue(body, "findings")) updatedData.findings = body.findings;
    if (hasOwnValue(body, "issues")) updatedData.issues = body.issues;
    if (hasOwnValue(body, "wins")) updatedData.wins = body.wins;
    if (hasOwnValue(body, "recommendations")) updatedData.recommendations = body.recommendations;
    if (hasOwnValue(body, "priorityActions")) updatedData.priorityActions = body.priorityActions;
    if (hasOwnValue(body, "overallScore")) updatedData.overallScore = Number(body.overallScore);

    const now = new Date().toISOString();

    db.prepare(
      `UPDATE audits SET score = ?, verdict = ?, target_name = ?, data_json = ?, updated_at = ? WHERE id = ?`
    ).run(score, verdict, targetName, JSON.stringify(updatedData), now, auditId);

    const updated = db
      .prepare(
        `SELECT id, lead_id, client_id, business_id, audit_type, score, verdict, data_json,
                ai_insights_json, target_name, status, created_at, updated_at
         FROM audits WHERE id = ?`
      )
      .get(auditId) as AuditRow;

    res.json(rowToAudit(updated));
  } catch (error) {
    console.error("Failed to update audit", error);
    res.status(500).json({ error: "Failed to update audit" });
  }
});

seoRouter.get("/finance", (req, res) => {
  try {
    const period = resolveFinancePeriod({
      range: req.query.range,
      month: req.query.month,
      year: req.query.year,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    const clientId = cleanText(req.query.clientId);
    const businessId = cleanText(req.query.businessId);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 12));

    const totalsByCurrency = listEarningsByCurrency({
      startDate: period.startDate,
      endDate: period.endDate,
      clientId,
      businessId,
    });
    const items = listRecentFinanceEntries({
      startDate: period.startDate,
      endDate: period.endDate,
      clientId,
      businessId,
      limit,
    });

    res.json({
      period,
      totalsByCurrency,
      items,
    });
  } catch (error) {
    console.error("Failed to load finance entries", error);
    res.status(500).json({ error: "Failed to load finance entries" });
  }
});

seoRouter.post("/finance", (req, res) => {
  try {
    const requestedBusinessId = cleanText(req.body?.business_id);
    const business = getBusinessFinanceDefaults(requestedBusinessId);

    if (requestedBusinessId && !business) {
      res.status(404).json({ error: "Client business not found" });
      return;
    }

    const clientId = cleanText(req.body?.client_id) || cleanText(business?.client_id);
    const client = getClientDefaults(clientId);
    if (!client) {
      res.status(404).json({ error: "SEO client not found" });
      return;
    }

    if (business && business.client_id !== client.id) {
      res.status(400).json({ error: "Selected business does not belong to the selected client" });
      return;
    }

    const amount = nullableNumber(req.body?.amount);
    if (amount === null || amount <= 0) {
      res.status(400).json({ error: "amount must be greater than 0" });
      return;
    }

    const entryDateValue = cleanText(req.body?.entry_date);
    const entryDate = /^\d{4}-\d{2}-\d{2}$/.test(entryDateValue)
      ? entryDateValue
      : new Date().toISOString().slice(0, 10);
    const entryType = cleanText(req.body?.entry_type).toLowerCase() === "expense" ? "expense" : "income";
    const currency = normalizeCurrency(
      req.body?.currency,
      normalizeCurrency(business?.currency || client.default_currency)
    );

    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO finance_entries (
        id, client_id, business_id, label, amount, currency, entry_type, entry_date, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      client.id,
      nullableText(business?.id),
      nullableText(req.body?.label),
      amount,
      currency,
      entryType,
      entryDate,
      nullableText(req.body?.notes),
      now,
      now
    );

    const saved = getFinanceEntryById(id);
    if (!saved) {
      res.status(500).json({ error: "Failed to save finance entry" });
      return;
    }

    res.status(201).json({
      id: saved.id,
      client_id: saved.client_id,
      client_name: saved.client_name,
      business_id: saved.business_id,
      business_name: saved.business_name,
      label: saved.label,
      amount: Number(saved.amount || 0),
      currency: normalizeCurrency(saved.currency),
      entry_type: saved.entry_type,
      entry_date: saved.entry_date,
      notes: saved.notes,
      created_at: saved.created_at,
    });
  } catch (error) {
    console.error("Failed to create finance entry", error);
    res.status(500).json({ error: "Failed to create finance entry" });
  }
});

seoRouter.get("/email-ops", (_req, res) => {
  try {
    const db = getDb();
    const smtpAccounts =
      (db.prepare("SELECT COUNT(*) as count FROM smtp_accounts WHERE is_active = 1").get() as { count: number }).count || 0;
    const templateCount =
      (db.prepare("SELECT COUNT(*) as count FROM campaign_templates").get() as { count: number }).count || 0;
    const activeCampaigns =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM campaigns WHERE LOWER(COALESCE(status, 'draft')) NOT IN ('completed', 'cancelled', 'archived')"
        )
        .get() as { count: number }).count || 0;

    res.json({
      mode: "outbound-only",
      smtpAccounts,
      templateCount,
      activeCampaigns,
      spamGuardEnabled: true,
      providerPresets: EMAIL_SENDER_PROVIDER_PRESETS,
      note:
        "Legacy email-sender inbox features are intentionally excluded. SMBify OS uses outbound-only sending, templates, SMTP presets, and composer guardrails.",
    });
  } catch (error) {
    console.error("Failed to load email ops status", error);
    res.status(500).json({ error: "Failed to load email ops status" });
  }
});

seoRouter.get("/audit-scoring-config", (_req, res) => {
  try {
    const config = readAdvancedWebsiteScoringConfigFromSettings();
    res.json(config);
  } catch (error) {
    console.error("Failed to load audit scoring config", error);
    res.status(500).json({ error: "Failed to load audit scoring config" });
  }
});

seoRouter.patch("/audit-scoring-config", (req, res) => {
  try {
    const current = readAdvancedWebsiteScoringConfigFromSettings();
    const next = mergeAdvancedWebsiteScoringConfig(current, req.body);
    writeAdvancedWebsiteScoringConfigToSettings(next);
    res.json(next);
  } catch (error) {
    console.error("Failed to update audit scoring config", error);
    res.status(500).json({ error: "Failed to update audit scoring config" });
  }
});

seoRouter.get("/crawl-jobs", (req, res) => {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM audit_crawl_jobs
         WHERE audit_scope = 'website'
         ORDER BY datetime(created_at) DESC
         LIMIT ?`
      )
      .all(limit) as CrawlJobRow[];

    res.json({ items: rows.map(rowToCrawlJob) });
  } catch (error) {
    console.error("Failed to list crawl jobs", error);
    res.status(500).json({ error: "Failed to list crawl jobs" });
  }
});

seoRouter.get("/crawl-jobs/:id", (req, res) => {
  try {
    const crawlJobId = cleanText(req.params.id);
    if (!crawlJobId) {
      res.status(400).json({ error: "Crawl job id is required" });
      return;
    }

    const job = getCrawlJobById(crawlJobId);
    if (!job) {
      res.status(404).json({ error: "Crawl job not found" });
      return;
    }

    res.json({
      job: rowToCrawlJob(job),
      pages: listCrawlPages(crawlJobId).map(rowToCrawlPage),
    });
  } catch (error) {
    console.error("Failed to fetch crawl job", error);
    res.status(500).json({ error: "Failed to fetch crawl job" });
  }
});

seoRouter.post("/crawl-jobs", async (req, res) => {
  try {
    const payload = buildWebsiteAuditInput((req.body ?? {}) as Record<string, unknown>);
    const maxPages = Math.max(3, Math.min(60, Number(req.body?.maxPages) || 10));
    const crawl = await runWebsiteDeepCrawl({
      website: payload.input.website,
      businessName: payload.targetName,
      city: payload.input.city,
      state: payload.input.state,
      maxPages,
    });
    const saved = insertCrawlJobRecord({
      targetName: payload.targetName,
      crawl,
    });

    res.status(201).json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run deep crawl";
    res.status(400).json({ error: message });
  }
});

seoRouter.post("/audits/gmb", (req, res) => {
  try {
    const payload = buildGmbAuditInput((req.body ?? {}) as Record<string, unknown>);
    const result = runGmbAudit(payload.input);
    const saved = insertAuditRecord({
      clientId: payload.clientId,
      businessId: payload.businessId,
      leadId: payload.leadId,
      auditType: "gmb",
      targetName: payload.targetName,
      verdict: result.verdict,
      score: result.score,
      result,
    });

    res.status(201).json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run GMB audit";
    res.status(400).json({ error: message });
  }
});

seoRouter.post("/audits/website/advanced", async (req, res) => {
  try {
    const payload = buildWebsiteAuditInput((req.body ?? {}) as Record<string, unknown>);
    const maxPages = Math.max(3, Math.min(60, Number(req.body?.maxPages) || 10));
    const scoringConfig = readAdvancedWebsiteScoringConfigFromSettings();
    const result = await runAdvancedWebsiteAudit({
      website: payload.input.website,
      businessName: payload.targetName,
      city: payload.input.city,
      state: payload.input.state,
      maxPages,
      scoringConfig,
    });
    const crawlSaved = insertCrawlJobRecord({
      targetName: payload.targetName,
      crawl: result.crawl,
    });
    const auditSaved = insertAuditRecord({
      clientId: payload.clientId,
      businessId: payload.businessId,
      leadId: payload.leadId,
      auditType: "website",
      targetName: payload.targetName,
      verdict: result.audit.verdict,
      score: result.audit.score,
      result: result.audit,
    });

    res.status(201).json({
      audit: auditSaved,
      crawlJob: crawlSaved.job,
      crawlPages: crawlSaved.pages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run advanced website audit";
    res.status(400).json({ error: message });
  }
});

seoRouter.post("/audits/website", async (req, res) => {
  try {
    const payload = buildWebsiteAuditInput((req.body ?? {}) as Record<string, unknown>);
    const result = await runWebsiteAudit(payload.input);
    const saved = insertAuditRecord({
      clientId: payload.clientId,
      businessId: payload.businessId,
      leadId: payload.leadId,
      auditType: "website",
      targetName: payload.targetName,
      verdict: result.verdict,
      score: result.score,
      result,
    });

    res.status(201).json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run website audit";
    res.status(400).json({ error: message });
  }
});

const execPromise = promisify(exec);

seoRouter.post("/audits/gmb/advanced", async (req, res) => {
  try {
    const payload = buildGmbAuditInput((req.body ?? {}) as Record<string, unknown>);
    const businessName = payload.targetName || payload.input.businessName || "GMB Business";
    const city = payload.input.city || "Local City";
    const state = payload.input.state || "Local State";
    const serviceType = cleanText(req.body?.service_type) || "Local Business";

    const systemPrompt = "You are a professional local SEO auditor. Optimize GMB profiles by dynamically generating custom categories, services, products, storefront photo prompts, GMB audits, high-intent keywords, and localized competitor analysis based on inputs, exporting them as structured JSON.";

    const prompt = `Act as an expert local SEO consultant. Perform a deep audit of the GMB profile and generate a complete optimization catalog for the business '${businessName}' located in '${city}, ${state}' (Niche: '${serviceType}').
    
    IMPORTANT: You must return a valid JSON object matching the following structure EXACTLY. Do not include markdown formatting other than the JSON itself. Do not write extra commentary outside the JSON block.
    
    JSON Schema:
    {
      "business_name": "${businessName}",
      "categories": ["Primary Niche Category", "Secondary Related Category 1", "Secondary Related Category 2"],
      "services": [
        {
          "category": "Primary Niche Category",
          "name": "Specific Service 1",
          "description": "Must be a unique description of 250 to 300 characters, including spaces, explaining the local service."
        }
      ],
      "high_intent_keywords": [
        {
          "keyword": "localized keyword phrase",
          "intent": "Transactional",
          "action": "Description of where to use this keyword (e.g. website, GMB description)"
        }
      ],
      "products": [
        {
          "name": "Product Name 1",
          "matched_service": "Specific Service 1",
          "description": "Product description rich in keywords.",
          "image_prompt": "Ultra-realistic iPhone photo prompt of this product."
        }
      ],
      "service_areas": [
        {
          "name": "Nearby Neighborhood/City, State",
          "proximity": "Nearby (e.g. 5 miles)",
          "recommendation": "Optimization suggestion for targeting this area"
        }
      ],
      "competition_analysis": {
        "summary": "Overview of the competitive landscape in this city/niche.",
        "table": [
          {
            "competitor_name": "Top Competitor Name",
            "rating": "4.6",
            "reviews": "142",
            "strengths": "What they do well.",
            "weaknesses": "Gaps we can exploit."
          }
        ],
        "detailed_profiles": [
          {
            "competitor_name": "Top Competitor Name",
            "winning_points": "Why they rank in the Local Pack.",
            "counter_strategy": "Actionable suggestions to beat them."
          }
        ]
      },
      "gmb_audit": {
        "health_score": "65%",
        "summary": "Checklist summary of GMB optimizations needed.",
        "issues": [
          "Issue 1...",
          "Issue 2..."
        ],
        "suggestions": [
          "Suggestion 1...",
          "Suggestion 2..."
        ]
      },
      "photo_prompts": {
        "storefront": [
          "Ultra-realistic iPhone photo prompt 1...",
          "Ultra-realistic iPhone photo prompt 2..."
        ]
      }
    }
    
    Ensure you provide at least 15-20 services, 5-8 products, 15-20 service areas, 5 competitors, 5 storefront photo prompts, 5 audit issues/suggestions, and 50+ high-intent keywords in the catalog.
    Service descriptions must satisfy the length constraint (250-300 characters).
    
    CRITICAL: All double quotes inside string values must be properly escaped (e.g., use \\\" instead of \"). Do not use unescaped double quotes inside any string value, as it will break the JSON parser. Do not include unescaped newlines inside string values. Output ONLY the raw JSON block without any markdown wrapping or conversational text.`;

    const generated = await generateAiText({
      task: "audit",
      preferredProviderKey: cleanText(req.body?.providerKey),
      systemPrompt,
      prompt,
      temperature: 0.55,
      maxTokens: 8000,
    });

    let auditData: any;
    try {
      const jsonStart = generated.output.indexOf("{");
      const jsonEnd = generated.output.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error("No JSON object found in output");
      }
      let rawJson = generated.output.substring(jsonStart, jsonEnd + 1);
      // Clean trailing commas before parsing
      rawJson = rawJson.replace(/,\s*([\]}])/g, "$1");
      auditData = JSON.parse(rawJson);
    } catch (e) {
      console.error("Failed to parse AI output as JSON, output was:", generated.output);
      throw new Error("AI output was not valid JSON: " + (e as Error).message);
    }

    const bName = (auditData.business_name || businessName).trim();
    const safeName = bName.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_");

    const tempDir = path.resolve(process.cwd(), "scratch");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `temp_gmb_data_${uuidv4()}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(auditData, null, 2), "utf8");

    const pythonPath = path.resolve(process.cwd(), "GMB Automation", ".venv", "Scripts", "python.exe");
    const scriptPath = path.resolve(process.cwd(), "GMB Automation", "scripts", "gmb_exporter.py");
    const outputDir = path.resolve(process.cwd(), "GMB Automation", "businesses");

    const cmd = `"${pythonPath}" "${scriptPath}" --json-file "${tempFilePath}" --output-dir "${outputDir}"`;
    
    console.log(`[seo] Running GMB exporter command: ${cmd}`);
    
    try {
      await execPromise(cmd);
      console.log(`[seo] GMB exporter completed successfully for ${safeName}`);
    } catch (pyErr) {
      console.error("[seo] Failed to run python gmb_exporter.py:", pyErr);
      throw new Error("Python report generation failed: " + (pyErr as Error).message);
    } finally {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch (unErr) {
        console.error("[seo] Failed to delete temp file:", unErr);
      }
    }

    const healthScoreStr = auditData.gmb_audit?.health_score || "75%";
    const score = Number(healthScoreStr.replace("%", "")) || 75;
    const verdict = score >= 82 ? "Strong" : score >= 60 ? "Needs Work" : "Urgent";

    const customResult = {
      ...auditData,
      safe_name: safeName,
      is_advanced: true,
      xlsx_file: `GMB_Optimization_Data_Entry.xlsx`,
      docx_file: `GMB_Optimization_Master_Report.docx`,
      summary: auditData.gmb_audit?.summary || "",
      issues: (auditData.gmb_audit?.issues || []).map((iss: string) => ({ severity: "medium", title: iss, detail: "" })),
      wins: auditData.categories || [],
      recommendations: auditData.gmb_audit?.suggestions || []
    };

    const saved = insertAuditRecord({
      clientId: payload.clientId,
      businessId: payload.businessId,
      leadId: payload.leadId,
      auditType: "gmb_advanced",
      targetName: bName,
      verdict,
      score,
      result: customResult as any,
    });

    res.status(201).json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run GMB advanced audit";
    res.status(400).json({ error: message });
  }
});

seoRouter.get("/audits/gmb/download/:id", (req, res) => {
  try {
    const id = req.params.id;
    const fileType = req.query.fileType === "docx" ? "docx" : "xlsx";
    
    const db = getDb();
    const row = db.prepare("SELECT data_json FROM audits WHERE id = ?").get(id) as { data_json: string } | undefined;
    
    if (!row) {
      res.status(404).json({ error: "Audit not found" });
      return;
    }
    
    const data = JSON.parse(row.data_json);
    const safeName = data.safe_name;
    
    if (!safeName) {
      res.status(400).json({ error: "Audit does not have advanced files associated with it" });
      return;
    }
    
    const filename = fileType === "docx" ? "GMB_Optimization_Master_Report.docx" : "GMB_Optimization_Data_Entry.xlsx";
    const filePath = path.resolve(process.cwd(), "GMB Automation", "businesses", safeName, filename);
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: `File not found on disk at: ${filePath}` });
      return;
    }
    
    res.download(filePath, filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to download audit file";
    res.status(500).json({ error: message });
  }
});

// POST /api/seo/audits/geo-grid
seoRouter.post("/audits/geo-grid", (req, res) => {
  try {
    const {
      businessName,
      keyword,
      city,
      state,
      centerLat,
      centerLng,
      radiusMiles,
      gridSize,
      baseScore,
      knownCompetitors,
    } = req.body;

    if (!businessName || !keyword) {
      res.status(400).json({ error: "businessName and keyword are required" });
      return;
    }

    const gridResult = generateGeoGridAudit({
      businessName: String(businessName).trim(),
      keyword: String(keyword).trim(),
      city: city ? String(city).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      centerLat: centerLat ? Number(centerLat) : undefined,
      centerLng: centerLng ? Number(centerLng) : undefined,
      radiusMiles: radiusMiles ? Number(radiusMiles) : 5,
      gridSize: gridSize === 3 || gridSize === 7 ? gridSize : 5,
      baseScore: baseScore != null ? Number(baseScore) : 65,
      knownCompetitors: Array.isArray(knownCompetitors) ? knownCompetitors : [],
    });

    res.json(gridResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate geo-grid audit";
    res.status(500).json({ error: message });
  }
});

// POST /api/seo/audits/competitors
seoRouter.post("/audits/competitors", (req, res) => {
  try {
    const { leadId, businessName, niche, city, rating, reviewCount, claimed, websiteScore } = req.body;

    if (!businessName) {
      res.status(400).json({ error: "businessName is required" });
      return;
    }

    const report = generateCompetitorBenchmark({
      leadId: leadId ? String(leadId) : undefined,
      businessName: String(businessName).trim(),
      niche: String(niche || "Local Business").trim(),
      city: String(city || "Local Area").trim(),
      rating: rating != null ? Number(rating) : undefined,
      reviewCount: reviewCount != null ? Number(reviewCount) : undefined,
      claimed: claimed != null ? Boolean(claimed) : undefined,
      websiteScore: websiteScore != null ? Number(websiteScore) : undefined,
    });

    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate competitor benchmark";
    res.status(500).json({ error: message });
  }
});

// POST /api/seo/audits/nap-check
seoRouter.post("/audits/nap-check", (req, res) => {
  try {
    const { businessName, address, city, state, phone, website, baseScore } = req.body;

    if (!businessName) {
      res.status(400).json({ error: "businessName is required" });
      return;
    }

    const napReport = generateNapAudit({
      businessName: String(businessName).trim(),
      address: address ? String(address).trim() : undefined,
      city: city ? String(city).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      phone: phone ? String(phone).trim() : undefined,
      website: website ? String(website).trim() : undefined,
      baseScore: baseScore != null ? Number(baseScore) : 70,
    });

    res.json(napReport);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run NAP citation check";
    res.status(500).json({ error: message });
  }
});

// POST /api/seo/audits/review-sentiment
seoRouter.post("/audits/review-sentiment", (req, res) => {
  try {
    const { businessName, niche, rating, reviewCount } = req.body;

    if (!businessName) {
      res.status(400).json({ error: "businessName is required" });
      return;
    }

    const sentimentReport = generateReviewSentimentAnalysis({
      businessName: String(businessName).trim(),
      niche: niche ? String(niche).trim() : undefined,
      rating: rating != null ? Number(rating) : undefined,
      reviewCount: reviewCount != null ? Number(reviewCount) : undefined,
    });

    res.json(sentimentReport);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate review sentiment report";
    res.status(500).json({ error: message });
  }
});

// GET /api/seo/recurring/status
seoRouter.get("/recurring/status", (_req, res) => {
  try {
    const status = getRecurringAuditStatus();
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch recurring audit status";
    res.status(500).json({ error: message });
  }
});

// POST /api/seo/recurring/run-now
seoRouter.post("/recurring/run-now", async (_req, res) => {
  try {
    const results = await executeRecurringClientAudits();
    res.json({ success: true, count: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to execute recurring client audits";
    res.status(500).json({ error: message });
  }
});