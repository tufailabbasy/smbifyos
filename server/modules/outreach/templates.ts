import { getDb } from "../../db/database.js";
import { normalizeHtmlTemplate, plainTextToEmailHtml } from "./html.js";

export type OutreachSourceKey =
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
  | "ads_bing"
  | "general";

export type CampaignTemplateRow = {
  id: string;
  name: string;
  source_key: string | null;
  subject: string;
  body: string;
  body_html: string | null;
  send_interval_ms: number;
  follow_up_enabled: number;
  follow_up_delay_hours: number;
  follow_up_subject: string | null;
  follow_up_body: string | null;
  follow_up_body_html: string | null;
  max_retries: number;
  is_default: number;
  created_at: string;
  updated_at: string;
};

export type CampaignTemplate = {
  id: string;
  name: string;
  source_key: string;
  subject: string;
  body: string;
  body_html: string;
  send_interval_ms: number;
  follow_up_enabled: boolean;
  follow_up_delay_hours: number;
  follow_up_subject: string;
  follow_up_body: string;
  follow_up_body_html: string;
  max_retries: number;
  is_default: boolean;
  origin: "database" | "built-in";
};

type TemplateContext = {
  source?: string;
  city?: string;
  niche?: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(parsed);
}

export function normalizeSourceKey(value: unknown): OutreachSourceKey {
  const normalized = cleanText(value).toLowerCase();
  if (
    normalized === "yellowpages" ||
    normalized === "gmb_scraper" ||
    normalized === "state_directory" ||
    normalized === "yelp_scraper" ||
    normalized === "bbb_scraper" ||
    normalized === "website_enrichment" ||
    normalized === "chamber_directory" ||
    normalized === "license_registry" ||
    normalized === "ads_google" ||
    normalized === "ads_meta" ||
    normalized === "ads_bing"
  ) {
    return normalized;
  }

  return "general";
}

export function getSourceLabel(source: unknown): string {
  const normalized = normalizeSourceKey(source);

  if (normalized === "yellowpages") return "Yellow Pages";
  if (normalized === "gmb_scraper") return "Google Maps";
  if (normalized === "state_directory") return "State Directory";
  if (normalized === "yelp_scraper") return "Yelp";
  if (normalized === "bbb_scraper") return "BBB";
  if (normalized === "website_enrichment") return "Website Enrichment";
  if (normalized === "chamber_directory") return "Chamber Directory";
  if (normalized === "license_registry") return "License Registry";
  if (normalized === "ads_google") return "Google Ads Intel";
  if (normalized === "ads_meta") return "Meta Ads Intel";
  if (normalized === "ads_bing") return "Microsoft/Bing Ads Intel";
  return "General";
}

function applyContext(template: CampaignTemplate, context?: TemplateContext): CampaignTemplate {
  const city = cleanText(context?.city);
  const niche = cleanText(context?.niche);
  const sourceLabel = getSourceLabel(context?.source);

  const baseName = cleanText(template.name) || `${sourceLabel} Template`;
  const decoratedName = [baseName, niche, city].filter(Boolean).join(" | ");

  return {
    ...template,
    name: decoratedName,
  };
}

function rowToTemplate(row: CampaignTemplateRow): CampaignTemplate {
  return {
    id: row.id,
    name: row.name,
    source_key: cleanText(row.source_key) || "general",
    subject: row.subject,
    body: row.body,
    body_html: normalizeHtmlTemplate(row.body_html, row.body),
    send_interval_ms: toInteger(row.send_interval_ms, 250),
    follow_up_enabled: row.follow_up_enabled === 1,
    follow_up_delay_hours: toInteger(row.follow_up_delay_hours, 72),
    follow_up_subject: cleanText(row.follow_up_subject),
    follow_up_body: cleanText(row.follow_up_body),
    follow_up_body_html: normalizeHtmlTemplate(row.follow_up_body_html, row.follow_up_body),
    max_retries: Math.max(0, toInteger(row.max_retries, 0)),
    is_default: row.is_default === 1,
    origin: "database",
  };
}

