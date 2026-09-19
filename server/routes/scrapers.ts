import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import express from "express";
import { ProxyAgent } from "undici";
import { v4 as uuidv4 } from "uuid";

import { getDb, tenantLocalStorage } from "../db/database.js";
import { getMainDb } from "../db/mainDb.js";
import { checkScraperLimit } from "../utils/limitsMiddleware.js";
import { generateAiText } from "../modules/ai/providers.js";
import { runEeatAuditReport, type EeatAuditReport } from "../modules/audits/eeat.js";
import { evaluateOutreachReadiness, type AuditSnapshot, type OutreachReadiness } from "../modules/audits/readiness.js";
import { insertStoredAuditRecord, listStoredAuditsByIds, type StoredAuditRecord } from "../modules/audits/store.js";
import { runGmbAudit, type GmbAuditResult } from "../modules/audits/gmb.js";
import { runWebsiteAudit, type WebsiteAuditResult } from "../modules/audits/website.js";
import { importLeads, updateLeadScore } from "../modules/leads/repository.js";
import { autoAuditQueue } from "../modules/leads/autoAudit.js";
import { plainTextToEmailHtml } from "../modules/outreach/html.js";
import {
  deriveAppendedLeadIds,
  summarizePersonalizationByLeadIds,
  type CampaignPersonalizationMode,
} from "../modules/outreach/personalizationCounters.js";
import { appendLeadIdsToCampaign, createCampaignDraftFromLeadIds } from "../modules/outreach/repository.js";
import { getRecommendedCampaignTemplate, getSourceLabel } from "../modules/outreach/templates.js";
import type { LeadInput } from "../types/lead.js";
import { splitAddress } from "../utils/address.js";

const require = createRequire(import.meta.url);
const scraperProxySupport = require("../modules/scraper-proxy.cjs") as {
  maskProxyUrl: (value: string) => string;
  normalizeProxyUrl: (value: string) => string;
};

type ScraperSource =
  | "yellowpages"
  | "gmb_scraper"
  | "state_directory"
  | "yelp_scraper"
  | "bbb_scraper"
  | "website_enrichment"
  | "chamber_directory"
  | "license_registry"
  | "ads_google"
  | "ads_meta"
  | "ads_bing";

type ScraperJobStatus = "queued" | "running" | "paused" | "complete" | "error" | "cancelled";

type ScraperJobRow = {
  id: string;
  job_label: string | null;
  source: ScraperSource;
  status: ScraperJobStatus;
  staged_count?: number;
  input_json: string | null;
  output_file: string | null;
  csv_file: string | null;
  imported_count: number;
  total_found: number;
  progress_percent: number;
  progress_message: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type StagedLeadRow = {
  id: string;
  job_id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  niche: string | null;
  gmb_url: string | null;
  gmb_claimed: number;
  gmb_rating: number | null;
  gmb_review_count: number | null;
  has_website: number;
  source: ScraperSource;
  status: string;
  notes: string | null;
  is_selected: number;
  added_to_dashboard: number;
  website_audit_id: string | null;
  website_audit_score: number | null;
  website_audit_verdict: string | null;
  website_audit_status: string;
  website_audit_summary: string | null;
  gmb_audit_id: string | null;
  gmb_audit_score: number | null;
  gmb_audit_verdict: string | null;
  gmb_audit_status: string;
  gmb_audit_summary: string | null;
  eeat_audit_id: string | null;
  eeat_audit_score: number | null;
  eeat_audit_verdict: string | null;
  eeat_audit_status: string;
  eeat_audit_summary: string | null;
  audit_readiness: string;
  audit_readiness_reason: string | null;
  last_audited_at: string | null;
  created_at: string;
  added_at: string | null;
};

type StagedLeadContactFilter =
  | "has_email"
  | "has_phone"
  | "has_website"
  | "contact_ready"
  | "missing_contact"
  | "missing_website";

type StagedLeadStageFilter = "pending" | "added" | "all";
type StagedLeadAuditStatus = "not_run" | "completed" | "failed" | "unavailable";
type StagedLeadAuditCoverageFilter = "audited" | "unaudited" | "partial";

type CampaignReportSnapshot = {
  auditId: string;
  status: StagedLeadAuditStatus;
  score: number | null;
  verdict: string;
  summary: string;
};

type CampaignReportContext = {
  sourceJobId: string;
  stagedLeadId: string;
  businessName: string;
  city: string;
  state: string;
  niche: string;
  website: string;
  gmbUrl: string;
  readiness: string;
  readinessReason: string;
  generatedAt: string;
  audits: {
    website: CampaignReportSnapshot | null;
    gmb: CampaignReportSnapshot | null;
    eeat: CampaignReportSnapshot | null;
  };
};

const activeProcesses = new Map<string, any>();
const interruptedJobs = new Map<string, "paused" | "cancelled">();

const DIRECTORY_HOST_BLOCKLIST = [
  "yellowpages.com",
  "yelp.com",
  "bbb.org",
  "google.com",
  "googleusercontent.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "mapquest.com",
  "waze.com",
];

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function splitProxyText(value: unknown): string[] {
  return cleanText(value)
    .split(/[\n,;]+/g)
    .map((entry) => cleanText(entry))
    .filter(Boolean);
}

function normalizeScraperProxyUrl(value: unknown): string {
  const normalized = scraperProxySupport.normalizeProxyUrl(cleanText(value));
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    const authority = normalized.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/, 1)[0] || "";
    const hostPort = authority.includes("@") ? authority.slice(authority.lastIndexOf("@") + 1) : authority;
    const portMatch = hostPort.match(/:(\d{1,5})$/);
    const port = portMatch ? Number(portMatch[1]) : NaN;

    if (!parsed.hostname || !Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error("Proxy must include host and port");
    }

    return normalized.replace(/\/$/g, "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid proxy URL";
    throw new Error(`Invalid proxy format. Use ip:port:user:pass or a proxy URL. ${message}`);
  }
}

