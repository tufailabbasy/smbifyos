import express from "express";
import { chromium } from "playwright";
import nodemailer from "nodemailer";
import { getDb } from "../db/database.js";
import { checkCampaignLimit } from "../utils/limitsMiddleware.js";
import {
  appendLeadIdsToCampaign,
  createCampaignDraftFromLeadIds,
  createCampaignShell,
} from "../modules/outreach/repository.js";
import {
  createCampaignTemplate,
  getRecommendedCampaignTemplate,
  getSourceLabel,
  listCampaignTemplates,
  normalizeSourceKey,
  type CampaignTemplate,
} from "../modules/outreach/templates.js";
import { normalizeHtmlTemplate, plainTextToEmailHtml } from "../modules/outreach/html.js";
import { addLeadActivity } from "../modules/leads/repository.js";
import { encryptCredential, decryptCredential } from "../utils/encryption.js";
import { enqueueLegacyCampaignDispatches, enqueueManualDispatch, processTenantDispatchQueue } from "../modules/email/dispatchQueue.js";
import { syncLegacyCampaigns } from "../modules/email/campaignBridge.js";

type SmtpAccountRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: number;
  username: string;
  password: string;
  from_name: string | null;
  from_email: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  target_niche: string | null;
  target_city: string | null;
  sequence_json: string | null;
  template_id: string | null;
  status: string;
  scheduled_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignRecipientRow = {
  email_id: string;
  lead_id: string | null;
  step_number: number;
  email: string | null;
  business_name: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  subject: string | null;
  body: string | null;
  body_html: string | null;
  report_context_json: string | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  error_message: string | null;
};

type BindValue = string | number | bigint | Uint8Array | null;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown): string {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type CampaignReportContext = {
  sourceJobId?: string;
  stagedLeadId?: string;
  businessName?: string;
  city?: string;
  state?: string;
  niche?: string;
  website?: string;
  gmbUrl?: string;
  readiness?: string;
  readinessReason?: string;
  generatedAt?: string;
  audits?: {
    website?: {
      id?: string | null;
      status?: string | null;
      score?: number | null;
      verdict?: string | null;
      summary?: string | null;
    } | null;
    gmb?: {
      id?: string | null;
      status?: string | null;
      score?: number | null;
      verdict?: string | null;
      summary?: string | null;
    } | null;
    eeat?: {
      id?: string | null;
      status?: string | null;
      score?: number | null;
      verdict?: string | null;
      summary?: string | null;
    } | null;
  };
};

function parseCampaignReportContext(value: string | null): CampaignReportContext | null {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as CampaignReportContext;
  } catch {
    return null;
  }
}

function normalizeFilenamePart(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "lead";
}

function formatDateLabel(value: unknown): string {
  const text = cleanText(value);
  if (!text) {
    return "Recently generated";
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return parsed.toLocaleString();
}

function buildAuditReportHtml(options: {
  reportKind: "website" | "gmb";
  recipient: CampaignRecipientRow;
  context: CampaignReportContext | null;
}): string {
  const { reportKind, recipient, context } = options;
  const audit = reportKind === "website" ? context?.audits?.website : context?.audits?.gmb;
  const reportTitle = reportKind === "website" ? "Website SEO Audit Report" : "Google Business Audit Report";
  const accent = reportKind === "website" ? "#5e6ad2" : "#0f766e";
  const leadName = cleanText(context?.businessName || recipient.business_name || "Lead") || "Lead";
  const cityState = [context?.city || recipient.city, context?.state || recipient.state].map(cleanText).filter(Boolean).join(", ");
  const website = cleanText(context?.website || recipient.website || "");
  const gmbUrl = cleanText(context?.gmbUrl || "");
  const readiness = cleanText(context?.readiness || "pending") || "pending";
  const readinessReason = cleanText(context?.readinessReason || "");

  const auditStatus = cleanText(audit?.status || "not_run") || "not_run";
  const auditScore = typeof audit?.score === "number" ? String(audit.score) : "--";
  const auditVerdict = cleanText(audit?.verdict || "--") || "--";
  const auditSummary = cleanText(audit?.summary || "No summary available.") || "No summary available.";
  const generatedAt = formatDateLabel(context?.generatedAt || new Date().toISOString());

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 28px; }
          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
            background: #f8fafc;
          }
          .page {
            background: #ffffff;
            border: 1px solid #dbe4ee;
            border-radius: 20px;
            overflow: hidden;
          }
          .hero {
            padding: 24px 28px 22px;
            color: #ffffff;
            background: linear-gradient(135deg, ${accent} 0%, #0f172a 100%);
          }
          .eyebrow {
            font-size: 11px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-weight: 700;
            opacity: 0.86;
          }
          .title {
            margin-top: 10px;
            font-size: 26px;
            line-height: 1.2;
            font-weight: 700;
          }
          .subtitle {
            margin-top: 8px;
            font-size: 13px;
            line-height: 1.6;
            opacity: 0.92;
          }
          .content {
            padding: 24px 28px 28px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 18px;
          }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 14px 16px;
            background: #f8fafc;
          }
          .label {
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 700;
            color: #64748b;
          }
          .value {
            margin-top: 6px;
            font-size: 14px;
            line-height: 1.5;
            color: #0f172a;
            word-break: break-word;
          }
          .section {
            margin-top: 18px;
          }
          .section h2 {
            margin: 0 0 10px;
            font-size: 15px;
            line-height: 1.3;
            color: ${accent};
          }
          .summary {
            font-size: 14px;
            line-height: 1.7;
            color: #334155;
          }
          .stack {
            display: grid;
            gap: 10px;
          }
          .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.06);
            font-size: 12px;
            font-weight: 700;
            color: #0f172a;
          }
          .footer {
            margin-top: 20px;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="hero">
            <div class="eyebrow">SMBify OS</div>
            <div class="title">${escapeHtml(reportTitle)}</div>
            <div class="subtitle">Prepared for ${escapeHtml(leadName)}${cityState ? ` · ${escapeHtml(cityState)}` : ""}</div>
          </div>
          <div class="content">
            <div class="grid">
              <div class="card">
                <div class="label">Business</div>
                <div class="value">${escapeHtml(leadName)}</div>
              </div>
              <div class="card">
                <div class="label">Generated</div>
                <div class="value">${escapeHtml(generatedAt)}</div>
              </div>
              <div class="card">
                <div class="label">Website</div>
                <div class="value">${escapeHtml(website || "--")}</div>
              </div>
              <div class="card">
                <div class="label">GMB</div>
                <div class="value">${escapeHtml(gmbUrl || "--")}</div>
              </div>
              <div class="card">
                <div class="label">Readiness</div>
                <div class="value"><span class="badge">${escapeHtml(readiness)}</span>${readinessReason ? `<div style="margin-top:8px;color:#475569;">${escapeHtml(readinessReason)}</div>` : ""}</div>
              </div>
              <div class="card">
                <div class="label">Audit Status</div>
                <div class="value">${escapeHtml(auditStatus)}</div>
              </div>
            </div>

            <div class="section">
              <h2>Audit Snapshot</h2>
              <div class="stack">
                <div class="card">
                  <div class="label">Score</div>
                  <div class="value">${escapeHtml(auditScore)}</div>
                </div>
                <div class="card">
                  <div class="label">Verdict</div>
                  <div class="value">${escapeHtml(auditVerdict)}</div>
                </div>
                <div class="card">
                  <div class="label">Summary</div>
                  <div class="value summary">${escapeHtml(auditSummary)}</div>
                </div>
              </div>
            </div>

            <div class="footer">
              This PDF was generated automatically for a single recipient so each outreach email can carry a unique report.
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function createAuditPdfRenderer(): Promise<{
  render(html: string): Promise<Buffer>;
  close(): Promise<void>;
}> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });

  return {
    async render(html: string): Promise<Buffer> {
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      return Buffer.from(pdf);
    },
    async close(): Promise<void> {
      await page.close();
      await browser.close();
    },
  };
}