export function listCampaignTemplates(source?: string): CampaignTemplate[] {
  const normalizedSource = normalizeSourceKey(source);
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT *
       FROM campaign_templates
       WHERE source_key = ? OR source_key IS NULL
       ORDER BY is_default DESC, datetime(created_at) ASC`
    )
    .all(normalizedSource) as CampaignTemplateRow[];

  return rows.map(rowToTemplate);
}

export function getRecommendedCampaignTemplate(context?: TemplateContext): CampaignTemplate {
  const normalizedSource = normalizeSourceKey(context?.source);
  const candidates = listCampaignTemplates(normalizedSource);
  const exactDefault = candidates.find(
    (item) => item.is_default && normalizeSourceKey(item.source_key) === normalizedSource
  );
  const genericDefault = candidates.find(
    (item) => item.is_default && normalizeSourceKey(item.source_key) === "general"
  );
  const chosen = exactDefault || genericDefault || candidates[0];

  if (chosen) {
    return applyContext(chosen, context);
  }

  const sourceLabel = getSourceLabel(normalizedSource);
  return applyContext(
    {
      id: `builtin:${normalizedSource}`,
      name: `${sourceLabel} Prospecting`,
      source_key: normalizedSource,
      subject: `Quick idea for {{business_name}}`,
      body: [
        "Hi {{business_name}},",
        "",
        "I found a few local growth opportunities around {{city}} that may help improve qualified lead flow.",
        "",
        "If useful, I can send a short action list tailored to your business.",
        "",
        "Best regards,",
        "SMBify OS Team",
      ].join("\n"),
      body_html: plainTextToEmailHtml([
        "Hi {{business_name}},",
        "",
        "I found a few local growth opportunities around {{city}} that may help improve qualified lead flow.",
        "",
        "If useful, I can send a short action list tailored to your business.",
        "",
        "Best regards,",
        "SMBify OS Team",
      ].join("\n")),
      send_interval_ms: 250,
      follow_up_enabled: true,
      follow_up_delay_hours: 72,
      follow_up_subject: "Following up on {{business_name}}",
      follow_up_body: [
        "Hi {{business_name}},",
        "",
        "Following up in case my previous note got buried.",
        "",
        "If you want the short action list, I can send it over.",
        "",
        "Best regards,",
        "SMBify OS Team",
      ].join("\n"),
      follow_up_body_html: plainTextToEmailHtml([
        "Hi {{business_name}},",
        "",
        "Following up in case my previous note got buried.",
        "",
        "If you want the short action list, I can send it over.",
        "",
        "Best regards,",
        "SMBify OS Team",
      ].join("\n")),
      max_retries: 1,
      is_default: true,
      origin: "built-in",
    },
    context
  );
}

export function createCampaignTemplate(input: {
  id: string;
  name: string;
  sourceKey?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  sendIntervalMs?: number;
  followUpEnabled?: boolean;
  followUpDelayHours?: number;
  followUpSubject?: string;
  followUpBody?: string;
  followUpBodyHtml?: string;
  maxRetries?: number;
  isDefault?: boolean;
}): CampaignTemplate {
  const db = getDb();
  const now = new Date().toISOString();
  const sourceKey = normalizeSourceKey(input.sourceKey);
  const isDefault = Boolean(input.isDefault);

  if (isDefault) {
    db.prepare(
      `UPDATE campaign_templates
       SET is_default = 0, updated_at = ?
       WHERE COALESCE(source_key, 'general') = ?`
    ).run(now, sourceKey);
  }

  db.prepare(
    `INSERT INTO campaign_templates (
      id,
      name,
      source_key,
      subject,
      body,
      body_html,
      send_interval_ms,
      follow_up_enabled,
      follow_up_delay_hours,
      follow_up_subject,
      follow_up_body,
      follow_up_body_html,
      max_retries,
      is_default,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    cleanText(input.name) || `${getSourceLabel(sourceKey)} Template`,
    sourceKey === "general" ? null : sourceKey,
    cleanText(input.subject),
    cleanText(input.body),
    normalizeHtmlTemplate(input.bodyHtml, input.body),
    Math.max(0, toInteger(input.sendIntervalMs, 250)),
    input.followUpEnabled ? 1 : 0,
    Math.max(1, toInteger(input.followUpDelayHours, 72)),
    cleanText(input.followUpSubject) || null,
    cleanText(input.followUpBody) || null,
    normalizeHtmlTemplate(input.followUpBodyHtml, input.followUpBody),
    Math.max(0, toInteger(input.maxRetries, 0)),
    isDefault ? 1 : 0,
    now,
    now
  );

  const created = db
    .prepare("SELECT * FROM campaign_templates WHERE id = ?")
    .get(input.id) as CampaignTemplateRow | undefined;

  if (!created) {
    throw new Error("Failed to create campaign template");
  }

  return rowToTemplate(created);
}