function normalizeScraperProxyList(value: unknown): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const entry of splitProxyText(value)) {
    const normalized = normalizeScraperProxyUrl(entry);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function getPayloadScraperProxyUrl(payload: Record<string, unknown>): string {
  return normalizeScraperProxyUrl(
    payload.scraperProxyUrl ?? payload.scraperProxy ?? payload.proxyUrl ?? payload.proxy
  );
}

function getPayloadScraperProxyUrls(payload: Record<string, unknown>): string[] {
  const directList = payload.scraperProxyUrls ?? payload.proxyUrls;
  if (Array.isArray(directList)) {
    return normalizeScraperProxyList(directList.join("\n"));
  }

  return normalizeScraperProxyList(directList);
}

function getSavedScraperProxySettings(): {
  enabled: boolean;
  proxiesText: string;
  proxies: string[];
  maskedProxies: string[];
  nextIndex: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT scraper_proxy_enabled, scraper_proxy_urls, scraper_proxy_cursor
       FROM app_settings
       WHERE id = 1`
    )
    .get() as
    | {
        scraper_proxy_enabled?: number | null;
        scraper_proxy_urls?: string | null;
        scraper_proxy_cursor?: number | null;
      }
    | undefined;

  const proxiesText = cleanText(row?.scraper_proxy_urls);
  const proxies = normalizeScraperProxyList(proxiesText);
  const cursor = Math.max(0, Number(row?.scraper_proxy_cursor || 0));
  const nextIndex = proxies.length > 0 ? cursor % proxies.length : 0;

  return {
    enabled: Boolean(row?.scraper_proxy_enabled),
    proxiesText,
    proxies,
    maskedProxies: proxies.map((entry) => scraperProxySupport.maskProxyUrl(entry)),
    nextIndex,
  };
}

function saveScraperProxySettings(input: {
  enabled: boolean;
  proxiesText: string;
}): ReturnType<typeof getSavedScraperProxySettings> {
  const proxies = normalizeScraperProxyList(input.proxiesText);
  const savedText = splitProxyText(input.proxiesText).join("\n");
  const enabled = input.enabled && proxies.length > 0;
  const now = new Date().toISOString();
  const db = getDb();

  db.prepare(
    `INSERT INTO app_settings (
      id, scraper_proxy_enabled, scraper_proxy_urls, scraper_proxy_cursor, updated_at
    ) VALUES (1, ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET
      scraper_proxy_enabled = excluded.scraper_proxy_enabled,
      scraper_proxy_urls = excluded.scraper_proxy_urls,
      scraper_proxy_cursor = CASE
        WHEN app_settings.scraper_proxy_urls = excluded.scraper_proxy_urls
        THEN app_settings.scraper_proxy_cursor
        ELSE 0
      END,
      updated_at = excluded.updated_at`
  ).run(enabled ? 1 : 0, savedText, now);

  return getSavedScraperProxySettings();
}

function pickSavedScraperProxyUrl(): string {
  const settings = getSavedScraperProxySettings();
  if (!settings.enabled || settings.proxies.length === 0) {
    return "";
  }

  const proxyUrl = settings.proxies[settings.nextIndex] || "";
  const nextCursor = settings.nextIndex + 1;
  getDb()
    .prepare(
      `UPDATE app_settings
       SET scraper_proxy_cursor = ?, updated_at = ?
       WHERE id = 1`
    )
    .run(nextCursor, new Date().toISOString());

  return proxyUrl;
}

function getScraperProxyFromSource(proxySource: Record<string, unknown> | null | undefined): string {
  const source = proxySource || {};
  const singleProxy = getPayloadScraperProxyUrl(source);
  if (singleProxy) {
    return singleProxy;
  }

  const proxyList = getPayloadScraperProxyUrls(source);
  if (proxyList.length > 0) {
    return proxyList[0] || "";
  }

  return pickSavedScraperProxyUrl();
}

function withScraperProxy<T extends Record<string, unknown>>(
  payload: T,
  proxySource: Record<string, unknown> | null | undefined
): T & { scraperProxyUrl?: string } {
  const proxyUrl = getScraperProxyFromSource(proxySource);
  return proxyUrl ? { ...payload, scraperProxyUrl: proxyUrl } : payload;
}

function prepareScraperPayload<T extends Record<string, unknown>>(
  payload: T,
  req: express.Request,
  res: express.Response
): (T & { scraperProxyUrl?: string }) | null {
  try {
    return withScraperProxy(payload, req.body as Record<string, unknown>);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid proxy format" });
    return null;
  }
}

function buildScraperChildEnv(proxyUrl: string): NodeJS.ProcessEnv {
  if (!proxyUrl) {
    return process.env;
  }

  return {
    ...process.env,
    SCRAPER_PROXY_URL: proxyUrl,
    SCRAPER_PROXY_URLS: proxyUrl,
  };
}

function createFetchProxyDispatcher(proxyUrl: string, label = "scraper"): unknown {
  const cleaned = cleanText(proxyUrl);
  if (!cleaned) {
    return undefined;
  }

  try {
    const protocol = new URL(cleaned).protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      console.warn(
        `[${label}] Fetch proxy skipped for ${scraperProxySupport.maskProxyUrl(
          cleaned
        )}; enrichment fetch proxy supports http/https proxies.`
      );
      return undefined;
    }

    return new ProxyAgent(cleaned);
  } catch (error) {
    console.error(
      `[${label}] Failed to create fetch proxy ${scraperProxySupport.maskProxyUrl(cleaned)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractHost(value: string): string {
  const normalized = cleanText(value);
  if (!normalized) return "";

  const withProtocol = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  try {
    return new URL(withProtocol).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeWebsiteUrl(value: string): string {
  const cleaned = cleanText(value);
  if (!cleaned) return "";

  const withProtocol = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;

  try {
    const parsed = new URL(withProtocol);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.protocol}//${parsed.hostname}${pathname}`;
  } catch {
    return "";
  }
}

function getJobCampaignContext(jobId: string): {
  source: ScraperSource;
  sourceLabel: string;
  pendingCount: number;
  selectedPendingCount: number;
  city: string;
  niche: string;
  recommendedTemplate: ReturnType<typeof getRecommendedCampaignTemplate>;
} {
  const db = getDb();
  const job = getJob(jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  const counts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN added_to_dashboard = 0 THEN 1 ELSE 0 END) as pending_count,
         SUM(CASE WHEN added_to_dashboard = 0 AND is_selected = 1 THEN 1 ELSE 0 END) as selected_pending_count
       FROM scraper_staged_leads
       WHERE job_id = ?`
    )
    .get(jobId) as { pending_count: number | null; selected_pending_count: number | null };

  const cityRow = db
    .prepare(
      `SELECT city, COUNT(*) as count
       FROM scraper_staged_leads
       WHERE job_id = ? AND added_to_dashboard = 0 AND TRIM(COALESCE(city, '')) <> ''
       GROUP BY city
       ORDER BY count DESC, city ASC
       LIMIT 1`
    )
    .get(jobId) as { city?: string } | undefined;

  const nicheRow = db
    .prepare(
      `SELECT niche, COUNT(*) as count
       FROM scraper_staged_leads
       WHERE job_id = ? AND added_to_dashboard = 0 AND TRIM(COALESCE(niche, '')) <> ''
       GROUP BY niche
       ORDER BY count DESC, niche ASC
       LIMIT 1`
    )
    .get(jobId) as { niche?: string } | undefined;

  const city = cleanText(cityRow?.city);
  const niche = cleanText(nicheRow?.niche);

  return {
    source: job.source,
    sourceLabel: getSourceLabel(job.source),
    pendingCount: Number(counts.pending_count || 0),
    selectedPendingCount: Number(counts.selected_pending_count || 0),
    city,
    niche,
    recommendedTemplate: getRecommendedCampaignTemplate({
      source: job.source,
      city,
      niche,
    }),
  };
}

function isDirectoryHost(host: string): boolean {
  return DIRECTORY_HOST_BLOCKLIST.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function summarizeErrorMessage(raw: string): string {
  const compact = cleanText(raw).replace(/\s+/g, " ");
  if (!compact) return "Unknown scraper error";
  return compact.length > 700 ? `${compact.slice(0, 700)}...` : compact;
}

function extractEmailsFromText(raw: string): string[] {
  const text = String(raw || "");
  const matches = text.match(EMAIL_REGEX) || [];

  const ignored = [
    "example.com",
    "yourdomain.com",
    "wix.com",
    "sentry.io",
    "cloudflare.com",
  ];

  const dedupe = new Set<string>();
  const out: string[] = [];

  for (const value of matches) {
    const email = value.trim().toLowerCase().replace(/[),.;:]+$/, "");
    if (!email.includes("@")) continue;
    if (email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".webp")) continue;
    if (ignored.some((domain) => email.endsWith(`@${domain}`))) continue;
    if (dedupe.has(email)) continue;

    dedupe.add(email);
    out.push(email);
  }

  return out;
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = 10000,
  dispatcher?: unknown
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    };

    if (dispatcher) {
      fetchOptions.dispatcher = dispatcher;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractContactLinks(html: string, baseUrl: string): string[] {
  const hrefRegex = /href=["']([^"']+)["']/gi;
  const allow = ["contact", "about", "support", "team", "imprint", "get-in-touch"];
  const links: string[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = cleanText(match[1]);
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (!allow.some((token) => href.toLowerCase().includes(token))) continue;

    try {
      const absolute = new URL(href, baseUrl).toString();
      if (!links.includes(absolute)) {
        links.push(absolute);
      }
    } catch {
      continue;
    }

    if (links.length >= 3) {
      break;
    }
  }

  return links;
}

function stripHtmlTags(value: string): string {
  return cleanText(String(value || "").replace(/<[^>]*>/g, " "));
}

function extractTagText(html: string, tagName: string): string {
  const match = String(html || "").match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return stripHtmlTags(match?.[1] || "");
}

function extractMetaContent(html: string, name: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([\\s\\S]*?)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+name=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([\\s\\S]*?)["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return "";
}

function extractSocialLinks(html: string, baseUrl: string): string[] {
  const hrefRegex = /href=["']([^"']+)["']/gi;
  const allow = ["facebook.com", "instagram.com", "linkedin.com", "youtube.com", "x.com", "twitter.com"];
  const links: string[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = cleanText(match[1]);
    if (!href) continue;

    try {
      const absolute = new URL(href, baseUrl).toString();
      if (!allow.some((token) => absolute.toLowerCase().includes(token))) {
        continue;
      }

      if (!links.includes(absolute)) {
        links.push(absolute);
      }
    } catch {
      continue;
    }

    if (links.length >= 4) {
      break;
    }
  }

  return links;
}

function extractServiceAreaHints(html: string, lead: Partial<LeadInput>): string[] {
  const text = stripHtmlTags(html).replace(/\s+/g, " ");
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /(?:serving|service areas?|areas served|proudly serving)\s*[:\-]?\s*([^.!?]{4,120})/gi,
    /(?:locations?|cities?)\s*[:\-]?\s*([^.!?]{4,120})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(text)) !== null) {
      const value = cleanText(match[1]).replace(/\s{2,}/g, " ");
      if (!value) continue;

      const normalized = value.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(value);

      if (out.length >= 3) {
        return out;
      }
    }
  }

  const city = cleanText(lead.city);
  if (city && text.toLowerCase().includes(city.toLowerCase()) && !seen.has(city.toLowerCase())) {
    out.push(city);
  }

  return out.slice(0, 3);
}

function sanitizeNoteSegment(value: string): string {
  return cleanText(value).replace(/[|]+/g, "/").replace(/[;]{2,}/g, ";").slice(0, 220);
}

function replaceNotesSegment(notes: string, key: string, content: string): string {
  const base = cleanText(notes).replace(new RegExp(`\\s*\\|\\s*${key}[^|]*`, "gi"), "");
  const segment = cleanText(content) ? `${key}${cleanText(content)}` : "";
  return [base, segment].filter(Boolean).join(" | ");
}

async function inspectWebsiteSignals(
  website: string,
  lead: Partial<LeadInput>,
  dispatcher?: unknown
): Promise<{
  email: string;
  title: string;
  contactLinks: string[];
  socialLinks: string[];
  serviceAreas: string[];
  seoFlags: string[];
}> {
  const normalizedWebsite = normalizeWebsiteUrl(website);
  if (!normalizedWebsite) {
    return {
      email: "",
      title: "",
      contactLinks: [],
      socialLinks: [],
      serviceAreas: [],
      seoFlags: [],
    };
  }

  const html = await fetchTextWithTimeout(normalizedWebsite, 12000, dispatcher);
  const title = extractTagText(html, "title");
  const metaDescription = extractMetaContent(html, "description") || extractMetaContent(html, "og:description");
  const h1 = extractTagText(html, "h1");
  const hasLocalBusinessSchema = /LocalBusiness|ProfessionalService|Plumber|RoofingContractor|Electrician/i.test(html);
  const homeEmails = extractEmailsFromText(html);
  const contactLinks = extractContactLinks(html, normalizedWebsite);
  const socialLinks = extractSocialLinks(html, normalizedWebsite);
  const serviceAreas = extractServiceAreaHints(html, lead);
  let email = homeEmails[0] || "";

  for (const link of contactLinks) {
    if (email) break;
    try {
      const pageHtml = await fetchTextWithTimeout(link, 12000, dispatcher);
      const emails = extractEmailsFromText(pageHtml);
      if (emails.length > 0) {
        email = emails[0];
      }
    } catch {
      continue;
    }
  }

  const seoFlags: string[] = [];
  if (!title) seoFlags.push("missing_title");
  if (!metaDescription) seoFlags.push("missing_meta_description");
  if (!h1) seoFlags.push("missing_h1");
  if (!hasLocalBusinessSchema) seoFlags.push("no_local_schema");

  const city = cleanText(lead.city);
  if (city) {
    const localText = `${title} ${metaDescription}`.toLowerCase();
    if (!localText.includes(city.toLowerCase())) {
      seoFlags.push("weak_local_keyword");
    }
  }

  if (contactLinks.length === 0) {
    seoFlags.push("no_contact_link_detected");
  }

  return {
    email,
    title,
    contactLinks,
    socialLinks,
    serviceAreas,
    seoFlags,
  };
}

function extractRssItemLinks(xml: string): string[] {
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const links: string[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1] || "";
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const url = cleanText(linkMatch?.[1] || "");
    if (url) {
      links.push(url);
    }
    if (links.length >= 8) {
      break;
    }
  }

  return links;
}

async function discoverWebsiteForLead(lead: Partial<LeadInput>, dispatcher?: unknown): Promise<string> {
  const businessName = cleanText(lead.business_name);
  if (!businessName) return "";

  const location = [cleanText(lead.city), cleanText(lead.state)].filter(Boolean).join(" ");
  const query = `${businessName} ${location} official website`.trim();
  const url = `https://www.bing.com/search?format=rss&setlang=en-us&cc=us&q=${encodeURIComponent(query)}`;
  const xml = await fetchTextWithTimeout(url, 10000, dispatcher);
  const links = extractRssItemLinks(xml);

  for (const link of links) {
    const host = extractHost(link);
    if (!host || isDirectoryHost(host)) continue;
    const normalized = normalizeWebsiteUrl(link);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

async function discoverEmailForWebsite(website: string, dispatcher?: unknown): Promise<string> {
  const signals = await inspectWebsiteSignals(website, {}, dispatcher);
  return signals.email;
}

async function enrichLeadsWithWebsiteAndEmail(
  jobId: string,
  leads: Partial<LeadInput>[],
  proxyUrl = ""
): Promise<Partial<LeadInput>[]> {
  if (leads.length === 0) {
    return leads;
  }

  const emailEnrichLimit = Math.max(0, Number(process.env.EMAIL_ENRICH_LIMIT || 120));
  const websiteDiscoveryLimit = Math.max(0, Number(process.env.WEBSITE_DISCOVERY_LIMIT || 120));

  let websitesResolved = 0;
  let emailsResolved = 0;
  const proxyDispatcher = createFetchProxyDispatcher(proxyUrl, `scraper-${jobId}`);

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    const current = index + 1;
    const progress = 82 + Math.round((current / leads.length) * 16);

    updateJob(jobId, {
      progress_percent: Math.min(99, progress),
      progress_message: `Enriching websites and emails ${current}/${leads.length}`,
    });

    if (current > emailEnrichLimit) {
      continue;
    }

    try {
      let website = normalizeWebsiteUrl(cleanText(lead.website));
      if (!website && current <= websiteDiscoveryLimit) {
        website = await discoverWebsiteForLead(lead, proxyDispatcher);
        if (website) {
          websitesResolved += 1;
          lead.website = website;
          lead.has_website = true;
        }
      }

      if (website) {
        const signals = await inspectWebsiteSignals(website, lead, proxyDispatcher);

        if (!cleanText(lead.email) && signals.email) {
          emailsResolved += 1;
          lead.email = signals.email;
        }

        const enrichmentParts: string[] = [];
        const title = sanitizeNoteSegment(signals.title);
        if (title) {
          enrichmentParts.push(`title=${title}`);
        }
        if (signals.contactLinks.length > 0) {
          enrichmentParts.push(
            `contact=${signals.contactLinks
              .map((value) => sanitizeNoteSegment(value))
              .slice(0, 2)
              .join(",")}`
          );
        }
        if (signals.socialLinks.length > 0) {
          enrichmentParts.push(
            `social=${signals.socialLinks
              .map((value) => sanitizeNoteSegment(value))
              .slice(0, 3)
              .join(",")}`
          );
        }
        if (signals.serviceAreas.length > 0) {
          enrichmentParts.push(
            `areas=${signals.serviceAreas.map((value) => sanitizeNoteSegment(value)).join(",")}`
          );
        }
        if (signals.seoFlags.length > 0) {
          enrichmentParts.push(`seo=${signals.seoFlags.join(",")}`);
        }
        if (enrichmentParts.length > 0) {
          lead.notes = replaceNotesSegment(cleanText(lead.notes), "enrichment:", enrichmentParts.join("; "));
        }
      }
    } catch {
      continue;
    }

    // Keep requests polite and reduce temporary blocks.
    await sleep(200);
  }

  updateJob(jobId, {
    progress_percent: 99,
    progress_message: `Enrichment done (websites: ${websitesResolved}, emails: ${emailsResolved})`,
  });

  try {
    await (proxyDispatcher as { close?: () => Promise<void> | void } | undefined)?.close?.();
  } catch {
    // Ignore proxy dispatcher cleanup errors.
  }

  return leads;
}

function getOutputDirectory(): string {
  const configured = process.env.SCRAPER_OUTPUT_DIR?.trim() || "./db/scraper-output";
  const outputDir = path.resolve(process.cwd(), configured);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  return outputDir;
}

function generateNextJobLabel(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `job-${suffix}`;
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return !relativePath || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function createJob(source: ScraperSource, input: Record<string, unknown>): ScraperJobRow {
  const db = getDb();
  const id = uuidv4();
  const jobLabel = generateNextJobLabel();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO scraper_jobs (
      id, job_label, source, status, input_json, output_file, csv_file,
      imported_count, total_found, progress_percent, progress_message,
      error_message, created_at, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, ?, NULL, NULL)`
  ).run(id, jobLabel, source, "queued", JSON.stringify(input), null, null, "Queued", now);

  return getJob(id) as ScraperJobRow;
}

function updateJob(jobId: string, patch: Partial<ScraperJobRow>): void {
  const db = getDb();
  const current = getJob(jobId);

  if (!current) return;

  const next = {
    ...current,
    ...patch,
  };

  db.prepare(
    `UPDATE scraper_jobs SET
      job_label = ?,
      source = ?,
      status = ?,
      input_json = ?,
      output_file = ?,
      csv_file = ?,
      imported_count = ?,
      total_found = ?,
      progress_percent = ?,
      progress_message = ?,
      error_message = ?,
      created_at = ?,
      started_at = ?,
      completed_at = ?
     WHERE id = ?`
  ).run(
    next.job_label,
    next.source,
    next.status,
    next.input_json,
    next.output_file,
    next.csv_file,
    next.imported_count,
    next.total_found,
    next.progress_percent,
    next.progress_message,
    next.error_message,
    next.created_at,
    next.started_at,
    next.completed_at,
    jobId
  );
}

function listJobs(): ScraperJobRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         j.*,
         (SELECT COUNT(*) FROM scraper_staged_leads s WHERE s.job_id = j.id) AS staged_count
       FROM scraper_jobs j
       ORDER BY datetime(j.created_at) DESC
       LIMIT 100`
    )
    .all() as ScraperJobRow[];
}

function getJob(jobId: string): ScraperJobRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM scraper_jobs WHERE id = ?").get(jobId) as ScraperJobRow | undefined;
}

function getInProgressJob(): ScraperJobRow | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM scraper_jobs
       WHERE status IN ('running')
       ORDER BY datetime(created_at) DESC
       LIMIT 1`
    )
    .get() as ScraperJobRow | undefined;
}

function removeArtifactFile(filePath: string | null | undefined): void {
  const cleaned = cleanText(filePath);
  if (!cleaned) {
    return;
  }

  const outputRoot = getOutputDirectory();
  const absolute = path.resolve(cleaned);

  if (!isPathInside(outputRoot, absolute)) {
    return;
  }

  if (fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
}

function removeJobArtifacts(job: ScraperJobRow): void {
  const outputRoot = getOutputDirectory();
  removeArtifactFile(path.join(outputRoot, `${job.id}.input.json`));
  removeArtifactFile(job.output_file);
  removeArtifactFile(job.csv_file);
}

function listFinishedJobs(): ScraperJobRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM scraper_jobs WHERE status IN ('complete', 'error', 'cancelled')")
    .all() as ScraperJobRow[];
}

function clearFinishedJobs(): number {
  const db = getDb();
  const finishedJobs = listFinishedJobs();

  for (const job of finishedJobs) {
    removeJobArtifacts(job);
    db.prepare("DELETE FROM scraper_staged_leads WHERE job_id = ?").run(job.id);
  }

  const result = db
    .prepare("DELETE FROM scraper_jobs WHERE status IN ('complete', 'error', 'cancelled')")
    .run();

  return Number(result.changes || 0);
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.round(numeric);
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return undefined;
}

type GmbClaimStatus = "claimed" | "unclaimed" | "unknown";

function parseOptionalStageFilter(value: unknown): StagedLeadStageFilter | undefined {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "pending" || normalized === "added" || normalized === "all") {
    return normalized;
  }

  return undefined;
}

function parseOptionalContactFilter(value: unknown): StagedLeadContactFilter | undefined {
  const normalized = cleanText(value).toLowerCase();
  if (
    normalized === "has_email" ||
    normalized === "has_phone" ||
    normalized === "has_website" ||
    normalized === "contact_ready" ||
    normalized === "missing_contact" ||
    normalized === "missing_website"
  ) {
    return normalized;
  }

  return undefined;
}

function parseOptionalGmbClaimStatus(value: unknown): GmbClaimStatus | undefined {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "claimed" || normalized === "unclaimed" || normalized === "unknown") {
    return normalized;
  }

  return undefined;
}

function parseOptionalAuditStatus(value: unknown): StagedLeadAuditStatus | undefined {
  const normalized = cleanText(value).toLowerCase();
  if (
    normalized === "not_run" ||
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "unavailable"
  ) {
    return normalized;
  }

  return undefined;
}

function parseOptionalAuditCoverage(value: unknown): StagedLeadAuditCoverageFilter | undefined {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "audited" || normalized === "unaudited" || normalized === "partial") {
    return normalized;
  }

  return undefined;
}

function parseOptionalOutreachReadiness(value: unknown): OutreachReadiness | undefined {
  const normalized = cleanText(value).toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "ready" ||
    normalized === "review" ||
    normalized === "skip"
  ) {
    return normalized;
  }

  return undefined;
}

function extractClaimSourceFromNotes(notes: unknown): string {
  const text = cleanText(notes);
  if (!text) return "";

  const match = text.match(/\bclaim_source\s*:\s*([a-z0-9_:-]+)/i);
  return cleanText(match?.[1]).toLowerCase();
}

function deriveGmbClaimStatus(row: Pick<StagedLeadRow, "source" | "gmb_claimed" | "notes" | "gmb_url">): GmbClaimStatus {
  const claimSource = extractClaimSourceFromNotes(row.notes);

  if (claimSource === "maps_page_unclaimed" || claimSource === "listing_unclaimed_signal") {
    return "unclaimed";
  }

  if (
    claimSource === "maps_page_claimed" ||
    claimSource === "listing_claimed_signal" ||
    claimSource === "maps_page_no_claim_prompt"
  ) {
    return "claimed";
  }

  if (claimSource === "maps_page" || claimSource === "listing_signal") {
    return row.gmb_claimed === 1 ? "claimed" : "unclaimed";
  }

  if (row.gmb_claimed === 1) return "claimed";
  if (row.gmb_claimed === 0) {
    const notesLower = cleanText(row.notes).toLowerCase();
    if (notesLower.includes("unclaimed") || notesLower.includes("claim this business") || notesLower.includes("is this your business")) {
      return "unclaimed";
    }
  }

  if (row.gmb_url && row.gmb_url.trim() !== "") {
    return row.gmb_claimed === 1 ? "claimed" : "claimed";
  }

  return "unknown";
}

type StagedLeadAuditMode = "website" | "gmb" | "eeat" | "basic" | "all";

function parseStagedLeadAuditStatus(value: unknown): StagedLeadAuditStatus {
  const normalized = cleanText(value).toLowerCase();
  if (
    normalized === "completed" ||
    normalized === "failed" ||
    normalized === "unavailable" ||
    normalized === "not_run"
  ) {
    return normalized;
  }

  return "not_run";
}

function buildAuditSummaryResult(args: {
  summary: string;
  issueTitle: string;
  issueDetail: string;
  recommendation: string;
  wins?: string[];
}): Record<string, unknown> {
  return {
    summary: args.summary,
    issues: [
      {
        severity: "medium",
        title: args.issueTitle,
        detail: args.issueDetail,
      },
    ],
    wins: args.wins || [],
    recommendations: [args.recommendation],
  };
}

function getStagedLead(jobId: string, stagedLeadId: string): StagedLeadRow | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM scraper_staged_leads WHERE id = ? AND job_id = ?")
    .get(stagedLeadId, jobId) as StagedLeadRow | undefined;
}

function buildStagedAuditSnapshot(
  status: string,
  score: number | null,
  verdict: string | null,
  summary: string | null
): AuditSnapshot {
  return {
    status: parseStagedLeadAuditStatus(status),
    score: typeof score === "number" ? score : null,
    verdict: cleanText(verdict),
    summary: cleanText(summary),
  };
}

function evaluateStagedLeadReadiness(row: StagedLeadRow): {
  readiness: OutreachReadiness;
  reason: string;
} {
  return evaluateOutreachReadiness({
    hasPhone: Boolean(cleanText(row.phone)),
    hasEmail: Boolean(cleanText(row.email)),
    hasWebsite: Boolean(cleanText(row.website)),
    hasGmbSignals:
      Boolean(cleanText(row.gmb_url)) ||
      row.source === "gmb_scraper" ||
      row.gmb_rating !== null ||
      row.gmb_review_count !== null,
    websiteAudit: buildStagedAuditSnapshot(
      row.website_audit_status,
      row.website_audit_score,
      row.website_audit_verdict,
      row.website_audit_summary
    ),
    gmbAudit: buildStagedAuditSnapshot(
      row.gmb_audit_status,
      row.gmb_audit_score,
      row.gmb_audit_verdict,
      row.gmb_audit_summary
    ),
  });
}

function updateStagedLeadAuditSnapshot(
  jobId: string,
  stagedLeadId: string,
  auditType: "website" | "gmb" | "eeat",
  audit: StoredAuditRecord<Record<string, unknown>>
): StagedLeadRow {
  const db = getDb();
  const now = new Date().toISOString();

  if (auditType === "website") {
    db.prepare(
      `UPDATE scraper_staged_leads
       SET website_audit_id = ?,
           website_audit_score = ?,
           website_audit_verdict = ?,
           website_audit_status = ?,
           website_audit_summary = ?,
           last_audited_at = ?
       WHERE id = ? AND job_id = ?`
    ).run(
      audit.id,
      audit.score,
      cleanText(audit.verdict) || null,
      parseStagedLeadAuditStatus(audit.status),
      cleanText(audit.summary) || null,
      now,
      stagedLeadId,
      jobId
    );
  } else if (auditType === "gmb") {
    db.prepare(
      `UPDATE scraper_staged_leads
       SET gmb_audit_id = ?,
           gmb_audit_score = ?,
           gmb_audit_verdict = ?,
           gmb_audit_status = ?,
           gmb_audit_summary = ?,
           last_audited_at = ?
       WHERE id = ? AND job_id = ?`
    ).run(
      audit.id,
      audit.score,
      cleanText(audit.verdict) || null,
      parseStagedLeadAuditStatus(audit.status),
      cleanText(audit.summary) || null,
      now,
      stagedLeadId,
      jobId
    );
  } else {
    db.prepare(
      `UPDATE scraper_staged_leads
       SET eeat_audit_id = ?,
           eeat_audit_score = ?,
           eeat_audit_verdict = ?,
           eeat_audit_status = ?,
           eeat_audit_summary = ?,
           last_audited_at = ?
       WHERE id = ? AND job_id = ?`
    ).run(
      audit.id,
      audit.score,
      cleanText(audit.verdict) || null,
      parseStagedLeadAuditStatus(audit.status),
      cleanText(audit.summary) || null,
      now,
      stagedLeadId,
      jobId
    );
  }

  const next = getStagedLead(jobId, stagedLeadId);
  if (!next) {
    throw new Error("Staged lead not found after audit update");
  }

  const readiness = evaluateStagedLeadReadiness(next);
  db.prepare(
    `UPDATE scraper_staged_leads
     SET audit_readiness = ?,
         audit_readiness_reason = ?,
         last_audited_at = ?
     WHERE id = ? AND job_id = ?`
  ).run(readiness.readiness, readiness.reason, now, stagedLeadId, jobId);

  return getStagedLead(jobId, stagedLeadId) as StagedLeadRow;
}

function isGmbAuditable(row: StagedLeadRow): boolean {
  return (
    Boolean(cleanText(row.gmb_url)) ||
    row.source === "gmb_scraper" ||
    row.gmb_rating !== null ||
    row.gmb_review_count !== null
  );
}

function isWebsiteAuditable(row: StagedLeadRow): boolean {
  return Boolean(cleanText(row.website));
}

async function runWebsiteAuditForStagedLead(
  row: StagedLeadRow
): Promise<StoredAuditRecord<Record<string, unknown>>> {
  const website = cleanText(row.website);

  if (!isWebsiteAuditable(row)) {
    return insertStoredAuditRecord({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "website",
      targetName: row.business_name,
      verdict: "Unavailable",
      score: null,
      status: "unavailable",
      result: buildAuditSummaryResult({
        summary: "Website audit could not run because this row does not contain a website URL.",
        issueTitle: "Website URL missing",
        issueDetail: "The staged lead does not include a valid website field for live page auditing.",
        recommendation: "Use website enrichment first or continue with direct outreach if the lead is still relevant.",
      }),
    });
  }

  try {
    const result = await runWebsiteAudit({
      website,
      businessName: row.business_name,
      city: cleanText(row.city),
      state: cleanText(row.state),
    });

    return insertStoredAuditRecord<WebsiteAuditResult>({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "website",
      targetName: row.business_name,
      verdict: result.verdict,
      score: result.score,
      status: "completed",
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website audit failed";
    return insertStoredAuditRecord({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "website",
      targetName: row.business_name,
      verdict: "Failed",
      score: null,
      status: "failed",
      result: buildAuditSummaryResult({
        summary: `Website audit failed: ${message}`,
        issueTitle: "Website audit request failed",
        issueDetail: message,
        recommendation: "Retry the audit later or verify the website URL manually.",
      }),
    });
  }
}

function runGmbAuditForStagedLead(row: StagedLeadRow): StoredAuditRecord<Record<string, unknown>> {
  if (!isGmbAuditable(row)) {
    return insertStoredAuditRecord({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "gmb",
      targetName: row.business_name,
      verdict: "Unavailable",
      score: null,
      status: "unavailable",
      result: buildAuditSummaryResult({
        summary: "GMB audit could not run because the staged row does not contain enough GBP signals.",
        issueTitle: "GMB data missing",
        issueDetail: "The row is missing a Google Maps URL and usable listing signals such as rating or review count.",
        recommendation: "Run a Google Maps scrape or enrich the row before using GMB audit as a qualification signal.",
      }),
    });
  }

  try {
    const result = runGmbAudit({
      businessName: row.business_name,
      city: cleanText(row.city) || undefined,
      state: cleanText(row.state) || undefined,
      website: cleanText(row.website) || undefined,
      gmbUrl: cleanText(row.gmb_url) || undefined,
      gmbClaimed: row.source === "gmb_scraper" ? deriveGmbClaimStatus(row) === "claimed" : row.gmb_claimed === 1,
      gmbRating: row.gmb_rating,
      gmbReviewCount: row.gmb_review_count,
      phone: cleanText(row.phone) || undefined,
      email: cleanText(row.email) || undefined,
      gmbProfileIncomplete: null,
      citationsFound: null,
    });

    return insertStoredAuditRecord<GmbAuditResult>({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "gmb",
      targetName: row.business_name,
      verdict: result.verdict,
      score: result.score,
      status: "completed",
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GMB audit failed";
    return insertStoredAuditRecord({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "gmb",
      targetName: row.business_name,
      verdict: "Failed",
      score: null,
      status: "failed",
      result: buildAuditSummaryResult({
        summary: `GMB audit failed: ${message}`,
        issueTitle: "GMB audit could not be completed",
        issueDetail: message,
        recommendation: "Retry the GMB audit after verifying the row data and source signals.",
      }),
    });
  }
}

async function runEeatAuditForStagedLead(
  row: StagedLeadRow
): Promise<StoredAuditRecord<Record<string, unknown>>> {
  const website = cleanText(row.website);
  const domain = extractHost(website);

  if (!website || !domain) {
    return insertStoredAuditRecord({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "eeat",
      targetName: row.business_name,
      verdict: "Unavailable",
      score: null,
      status: "unavailable",
      result: buildAuditSummaryResult({
        summary: "EEAT audit could not run because this row does not contain a valid website domain.",
        issueTitle: "Website domain missing",
        issueDetail: "The staged lead needs a website URL so EEAT checks can crawl trust and content signals.",
        recommendation: "Run website enrichment or update the URL, then retry EEAT.",
      }),
    });
  }

  try {
    const result = await runEeatAuditReport({
      domain,
      timeoutMs: 10_000,
    });

    return insertStoredAuditRecord<EeatAuditReport>({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "eeat",
      targetName: row.business_name,
      verdict: result.rating,
      score: result.score,
      status: "completed",
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EEAT audit failed";
    return insertStoredAuditRecord({
      scraperJobId: row.job_id,
      stagedLeadId: row.id,
      auditType: "eeat",
      targetName: row.business_name,
      verdict: "Failed",
      score: null,
      status: "failed",
      result: buildAuditSummaryResult({
        summary: `EEAT audit failed: ${message}`,
        issueTitle: "EEAT audit request failed",
        issueDetail: message,
        recommendation: "Retry the EEAT audit later or verify that the website is reachable.",
      }),
    });
  }
}

async function runStagedLeadAudit(jobId: string, stagedLeadId: string, mode: StagedLeadAuditMode): Promise<{
  row: StagedLeadRow;
  websiteAudit: StoredAuditRecord<Record<string, unknown>> | null;
  gmbAudit: StoredAuditRecord<Record<string, unknown>> | null;
  eeatAudit: StoredAuditRecord<Record<string, unknown>> | null;
}> {
  const initialRow = getStagedLead(jobId, stagedLeadId);
  if (!initialRow) {
    throw new Error("Staged lead not found for this job");
  }

  let nextRow = initialRow;
  let websiteAudit: StoredAuditRecord<Record<string, unknown>> | null = null;
  let gmbAudit: StoredAuditRecord<Record<string, unknown>> | null = null;
  let eeatAudit: StoredAuditRecord<Record<string, unknown>> | null = null;

  if (mode === "website" || mode === "basic" || mode === "all") {
    websiteAudit = await runWebsiteAuditForStagedLead(nextRow);
    nextRow = updateStagedLeadAuditSnapshot(jobId, stagedLeadId, "website", websiteAudit);
  }

  if (mode === "gmb" || mode === "basic" || mode === "all") {
    gmbAudit = runGmbAuditForStagedLead(nextRow);
    nextRow = updateStagedLeadAuditSnapshot(jobId, stagedLeadId, "gmb", gmbAudit);
  }

  if (mode === "eeat" || mode === "all") {
    eeatAudit = await runEeatAuditForStagedLead(nextRow);
    nextRow = updateStagedLeadAuditSnapshot(jobId, stagedLeadId, "eeat", eeatAudit);
  }

  return {
    row: nextRow,
    websiteAudit,
    gmbAudit,
    eeatAudit,
  };
}

function toStagedLeadInput(row: StagedLeadRow): Partial<LeadInput> {
  return {
    business_name: row.business_name,
    phone: row.phone || "",
    email: row.email || "",
    website: row.website || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || "",
    niche: row.niche || "",
    gmb_url: row.gmb_url || "",
    gmb_claimed: row.gmb_claimed === 1,
    gmb_rating: row.gmb_rating,
    gmb_review_count: row.gmb_review_count,
    has_website: row.has_website === 1,
    gmb_profile_incomplete: false,
    citations_found: false,
    source: row.source,
    status: (row.status || "new") as LeadInput["status"],
    notes: row.notes || "",
  };
}

function saveStagedLeads(jobId: string, source: ScraperSource, leads: Partial<LeadInput>[]): void {
  const db = getDb();

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM scraper_staged_leads WHERE job_id = ?").run(jobId);

    const insertStmt = db.prepare(
      `INSERT INTO scraper_staged_leads (
        id, job_id, business_name, phone, email, website, address, city, state, zip,
        niche, gmb_url, gmb_claimed, gmb_rating, gmb_review_count, has_website,
        source, status, notes, is_selected, added_to_dashboard, created_at, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, NULL)`
    );

    const now = new Date().toISOString();
    for (const lead of leads) {
      const businessName = cleanText(lead.business_name);
      if (!businessName) continue;

      insertStmt.run(
        uuidv4(),
        jobId,
        businessName,
        cleanText(lead.phone) || null,
        cleanText(lead.email) || null,
        cleanText(lead.website) || null,
        cleanText(lead.address) || null,
        cleanText(lead.city) || null,
        cleanText(lead.state) || null,
        cleanText(lead.zip) || null,
        cleanText(lead.niche) || null,
        cleanText(lead.gmb_url) || null,
        lead.gmb_claimed ? 1 : 0,
        toNumber(lead.gmb_rating),
        toIntFromUnknown(lead.gmb_review_count),
        lead.has_website ? 1 : 0,
        (cleanText(lead.source) as ScraperSource) || source,
        cleanText(lead.status) || "new",
        cleanText(lead.notes) || null,
        now
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function buildWebsiteEnrichmentSeedRows(options: {
  sourceJobId: string;
  selectedOnly: boolean;
  pendingOnly: boolean;
  limit: number;
}): Array<Record<string, unknown>> {
  const db = getDb();
  const where = ["job_id = ?"];
  const params: Array<string | number> = [options.sourceJobId];

  if (options.selectedOnly) {
    where.push("is_selected = 1");
  }

  if (options.pendingOnly) {
    where.push("added_to_dashboard = 0");
  }

  const rows = db
    .prepare(
      `SELECT * FROM scraper_staged_leads
       WHERE ${where.join(" AND ")}
       ORDER BY is_selected DESC, added_to_dashboard ASC, datetime(created_at) DESC
       LIMIT ?`
    )
    .all(...params, Math.max(1, Math.min(150, options.limit))) as StagedLeadRow[];

  return rows.map((row) => ({
    ...toStagedLeadInput(row),
    original_source: row.source,
  }));
}

function listJobStagedLeads(options: {
  jobId: string;
  page: number;
  pageSize: number;
  query?: string;
  pendingOnly?: boolean;
  stageFilter?: StagedLeadStageFilter;
  city?: string;
  state?: string;
  niche?: string;
  selectedOnly?: boolean;
  contactFilter?: StagedLeadContactFilter;
  gmbClaimed?: boolean;
  gmbClaimStatus?: GmbClaimStatus;
  auditCoverage?: StagedLeadAuditCoverageFilter;
  readiness?: OutreachReadiness;
  websiteAuditStatus?: StagedLeadAuditStatus;
  gmbAuditStatus?: StagedLeadAuditStatus;
  websiteVerdict?: string;
  gmbVerdict?: string;
}): {
  items: StagedLeadRow[];
  total: number;
  pending: number;
  added: number;
  selectedPending: number;
  page: number;
  pageSize: number;
} {
  const { jobId } = options;
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(200, Math.max(1, options.pageSize || 25));
  const offset = (page - 1) * pageSize;
  const stageFilter = options.stageFilter || (options.pendingOnly ? "pending" : "all");

  const where: string[] = ["job_id = ?"];
  const params: Array<string | number> = [jobId];

  if (stageFilter === "pending") {
    where.push("added_to_dashboard = 0");
  } else if (stageFilter === "added") {
    where.push("added_to_dashboard = 1");
  }

  if (options.selectedOnly) {
    where.push("is_selected = 1");
  }

  if (typeof options.gmbClaimed === "boolean") {
    where.push("gmb_claimed = ?");
    params.push(options.gmbClaimed ? 1 : 0);
  }

  if (options.auditCoverage === "audited") {
    where.push(
      "website_audit_status <> 'not_run' AND gmb_audit_status <> 'not_run'"
    );
  } else if (options.auditCoverage === "unaudited") {
    where.push(
      "website_audit_status = 'not_run' AND gmb_audit_status = 'not_run'"
    );
  } else if (options.auditCoverage === "partial") {
    where.push(
      "((website_audit_status <> 'not_run' AND gmb_audit_status = 'not_run') OR (website_audit_status = 'not_run' AND gmb_audit_status <> 'not_run'))"
    );
  }

  if (options.readiness) {
    where.push("audit_readiness = ?");
    params.push(options.readiness);
  }

  if (options.websiteAuditStatus) {
    where.push("website_audit_status = ?");
    params.push(options.websiteAuditStatus);
  }

  if (options.gmbAuditStatus) {
    where.push("gmb_audit_status = ?");
    params.push(options.gmbAuditStatus);
  }

  const websiteVerdict = cleanText(options.websiteVerdict);
  if (websiteVerdict) {
    where.push("LOWER(COALESCE(website_audit_verdict, '')) = LOWER(?)");
    params.push(websiteVerdict);
  }

  const gmbVerdict = cleanText(options.gmbVerdict);
  if (gmbVerdict) {
    where.push("LOWER(COALESCE(gmb_audit_verdict, '')) = LOWER(?)");
    params.push(gmbVerdict);
  }

  const city = cleanText(options.city);
  if (city) {
    where.push("LOWER(COALESCE(city,'')) LIKE LOWER(?)");
    params.push(`%${city}%`);
  }

  const state = cleanText(options.state);
  if (state) {
    where.push("LOWER(COALESCE(state,'')) LIKE LOWER(?)");
    params.push(`%${state}%`);
  }

  const niche = cleanText(options.niche);
  if (niche) {
    where.push("LOWER(COALESCE(niche,'')) LIKE LOWER(?)");
    params.push(`%${niche}%`);
  }

  if (options.contactFilter === "has_email") {
    where.push("TRIM(COALESCE(email,'')) <> ''");
  } else if (options.contactFilter === "has_phone") {
    where.push("TRIM(COALESCE(phone,'')) <> ''");
  } else if (options.contactFilter === "has_website") {
    where.push("TRIM(COALESCE(website,'')) <> ''");
  } else if (options.contactFilter === "contact_ready") {
    where.push("(TRIM(COALESCE(email,'')) <> '' OR TRIM(COALESCE(phone,'')) <> '')");
  } else if (options.contactFilter === "missing_contact") {
    where.push("TRIM(COALESCE(email,'')) = '' AND TRIM(COALESCE(phone,'')) = ''");
  } else if (options.contactFilter === "missing_website") {
    where.push("TRIM(COALESCE(website,'')) = ''");
  }

  if (options.gmbClaimStatus) {
    if (options.gmbClaimStatus === "claimed") {
      where.push(
        `(
          (source = 'gmb_scraper' AND (
            LOWER(COALESCE(notes,'')) LIKE '%claim_source: maps_page_claimed%'
            OR LOWER(COALESCE(notes,'')) LIKE '%claim_source: listing_claimed_signal%'
            OR LOWER(COALESCE(notes,'')) LIKE '%claim_source: maps_page_no_claim_prompt%'
            OR (LOWER(COALESCE(notes,'')) LIKE '%claim_source: maps_page%' AND gmb_claimed = 1)
            OR (LOWER(COALESCE(notes,'')) LIKE '%claim_source: listing_signal%' AND gmb_claimed = 1)
            OR gmb_claimed = 1
          )) OR (source <> 'gmb_scraper' AND gmb_claimed = 1)
        )`
      );
    } else if (options.gmbClaimStatus === "unclaimed") {
      where.push(
        `(
          (source = 'gmb_scraper' AND (
            LOWER(COALESCE(notes,'')) LIKE '%claim_source: maps_page_unclaimed%'
            OR LOWER(COALESCE(notes,'')) LIKE '%claim_source: listing_unclaimed_signal%'
            OR (LOWER(COALESCE(notes,'')) LIKE '%claim_source: maps_page%' AND gmb_claimed = 0)
            OR (LOWER(COALESCE(notes,'')) LIKE '%claim_source: listing_signal%' AND gmb_claimed = 0)
            OR (gmb_claimed = 0 AND (TRIM(COALESCE(gmb_url,'')) <> '' OR LOWER(COALESCE(notes,'')) LIKE '%claim_source%'))
          )) OR (source <> 'gmb_scraper' AND gmb_claimed = 0 AND TRIM(COALESCE(gmb_url,'')) <> '')
        )`
      );
    } else {
      where.push(
        `(
          (source = 'gmb_scraper' AND (
            (LOWER(COALESCE(notes,'')) = '' OR LOWER(COALESCE(notes,'')) NOT LIKE '%claim_source:%')
            AND gmb_claimed = 0 AND TRIM(COALESCE(gmb_url,'')) = ''
          )) OR (source <> 'gmb_scraper' AND (gmb_claimed = 0 AND TRIM(COALESCE(gmb_url,'')) = ''))
        )`
      );
    }
  }

  const query = cleanText(options.query);
  if (query) {
    const like = `%${query}%`;
    where.push(
      "(LOWER(business_name) LIKE LOWER(?) OR LOWER(COALESCE(email,'')) LIKE LOWER(?) OR LOWER(COALESCE(website,'')) LIKE LOWER(?) OR LOWER(COALESCE(phone,'')) LIKE LOWER(?) OR LOWER(COALESCE(city,'')) LIKE LOWER(?) OR LOWER(COALESCE(state,'')) LIKE LOWER(?) OR LOWER(COALESCE(niche,'')) LIKE LOWER(?))"
    );
    params.push(like, like, like, like, like, like, like);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = getDb();

  const items = db
    .prepare(
      `SELECT * FROM scraper_staged_leads ${whereClause}
       ORDER BY added_to_dashboard ASC, is_selected DESC, datetime(created_at) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as StagedLeadRow[];

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM scraper_staged_leads ${whereClause}`)
      .get(...params) as { count: number }
  ).count;

  const pending = (
    db
      .prepare("SELECT COUNT(*) AS count FROM scraper_staged_leads WHERE job_id = ? AND added_to_dashboard = 0")
      .get(jobId) as { count: number }
  ).count;

  const added = (
    db
      .prepare("SELECT COUNT(*) AS count FROM scraper_staged_leads WHERE job_id = ? AND added_to_dashboard = 1")
      .get(jobId) as { count: number }
  ).count;

  const selectedPending = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM scraper_staged_leads WHERE job_id = ? AND added_to_dashboard = 0 AND is_selected = 1"
      )
      .get(jobId) as { count: number }
  ).count;

  return { items, total, pending, added, selectedPending, page, pageSize };
}

function buildFallbackAuditPreview(
  row: StagedLeadRow,
  auditType: "website" | "gmb" | "eeat"
): StoredAuditRecord<Record<string, unknown>> | null {
  if (auditType === "website") {
    if (parseStagedLeadAuditStatus(row.website_audit_status) === "not_run") {
      return null;
    }

    return {
      id: row.website_audit_id || "",
      lead_id: "",
      client_id: "",
      business_id: "",
      scraper_job_id: row.job_id,
      staged_lead_id: row.id,
      audit_type: "website",
      score: row.website_audit_score,
      verdict: cleanText(row.website_audit_verdict),
      target_name: row.business_name,
      status: parseStagedLeadAuditStatus(row.website_audit_status),
      summary: cleanText(row.website_audit_summary),
      issue_count: 0,
      win_count: 0,
      ai_insights: null,
      result: {
        summary: cleanText(row.website_audit_summary),
        issues: [],
        wins: [],
        recommendations: [],
      },
      created_at: row.last_audited_at || row.created_at,
      updated_at: row.last_audited_at || row.created_at,
    };
  }

  if (auditType === "gmb") {
    if (parseStagedLeadAuditStatus(row.gmb_audit_status) === "not_run") {
      return null;
    }

    return {
      id: row.gmb_audit_id || "",
      lead_id: "",
      client_id: "",
      business_id: "",
      scraper_job_id: row.job_id,
      staged_lead_id: row.id,
      audit_type: "gmb",
      score: row.gmb_audit_score,
      verdict: cleanText(row.gmb_audit_verdict),
      target_name: row.business_name,
      status: parseStagedLeadAuditStatus(row.gmb_audit_status),
      summary: cleanText(row.gmb_audit_summary),
      issue_count: 0,
      win_count: 0,
      ai_insights: null,
      result: {
        summary: cleanText(row.gmb_audit_summary),
        issues: [],
        wins: [],
        recommendations: [],
      },
      created_at: row.last_audited_at || row.created_at,
      updated_at: row.last_audited_at || row.created_at,
    };
  }

  if (parseStagedLeadAuditStatus(row.eeat_audit_status) === "not_run") {
    return null;
  }

  return {
    id: row.eeat_audit_id || "",
    lead_id: "",
    client_id: "",
    business_id: "",
    scraper_job_id: row.job_id,
    staged_lead_id: row.id,
    audit_type: "eeat",
    score: row.eeat_audit_score,
    verdict: cleanText(row.eeat_audit_verdict),
    target_name: row.business_name,
    status: parseStagedLeadAuditStatus(row.eeat_audit_status),
    summary: cleanText(row.eeat_audit_summary),
    issue_count: 0,
    win_count: 0,
    ai_insights: null,
    result: {
      summary: cleanText(row.eeat_audit_summary),
      issues: [],
      wins: [],
      recommendations: [],
    },
    created_at: row.last_audited_at || row.created_at,
    updated_at: row.last_audited_at || row.created_at,
  };
}

function buildStagedLeadApiRows(rows: StagedLeadRow[]) {
  const auditIds = rows
    .flatMap((row) => [
      cleanText(row.website_audit_id),
      cleanText(row.gmb_audit_id),
      cleanText(row.eeat_audit_id),
    ])
    .filter(Boolean);
  const auditsById = listStoredAuditsByIds<Record<string, unknown>>(auditIds);

  return rows.map((row) => {
    const websiteAudit =
      (row.website_audit_id ? auditsById.get(row.website_audit_id) : null) ||
      buildFallbackAuditPreview(row, "website");
    const gmbAudit =
      (row.gmb_audit_id ? auditsById.get(row.gmb_audit_id) : null) ||
      buildFallbackAuditPreview(row, "gmb");
    const eeatAudit =
      (row.eeat_audit_id ? auditsById.get(row.eeat_audit_id) : null) ||
      buildFallbackAuditPreview(row, "eeat");

    return {
      id: row.id,
      job_id: row.job_id,
      business_name: row.business_name,
      phone: row.phone || "",
      email: row.email || "",
      website: row.website || "",
      address: row.address || "",
      city: row.city || "",
      state: row.state || "",
      zip: row.zip || "",
      niche: row.niche || "",
      gmb_url: row.gmb_url || "",
      gmb_claimed: row.gmb_claimed === 1,
      gmb_claim_source: extractClaimSourceFromNotes(row.notes),
      gmb_claim_status: deriveGmbClaimStatus(row),
      gmb_rating: row.gmb_rating,
      gmb_review_count: row.gmb_review_count,
      source: row.source,
      notes: row.notes || "",
      is_selected: row.is_selected === 1,
      added_to_dashboard: row.added_to_dashboard === 1,
      website_audit: websiteAudit,
      gmb_audit: gmbAudit,
      eeat_audit: eeatAudit,
      audit_readiness: (cleanText(row.audit_readiness).toLowerCase() || "pending") as OutreachReadiness,
      audit_readiness_reason: row.audit_readiness_reason || "",
      last_audited_at: row.last_audited_at,
      created_at: row.created_at,
      added_at: row.added_at,
    };
  });
}

function updateStagedLeadSelection(jobId: string, stagedLeadId: string, selected: boolean): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE scraper_staged_leads
       SET is_selected = ?
       WHERE id = ? AND job_id = ? AND added_to_dashboard = 0`
    )
    .run(selected ? 1 : 0, stagedLeadId, jobId);

  return Number(result.changes || 0) > 0;
}

function updateAllStagedLeadSelection(jobId: string, selected: boolean): number {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE scraper_staged_leads
       SET is_selected = ?
       WHERE job_id = ? AND added_to_dashboard = 0`
    )
    .run(selected ? 1 : 0, jobId);

  return Number(result.changes || 0);
}

function addSelectedStagedLeadsToDashboard(jobId: string): {
  inserted: number;
  updated: number;
  processed: number;
  selectedBeforeImport: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM scraper_staged_leads
       WHERE job_id = ? AND added_to_dashboard = 0 AND is_selected = 1`
    )
    .all(jobId) as StagedLeadRow[];

  if (rows.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      processed: 0,
      selectedBeforeImport: 0,
    };
  }

  const leads = rows.map(toStagedLeadInput);
  const importResult = importLeads(leads, rows[0].source);

  // Link existing staged audits to dashboard leads and carry over audit scores
  const linkAuditStmt = db.prepare(
    `UPDATE audits
     SET lead_id = ?
     WHERE staged_lead_id = ? AND lead_id IS NULL`
  );

  const updateScoresStmt = db.prepare(
    `UPDATE leads
     SET last_website_audit_score = COALESCE(?, last_website_audit_score),
         last_gmb_audit_score = COALESCE(?, last_gmb_audit_score)
     WHERE id = ?`
  );

  db.exec("BEGIN");
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const leadId = importResult.leadIds[i];
      if (leadId) {
        linkAuditStmt.run(leadId, row.id);
        updateScoresStmt.run(
          row.website_audit_score ?? null,
          row.gmb_audit_score ?? null,
          leadId
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    console.error("Failed to link staged audits to dashboard leads:", error);
  }

  // Recalculate scores and trigger background auto-audits if audits were not completed
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const leadId = importResult.leadIds[i];
    if (leadId) {
      updateLeadScore(leadId);

      const hasWebsiteAudit = row.website_audit_status === "completed";
      const hasGmbAudit = row.gmb_audit_status === "completed";

      if (!hasWebsiteAudit || !hasGmbAudit) {
        autoAuditQueue.enqueue(leadId);
      }
    }
  }

  const now = new Date().toISOString();
  const markStmt = db.prepare(
    `UPDATE scraper_staged_leads
     SET added_to_dashboard = 1, added_at = ?
     WHERE id = ?`
  );

  db.exec("BEGIN");
  try {
    for (const row of rows) {
      markStmt.run(now, row.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const job = getJob(jobId);
  if (job) {
    updateJob(jobId, {
      imported_count: Number(job.imported_count || 0) + importResult.inserted + importResult.updated,
      progress_message: "Selected leads added to dashboard",
    });
  }

  return {
    inserted: importResult.inserted,
    updated: importResult.updated,
    processed: rows.length,
    selectedBeforeImport: rows.length,
  };
}

function resolveImportedLeadMatchesForStagedRows(rows: StagedLeadRow[]): {
  matchedLeadIds: string[];
  rowByLeadId: Map<string, StagedLeadRow>;
} {
  if (rows.length === 0) {
    return {
      matchedLeadIds: [],
      rowByLeadId: new Map<string, StagedLeadRow>(),
    };
  }

  const db = getDb();
  const findByEmail = db.prepare(
    `SELECT id FROM leads
     WHERE LOWER(COALESCE(email, '')) = LOWER(?)
     ORDER BY datetime(updated_at) DESC
     LIMIT 1`
  );

  const findByBusiness = db.prepare(
    `SELECT id FROM leads
     WHERE LOWER(business_name) = LOWER(?)
       AND LOWER(COALESCE(city, '')) = LOWER(?)
       AND LOWER(COALESCE(state, '')) = LOWER(?)
     ORDER BY datetime(updated_at) DESC
     LIMIT 1`
  );

  const matchedLeadIds = new Set<string>();
  const rowByLeadId = new Map<string, StagedLeadRow>();
  for (const row of rows) {
    let matched: { id?: string } | undefined;

    const email = cleanText(row.email);
    if (email) {
      matched = findByEmail.get(email) as { id?: string } | undefined;
    }

    if (!matched?.id) {
      matched = findByBusiness.get(
        cleanText(row.business_name),
        cleanText(row.city),
        cleanText(row.state)
      ) as { id?: string } | undefined;
    }

    if (matched?.id) {
      matchedLeadIds.add(matched.id);
      if (!rowByLeadId.has(matched.id)) {
        rowByLeadId.set(matched.id, row);
      }
    }
  }

  return {
    matchedLeadIds: Array.from(matchedLeadIds),
    rowByLeadId,
  };
}

function truncateText(value: string, maxLength: number): string {
  const normalized = cleanText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function parseJsonObject<T extends Record<string, unknown>>(value: string): Partial<T> {
  const cleaned = cleanText(value)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const parseCandidate = (candidate: string): Partial<T> | null => {
    try {
      return JSON.parse(candidate) as Partial<T>;
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(cleaned);
  if (direct) {
    return direct;
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const extracted = parseCandidate(cleaned.slice(start, end + 1));
    if (extracted) {
      return extracted;
    }
  }

  return {};
}

function parseCampaignSequenceForPersonalization(sequenceJson: string | null): {
  subject: string;
  body: string;
} {
  if (!sequenceJson) {
    return { subject: "", body: "" };
  }

  try {
    const parsed = JSON.parse(sequenceJson) as Partial<{ subject: string; body: string }>;
    return {
      subject: cleanText(parsed.subject),
      body: cleanText(parsed.body),
    };
  } catch {
    return { subject: "", body: "" };
  }
}

function personalizeEmailTemplate(template: string, row: StagedLeadRow): string {
  const replacements: Record<string, string> = {
    "{{business_name}}": cleanText(row.business_name),
    "{{city}}": cleanText(row.city),
    "{{state}}": cleanText(row.state),
    "{{website}}": cleanText(row.website),
    "{{email}}": cleanText(row.email),
  };

  let output = cleanText(template);
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }

  return output;
}

function buildCampaignReportSnapshot(args: {
  id: string | null;
  status: string;
  score: number | null;
  verdict: string | null;
  summary: string | null;
}): CampaignReportSnapshot | null {
  const status = parseStagedLeadAuditStatus(args.status);
  const score = typeof args.score === "number" ? args.score : null;
  const verdict = cleanText(args.verdict);
  const summary = cleanText(args.summary);

  if (status === "not_run" && score === null && !verdict && !summary) {
    return null;
  }

  return {
    auditId: cleanText(args.id),
    status,
    score,
    verdict,
    summary,
  };
}

function buildCampaignReportContext(row: StagedLeadRow): CampaignReportContext {
  return {
    sourceJobId: row.job_id,
    stagedLeadId: row.id,
    businessName: cleanText(row.business_name),
    city: cleanText(row.city),
    state: cleanText(row.state),
    niche: cleanText(row.niche),
    website: cleanText(row.website),
    gmbUrl: cleanText(row.gmb_url),
    readiness: cleanText(row.audit_readiness).toLowerCase() || "pending",
    readinessReason: cleanText(row.audit_readiness_reason),
    generatedAt: new Date().toISOString(),
    audits: {
      website: buildCampaignReportSnapshot({
        id: row.website_audit_id,
        status: row.website_audit_status,
        score: row.website_audit_score,
        verdict: row.website_audit_verdict,
        summary: row.website_audit_summary,
      }),
      gmb: buildCampaignReportSnapshot({
        id: row.gmb_audit_id,
        status: row.gmb_audit_status,
        score: row.gmb_audit_score,
        verdict: row.gmb_audit_verdict,
        summary: row.gmb_audit_summary,
      }),
      eeat: buildCampaignReportSnapshot({
        id: row.eeat_audit_id,
        status: row.eeat_audit_status,
        score: row.eeat_audit_score,
        verdict: row.eeat_audit_verdict,
        summary: row.eeat_audit_summary,
      }),
    },
  };
}

function renderCampaignReportAttachment(context: CampaignReportContext): string {
  const formatSnapshot = (label: string, snapshot: CampaignReportSnapshot | null): string => {
    if (!snapshot) {
      return `${label}: not run`;
    }

    const scoreText = snapshot.score === null ? "n/a" : String(snapshot.score);
    const verdictText = snapshot.verdict || "n/a";
    const statusText = snapshot.status.replace(/_/g, " ");
    const summaryText = snapshot.summary ? ` | ${truncateText(snapshot.summary, 180)}` : "";

    return `${label}: ${scoreText} | ${verdictText} | ${statusText}${summaryText}`;
  };

  return [
    "Attached audit snapshot:",
    formatSnapshot("Website Legacy", context.audits.website),
    formatSnapshot("GMB", context.audits.gmb),
    formatSnapshot("EEAT", context.audits.eeat),
    `Readiness: ${context.readiness}${context.readinessReason ? ` | ${truncateText(context.readinessReason, 140)}` : ""}`,
  ].join("\n");
}

async function buildCampaignPersonalizationMaps(args: {
  leadIds: string[];
  rowByLeadId: Map<string, StagedLeadRow>;
  baseSubject: string;
  baseBody: string;
  targetCity: string;
  targetNiche: string;
  preferredProviderKey?: string;
  enableAi?: boolean;
}): Promise<{
  personalizedByLeadId: Record<string, { subject?: string; body?: string; bodyHtml?: string }>;
  reportContextByLeadId: Record<string, Record<string, unknown>>;
  modeByLeadId: Record<string, CampaignPersonalizationMode>;
  aiGeneratedCount: number;
  fallbackCount: number;
}> {
  const personalizedByLeadId: Record<string, { subject?: string; body?: string; bodyHtml?: string }> = {};
  const reportContextByLeadId: Record<string, Record<string, unknown>> = {};
  const modeByLeadId: Record<string, CampaignPersonalizationMode> = {};

  let aiGeneratedCount = 0;
  let fallbackCount = 0;

  const leadIdsQueue = [...args.leadIds];
  const preferredProviderKey = cleanText(args.preferredProviderKey) || undefined;
  const workerCount = Math.max(1, Math.min(4, parseInteger(process.env.CAMPAIGN_AI_CONCURRENCY, 2)));

  const workers = Array.from({ length: Math.min(workerCount, leadIdsQueue.length) }, async () => {
    while (leadIdsQueue.length > 0) {
      const leadId = leadIdsQueue.shift();
      if (!leadId) {
        continue;
      }

      const row = args.rowByLeadId.get(leadId);
      if (!row) {
        continue;
      }

      const reportContext = buildCampaignReportContext(row);
      reportContextByLeadId[leadId] = reportContext as unknown as Record<string, unknown>;

      const fallbackSubject =
        personalizeEmailTemplate(args.baseSubject, row) || `Quick idea for ${cleanText(row.business_name)}`;
      const fallbackBodyCore =
        personalizeEmailTemplate(args.baseBody, row) ||
        `Hi ${cleanText(row.business_name)},\n\nI reviewed your local visibility and found a few practical opportunities in ${cleanText(row.city) || "your market"}.`;
      const reportAttachment = renderCampaignReportAttachment(reportContext);
      const fallbackBody = `${fallbackBodyCore}\n\n${reportAttachment}`;

      if (args.enableAi === false) {
        personalizedByLeadId[leadId] = {
          subject: fallbackSubject,
          body: fallbackBody,
          bodyHtml: plainTextToEmailHtml(fallbackBody),
        };
        modeByLeadId[leadId] = "fallback";
        fallbackCount += 1;
        continue;
      }

      try {
        const prompt = [
          "Write one unique local SEO outreach email for this exact business.",
          "Return strict JSON only: {\"subject\": string, \"body\": string}.",
          "Body must be plain text only, 90-170 words, direct and human.",
          "Avoid hype, fake urgency, guarantees, and robotic phrasing.",
          `Business: ${cleanText(row.business_name)}`,
          `City/State: ${cleanText(row.city)} ${cleanText(row.state)}`,
          `Niche: ${cleanText(row.niche) || cleanText(args.targetNiche)}`,
          `Website: ${cleanText(row.website)}`,
          `Campaign target city: ${cleanText(args.targetCity)}`,
          `Base subject to adapt: ${args.baseSubject}`,
          `Base body to adapt:\n${args.baseBody}`,
          `Audit snapshot to use:\n${reportAttachment}`,
          "Mention one concrete audit insight naturally in the body.",
        ].join("\n\n");

        const generated = await generateAiText({
          task: "email",
          preferredProviderKey,
          systemPrompt:
            "You write concise, respectful local SEO outreach emails personalized for one recipient at a time.",
          prompt,
          temperature: 0.6,
          maxTokens: 700,
        });

        const parsed = parseJsonObject<{ subject: string; body: string }>(generated.output);
        const aiSubject = cleanText(parsed.subject) || fallbackSubject;
        const aiBodyCore = cleanText(parsed.body) || cleanText(generated.output) || fallbackBodyCore;
        const aiBody = `${aiBodyCore}\n\n${reportAttachment}`;

        personalizedByLeadId[leadId] = {
          subject: aiSubject,
          body: aiBody,
          bodyHtml: plainTextToEmailHtml(aiBody),
        };
        modeByLeadId[leadId] = "ai";
        aiGeneratedCount += 1;
      } catch {
        personalizedByLeadId[leadId] = {
          subject: fallbackSubject,
          body: fallbackBody,
          bodyHtml: plainTextToEmailHtml(fallbackBody),
        };
        modeByLeadId[leadId] = "fallback";
        fallbackCount += 1;
      }
    }
  });

  await Promise.all(workers);

  return {
    personalizedByLeadId,
    reportContextByLeadId,
    modeByLeadId,
    aiGeneratedCount,
    fallbackCount,
  };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toIntFromUnknown(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const text = String(value).replace(/[^\d]/g, "");
  if (!text) return null;

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}

const UNCLAIMED_TEXT_PATTERNS = [
  /\bclaim\s+this\s+(?:business|listing|profile)\b/i,
  /\bclaim\s+(?:your\s+)?(?:business|listing|profile)\b/i,
  /\bis\s+this\s+your\s+business\b/i,
  /\bown\s+this\s+business\b/i,
  /\bunclaimed\b/i,
  /\bnot\s+claimed\b/i,
  /\brequest\s+ownership\b/i,
  /"isclaimed"\s*:\s*false/i,
  /"claimed"\s*:\s*false/i,
  /"ownershipstate"\s*:\s*"unclaimed"/i,
];

const CLAIMED_TEXT_PATTERNS = [
  /"isclaimed"\s*:\s*true/i,
  /"claimed"\s*:\s*true/i,
  /"ownershipstate"\s*:\s*"claimed"/i,
];

function toNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return null;

  if (["1", "true", "yes", "y", "claimed"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "unclaimed", "not claimed"].includes(normalized)) {
    return false;
  }

  return null;
}

function detectClaimedFromText(value: unknown): boolean | null {
  const text = cleanText(value);
  if (!text) return null;

  if (UNCLAIMED_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (CLAIMED_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return null;
}

function collectStringSignals(value: unknown, out: string[], depth = 0): void {
  if (value === null || value === undefined || depth > 2 || out.length >= 160) {
    return;
  }

  if (typeof value === "string") {
    const text = cleanText(value);
    if (text) out.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringSignals(item, out, depth + 1);
      if (out.length >= 160) break;
    }
    return;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectStringSignals(nested, out, depth + 1);
      if (out.length >= 160) break;
    }
  }
}

function resolveGmbClaimed(source: Record<string, unknown>): boolean {
  const directBooleanFields = [
    source.gmb_claimed,
    source.claimed,
    source.isClaimed,
    source.is_claimed,
    source.ownerClaimed,
    source.businessClaimed,
  ];

  for (const candidate of directBooleanFields) {
    const parsed = toNullableBoolean(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const invertedBooleanFields = [source.unclaimed, source.isUnclaimed, source.notClaimed];
  for (const candidate of invertedBooleanFields) {
    const parsed = toNullableBoolean(candidate);
    if (parsed !== null) {
      return !parsed;
    }
  }

  const textSignals: string[] = [];
  const textSignalFields = [
    source.claimStatus,
    source.claimPromptCandidates,
    source.claimHrefCandidates,
    source.ownershipStatus,
    source.verificationStatus,
    source.badge,
    source.badges,
    source.attributes,
    source.serviceOptions,
    source.highlights,
    source.notes,
    source.note,
    source.description,
    source.summary,
  ];

  for (const signal of textSignalFields) {
    collectStringSignals(signal, textSignals);
  }

  for (const text of textSignals) {
    const detected = detectClaimedFromText(text);
    if (detected !== null) {
      return detected;
    }
  }

  // On Google Maps, listings without an explicit "Claim this business" prompt are claimed
  return true;
}

const KEYWORD_STOP_WORDS = new Set([
  "in",
  "near",
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "of",
  "to",
  "with",
  "service",
  "services",
  "company",
  "business",
  "businesses",
  "local",
  "best",
  "top",
]);

const KEYWORD_SYNONYMS: Record<string, string[]> = {
  plumber: ["plumb", "plumbing", "drain", "rooter", "sewer", "pipe", "pipes"],
  plumbing: ["plumb", "plumber", "drain", "rooter", "sewer", "pipe", "pipes"],
  drain: ["drainage", "drains", "rooter", "sewer", "plumbing"],
  drains: ["drainage", "drain", "rooter", "sewer", "plumbing"],
  rooter: ["drain", "drainage", "sewer", "plumbing", "plumber"],
};

const CLEARLY_IRRELEVANT_INDUSTRY_TERMS = [
  /\bmortgage\b/i,
  /\bhome\s+loan\b/i,
  /\bloan\s+officer\b/i,
  /\blender\b/i,
  /\breal\s+estate\b/i,
  /\brealtor\b/i,
  /\binsurance\b/i,
  /\bcredit\s+union\b/i,
  /\battorney\b/i,
  /\blaw\s+firm\b/i,
  /\bdentist\b/i,
  /\bdental\b/i,
];

function buildKeywordTerms(keyword: string): string[] {
  const normalizedKeyword = cleanText(keyword).toLowerCase();
  if (!normalizedKeyword) return [];

  const out = new Set<string>();
  const tokens = normalizedKeyword
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 3)
    .filter((token) => !KEYWORD_STOP_WORDS.has(token));

  for (const token of tokens) {
    out.add(token);
    if (token.endsWith("s") && token.length > 4) {
      out.add(token.slice(0, -1));
    }

    const synonyms = KEYWORD_SYNONYMS[token] || [];
    for (const synonym of synonyms) {
      out.add(synonym);
    }
  }

  return [...out];
}

function buildGmbRelevanceText(source: Record<string, unknown>): string {
  const pieces: string[] = [];
  const signalFields = [
    source.name,
    source.business_name,
    source.category,
    source.niche,
    source.snippet,
    source.description,
    source.summary,
    source.note,
    source.notes,
    source.website,
    source.rawText,
    source.text,
    source.subtypes,
    source.attributes,
    source.serviceOptions,
    source.highlights,
  ];

  for (const field of signalFields) {
    collectStringSignals(field, pieces);
  }

  return pieces.join(" ").toLowerCase();
}

function isGmbListingRelevant(source: Record<string, unknown>, keyword: string): boolean {
  const keywordTerms = buildKeywordTerms(keyword);
  if (keywordTerms.length === 0) {
    return true;
  }

  const listingText = buildGmbRelevanceText(source);
  if (!listingText) {
    return false;
  }

  const phrase = cleanText(keyword).toLowerCase();
  if (phrase && listingText.includes(phrase)) {
    return true;
  }

  if (keywordTerms.some((term) => listingText.includes(term))) {
    return true;
  }

  if (CLEARLY_IRRELEVANT_INDUSTRY_TERMS.some((pattern) => pattern.test(listingText))) {
    return false;
  }

  // If there's no direct hit but also no obvious mismatch, keep the listing.
  return true;
}

function parseLocationFallback(location: string): { city: string; state: string } {
  const normalized = cleanText(location);

  if (!normalized) {
    return { city: "", state: "" };
  }

  if (normalized.includes(",")) {
    const parts = normalized.split(",").map((part) => cleanText(part));
    return {
      city: parts[0] || "",
      state: (parts[1] || "").replace(/[^a-zA-Z]/g, "").toUpperCase(),
    };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens[tokens.length - 1].length <= 3) {
    return {
      city: tokens.slice(0, -1).join(" "),
      state: tokens[tokens.length - 1].replace(/[^a-zA-Z]/g, "").toUpperCase(),
    };
  }

  return { city: normalized, state: "" };
}

function hostMatchesDomain(host: string, domain: string): boolean {
  const normalizedHost = cleanText(host).toLowerCase();
  const normalizedDomain = cleanText(domain).toLowerCase();
  if (!normalizedHost || !normalizedDomain) return false;

  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function isValidDirectoryListingUrl(
  sourceType: "yellowpages" | "yelp_scraper" | "bbb_scraper",
  urlValue: string
): boolean {
  const normalized = cleanText(urlValue);
  if (!normalized) return false;

  const withProtocol = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (sourceType === "yelp_scraper") {
      if (!hostMatchesDomain(host, "yelp.com")) {
        return false;
      }

      return ![
        "/search",
        "/topic/",
        "/events/",
        "/questions/",
        "/collections/",
        "/talk",
        "/for-business",
        "/developers",
        "/adredir",
      ].some((token) => pathname.includes(token));
    }

    if (sourceType === "yellowpages") {
      return (
        hostMatchesDomain(host, "yellowpages.com") &&
        !["/search", "/yellowpages/"].some((token) => pathname.includes(token))
      );
    }

    return (
      hostMatchesDomain(host, "bbb.org") &&
      !["/accredited-business-directory", "/scamtracker"].some((token) => pathname.includes(token))
    );
  } catch {
    return false;
  }
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function writeLeadsCsv(jobId: string, leads: Partial<LeadInput>[]): string {
  const outputDir = getOutputDirectory();
  const csvPath = path.join(outputDir, `${jobId}.csv`);

  const headers = [
    "business_name",
    "phone",
    "email",
    "website",
    "address",
    "city",
    "state",
    "zip",
    "niche",
    "gmb_url",
    "gmb_claimed",
    "gmb_rating",
    "gmb_review_count",
    "has_website",
    "source",
    "status",
    "notes",
  ];

  const rows = leads.map((lead) =>
    [
      lead.business_name,
      lead.phone,
      lead.email,
      lead.website,
      lead.address,
      lead.city,
      lead.state,
      lead.zip,
      lead.niche,
      lead.gmb_url,
      lead.gmb_claimed,
      lead.gmb_rating,
      lead.gmb_review_count,
      lead.has_website,
      lead.source,
      lead.status,
      lead.notes,
    ]
      .map((value) => csvEscape(value))
      .join(",")
  );

  const content = [headers.join(","), ...rows].join("\n");
  fs.writeFileSync(csvPath, `${content}\n`, "utf8");

  return csvPath;
}

function normalizeDirectoryOutput(
  raw: unknown,
  payload: { businessType: string; location: string },
  sourceType: "yellowpages" | "yelp_scraper" | "bbb_scraper",
  notePrefix: string
): Partial<LeadInput>[] {
  const items = Array.isArray(raw) ? raw : [];
  const locationFallback = parseLocationFallback(payload.location);
  const leads: Partial<LeadInput>[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;

    const source = item as Record<string, unknown>;
    const businessName = cleanText(source.name || source.business_name);
    if (!businessName) continue;

    const addressRaw = cleanText(source.address) || cleanText(payload.location);
    const parts = splitAddress(addressRaw);
    const website = cleanText(source.website);
    const sourceUrl = cleanText(source.sourceUrl || source.url || source.gmb_url || source.locationLink);
    const discoverySource = cleanText(source.discoverySource || source.dataSource).toLowerCase();
    const isGoogleMapsFallback = discoverySource === "google_maps_fallback";

    if (sourceUrl && !isGoogleMapsFallback && !isValidDirectoryListingUrl(sourceType, sourceUrl)) {
      continue;
    }

    const listingUrl = isGoogleMapsFallback
      ? cleanText(source.gmb_url || source.locationLink || source.sourceUrl || source.url)
      : sourceUrl;
    const sourceNotes = cleanText(source.notes);
    const noteSuffix = sourceNotes ? ` | ${sourceNotes}` : "";

    leads.push({
      business_name: businessName,
      phone: cleanText(source.phone),
      email: cleanText(source.email),
      website,
      address: parts.address || addressRaw,
      city: parts.city || locationFallback.city,
      state: parts.state || locationFallback.state,
      zip: parts.zip,
      niche:
        cleanText(source.category) ||
        (Array.isArray(source.categories) ? cleanText(source.categories[0]) : "") ||
        payload.businessType,
      gmb_url: listingUrl,
      gmb_claimed: false,
      gmb_rating: toNumber(source.rating),
      gmb_review_count: toIntFromUnknown(source.reviewCount),
      has_website: Boolean(website),
      gmb_profile_incomplete: false,
      citations_found: false,
      source: sourceType,
      status: "new",
      notes: `${notePrefix}${noteSuffix} | ${cleanText(source.snippet)}`.trim(),
    });
  }

  return leads;
}

function normalizeYellowPagesOutput(
  raw: unknown,
  payload: { businessType: string; location: string }
): Partial<LeadInput>[] {
  return normalizeDirectoryOutput(raw, payload, "yellowpages", "Imported from Yellow Pages Lead Engine");
}

function normalizeYelpOutput(
  raw: unknown,
  payload: { businessType: string; location: string }
): Partial<LeadInput>[] {
  return normalizeDirectoryOutput(raw, payload, "yelp_scraper", "Imported from Yelp Lead Engine");
}

function normalizeBbbOutput(
  raw: unknown,
  payload: { businessType: string; location: string }
): Partial<LeadInput>[] {
  return normalizeDirectoryOutput(raw, payload, "bbb_scraper", "Imported from BBB Lead Engine");
}

function normalizeDiscoveryOutput(
  raw: unknown,
  payload: { businessType: string; location?: string; state?: string },
  sourceType: ScraperSource,
  notePrefix: string
): Partial<LeadInput>[] {
  const items = Array.isArray(raw) ? raw : [];
  const locationSeed = cleanText(payload.location) || cleanText(payload.state);
  const locationFallback = payload.location
    ? parseLocationFallback(locationSeed)
    : { city: "", state: cleanText(payload.state).toUpperCase() };
  const leads: Partial<LeadInput>[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;

    const source = item as Record<string, unknown>;
    const businessName = cleanText(source.name || source.business_name || source.title || source.advertiser);
    if (!businessName) continue;

    const addressRaw = cleanText(source.address) || locationSeed;
    const parts = splitAddress(addressRaw);
    const websiteRaw = cleanText(source.website);
    const sourceUrl = cleanText(source.sourceUrl || source.url || source.link);
    const snippet = sanitizeNoteSegment(cleanText(source.snippet || source.description));
    const network = sanitizeNoteSegment(cleanText(source.network));
    const model = sanitizeNoteSegment(cleanText(source.model));
    const confidence = Number(source.confidence);
    const noteBits = [notePrefix];
    const signalBits: string[] = [];

    if (network) signalBits.push(`network=${network}`);
    if (model) signalBits.push(`model=${model}`);
    if (Number.isFinite(confidence)) signalBits.push(`confidence=${confidence.toFixed(2)}`);
    if (signalBits.length > 0) {
      noteBits.push(`intel: ${signalBits.join("; ")}`);
    }
    if (snippet) {
      noteBits.push(`snippet: ${snippet}`);
    }

    leads.push({
      business_name: businessName,
      phone: cleanText(source.phone),
      email: cleanText(source.email),
      website: websiteRaw,
      address: parts.address || addressRaw,
      city: cleanText(source.city) || parts.city || locationFallback.city,
      state: cleanText(source.state) || parts.state || locationFallback.state,
      zip: cleanText(source.zip) || parts.zip,
      niche:
        cleanText(source.category) ||
        (Array.isArray(source.categories) ? cleanText(source.categories[0]) : "") ||
        payload.businessType,
      gmb_url: sourceUrl || cleanText(source.gmb_url),
      gmb_claimed: false,
      gmb_rating: toNumber(source.rating),
      gmb_review_count: toIntFromUnknown(source.reviewCount),
      has_website: Boolean(websiteRaw),
      gmb_profile_incomplete: false,
      citations_found: false,
      source: sourceType,
      status: "new",
      notes: noteBits.filter(Boolean).join(" | "),
    });
  }

  return leads;
}

function normalizeWebsiteEnrichmentOutput(raw: unknown): Partial<LeadInput>[] {
  const items = Array.isArray(raw) ? raw : [];
  const leads: Partial<LeadInput>[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;

    const source = item as Record<string, unknown>;
    const businessName = cleanText(source.business_name || source.name);
    if (!businessName) continue;

    const originalSource = cleanText(source.original_source || source.source);
    const notes = [cleanText(source.notes), originalSource ? `origin_source: ${originalSource}` : ""]
      .filter(Boolean)
      .join(" | ");

    leads.push({
      business_name: businessName,
      phone: cleanText(source.phone),
      email: cleanText(source.email),
      website: cleanText(source.website),
      address: cleanText(source.address),
      city: cleanText(source.city),
      state: cleanText(source.state),
      zip: cleanText(source.zip),
      niche: cleanText(source.niche),
      gmb_url: cleanText(source.gmb_url),
      gmb_claimed: source.gmb_claimed === true || source.gmb_claimed === 1 || source.gmb_claimed === "1",
      gmb_rating: toNumber(source.gmb_rating),
      gmb_review_count: toIntFromUnknown(source.gmb_review_count),
      has_website:
        source.has_website === true ||
        source.has_website === 1 ||
        source.has_website === "1" ||
        Boolean(cleanText(source.website)),
      gmb_profile_incomplete: false,
      citations_found: false,
      source: "website_enrichment",
      status: "new",
      notes,
    });
  }

  return leads;
}

function normalizeGmbOutput(raw: unknown, payload: { keyword: string; location: string }): Partial<LeadInput>[] {
  const items = Array.isArray(raw) ? raw : [];
  const locationFallback = parseLocationFallback(payload.location);
  const leads: Partial<LeadInput>[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;

    const source = item as Record<string, unknown>;
    const businessName = cleanText(source.name || source.business_name);
    if (!businessName) continue;

    if (!isGmbListingRelevant(source, payload.keyword)) {
      continue;
    }

    const website = cleanText(source.website);
    const parts = splitAddress(cleanText(source.address));
    const gmbClaimed = resolveGmbClaimed(source);
    const claimSource = cleanText(source.gmb_claim_source);
    const notes = claimSource
      ? `Imported from Google Maps Lead Engine | claim_source: ${claimSource}`
      : "Imported from Google Maps Lead Engine";

    leads.push({
      business_name: businessName,
      phone: cleanText(source.phone),
      email: "",
      website,
      address: parts.address,
      city: parts.city || locationFallback.city,
      state: parts.state || locationFallback.state,
      zip: parts.zip,
      niche: cleanText(source.category) || payload.keyword,
      gmb_url: cleanText(source.locationLink || source.gmb_url),
      gmb_claimed: gmbClaimed,
      gmb_rating: toNumber(source.rating),
      gmb_review_count: toIntFromUnknown(source.reviews || source.reviewCount || source.visibleReviewsCount),
      has_website: Boolean(website),
      gmb_profile_incomplete: false,
      citations_found: false,
      source: "gmb_scraper",
      status: "new",
      notes,
    });
  }

  return leads;
}

function normalizeStateDirectoryOutput(
  raw: unknown,
  payload: { businessType: string; state: string }
): Partial<LeadInput>[] {
  const items = Array.isArray(raw) ? raw : [];
  const leads: Partial<LeadInput>[] = [];

  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;

    const source = item as Record<string, unknown>;
    const businessName = cleanText(
      source.business_name || source.businessName || source.name || source.company_name
    );
    if (!businessName) continue;

    const addressRaw = cleanText(source.address || source.street_address || payload.state);
    const parts = splitAddress(addressRaw);
    const website = cleanText(source.website || source.url);

    const agentName = cleanText(source.agentName || source.agent_name);
    const filingDate = cleanText(source.filingDate || source.filing_date);
    const regStatus = cleanText(source.status);
    const dataSource = cleanText(source.dataSource || source.data_source || source.origin);
    const noteParts = [`Imported from ${payload.state.toUpperCase()} state directory Lead Engine`];
    if (dataSource === "google_maps_fallback") {
      noteParts.push("fallback: Google Maps statewide discovery");
    }
    if (regStatus) noteParts.push(`status: ${regStatus}`);
    if (filingDate) noteParts.push(`filed: ${filingDate}`);
    if (agentName) noteParts.push(`agent: ${agentName}`);

    leads.push({
      business_name: businessName,
      phone: cleanText(source.phone || source.phone_number),
      email: cleanText(source.email),
      website,
      address: addressRaw,
      city: cleanText(source.city) || parts.city,
      state: cleanText(source.state) || parts.state || payload.state.toUpperCase(),
      zip: cleanText(source.zip || source.zip_code) || parts.zip,
      niche: cleanText(source.niche || source.category) || payload.businessType,
      gmb_url: cleanText(source.gmb_url || source.sourceUrl),
      gmb_claimed: false,
      gmb_rating: toNumber(source.gmb_rating || source.rating),
      gmb_review_count: toIntFromUnknown(source.gmb_review_count || source.reviewCount),
      has_website: Boolean(website),
      gmb_profile_incomplete: false,
      citations_found: false,
      source: "state_directory",
      status: "new",
      notes: noteParts.join(" | "),
    });
  }

  return leads;
}

function parseProgressLine(line: string): {
  percent?: number;
  message?: string;
  totalFound?: number;
  previewListings?: unknown[];
} | null {
  const marker = "__PROGRESS__";
  if (!line.startsWith(marker)) {
    return null;
  }

  try {
    const parsed = JSON.parse(line.slice(marker.length));
    const previewListings = Array.isArray(parsed?.previewListings)
      ? parsed.previewListings
      : Array.isArray(parsed?.listings)
        ? parsed.listings
        : undefined;

    return {
      percent: Number(parsed?.percent),
      message: cleanText(parsed?.message),
      totalFound: Number(parsed?.totalFound),
      previewListings,
    };
  } catch (error) {
    return null;
  }
}

function runScraperInBackground(options: {
  jobId: string;
  source: ScraperSource;
  command: string;
  args: string[];
  outputPath: string;
  proxyUrl?: string;
  normalize: (raw: unknown) => Partial<LeadInput>[];
}): void {
  const { jobId, source, command, args, outputPath, normalize } = options;
  const proxyUrl = cleanText(options.proxyUrl);
  const tenantStore = tenantLocalStorage.getStore();
  const tenantId = tenantStore?.tenantId || "default";

  updateJob(jobId, {
    status: "running",
    started_at: new Date().toISOString(),
    output_file: outputPath,
    progress_percent: 1,
    progress_message: "Runner started",
    total_found: 0,
  });

  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: buildScraperChildEnv(proxyUrl),
    stdio: ["ignore", "pipe", "pipe"],
  }) as any;

  activeProcesses.set(jobId, child);

  try {
    console.log(
      `[scraper-${jobId}] Starting child process ${path.basename(String(args?.[0] || command))} using proxy ${scraperProxySupport.maskProxyUrl(proxyUrl) || "(none)"}`
    );
  } catch {
    // ignore logging errors
  }

  let stderrOutput = "";
  let stdoutBuffer = "";
  let lastPreviewPersistedAt = 0;
  let lastPreviewCount = -1;

  child.stdout?.on("data", (chunk: Buffer) => {
    tenantLocalStorage.run({ tenantId }, () => {
      stdoutBuffer += chunk.toString();

      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        const progress = parseProgressLine(line);
        if (progress) {
          const currentJob = getJob(jobId);
          const progressPercent = Number.isFinite(progress.percent || NaN)
            ? Math.min(99, Math.max(0, Number(progress.percent)))
            : currentJob?.progress_percent || 0;
          const progressMessage = progress.message || currentJob?.progress_message || "Running";
          const progressTotalFound = Number.isFinite(progress.totalFound || NaN)
            ? Math.max(0, Number(progress.totalFound))
            : currentJob?.total_found || 0;

          updateJob(jobId, {
            progress_percent: progressPercent,
            progress_message: progressMessage,
            total_found: progressTotalFound,
          });

          const previewListings = Array.isArray(progress.previewListings) ? progress.previewListings : [];
          if (previewListings.length > 0) {
            const now = Date.now();
            const shouldPersistPreview =
              now - lastPreviewPersistedAt >= 1200 || previewListings.length !== lastPreviewCount;

            if (shouldPersistPreview) {
              try {
                const previewLeads = normalize(previewListings);
                saveStagedLeads(jobId, source, previewLeads);

                lastPreviewPersistedAt = now;
                lastPreviewCount = previewListings.length;

                updateJob(jobId, {
                  total_found: Math.max(progressTotalFound, previewLeads.length),
                  progress_message: `${progressMessage} | Live leads: ${previewLeads.length}`,
                });
              } catch {
                // Ignore preview persistence errors and keep runner alive.
              }
            }
          }
        }

        newlineIndex = stdoutBuffer.indexOf("\n");
      }
    });
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString();
  });

  child.on("close", (code: number | null) => {
    tenantLocalStorage.run({ tenantId }, () => {
      activeProcesses.delete(jobId);

      const interrupted = interruptedJobs.get(jobId);
      if (interrupted) {
        interruptedJobs.delete(jobId);
        processNextQueuedJob();
        return;
      }

      if (code !== 0) {
        try {
          const proxyNote = proxyUrl ? ` Proxy: ${scraperProxySupport.maskProxyUrl(proxyUrl)}.` : "";
          const stderrSummary = summarizeErrorMessage(stderrOutput || "");
          const mainMessage = stderrSummary || `${source} scraper failed with exit code ${code}`;

          updateJob(jobId, {
            status: "error",
            completed_at: new Date().toISOString(),
            progress_percent: 100,
            progress_message: "Failed",
            error_message: `${mainMessage}${proxyNote}`,
          });
        } catch (e) {
          updateJob(jobId, {
            status: "error",
            completed_at: new Date().toISOString(),
            progress_percent: 100,
            progress_message: "Failed",
            error_message: summarizeErrorMessage(stderrOutput || `${source} scraper failed with exit code ${code}`),
          });
        }
        processNextQueuedJob();
        return;
      }

      void (async () => {
        try {
          const rawJson = fs.readFileSync(outputPath, "utf8");
          const parsed = JSON.parse(rawJson);
          const normalizedLeads = normalize(parsed);

          updateJob(jobId, {
            progress_percent: 80,
            progress_message: "Normalizing and enriching leads",
            total_found: normalizedLeads.length,
          });

          const enrichedLeads = await enrichLeadsWithWebsiteAndEmail(jobId, normalizedLeads, proxyUrl);
          const csvPath = writeLeadsCsv(jobId, enrichedLeads);
          saveStagedLeads(jobId, source, enrichedLeads);

          if (Array.isArray(enrichedLeads) && enrichedLeads.length === 0) {
            const proxyNote = proxyUrl ? ` Proxy: ${scraperProxySupport.maskProxyUrl(proxyUrl)}.` : "";
            const stderrSummary = summarizeErrorMessage(stderrOutput || "");
            updateJob(jobId, {
              status: "error",
              completed_at: new Date().toISOString(),
              progress_percent: 100,
              progress_message: "No leads found - possible blocking or misconfiguration",
              error_message: `${stderrSummary || "No leads were extracted by the scraper."}${proxyNote} Output file: ${outputPath}`,
              csv_file: csvPath,
              total_found: 0,
              imported_count: 0,
            });
          } else {
            updateJob(jobId, {
              status: "complete",
              imported_count: 0,
              total_found: enrichedLeads.length,
              csv_file: csvPath,
              completed_at: new Date().toISOString(),
              progress_percent: 100,
              progress_message: `Completed - ${enrichedLeads.length} leads found`,
            });
          }

          processNextQueuedJob();
        } catch (error) {
          try {
            const proxyNote = proxyUrl ? ` Proxy: ${scraperProxySupport.maskProxyUrl(proxyUrl)}.` : "";
            const stderrSummary = summarizeErrorMessage(stderrOutput || "");
            const mainMessage = error instanceof Error ? error.message : "Failed to parse scraper output";
            updateJob(jobId, {
              status: "error",
              completed_at: new Date().toISOString(),
              progress_percent: 100,
              progress_message: "Failed",
              error_message: `${mainMessage}${stderrSummary ? ` | ${stderrSummary}` : ""}${proxyNote}`,
            });
          } catch (e) {
            updateJob(jobId, {
              status: "error",
              completed_at: new Date().toISOString(),
              progress_percent: 100,
              progress_message: "Failed",
              error_message: summarizeErrorMessage(
                error instanceof Error ? error.message : "Failed to parse scraper output"
              ),
            });
          }
          processNextQueuedJob();
        }
      })();
    });
  });
}

function writeInputFile(jobId: string, payload: Record<string, unknown>): string {
  const outputDir = getOutputDirectory();
  const inputPath = path.join(outputDir, `${jobId}.input.json`);
  fs.writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return inputPath;
}

function buildRunnerOutputPath(jobId: string): string {
  const outputDir = getOutputDirectory();
  return path.join(outputDir, `${jobId}.output.json`);
}

function getNodeCommand(): string {
  return process.execPath;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.round(numeric);
}

function parseCappedPositiveInteger(value: unknown, fallback: number, maxValue: number): number {
  return Math.min(maxValue, parsePositiveInteger(value, fallback));
}

function buildJobRunConfig(options: {
  source: ScraperSource;
  payload: Record<string, unknown>;
}): {
  payload: Record<string, unknown>;
  runnerFile: string;
  normalize: (raw: unknown) => Partial<LeadInput>[];
} | null {
  const { source, payload } = options;

  if (source === "yellowpages") {
    const businessType = cleanText(payload.businessType);
    const location = cleanText(payload.location);
    const maxItems = parseCappedPositiveInteger(payload.maxItems ?? payload.maxPages, 20, 5000);
    if (!businessType || !location) return null;

    const normalizedPayload = { businessType, location, maxItems };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/yellow-pages-runner.cjs",
      normalize: (raw) => normalizeYellowPagesOutput(raw, normalizedPayload),
    };
  }

  if (source === "gmb_scraper") {
    const keyword = cleanText(payload.keyword);
    const location = cleanText(payload.location);
    const listingsPerQuery = parseCappedPositiveInteger(payload.listingsPerQuery, 40, 5000);
    if (!keyword || !location) return null;

    const normalizedPayload = { keyword, location, listingsPerQuery };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/gmb-photo-runner.cjs",
      normalize: (raw) => normalizeGmbOutput(raw, normalizedPayload),
    };
  }

  if (source === "state_directory") {
    const state = cleanText(payload.state).toLowerCase();
    const businessType = cleanText(payload.businessType);
    const limit = parseCappedPositiveInteger(payload.limit, 250, 5000);
    if (!state || !businessType) return null;

    const normalizedPayload = { state, businessType, limit };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/state-directory-runner.cjs",
      normalize: (raw) => normalizeStateDirectoryOutput(raw, normalizedPayload),
    };
  }

  if (source === "yelp_scraper") {
    const businessType = cleanText(payload.businessType);
    const location = cleanText(payload.location);
    const maxItems = parseCappedPositiveInteger(payload.maxItems, 20, 5000);
    if (!businessType || !location) return null;

    const normalizedPayload = { businessType, location, maxItems };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/yelp-runner.cjs",
      normalize: (raw) => normalizeYelpOutput(raw, normalizedPayload),
    };
  }

  if (source === "bbb_scraper") {
    const businessType = cleanText(payload.businessType);
    const location = cleanText(payload.location);
    const maxItems = parseCappedPositiveInteger(payload.maxItems, 20, 5000);
    if (!businessType || !location) return null;

    const normalizedPayload = { businessType, location, maxItems };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/bbb-runner.cjs",
      normalize: (raw) => normalizeBbbOutput(raw, normalizedPayload),
    };
  }

  if (source === "website_enrichment") {
    const sourceJobId = cleanText(payload.sourceJobId);
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (!sourceJobId || rows.length === 0) return null;

    const normalizedPayload = {
      sourceJobId,
      rows: rows.slice(0, 150),
    };

    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/website-enrichment-runner.cjs",
      normalize: (raw) => normalizeWebsiteEnrichmentOutput(raw),
    };
  }

  if (source === "chamber_directory" || source === "license_registry") {
    return null;
  }

  if (source === "ads_google") {
    const businessType = cleanText(payload.businessType);
    const location = cleanText(payload.location);
    const maxItems = parseCappedPositiveInteger(payload.maxItems, 20, 5000);
    if (!businessType || !location) return null;

    const normalizedPayload = { businessType, location, maxItems };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/ads-google-runner.cjs",
      normalize: (raw) =>
        normalizeDiscoveryOutput(raw, normalizedPayload, "ads_google", "Active advertiser candidate from Google Ads intelligence"),
    };
  }

  if (source === "ads_meta") {
    const businessType = cleanText(payload.businessType);
    const location = cleanText(payload.location);
    const maxItems = parseCappedPositiveInteger(payload.maxItems, 20, 5000);
    if (!businessType || !location) return null;

    const normalizedPayload = { businessType, location, maxItems };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/ads-meta-runner.cjs",
      normalize: (raw) =>
        normalizeDiscoveryOutput(raw, normalizedPayload, "ads_meta", "Active advertiser candidate from Meta ads intelligence"),
    };
  }

  if (source === "ads_bing") {
    const businessType = cleanText(payload.businessType);
    const location = cleanText(payload.location);
    const maxItems = parseCappedPositiveInteger(payload.maxItems, 20, 5000);
    if (!businessType || !location) return null;

    const normalizedPayload = { businessType, location, maxItems };
    return {
      payload: withScraperProxy(normalizedPayload, payload),
      runnerFile: "server/modules/scraper-runners/ads-bing-runner.cjs",
      normalize: (raw) =>
        normalizeDiscoveryOutput(raw, normalizedPayload, "ads_bing", "Paid-intent candidate from Microsoft/Bing ads intelligence"),
    };
  }

  return null;
}