async function buildAuditPdfAttachment(options: {
  reportKind: "website" | "gmb";
  recipient: CampaignRecipientRow;
  renderer: { render(html: string): Promise<Buffer> };
}): Promise<{ filename: string; content: Buffer; contentType: string }> {
  const context = parseCampaignReportContext(options.recipient.report_context_json);
  const html = buildAuditReportHtml({
    reportKind: options.reportKind,
    recipient: options.recipient,
    context,
  });
  const content = await options.renderer.render(html);
  const leadLabel = normalizeFilenamePart(context?.businessName || options.recipient.business_name || options.recipient.email || "lead");
  const suffix = options.reportKind === "website" ? "website-audit" : "gmb-audit";

  return {
    filename: `${leadLabel}-${suffix}-report.pdf`,
    content,
    contentType: "application/pdf",
  };
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.round(parsed);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseLeadIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const id = cleanText(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function parseSequenceJson(sequenceJson: string | null): {
  subject: string;
  body: string;
  bodyHtml: string;
  smtpAccountId: string;
  templateId: string;
  sendIntervalMs: number;
  followUpEnabled: boolean;
  followUpDelayHours: number;
  followUpSubject: string;
  followUpBody: string;
  followUpBodyHtml: string;
  maxRetries: number;
  scheduledAt: string;
  emailMode: string;
  attachGmbAudit: boolean;
  attachWebsiteAudit: boolean;
} {
  const defaults = {
    subject: "",
    body: "",
    bodyHtml: "",
    smtpAccountId: "",
    templateId: "",
    sendIntervalMs: 250,
    followUpEnabled: false,
    followUpDelayHours: 72,
    followUpSubject: "",
    followUpBody: "",
    followUpBodyHtml: "",
    maxRetries: 0,
    scheduledAt: "",
    emailMode: "custom" as string,
    attachGmbAudit: false,
    attachWebsiteAudit: false,
  };

  if (!sequenceJson) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(sequenceJson) as Record<string, unknown>;

    return {
      subject: cleanText(parsed.subject),
      body: cleanText(parsed.body),
      bodyHtml: normalizeHtmlTemplate(parsed.bodyHtml as string | undefined, parsed.body as string | undefined),
      smtpAccountId: cleanText(parsed.smtpAccountId),
      templateId: cleanText(parsed.templateId),
      sendIntervalMs: Math.max(0, toInteger(parsed.sendIntervalMs, 250)),
      followUpEnabled: Boolean(parsed.followUpEnabled),
      followUpDelayHours: Math.max(1, toInteger(parsed.followUpDelayHours, 72)),
      followUpSubject: cleanText(parsed.followUpSubject),
      followUpBody: cleanText(parsed.followUpBody),
      followUpBodyHtml: normalizeHtmlTemplate(parsed.followUpBodyHtml as string | undefined, parsed.followUpBody as string | undefined),
      maxRetries: Math.max(0, toInteger(parsed.maxRetries, 0)),
      scheduledAt: cleanText(parsed.scheduledAt),
      emailMode: cleanText(parsed.emailMode) || "custom",
      attachGmbAudit: toBoolean(parsed.attachGmbAudit, false),
      attachWebsiteAudit: toBoolean(parsed.attachWebsiteAudit, false),
    };
  } catch {
    return defaults;
  }
}

function normalizeDateTime(value: unknown): string {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }

  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function addHoursIso(startIso: string, hours: number): string {
  const date = new Date(startIso);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function resolveCampaignStatus(campaignId: string, scheduledAt: string): string {
  const db = getDb();
  const pending = db
    .prepare("SELECT COUNT(*) as count FROM emails_sent WHERE campaign_id = ? AND status = 'pending'")
    .get(campaignId) as { count: number };

  if ((pending.count || 0) > 0) {
    if (scheduledAt) {
      const scheduleTime = new Date(scheduledAt).getTime();
      if (Number.isFinite(scheduleTime) && scheduleTime > Date.now()) {
        return "scheduled";
      }
    }
    return "queued";
  }

  return "complete";
}

function queueFollowUpIfNeeded(
  campaignId: string,
  recipient: CampaignRecipientRow,
  sequence: ReturnType<typeof parseSequenceJson>,
  smtpAccountId: string
): void {
  if (!sequence.followUpEnabled || !recipient.lead_id) {
    return;
  }

  const followUpSubject = cleanText(sequence.followUpSubject);
  const followUpBody = cleanText(sequence.followUpBody);
  if (!followUpSubject || !followUpBody) {
    return;
  }

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM emails_sent
       WHERE campaign_id = ? AND lead_id = ? AND step_number = 2
       LIMIT 1`
    )
    .get(campaignId, recipient.lead_id) as { id?: string } | undefined;

  if (existing?.id) {
    return;
  }

  const sentAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO emails_sent (
      id,
      campaign_id,
      lead_id,
      step_number,
      smtp_account_id,
      subject,
      body,
      body_html,
      status,
      next_attempt_at,
      created_at
    ) VALUES (?, ?, ?, 2, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    crypto.randomUUID(),
    campaignId,
    recipient.lead_id,
    smtpAccountId,
    followUpSubject,
    followUpBody,
    sequence.followUpBodyHtml || plainTextToEmailHtml(followUpBody),
    addHoursIso(sentAt, sequence.followUpDelayHours),
    sentAt
  );
}

function buildRetrySchedule(attemptCount: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + Math.max(15, attemptCount * 30));
  return now.toISOString();
}

function formatFromAddress(account: SmtpAccountRow): string {
  const fromName = cleanText(account.from_name);
  const fromEmailRaw = cleanText(account.from_email);
  const usernameRaw = cleanText(account.username);

  // Prefer explicit configured from_email. If missing, only use username
  // when it appears to be a valid email address (contains @).
  let fromEmail: string | null = null;
  if (fromEmailRaw) {
    fromEmail = fromEmailRaw;
  } else if (usernameRaw && usernameRaw.includes("@")) {
    fromEmail = usernameRaw;
  }

  if (!fromEmail) {
    throw new Error("SMTP from email is not configured. Set `from_email` for the SMTP account or use an email-style username.");
  }

  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

function personalizeTemplate(template: string, recipient: CampaignRecipientRow): string {
  const context = parseCampaignReportContext(recipient.report_context_json);
  let auditScore: number | null = context?.audits?.website?.score ?? null;
  let auditVerdict: string = context?.audits?.website?.verdict || "";
  let auditSummary: string = context?.audits?.website?.summary || "";
  let gmbScore: number | null = context?.audits?.gmb?.score ?? null;
  let auditIssue1 = "";
  let auditIssue2 = "";

  if (recipient.lead_id) {
    try {
      const db = getDb();
      const auditRow = db
        .prepare(
          `SELECT * FROM audits WHERE lead_id = ? ORDER BY datetime(created_at) DESC LIMIT 1`
        )
        .get(recipient.lead_id) as any;

      if (auditRow) {
        if (auditScore === null && auditRow.score != null) {
          auditScore = auditRow.score;
        }
        if (!auditVerdict && auditRow.verdict) {
          auditVerdict = auditRow.verdict;
        }
        if (auditRow.data_json) {
          try {
            const parsed = JSON.parse(auditRow.data_json);
            if (!auditSummary && parsed.summary) {
              auditSummary = parsed.summary;
            }
            if (Array.isArray(parsed.issues) && parsed.issues.length > 0) {
              auditIssue1 = String(parsed.issues[0]?.title || parsed.issues[0] || "");
              if (parsed.issues.length > 1) {
                auditIssue2 = String(parsed.issues[1]?.title || parsed.issues[1] || "");
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  const pitchLink = recipient.lead_id ? `/pitch/${recipient.lead_id}` : "/";
  const businessName = cleanText(recipient.business_name) || "Business Owner";
  const city = cleanText(recipient.city) || "your area";
  const state = cleanText(recipient.state) || "";
  const website = cleanText(recipient.website) || "your website";
  const email = cleanText(recipient.email) || "";

  const replacements: Record<string, string> = {
    "{{business_name}}": businessName,
    "{{businessName}}": businessName,
    "{{city}}": city,
    "{{state}}": state,
    "{{website}}": website,
    "{{email}}": email,
    "{{score}}": auditScore !== null ? String(auditScore) : "74",
    "{{audit_score}}": auditScore !== null ? String(auditScore) : "74",
    "{{website_audit_score}}": auditScore !== null ? String(auditScore) : "74",
    "{{gmb_score}}": gmbScore !== null ? String(gmbScore) : "68",
    "{{gmb_audit_score}}": gmbScore !== null ? String(gmbScore) : "68",
    "{{audit_verdict}}": auditVerdict || "Optimization Opportunities Found",
    "{{verdict}}": auditVerdict || "Optimization Opportunities Found",
    "{{audit_summary}}": auditSummary || "Recent analysis identified high-impact optimization opportunities.",
    "{{audit_issue_1}}": auditIssue1 || "Mobile loading performance and Core Web Vitals optimization",
    "{{audit_issue_2}}": auditIssue2 || "Google Maps profile category and local citation consistency gaps",
    "{{pitch_link}}": pitchLink,
    "{{pitchLink}}": pitchLink,
    "{{proposal_link}}": pitchLink,
  };

  let output = template;
  for (const [token, value] of Object.entries(replacements)) {
    output = output.split(token).join(value);
  }

  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSmtpAccountById(accountId: string): SmtpAccountRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM smtp_accounts WHERE id = ?")
    .get(accountId) as SmtpAccountRow | undefined;

  return row || null;
}

function getFirstActiveSmtpAccount(): SmtpAccountRow | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT *
       FROM smtp_accounts
       WHERE is_active = 1
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`
    )
    .get() as SmtpAccountRow | undefined;

  return row || null;
}

function normalizeSmtpAccountOutput(row: SmtpAccountRow) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    secure: row.secure === 1,
    username: row.username,
    from_name: row.from_name || "",
    from_email: row.from_email || "",
    is_active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    password_set: Boolean(cleanText(row.password)),
  };
}