function enqueueJobRun(options: {
  source: ScraperSource;
  payload: Record<string, unknown>;
  runnerFile: string;
  normalize: (raw: unknown) => Partial<LeadInput>[];
}): ScraperJobRow {
  const { source, payload, runnerFile, normalize } = options;

  const job = createJob(source, payload);
  const inputPath = writeInputFile(job.id, payload);
  const outputPath = buildRunnerOutputPath(job.id);

  runScraperInBackground({
    jobId: job.id,
    source,
    command: getNodeCommand(),
    args: [path.resolve(process.cwd(), runnerFile), "--input", inputPath, "--output", outputPath],
    outputPath,
    proxyUrl: getPayloadScraperProxyUrl(payload),
    normalize,
  });

  return job;
}

function processNextQueuedJob(): void {
  const running = getInProgressJob();
  if (running) return;

  const db = getDb();
  const nextQueued = db
    .prepare(
      `SELECT * FROM scraper_jobs
       WHERE status = 'queued'
       ORDER BY datetime(created_at) ASC
       LIMIT 1`
    )
    .get() as ScraperJobRow | undefined;

  if (!nextQueued) return;

  const savedPayload = nextQueued.input_json ? JSON.parse(nextQueued.input_json) : {};
  const config = buildJobRunConfig({ source: nextQueued.source, payload: savedPayload });
  if (!config) {
    updateJob(nextQueued.id, {
      status: "error",
      completed_at: new Date().toISOString(),
      progress_percent: 100,
      progress_message: "Failed to rebuild job config from queue",
      error_message: "Could not rebuild runner config for queued job",
    });
    processNextQueuedJob();
    return;
  }

  const inputPath = writeInputFile(nextQueued.id, config.payload);
  const outputPath = buildRunnerOutputPath(nextQueued.id);

  runScraperInBackground({
    jobId: nextQueued.id,
    source: nextQueued.source,
    command: getNodeCommand(),
    args: [path.resolve(process.cwd(), config.runnerFile), "--input", inputPath, "--output", outputPath],
    outputPath,
    proxyUrl: getPayloadScraperProxyUrl(config.payload),
    normalize: config.normalize,
  });
}

export function startScraperQueueRecovery(): void {
  const tenants = getMainDb().prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
  for (const tenant of tenants) {
    tenantLocalStorage.run({ tenantId: tenant.id }, () => {
      const db = getDb();
      db.prepare(`UPDATE scraper_jobs SET status='error',completed_at=datetime('now'),progress_percent=100,progress_message='Interrupted by server restart',error_message='Server restarted before scraper process completed' WHERE status='running'`).run();
      processNextQueuedJob();
    });
  }
}
function startJob(options: {
  source: ScraperSource;
  payload: Record<string, unknown>;
  runnerFile: string;
  normalize: (raw: unknown) => Partial<LeadInput>[];
  successMessage: string;
  res: express.Response;
}): void {
  const { source, payload, runnerFile, normalize, successMessage, res } = options;

  const running = getInProgressJob();
  if (running) {
    // Queue the job instead of rejecting
    const job = createJob(source, payload);
    res.status(202).json({
      message: `${successMessage} (queued — will auto-start after current job finishes)`,
      jobId: job.id,
      jobLabel: job.job_label,
      queued: true,
    });
    return;
  }

  const job = enqueueJobRun({ source, payload, runnerFile, normalize });

  res.status(202).json({
    message: successMessage,
    jobId: job.id,
    jobLabel: job.job_label,
  });
}