function listCampaignRows(): Array<CampaignRow & {
  total_count: number;
  pending_count: number;
  sent_count: number;
  failed_count: number;
}> {
  const db = getDb();

  return db
    .prepare(
      `SELECT
        c.*,
        COUNT(e.id) as total_count,
        SUM(CASE WHEN e.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN e.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
        SUM(CASE WHEN e.status = 'bounced' THEN 1 ELSE 0 END) as failed_count
       FROM campaigns c
       LEFT JOIN emails_sent e ON e.campaign_id = c.id
       GROUP BY c.id
       ORDER BY datetime(c.created_at) DESC`
    )
    .all() as Array<CampaignRow & {
    total_count: number;
    pending_count: number;
    sent_count: number;
    failed_count: number;
  }>;
}

function normalizeCampaignRow(
  row: CampaignRow & {
    total_count: number;
    pending_count: number;
    sent_count: number;
    failed_count: number;
  }
) {
  const sequence = parseSequenceJson(row.sequence_json);

  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    target_niche: row.target_niche || "",
    target_city: row.target_city || "",
    status: row.status,
    subject: sequence.subject,
    body: sequence.body,
    body_html: sequence.bodyHtml,
    smtp_account_id: sequence.smtpAccountId,
    template_id: sequence.templateId,
    send_interval_ms: sequence.sendIntervalMs,
    follow_up_enabled: sequence.followUpEnabled,
    follow_up_delay_hours: sequence.followUpDelayHours,
    follow_up_subject: sequence.followUpSubject,
    follow_up_body: sequence.followUpBody,
    follow_up_body_html: sequence.followUpBodyHtml,
    max_retries: sequence.maxRetries,
    scheduled_at: row.scheduled_at || sequence.scheduledAt,
    email_mode: sequence.emailMode || "custom",
    attach_gmb_audit: sequence.attachGmbAudit || false,
    attach_website_audit: sequence.attachWebsiteAudit || false,
    total_count: Number(row.total_count || 0),
    pending_count: Number(row.pending_count || 0),
    sent_count: Number(row.sent_count || 0),
    failed_count: Number(row.failed_count || 0),
    last_run_at: row.last_run_at || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const outreachRouter = express.Router();

outreachRouter.get("/templates", (req, res) => {
  try {
    const source = cleanText(req.query.source);
    const city = cleanText(req.query.city);
    const niche = cleanText(req.query.niche);
    const items = listCampaignTemplates(source).map((template) => {
      if (!city && !niche) {
        return template;
      }

      return getRecommendedCampaignTemplate({
        source: template.source_key,
        city,
        niche,
      }).id === template.id
        ? getRecommendedCampaignTemplate({ source: template.source_key, city, niche })
        : template;
    });

    const recommended = getRecommendedCampaignTemplate({ source, city, niche });
    res.json({ items, recommended });
  } catch (error) {
    console.error("Failed to list campaign templates", error);
    res.status(500).json({ error: "Failed to list campaign templates" });
  }
});

outreachRouter.post("/templates", (req, res) => {
  try {
    const name = cleanText(req.body?.name);
    const subject = cleanText(req.body?.subject);
    const body = cleanText(req.body?.body);
    const bodyHtml = cleanText(req.body?.bodyHtml);

    if (!name || !subject || !body) {
      res.status(400).json({ error: "name, subject and body are required" });
      return;
    }

    const created = createCampaignTemplate({
      id: crypto.randomUUID(),
      name,
      sourceKey: cleanText(req.body?.sourceKey),
      subject,
      body,
      bodyHtml,
      sendIntervalMs: toInteger(req.body?.sendIntervalMs, 250),
      followUpEnabled: toBoolean(req.body?.followUpEnabled, false),
      followUpDelayHours: toInteger(req.body?.followUpDelayHours, 72),
      followUpSubject: cleanText(req.body?.followUpSubject),
      followUpBody: cleanText(req.body?.followUpBody),
      followUpBodyHtml: cleanText(req.body?.followUpBodyHtml),
      maxRetries: toInteger(req.body?.maxRetries, 0),
      isDefault: toBoolean(req.body?.isDefault, false),
    });

    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create campaign template";
    res.status(400).json({ error: message });
  }
});

outreachRouter.get("/summary", (_req, res) => {
  try {
    const db = getDb();

    const campaignsByStatus = db
      .prepare("SELECT status, COUNT(*) as count FROM campaigns GROUP BY status")
      .all() as Array<{ status: string; count: number }>;

    const queuedEmails = db
      .prepare("SELECT COUNT(*) as count FROM emails_sent WHERE status = 'pending'")
      .get() as { count: number };

    const sentEmails = db
      .prepare("SELECT COUNT(*) as count FROM emails_sent WHERE status = 'sent'")
      .get() as { count: number };

    const smtpAccounts = db
      .prepare("SELECT COUNT(*) as count FROM smtp_accounts WHERE is_active = 1")
      .get() as { count: number };

    const eligibleLeads = db
      .prepare("SELECT COUNT(*) as count FROM leads WHERE TRIM(COALESCE(email, '')) <> ''")
      .get() as { count: number };

    res.json({
      campaignsByStatus,
      queuedEmails: queuedEmails.count || 0,
      sentEmails: sentEmails.count || 0,
      smtpAccounts: smtpAccounts.count || 0,
      eligibleLeads: eligibleLeads.count || 0,
    });
  } catch (error) {
    console.error("Failed to fetch outreach summary", error);
    res.status(500).json({ error: "Failed to fetch outreach summary" });
  }
});

outreachRouter.get("/smtp-accounts", (_req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM smtp_accounts ORDER BY datetime(created_at) DESC")
      .all() as SmtpAccountRow[];

    res.json({ items: rows.map(normalizeSmtpAccountOutput) });
  } catch (error) {
    console.error("Failed to list SMTP accounts", error);
    res.status(500).json({ error: "Failed to list SMTP accounts" });
  }
});