export const scraperRouter = express.Router();

scraperRouter.get("/proxy-settings", (_req, res) => {
  try {
    const settings = getSavedScraperProxySettings();
    res.json({
      enabled: settings.enabled,
      proxiesText: settings.proxiesText,
      proxyCount: settings.proxies.length,
      maskedProxies: settings.maskedProxies,
      nextIndex: settings.nextIndex,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load proxy settings";
    res.status(500).json({ error: message });
  }
});

scraperRouter.patch("/proxy-settings", (req, res) => {
  try {
    const proxiesText = cleanText(req.body?.proxiesText ?? req.body?.proxyText ?? req.body?.proxies);
    const enabled = parseBoolean(req.body?.enabled, false);
    const settings = saveScraperProxySettings({ enabled, proxiesText });

    res.json({
      enabled: settings.enabled,
      proxiesText: settings.proxiesText,
      proxyCount: settings.proxies.length,
      maskedProxies: settings.maskedProxies,
      nextIndex: settings.nextIndex,
      message: settings.enabled
        ? `Proxy rotation saved with ${settings.proxies.length} prox${settings.proxies.length === 1 ? "y" : "ies"}`
        : "Proxy rotation saved but disabled",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save proxy settings";
    res.status(400).json({ error: message });
  }
});

scraperRouter.get("/jobs", (_req, res) => {
  res.json({ jobs: listJobs() });
});

scraperRouter.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(job);
});

scraperRouter.get("/jobs/:id/csv", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const csvPath = cleanText(job.csv_file);
  if (!csvPath) {
    res.status(404).json({ error: "CSV not available for this job yet" });
    return;
  }

  const absolute = path.resolve(csvPath);
  const outputRoot = getOutputDirectory();

  if (!isPathInside(outputRoot, absolute) || !fs.existsSync(absolute)) {
    res.status(404).json({ error: "CSV file not found" });
    return;
  }

  res.download(absolute, `${job.source}_${job.id}.csv`);
});

scraperRouter.get("/jobs/:id/export-csv", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const selectedOnly = req.query.selectedOnly === "1";
  const db = getDb();
  const sql = selectedOnly
    ? "SELECT * FROM scraper_staged_leads WHERE job_id = ? AND is_selected = 1 ORDER BY datetime(created_at) DESC"
    : "SELECT * FROM scraper_staged_leads WHERE job_id = ? ORDER BY datetime(created_at) DESC";
  const rows = db.prepare(sql).all(jobId) as StagedLeadRow[];

  if (!rows.length) {
    res.status(404).json({ error: selectedOnly ? "No selected leads found for this job" : "No leads found for this job" });
    return;
  }

  const headers = [
    "Business Name","Phone","Email","Website","Address","City","State","Zip","Niche",
    "GMB URL","GMB Claimed","GMB Rating","GMB Reviews","Source","Stage","Readiness",
    "Website Audit Score","Website Audit Verdict","GMB Audit Score","GMB Audit Verdict",
    "E-E-A-T Audit Score","E-E-A-T Audit Verdict","Created At",
  ];

  const esc = (v: string | number | null | undefined): string => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const csvRows = [headers.map(esc).join(",")];
  for (const r of rows) {
    csvRows.push(
      [
        r.business_name, r.phone, r.email, r.website, r.address, r.city, r.state, r.zip, r.niche,
        r.gmb_url, r.gmb_claimed ? "Yes" : "No", r.gmb_rating, r.gmb_review_count,
        r.source, r.added_to_dashboard ? "Added" : "Pending", r.audit_readiness,
        r.website_audit_score, r.website_audit_verdict, r.gmb_audit_score, r.gmb_audit_verdict,
        r.eeat_audit_score, r.eeat_audit_verdict, r.created_at,
      ].map(esc).join(",")
    );
  }

  const fileName = `${job.source}_${job.id}.csv`;
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.send(csvRows.join("\n"));
});

function stopJobByUser(jobId: string): { ok: boolean; statusCode?: number; error?: string } {
  const job = getJob(jobId);
  if (!job) {
    return { ok: false, statusCode: 404, error: "Job not found" };
  }

  if (job.status === "complete" || job.status === "error" || job.status === "cancelled") {
    return { ok: false, statusCode: 409, error: "Job already finished" };
  }

  const active = activeProcesses.get(jobId);
  if (active) {
    interruptedJobs.set(jobId, "cancelled");
    active.kill();
  }

  updateJob(jobId, {
    status: "cancelled",
    completed_at: new Date().toISOString(),
    progress_percent: 100,
    progress_message: "Stopped",
    error_message: "Stopped by user",
  });

  processNextQueuedJob();

  return { ok: true };
}

scraperRouter.post("/jobs/:id/stop", (req, res) => {
  const result = stopJobByUser(req.params.id);
  if (!result.ok) {
    res.status(result.statusCode || 400).json({ error: result.error || "Failed to stop job" });
    return;
  }

  res.json({ stopped: true });
});

scraperRouter.post("/jobs/:id/cancel", (req, res) => {
  const result = stopJobByUser(req.params.id);
  if (!result.ok) {
    res.status(result.statusCode || 400).json({ error: result.error || "Failed to cancel job" });
    return;
  }

  res.json({ cancelled: true });
});