outreachRouter.post("/smtp-accounts", (req, res) => {
  try {
    const name = cleanText(req.body?.name);
    const host = cleanText(req.body?.host);
    const port = toInteger(req.body?.port, 587);
    const secure = toBoolean(req.body?.secure, port === 465);
    const username = cleanText(req.body?.username);
    const password = cleanText(req.body?.password);
    const fromName = cleanText(req.body?.from_name);
    const fromEmail = cleanText(req.body?.from_email);
    const isActive = toBoolean(req.body?.is_active, true);

    if (!name || !host || !username || !password) {
      res.status(400).json({ error: "name, host, username and password are required" });
      return;
    }

    if (port < 1 || port > 65535) {
      res.status(400).json({ error: "SMTP port must be between 1 and 65535" });
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    db.prepare(
      `INSERT INTO smtp_accounts (
        id, name, host, port, secure, username, password,
        from_name, from_email, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      host,
      port,
      secure ? 1 : 0,
      username,
      encryptCredential(password),
      fromName || null,
      fromEmail || null,
      isActive ? 1 : 0,
      now,
      now
    );

    const created = getSmtpAccountById(id);
    if (!created) {
      throw new Error("Failed to create SMTP account");
    }

    res.status(201).json(normalizeSmtpAccountOutput(created));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create SMTP account";
    res.status(400).json({ error: message });
  }
});

outreachRouter.post("/smtp-accounts/bulk", (req, res) => {
  try {
    const accounts = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
    if (!accounts.length) {
      res.status(400).json({ error: "No accounts provided in bulk payload" });
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    let imported = 0;

    const stmt = db.prepare(
      `INSERT INTO smtp_accounts (
        id, name, host, port, secure, username, password,
        from_name, from_email, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    db.exec("BEGIN");
    for (const r of accounts) {
      const id = crypto.randomUUID();
      const fromName = cleanText(r.from_name || r.name || "Outreach");
      const fromEmail = cleanText(r.from_email || r.email || r.username);
      const host = cleanText(r.smtp_host || r.host || "smtp.titan.email");
      const port = Number(r.smtp_port || r.port) || 465;
      const secure = r.ssl !== undefined ? (r.ssl ? 1 : 0) : (port === 465 ? 1 : 0);
      const username = cleanText(r.username || fromEmail);
      const password = encryptCredential(cleanText(r.password));
      stmt.run(id, fromName, host, port, secure, username, password, fromName, fromEmail, 1, now, now);
      imported++;
    }
    db.exec("COMMIT");

    res.json({ success: true, count: imported });
  } catch (error) {
    console.error("Bulk SMTP import error:", error);
    res.status(500).json({ error: "Failed to bulk import SMTP accounts" });
  }
});

outreachRouter.delete("/smtp-accounts/:id", (req, res) => {
  try {
    const accountId = cleanText(req.params.id);
    if (!accountId) {
      res.status(400).json({ error: "SMTP account id is required" });
      return;
    }

    const db = getDb();
    const result = db
      .prepare("DELETE FROM smtp_accounts WHERE id = ?")
      .run(accountId);

    if (!Number(result.changes || 0)) {
      res.status(404).json({ error: "SMTP account not found" });
      return;
    }

    res.json({ deleted: true, id: accountId });
  } catch (error) {
    console.error("Failed to delete SMTP account", error);
    res.status(500).json({ error: "Failed to delete SMTP account" });
  }
});

outreachRouter.post("/smtp-accounts/test", async (req, res) => {
  try {
    const host = cleanText(req.body?.smtp_host || req.body?.host);
    const port = toInteger(req.body?.smtp_port || req.body?.port, 465);
    const secure = toBoolean(req.body?.ssl !== undefined ? req.body.ssl : req.body?.secure, port === 465);
    const username = cleanText(req.body?.username);
    const password = cleanText(req.body?.password);
    const fromEmail = cleanText(req.body?.from_email || username);

    if (!host || !username || !password) {
      res.status(400).json({ error: "host, username and password are required" });
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: username,
        pass: password,
      },
    });

    await transporter.verify();
    res.json({ success: true, ok: true, message: "SMTP credentials verified successfully!" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP connection failed";
    res.status(400).json({ error: message });
  }
});

outreachRouter.post("/smtp-accounts/:id/test", async (req, res) => {
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") return res.status(409).json({ error: "Outbound email is paused until public hosting and sender verification are configured." });
  try {
    const accountId = cleanText(req.params.id);
    const toEmail = cleanText(req.body?.to_email);

    if (!accountId || !toEmail) {
      res.status(400).json({ error: "SMTP account id and to_email are required" });
      return;
    }

    const account = getSmtpAccountById(accountId);
    if (!account || account.is_active !== 1) {
      res.status(404).json({ error: "Active SMTP account not found" });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure === 1,
      auth: {
        user: account.username,
        pass: decryptCredential(account.password),
      },
    });

    await transporter.sendMail({
      from: formatFromAddress(account),
      to: toEmail,
      subject: "SMBify OS SMTP test",
      text: "SMTP test successful. Your account is ready for campaigns.",
      html: "<p>SMTP test successful. Your account is ready for campaigns.</p>",
    });

    res.json({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP test failed";
    res.status(400).json({ error: message });
  }
});

outreachRouter.post("/send-direct", async (req, res) => {
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") return res.status(409).json({ error: "Outbound email is paused until public hosting and sender verification are configured." });
  try {
    const toEmail = cleanText(req.body?.to_email || req.body?.to).toLowerCase();
    const subject = cleanText(req.body?.subject);
    const body = cleanText(req.body?.body);
    const bodyHtml = cleanText(req.body?.body_html || req.body?.bodyHtml) || null;
    const smtpAccountId = cleanText(req.body?.smtpAccountId || req.body?.smtp_account_id) || null;
    const leadId = cleanText(req.body?.leadId || req.body?.lead_id);
    const auditId = cleanText(req.body?.auditId || req.body?.audit_id);
    if (!toEmail || !subject || !body || !leadId) return res.status(400).json({ error: "lead, recipient, subject and body are required" });

    const db = getDb();
    const lead = db.prepare("SELECT id,email FROM leads WHERE id=?").get(leadId) as { id: string; email: string | null } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (cleanText(lead.email).toLowerCase() !== toEmail) return res.status(400).json({ error: "Recipient must match the lead email. Update the lead before sending." });
    if (smtpAccountId && !db.prepare("SELECT 1 FROM smtp_accounts WHERE id=? AND is_active=1").get(smtpAccountId)) return res.status(400).json({ error: "Selected SMTP account is missing or inactive" });

    const result = enqueueManualDispatch(db, { leadId, subject, body, bodyHtml, smtpAccountId, name: auditId ? "Audit report outreach" : "Manual outreach" });
    addLeadActivity(leadId, "manual_email_queued", `Manual report email queued for ${toEmail}`, { to: toEmail, subject, smtp_account_id: smtpAccountId, audit_id: auditId || null, campaign_id: result.campaignId });
    void processTenantDispatchQueue().catch((error) => console.error("[outreach/send-direct] Dispatch start failed", error));
    return res.status(202).json({ sent: false, queued: true, campaignId: result.campaignId, smtpAccountId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to queue direct email";
    return res.status(400).json({ error: message });
  }
});
outreachRouter.get("/eligible-leads", (req, res) => {
  try {
    const db = getDb();
    const where: string[] = ["TRIM(COALESCE(email, '')) <> ''"];
    const params: BindValue[] = [];

    const query = cleanText(req.query.query);
    const city = cleanText(req.query.city);
    const niche = cleanText(req.query.niche);
    const limit = Math.min(500, Math.max(1, toInteger(req.query.limit, 120)));

    if (query) {
      where.push(
        "(LOWER(business_name) LIKE LOWER(?) OR LOWER(COALESCE(email,'')) LIKE LOWER(?) OR LOWER(COALESCE(city,'')) LIKE LOWER(?) OR LOWER(COALESCE(niche,'')) LIKE LOWER(?))"
      );
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }

    if (city) {
      where.push("LOWER(COALESCE(city,'')) = LOWER(?)");
      params.push(city);
    }

    if (niche) {
      where.push("LOWER(COALESCE(niche,'')) = LOWER(?)");
      params.push(niche);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const items = db
      .prepare(
        `SELECT l.id, l.business_name, l.email, l.phone, l.website, l.gmb_url,
                l.city, l.state, l.niche, l.status,
                l.has_website, l.gmb_claimed, l.gmb_rating, l.gmb_review_count,
                l.gmb_profile_incomplete, l.citations_found,
                (
                  SELECT a.score
                  FROM audits a
                  WHERE a.lead_id = l.id AND a.audit_type = 'gmb'
                  ORDER BY datetime(a.created_at) DESC
                  LIMIT 1
                ) AS last_gmb_audit_score,
                (
                  SELECT a.created_at
                  FROM audits a
                  WHERE a.lead_id = l.id AND a.audit_type = 'gmb'
                  ORDER BY datetime(a.created_at) DESC
                  LIMIT 1
                ) AS last_gmb_audited_at,
                (
                  SELECT a.score
                  FROM audits a
                  WHERE a.lead_id = l.id AND a.audit_type = 'website'
                  ORDER BY datetime(a.created_at) DESC
                  LIMIT 1
                ) AS last_website_audit_score,
                (
                  SELECT a.created_at
                  FROM audits a
                  WHERE a.lead_id = l.id AND a.audit_type = 'website'
                  ORDER BY datetime(a.created_at) DESC
                  LIMIT 1
                ) AS last_website_audited_at
         FROM leads l
         ${whereClause}
         ORDER BY datetime(l.created_at) DESC
         LIMIT ?`
      )
      .all(...params, limit) as Array<{
      id: string;
      business_name: string;
      email: string;
      phone: string | null;
      website: string | null;
      gmb_url: string | null;
      city: string | null;
      state: string | null;
      niche: string | null;
      status: string;
      has_website: number;
      gmb_claimed: number;
      gmb_rating: number | null;
      gmb_review_count: number | null;
      gmb_profile_incomplete: number;
      citations_found: number;
      last_gmb_audit_score: number | null;
      last_gmb_audited_at: string | null;
      last_website_audit_score: number | null;
      last_website_audited_at: string | null;
    }>;

    const normalizedItems = items.map((item) => ({
      ...item,
      has_website: item.has_website === 1,
      gmb_claimed: item.gmb_claimed === 1,
      gmb_profile_incomplete: item.gmb_profile_incomplete === 1,
      citations_found: item.citations_found === 1,
    }));

    res.json({ items: normalizedItems, count: normalizedItems.length });
  } catch (error) {
    console.error("Failed to list eligible leads", error);
    res.status(500).json({ error: "Failed to list eligible leads" });
  }
});

outreachRouter.get("/campaigns", (_req, res) => {
  try {
    const items = listCampaignRows().map(normalizeCampaignRow);
    res.json({ items });
  } catch (error) {
    console.error("Failed to list campaigns", error);
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

outreachRouter.get("/campaigns/:id", (req, res) => {
  try {
    const campaignId = cleanText(req.params.id);
    if (!campaignId) {
      res.status(400).json({ error: "Campaign id is required" });
      return;
    }

    const db = getDb();
    const campaign = db
      .prepare("SELECT * FROM campaigns WHERE id = ?")
      .get(campaignId) as CampaignRow | undefined;

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const recipients = db
      .prepare(
        `SELECT
          e.id as email_id,
          e.lead_id,
          e.step_number,
          l.email,
          l.business_name,
          l.city,
          l.state,
          l.website,
          e.subject,
          e.body,
          e.body_html,
          e.report_context_json,
          e.status,
          e.sent_at,
          e.opened_at,
          e.replied_at,
          e.bounced_at,
          e.attempt_count,
          e.last_attempt_at,
          e.next_attempt_at,
          e.error_message
         FROM emails_sent e
         LEFT JOIN leads l ON l.id = e.lead_id
         WHERE e.campaign_id = ?
         ORDER BY datetime(e.created_at) ASC`
      )
      .all(campaignId) as CampaignRecipientRow[];

    const listRow = listCampaignRows().find((row) => row.id === campaignId);

    res.json({
      campaign: listRow ? normalizeCampaignRow(listRow) : normalizeCampaignRow({
        ...campaign,
        total_count: recipients.length,
        pending_count: recipients.filter((item) => item.status === "pending").length,
        sent_count: recipients.filter((item) => item.status === "sent").length,
        failed_count: recipients.filter((item) => item.status === "bounced").length,
      }),
      recipients,
    });
  } catch (error) {
    console.error("Failed to fetch campaign", error);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

outreachRouter.post("/campaigns", checkCampaignLimit, (req, res) => {
  try {
    const leadIds = parseLeadIds(req.body?.leadIds);
    const payload = {
      name: cleanText(req.body?.name),
      description: cleanText(req.body?.description),
      subject: cleanText(req.body?.subject),
      body: cleanText(req.body?.body),
      bodyHtml: cleanText(req.body?.bodyHtml),
      leadIds,
      smtpAccountId: cleanText(req.body?.smtpAccountId),
      targetCity: cleanText(req.body?.targetCity),
      targetNiche: cleanText(req.body?.targetNiche),
      templateId: cleanText(req.body?.templateId),
      sendIntervalMs: toInteger(req.body?.sendIntervalMs, 250),
      followUpEnabled: toBoolean(req.body?.followUpEnabled, false),
      followUpDelayHours: toInteger(req.body?.followUpDelayHours, 72),
      followUpSubject: cleanText(req.body?.followUpSubject),
      followUpBody: cleanText(req.body?.followUpBody),
      followUpBodyHtml: cleanText(req.body?.followUpBodyHtml),
      maxRetries: toInteger(req.body?.maxRetries, 0),
      scheduledAt: normalizeDateTime(req.body?.scheduledAt),
    };
    const allowEmpty = toBoolean(req.body?.allowEmpty, false);
    const result = leadIds.length === 0 && allowEmpty
      ? createCampaignShell(payload)
      : createCampaignDraftFromLeadIds(payload);

    res.status(201).json({
      campaignId: result.campaignId,
      queuedCount: result.queuedCount,
      matchedLeadIds: result.matchedLeadIds,
      createdEmpty: leadIds.length === 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create campaign";
    res.status(400).json({ error: message });
  }
});

outreachRouter.patch("/campaigns/:id", (req, res) => {
  try {
    const campaignId = cleanText(req.params.id);
    if (!campaignId) {
      res.status(400).json({ error: "Campaign id is required" });
      return;
    }

    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM campaigns WHERE id = ?")
      .get(campaignId) as CampaignRow | undefined;

    if (!existing) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const oldSeq = existing.sequence_json ? JSON.parse(existing.sequence_json) : {};

    const hasField = (key: string) => req.body?.[key] !== undefined;

    const updatedSeq = {
      ...oldSeq,
      ...(hasField("subject") && { subject: cleanText(req.body.subject) }),
      ...(hasField("body") && { body: cleanText(req.body.body) }),
      ...(hasField("bodyHtml") && { bodyHtml: cleanText(req.body.bodyHtml) }),
      ...(hasField("smtpAccountId") && { smtpAccountId: cleanText(req.body.smtpAccountId) }),
      ...(hasField("templateId") && { templateId: cleanText(req.body.templateId) }),
      ...(hasField("sendIntervalMs") && { sendIntervalMs: toInteger(req.body.sendIntervalMs, 250) }),
      ...(hasField("followUpEnabled") && { followUpEnabled: toBoolean(req.body.followUpEnabled, false) }),
      ...(hasField("followUpDelayHours") && { followUpDelayHours: toInteger(req.body.followUpDelayHours, 72) }),
      ...(hasField("followUpSubject") && { followUpSubject: cleanText(req.body.followUpSubject) }),
      ...(hasField("followUpBody") && { followUpBody: cleanText(req.body.followUpBody) }),
      ...(hasField("followUpBodyHtml") && { followUpBodyHtml: cleanText(req.body.followUpBodyHtml) }),
      ...(hasField("maxRetries") && { maxRetries: toInteger(req.body.maxRetries, 0) }),
      ...(hasField("scheduledAt") && { scheduledAt: normalizeDateTime(req.body.scheduledAt) }),
      ...(hasField("emailMode") && { emailMode: cleanText(req.body.emailMode) || "custom" }),
      ...(hasField("attachGmbAudit") && { attachGmbAudit: toBoolean(req.body.attachGmbAudit, false) }),
      ...(hasField("attachWebsiteAudit") && { attachWebsiteAudit: toBoolean(req.body.attachWebsiteAudit, false) }),
    };

    const sets: string[] = ["sequence_json = ?", "updated_at = ?"];
    const params: BindValue[] = [JSON.stringify(updatedSeq), new Date().toISOString()];

    if (hasField("name")) {
      sets.push("name = ?");
      params.push(cleanText(req.body.name));
    }
    if (hasField("description")) {
      sets.push("description = ?");
      params.push(cleanText(req.body.description));
    }
    if (hasField("targetNiche")) {
      sets.push("target_niche = ?");
      params.push(cleanText(req.body.targetNiche));
    }
    if (hasField("targetCity")) {
      sets.push("target_city = ?");
      params.push(cleanText(req.body.targetCity));
    }
    if (hasField("status")) {
      sets.push("status = ?");
      params.push(cleanText(req.body.status));
    }

    params.push(campaignId);
    db.prepare(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    const listRow = listCampaignRows().find((row) => row.id === campaignId);
    if (listRow) {
      res.json({ campaign: normalizeCampaignRow(listRow) });
    } else {
      res.json({ updated: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update campaign";
    res.status(400).json({ error: message });
  }
});

outreachRouter.post("/campaigns/:id/leads", (req, res) => {
  try {
    const campaignId = cleanText(req.params.id);
    if (!campaignId) {
      res.status(400).json({ error: "Campaign id is required" });
      return;
    }

    const result = appendLeadIdsToCampaign(campaignId, req.body?.leadIds);
    res.json({
      campaignId: result.campaignId,
      appendedCount: result.queuedCount,
      matchedLeadIds: result.matchedLeadIds,
      duplicateLeadIds: result.duplicateLeadIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add leads to campaign";
    res.status(400).json({ error: message });
  }
});

outreachRouter.post("/campaigns/:id/send", async (req, res) => {
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") return res.status(409).json({ error: "Outbound email is paused until public hosting and sender verification are configured." });
  try {
    const campaignId = cleanText(req.params.id);
    if (!campaignId) return res.status(400).json({ error: "Campaign id is required" });
    if (cleanText(req.body?.testEmail)) return res.status(400).json({ error: "Use the SMTP account test action for test messages." });

    const db = getDb();
    const campaign = db.prepare("SELECT * FROM campaigns WHERE id=?").get(campaignId) as CampaignRow | undefined;
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    const sequence = parseSequenceJson(campaign.sequence_json);
    const scheduledAt = cleanText(campaign.scheduled_at) || sequence.scheduledAt;
    if (scheduledAt && new Date(scheduledAt).getTime() > Date.now()) return res.status(400).json({ error: `Campaign is scheduled for ${scheduledAt} and is not due yet` });
    if (!sequence.smtpAccountId) return res.status(400).json({ error: "Campaign does not have an SMTP account configured" });
    if (!getSmtpAccountById(sequence.smtpAccountId)) return res.status(404).json({ error: "Configured SMTP account is missing or inactive" });

    syncLegacyCampaigns();
    const bridged = db.prepare("SELECT id FROM email_campaigns WHERE legacy_campaign_id=?").get(campaignId) as { id: string } | undefined;
    if (!bridged) return res.status(500).json({ error: "Failed to prepare campaign for dispatch" });
    const result = enqueueLegacyCampaignDispatches(db, { legacyCampaignId: campaignId, emailCampaignId: bridged.id, smtpAccountId: sequence.smtpAccountId });
    if (!result.queued) return res.status(409).json({ error: "No new eligible recipients were queued." });
    void processTenantDispatchQueue().catch((error) => console.error(`[outreach] Campaign ${campaignId} dispatch failed`, error));
    return res.status(202).json({ queued: true, queuedCount: result.queued, campaignId });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to queue campaign" });
  }
});
outreachRouter.delete("/campaigns/:id", (req, res) => {
  try {
    const campaignId = cleanText(req.params.id);
    if (!campaignId) {
      res.status(400).json({ error: "Campaign id is required" });
      return;
    }

    const db = getDb();
    db.exec("BEGIN");
    try {
      const bridge = db.prepare("SELECT id FROM email_campaigns WHERE legacy_campaign_id=?").get(campaignId) as { id: string } | undefined;
      if (bridge) {
        db.prepare("DELETE FROM email_dispatch_jobs WHERE campaign_id=? AND status NOT IN ('sent')").run(bridge.id);
        db.prepare("DELETE FROM email_campaigns WHERE id=?").run(bridge.id);
      }
      db.prepare("DELETE FROM emails_sent WHERE campaign_id = ?").run(campaignId);
      const result = db.prepare("DELETE FROM campaigns WHERE id = ?").run(campaignId);

      if (!Number(result.changes || 0)) {
        db.exec("ROLLBACK");
        res.status(404).json({ error: "Campaign not found" });
        return;
      }

      db.exec("COMMIT");
      res.json({ deleted: true, campaignId });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Failed to delete campaign", error);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});