scraperRouter.post("/jobs/:id/pause", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status !== "running" && job.status !== "queued") {
    res.status(409).json({ error: "Only running or queued jobs can be paused" });
    return;
  }

  const active = activeProcesses.get(jobId);
  if (active) {
    interruptedJobs.set(jobId, "paused");
    active.kill();
  }

  updateJob(jobId, {
    status: "paused",
    completed_at: null,
    progress_message: "Paused by user",
    error_message: null,
  });

  res.json({ paused: true, jobId });
});

scraperRouter.post("/jobs/:id/resume", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status !== "paused") {
    res.status(409).json({ error: "Only paused jobs can be resumed" });
    return;
  }

  const inProgress = getInProgressJob();
  if (inProgress && inProgress.id !== jobId) {
    res.status(409).json({
      error: `Another scraper job is still ${inProgress.status}. Resume after it finishes.`,
      activeJobId: inProgress.id,
      activeSource: inProgress.source,
    });
    return;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = job.input_json ? (JSON.parse(job.input_json) as Record<string, unknown>) : {};
  } catch {
    res.status(400).json({ error: "Cannot resume job: invalid stored input payload" });
    return;
  }

  const config = buildJobRunConfig({ source: job.source, payload });
  if (!config) {
    if (job.source === "chamber_directory" || job.source === "license_registry") {
      res.status(400).json({ error: "Cannot resume job: source is temporarily disabled" });
      return;
    }

    res.status(400).json({ error: "Cannot resume job: missing required job input fields" });
    return;
  }

  removeJobArtifacts(job);

  const inputPath = writeInputFile(job.id, config.payload);
  const outputPath = buildRunnerOutputPath(job.id);

  updateJob(job.id, {
    status: "queued",
    input_json: JSON.stringify(config.payload),
    output_file: outputPath,
    csv_file: null,
    imported_count: 0,
    total_found: 0,
    progress_percent: 0,
    progress_message: "Resuming",
    error_message: null,
    started_at: null,
    completed_at: null,
  });

  runScraperInBackground({
    jobId: job.id,
    source: job.source,
    command: getNodeCommand(),
    args: [
      path.resolve(process.cwd(), config.runnerFile),
      "--input",
      inputPath,
      "--output",
      outputPath,
    ],
    outputPath,
    proxyUrl: getPayloadScraperProxyUrl(config.payload),
    normalize: config.normalize,
  });

  res.json({ resumed: true, jobId: job.id, jobLabel: job.job_label });
});

scraperRouter.post("/jobs/:id/restart", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status === "queued" || job.status === "running" || job.status === "paused") {
    res.status(409).json({ error: "Cannot restart a non-finished job. Stop or pause/resume as needed." });
    return;
  }

  const inProgress = getInProgressJob();
  if (inProgress) {
    res.status(409).json({
      error: `Another scraper job is still ${inProgress.status}. Start again after it finishes.`,
      activeJobId: inProgress.id,
      activeSource: inProgress.source,
    });
    return;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = job.input_json ? (JSON.parse(job.input_json) as Record<string, unknown>) : {};
  } catch {
    res.status(400).json({ error: "Cannot restart job: invalid stored input payload" });
    return;
  }

  const config = buildJobRunConfig({ source: job.source, payload });
  if (!config) {
    if (job.source === "chamber_directory" || job.source === "license_registry") {
      res.status(400).json({ error: "Cannot restart job: source is temporarily disabled" });
      return;
    }

    res.status(400).json({ error: "Cannot restart job: missing required payload fields" });
    return;
  }

  const restarted = enqueueJobRun({
    source: job.source,
    payload: config.payload,
    runnerFile: config.runnerFile,
    normalize: config.normalize,
  });

  res.status(202).json({
    restarted: true,
    jobId: restarted.id,
    jobLabel: restarted.job_label,
    source: restarted.source,
  });
});

scraperRouter.get("/jobs/:id/leads", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const page = parsePositiveInteger(req.query.page, 1);
  const pageSize = parseCappedPositiveInteger(req.query.pageSize, 25, 200);
  const query = cleanText(req.query.query);
  const pendingOnly = parseBoolean(req.query.pendingOnly, true);
  const stageFilter = parseOptionalStageFilter(req.query.stageFilter);
  const city = cleanText(req.query.city);
  const state = cleanText(req.query.state);
  const niche = cleanText(req.query.niche);
  const selectedOnly = parseBoolean(req.query.selectedOnly, false);
  const contactFilter = parseOptionalContactFilter(req.query.contactFilter);
  const gmbClaimed = parseOptionalBoolean(req.query.gmbClaimed);
  const gmbClaimStatus = parseOptionalGmbClaimStatus(req.query.gmbClaimStatus);
  const auditCoverage = parseOptionalAuditCoverage(req.query.auditCoverage);
  const readiness = parseOptionalOutreachReadiness(req.query.readiness);
  const websiteAuditStatus = parseOptionalAuditStatus(req.query.websiteAuditStatus);
  const gmbAuditStatus = parseOptionalAuditStatus(req.query.gmbAuditStatus);
  const websiteVerdict = cleanText(req.query.websiteVerdict);
  const gmbVerdict = cleanText(req.query.gmbVerdict);

  const data = listJobStagedLeads({
    jobId,
    page,
    pageSize,
    query: query || undefined,
    pendingOnly,
    stageFilter,
    city: city || undefined,
    state: state || undefined,
    niche: niche || undefined,
    selectedOnly,
    contactFilter,
    gmbClaimed,
    gmbClaimStatus,
    auditCoverage,
    readiness,
    websiteAuditStatus,
    gmbAuditStatus,
    websiteVerdict: websiteVerdict || undefined,
    gmbVerdict: gmbVerdict || undefined,
  });

  res.json({
    jobId,
    items: buildStagedLeadApiRows(data.items),
    total: data.total,
    pending: data.pending,
    added: data.added,
    selectedPending: data.selectedPending,
    page: data.page,
    pageSize: data.pageSize,
  });
});

scraperRouter.patch("/jobs/:id/leads/:leadId/select", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const selected = parseBoolean(req.body?.selected, true);
  const updated = updateStagedLeadSelection(jobId, req.params.leadId, selected);
  if (!updated) {
    res.status(404).json({ error: "Staged lead not found for this job" });
    return;
  }

  res.json({ updated: true, selected });
});

scraperRouter.post("/jobs/:id/leads/select-all", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const selected = parseBoolean(req.body?.selected, true);
  const changed = updateAllStagedLeadSelection(jobId, selected);
  res.json({ changed, selected });
});

scraperRouter.post("/jobs/:id/leads/:leadId/audits/:auditType", async (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const auditType = cleanText(req.params.auditType).toLowerCase();
  if (
    auditType !== "website" &&
    auditType !== "gmb" &&
    auditType !== "eeat" &&
    auditType !== "basic" &&
    auditType !== "all"
  ) {
    res.status(400).json({ error: "auditType must be website, gmb, eeat, basic, or all" });
    return;
  }

  try {
    const result = await runStagedLeadAudit(jobId, req.params.leadId, auditType as StagedLeadAuditMode);
    const lead = buildStagedLeadApiRows([result.row])[0];

    res.json({
      jobId,
      leadId: req.params.leadId,
      auditType,
      lead,
      websiteAudit: result.websiteAudit,
      gmbAudit: result.gmbAudit,
      eeatAudit: result.eeatAudit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run staged audit";
    res.status(message === "Staged lead not found for this job" ? 404 : 400).json({ error: message });
  }
});

scraperRouter.post("/jobs/:id/leads/audits/run", async (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const auditType = cleanText(req.body?.auditType || "basic").toLowerCase();
  if (
    auditType !== "website" &&
    auditType !== "gmb" &&
    auditType !== "eeat" &&
    auditType !== "basic" &&
    auditType !== "all"
  ) {
    res.status(400).json({ error: "auditType must be website, gmb, eeat, basic, or all" });
    return;
  }

  const selectedOnly = parseBoolean(req.body?.selectedOnly, true);
  const limit = Math.max(1, Math.min(50, parseInteger(req.body?.limit, 15)));
  const db = getDb();
  const where = ["job_id = ?"];
  const params: Array<string | number> = [jobId];

  if (selectedOnly) {
    where.push("is_selected = 1");
  }

  const rows = db
    .prepare(
      `SELECT * FROM scraper_staged_leads
       WHERE ${where.join(" AND ")}
       ORDER BY added_to_dashboard ASC, is_selected DESC, datetime(created_at) DESC
       LIMIT ?`
    )
    .all(...params, limit) as StagedLeadRow[];

  if (rows.length === 0) {
    res.status(400).json({ error: "No staged leads matched the audit selection" });
    return;
  }

  const updatedRows: StagedLeadRow[] = [];
  for (const row of rows) {
    const result = await runStagedLeadAudit(jobId, row.id, auditType as StagedLeadAuditMode);
    updatedRows.push(result.row);
  }

  const refreshed = buildStagedLeadApiRows(updatedRows);
  res.json({
    jobId,
    auditType,
    processed: refreshed.length,
    selectedOnly,
    items: refreshed,
  });
});

scraperRouter.post("/jobs/:id/leads/add-selected", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const result = addSelectedStagedLeadsToDashboard(jobId);
  const counts = listJobStagedLeads({ jobId, page: 1, pageSize: 1, pendingOnly: false });

  res.json({
    ...result,
    pending: counts.pending,
    added: counts.added,
    selectedPending: counts.selectedPending,
  });
});

scraperRouter.get("/jobs/:id/campaign-context", (req, res) => {
  const jobId = req.params.id;

  try {
    const context = getJobCampaignContext(jobId);
    res.json({ jobId, ...context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build campaign context";
    res.status(message === "Job not found" ? 404 : 400).json({ error: message });
  }
});

scraperRouter.post("/jobs/:id/leads/create-campaign-draft", async (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const db = getDb();
  const context = getJobCampaignContext(jobId);
  const selectedRows = db
    .prepare(
      `SELECT * FROM scraper_staged_leads
       WHERE job_id = ? AND added_to_dashboard = 0 AND is_selected = 1`
    )
    .all(jobId) as StagedLeadRow[];

  if (selectedRows.length === 0) {
    res.status(400).json({ error: "Select at least one pending lead first" });
    return;
  }

  const imported = addSelectedStagedLeadsToDashboard(jobId);

  const matched = resolveImportedLeadMatchesForStagedRows(selectedRows);
  const matchedLeadIds = matched.matchedLeadIds;

  if (matchedLeadIds.length === 0) {
    res.status(400).json({
      error: "Imported leads were not resolved for campaign drafting. Try importing again.",
    });
    return;
  }

  const requestedName = cleanText(req.body?.name);
  const requestedSubject = cleanText(req.body?.subject);
  const requestedBody = cleanText(req.body?.body);
  const requestedBodyHtml = cleanText(req.body?.bodyHtml);
  const targetCity = cleanText(req.body?.targetCity) || context.city;
  const targetNiche = cleanText(req.body?.targetNiche) || context.niche;
  const campaignSubject = requestedSubject || context.recommendedTemplate.subject;
  const campaignBody = requestedBody || context.recommendedTemplate.body;
  const aiPersonalize = parseBoolean(req.body?.aiPersonalize, true);

  try {
    const personalization = await buildCampaignPersonalizationMaps({
      leadIds: matchedLeadIds,
      rowByLeadId: matched.rowByLeadId,
      baseSubject: campaignSubject,
      baseBody: campaignBody,
      targetCity,
      targetNiche,
      preferredProviderKey: cleanText(req.body?.aiProviderKey) || undefined,
      enableAi: aiPersonalize,
    });

    const result = createCampaignDraftFromLeadIds({
      name:
        requestedName ||
        `${context.sourceLabel} outreach ${new Date().toISOString().slice(0, 10)} (${selectedRows.length} leads)`,
      subject: campaignSubject,
      body: campaignBody,
      bodyHtml: requestedBodyHtml || context.recommendedTemplate.body_html,
      leadIds: matchedLeadIds,
      smtpAccountId: cleanText(req.body?.smtpAccountId) || undefined,
      targetNiche,
      targetCity,
      templateId: cleanText(req.body?.templateId) || context.recommendedTemplate.id,
      sendIntervalMs: parseInteger(req.body?.sendIntervalMs, context.recommendedTemplate.send_interval_ms),
      followUpEnabled: parseBoolean(req.body?.followUpEnabled, context.recommendedTemplate.follow_up_enabled),
      followUpDelayHours: parseInteger(
        req.body?.followUpDelayHours,
        context.recommendedTemplate.follow_up_delay_hours
      ),
      followUpSubject:
        cleanText(req.body?.followUpSubject) || context.recommendedTemplate.follow_up_subject,
      followUpBody:
        cleanText(req.body?.followUpBody) || context.recommendedTemplate.follow_up_body,
      followUpBodyHtml:
        cleanText(req.body?.followUpBodyHtml) || context.recommendedTemplate.follow_up_body_html,
      maxRetries: parseInteger(req.body?.maxRetries, context.recommendedTemplate.max_retries),
      scheduledAt: cleanText(req.body?.scheduledAt) || undefined,
      personalizedByLeadId: personalization.personalizedByLeadId,
      reportContextByLeadId: personalization.reportContextByLeadId,
    });

    const personalizationCounts = summarizePersonalizationByLeadIds(
      personalization.modeByLeadId,
      result.matchedLeadIds
    );

    res.status(201).json({
      campaignId: result.campaignId,
      queuedCount: result.queuedCount,
      matchedLeadIds: result.matchedLeadIds,
      imported,
      personalization: {
        aiEnabled: aiPersonalize,
        aiGenerated: personalizationCounts.aiGenerated,
        fallback: personalizationCounts.fallback,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create campaign draft";
    res.status(400).json({ error: message });
  }
});

scraperRouter.post("/jobs/:id/leads/add-to-campaign", async (req, res) => {
  const jobId = req.params.id;
  const campaignId = cleanText(req.body?.campaignId);
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (!campaignId) {
    res.status(400).json({ error: "campaignId is required" });
    return;
  }

  const db = getDb();
  const selectedRows = db
    .prepare(
      `SELECT * FROM scraper_staged_leads
       WHERE job_id = ? AND added_to_dashboard = 0 AND is_selected = 1`
    )
    .all(jobId) as StagedLeadRow[];

  if (selectedRows.length === 0) {
    res.status(400).json({ error: "Select at least one pending lead first" });
    return;
  }

  const imported = addSelectedStagedLeadsToDashboard(jobId);
  const matched = resolveImportedLeadMatchesForStagedRows(selectedRows);
  const matchedLeadIds = matched.matchedLeadIds;

  if (matchedLeadIds.length === 0) {
    res.status(400).json({
      error: "Imported leads were not resolved for campaign append. Try importing again.",
    });
    return;
  }

  const campaignRow = db
    .prepare(
      `SELECT sequence_json, target_city, target_niche
       FROM campaigns
       WHERE id = ?`
    )
    .get(campaignId) as
    | {
        sequence_json?: string | null;
        target_city?: string | null;
        target_niche?: string | null;
      }
    | undefined;

  if (!campaignRow) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const sequence = parseCampaignSequenceForPersonalization(campaignRow?.sequence_json || null);
  const baseSubject = sequence.subject || "Quick idea for {{business_name}}";
  const baseBody =
    sequence.body ||
    "Hi {{business_name}},\n\nI reviewed your local visibility and found a few practical improvements that can help in {{city}}.";
  const aiPersonalize = parseBoolean(req.body?.aiPersonalize, true);

  try {
    const personalization = await buildCampaignPersonalizationMaps({
      leadIds: matchedLeadIds,
      rowByLeadId: matched.rowByLeadId,
      baseSubject,
      baseBody,
      targetCity: cleanText(campaignRow?.target_city),
      targetNiche: cleanText(campaignRow?.target_niche),
      preferredProviderKey: cleanText(req.body?.aiProviderKey) || undefined,
      enableAi: aiPersonalize,
    });

    const result = appendLeadIdsToCampaign(campaignId, matchedLeadIds, {
      personalizedByLeadId: personalization.personalizedByLeadId,
      reportContextByLeadId: personalization.reportContextByLeadId,
    });

    const appendedLeadIds = deriveAppendedLeadIds(result.matchedLeadIds, result.duplicateLeadIds);
    const personalizationCounts = summarizePersonalizationByLeadIds(
      personalization.modeByLeadId,
      appendedLeadIds
    );

    res.json({
      campaignId: result.campaignId,
      appendedCount: result.queuedCount,
      matchedLeadIds: result.matchedLeadIds,
      duplicateLeadIds: result.duplicateLeadIds,
      imported,
      personalization: {
        aiEnabled: aiPersonalize,
        aiGenerated: personalizationCounts.aiGenerated,
        fallback: personalizationCounts.fallback,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add selected leads to campaign";
    res.status(400).json({ error: message });
  }
});

scraperRouter.post("/jobs/clean", (req, res) => {
  const scope = cleanText(req.body?.scope || "finished").toLowerCase();

  if (scope !== "finished") {
    res.status(400).json({ error: "Only scope='finished' is currently supported" });
    return;
  }

  const deleted = clearFinishedJobs();
  res.json({ deleted, scope: "finished" });
});

scraperRouter.delete("/jobs/:id", (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job.status === "queued" || job.status === "running") {
    res.status(409).json({ error: "Cannot delete a running job. Cancel it first." });
    return;
  }

  removeJobArtifacts(job);

  const db = getDb();
  db.prepare("DELETE FROM scraper_staged_leads WHERE job_id = ?").run(jobId);
  db.prepare("DELETE FROM scraper_jobs WHERE id = ?").run(jobId);

  res.json({ deleted: true, jobId });
});

scraperRouter.post("/yellow-pages", checkScraperLimit, (req, res) => {
  const businessType = cleanText(req.body?.businessType);
  const location = cleanText(req.body?.location);
  const maxItems = parseCappedPositiveInteger(req.body?.maxItems ?? req.body?.maxPages, 20, 5000);

  if (!businessType || !location) {
    res.status(400).json({ error: "businessType and location are required" });
    return;
  }

  const payload = prepareScraperPayload({ businessType, location, maxItems }, req, res);
  if (!payload) return;

  startJob({
    source: "yellowpages",
    payload,
    runnerFile: "server/modules/scraper-runners/yellow-pages-runner.cjs",
    normalize: (raw) => normalizeYellowPagesOutput(raw, payload),
    successMessage: "Yellow Pages Lead Engine job started",
    res,
  });
});

function startGoogleMapsImport(req: express.Request, res: express.Response): void {
  const keyword = cleanText(req.body?.keyword);
  const location = cleanText(req.body?.location);
  const listingsPerQuery = parseCappedPositiveInteger(req.body?.listingsPerQuery, 40, 5000);

  if (!keyword || !location) {
    res.status(400).json({ error: "keyword and location are required" });
    return;
  }

  const payload = prepareScraperPayload({ keyword, location, listingsPerQuery }, req, res);
  if (!payload) return;

  startJob({
    source: "gmb_scraper",
    payload,
    runnerFile: "server/modules/scraper-runners/gmb-photo-runner.cjs",
    normalize: (raw) => normalizeGmbOutput(raw, payload),
    successMessage: "Google Maps Lead Engine job started",
    res,
  });
}

scraperRouter.post("/google", checkScraperLimit, startGoogleMapsImport);
scraperRouter.post("/google-maps", checkScraperLimit, startGoogleMapsImport);
scraperRouter.post("/gmb-listings", checkScraperLimit, startGoogleMapsImport);

scraperRouter.post("/state-directory", checkScraperLimit, (req, res) => {
  const state = cleanText(req.body?.state).toLowerCase();
  const businessType = cleanText(req.body?.businessType);
  const limit = parseCappedPositiveInteger(req.body?.limit, 250, 5000);

  if (!state || !businessType) {
    res.status(400).json({ error: "state and businessType are required" });
    return;
  }

  const payload = prepareScraperPayload({ state, businessType, limit }, req, res);
  if (!payload) return;

  startJob({
    source: "state_directory",
    payload,
    runnerFile: "server/modules/scraper-runners/state-directory-runner.cjs",
    normalize: (raw) => normalizeStateDirectoryOutput(raw, payload),
    successMessage: "State Directory Lead Engine job started",
    res,
  });
});

scraperRouter.post("/yelp", checkScraperLimit, (req, res) => {
  const businessType = cleanText(req.body?.businessType);
  const location = cleanText(req.body?.location);
  const maxItems = parseCappedPositiveInteger(req.body?.maxItems, 20, 5000);

  if (!businessType || !location) {
    res.status(400).json({ error: "businessType and location are required" });
    return;
  }

  const payload = prepareScraperPayload({ businessType, location, maxItems }, req, res);
  if (!payload) return;

  startJob({
    source: "yelp_scraper",
    payload,
    runnerFile: "server/modules/scraper-runners/yelp-runner.cjs",
    normalize: (raw) => normalizeYelpOutput(raw, payload),
    successMessage: "Yelp Lead Engine job started",
    res,
  });
});

scraperRouter.post("/bbb", checkScraperLimit, (req, res) => {
  const businessType = cleanText(req.body?.businessType);
  const location = cleanText(req.body?.location);
  const maxItems = parseCappedPositiveInteger(req.body?.maxItems, 20, 5000);

  if (!businessType || !location) {
    res.status(400).json({ error: "businessType and location are required" });
    return;
  }

  const payload = prepareScraperPayload({ businessType, location, maxItems }, req, res);
  if (!payload) return;

  startJob({
    source: "bbb_scraper",
    payload,
    runnerFile: "server/modules/scraper-runners/bbb-runner.cjs",
    normalize: (raw) => normalizeBbbOutput(raw, payload),
    successMessage: "BBB Lead Engine job started",
    res,
  });
});

scraperRouter.post("/website-enrichment", checkScraperLimit, (req, res) => {
  const sourceJobId = cleanText(req.body?.sourceJobId);
  const selectedOnly = parseBoolean(req.body?.selectedOnly, true);
  const pendingOnly = parseBoolean(req.body?.pendingOnly, true);
  const limit = parseCappedPositiveInteger(req.body?.limit, 50, 150);

  if (!sourceJobId) {
    res.status(400).json({ error: "sourceJobId is required" });
    return;
  }

  const sourceJob = getJob(sourceJobId);
  if (!sourceJob) {
    res.status(404).json({ error: "Source job not found" });
    return;
  }

  const rows = buildWebsiteEnrichmentSeedRows({
    sourceJobId,
    selectedOnly,
    pendingOnly,
    limit,
  });

  if (rows.length === 0) {
    res.status(400).json({ error: "No staged leads matched the enrichment filters" });
    return;
  }

  const payload = prepareScraperPayload({
    sourceJobId,
    selectedOnly,
    pendingOnly,
    limit,
    rows,
  }, req, res);
  if (!payload) return;

  startJob({
    source: "website_enrichment",
    payload,
    runnerFile: "server/modules/scraper-runners/website-enrichment-runner.cjs",
    normalize: (raw) => normalizeWebsiteEnrichmentOutput(raw),
    successMessage: `Website enrichment batch started from ${sourceJob.source}`,
    res,
  });
});

scraperRouter.post("/chamber-directory", (_req, res) => {
  res.status(410).json({
    error: "Chamber Directory is temporarily disabled",
  });
});

scraperRouter.post("/license-registry", (_req, res) => {
  res.status(410).json({
    error: "License Registry is temporarily disabled",
  });
});

scraperRouter.post("/ads-google", checkScraperLimit, (req, res) => {
  const businessType = cleanText(req.body?.businessType);
  const location = cleanText(req.body?.location);
  const maxItems = parseCappedPositiveInteger(req.body?.maxItems, 20, 5000);

  if (!businessType || !location) {
    res.status(400).json({ error: "businessType and location are required" });
    return;
  }

  const payload = prepareScraperPayload({ businessType, location, maxItems }, req, res);
  if (!payload) return;

  startJob({
    source: "ads_google",
    payload,
    runnerFile: "server/modules/scraper-runners/ads-google-runner.cjs",
    normalize: (raw) =>
      normalizeDiscoveryOutput(raw, payload, "ads_google", "Active advertiser candidate from Google Ads intelligence"),
    successMessage: "Google Ads intelligence job started",
    res,
  });
});

scraperRouter.post("/ads-meta", checkScraperLimit, (req, res) => {
  const businessType = cleanText(req.body?.businessType);
  const location = cleanText(req.body?.location);
  const maxItems = parseCappedPositiveInteger(req.body?.maxItems, 20, 5000);

  if (!businessType || !location) {
    res.status(400).json({ error: "businessType and location are required" });
    return;
  }

  const payload = prepareScraperPayload({ businessType, location, maxItems }, req, res);
  if (!payload) return;

  startJob({
    source: "ads_meta",
    payload,
    runnerFile: "server/modules/scraper-runners/ads-meta-runner.cjs",
    normalize: (raw) =>
      normalizeDiscoveryOutput(raw, payload, "ads_meta", "Active advertiser candidate from Meta ads intelligence"),
    successMessage: "Meta ads intelligence job started",
    res,
  });
});

scraperRouter.post("/ads-bing", checkScraperLimit, (req, res) => {
  const businessType = cleanText(req.body?.businessType);
  const location = cleanText(req.body?.location);
  const maxItems = parseCappedPositiveInteger(req.body?.maxItems, 20, 5000);

  if (!businessType || !location) {
    res.status(400).json({ error: "businessType and location are required" });
    return;
  }

  const payload = prepareScraperPayload({ businessType, location, maxItems }, req, res);
  if (!payload) return;

  startJob({
    source: "ads_bing",
    payload,
    runnerFile: "server/modules/scraper-runners/ads-bing-runner.cjs",
    normalize: (raw) =>
      normalizeDiscoveryOutput(raw, payload, "ads_bing", "Paid-intent candidate from Microsoft/Bing ads intelligence"),
    successMessage: "Microsoft/Bing ads intelligence job started",
    res,
  });
});
