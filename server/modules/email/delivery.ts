import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { getDb, tenantLocalStorage } from "../../db/database.js";
import { decryptCredential } from "../../utils/encryption.js";
import { appBaseUrl, publicToken } from "../../utils/publicLinks.js";

export type DeliveryInput = {
  campaignId: string;
  leadId: string;
  subject: string;
  body: string;
  bodyHtml?: string | null;
  sequenceNumber?: number;
  smtpAccountId?: string | null;
  idempotencyKey?: string | null;
};
export type DeliveryResult = { trackingId: string; status: "sent" };

export class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly permanent = false,
    public readonly code = "DELIVERY_FAILED",
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function personalize(template: string, lead: Record<string, unknown>): string {
  return String(template || "").replace(
    /\{\{?\s*(business_name|email|phone|website|city|state|niche)\s*\}?\}/gi,
    (_match, key: string) => String(lead[key.toLowerCase()] ?? ""),
  );
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertSendingConfigured(): void {
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") {
    throw new DeliveryError(
      "Outbound email is paused. Set OUTBOUND_EMAIL_ENABLED=true after public hosting and sender verification are configured.",
      false,
      "OUTBOUND_PAUSED",
    );
  }
  appBaseUrl();
}

function recipientBlocked(db: any, email: string, lead: any): boolean {
  if (!email || !isValidEmail(email)) return true;
  if (["unsubscribed", "bounced", "invalid_email", "closed_lost"].includes(String(lead?.status))) return true;
  return Boolean(db.prepare("SELECT 1 FROM email_suppression WHERE LOWER(email)=LOWER(?) LIMIT 1").get(email));
}

export async function guardedSend(input: DeliveryInput): Promise<DeliveryResult> {
  assertSendingConfigured();
  const db = getDb();
  const lead = db.prepare("SELECT * FROM leads WHERE id=?").get(input.leadId) as any;
  if (!lead) throw new DeliveryError("Lead not found", true, "LEAD_NOT_FOUND");

  const recipient = String(lead.email || "").trim().toLowerCase();
  if (recipientBlocked(db, recipient, lead)) {
    throw new DeliveryError("Recipient is missing, invalid, suppressed, or opted out", true, "RECIPIENT_BLOCKED");
  }

  if (input.idempotencyKey) {
    const previousAttempt = db.prepare("SELECT id,status FROM email_tracking WHERE id=?").get(input.idempotencyKey) as any;
    if (previousAttempt?.status === "sent") return { trackingId: previousAttempt.id, status: "sent" };
  }

  const campaign = db.prepare("SELECT * FROM email_campaigns WHERE id=?").get(input.campaignId) as any;
  if (!campaign) throw new DeliveryError("Campaign not found", true, "CAMPAIGN_NOT_FOUND");
  if (["cancelled", "archived"].includes(String(campaign.status))) {
    throw new DeliveryError("Campaign is no longer active", true, "CAMPAIGN_INACTIVE");
  }

  const sequenceNumber = Math.max(1, Number(input.sequenceNumber || 1));
  if (sequenceNumber > 1) {
    const replied = db.prepare("SELECT 1 FROM email_tracking WHERE lead_id=? AND replied=1 LIMIT 1").get(input.leadId);
    if (replied) throw new DeliveryError("Follow-up cancelled because the lead replied", true, "LEAD_REPLIED");
    const previousStep = db.prepare(
      "SELECT 1 FROM email_tracking WHERE campaign_id=? AND lead_id=? AND sequence_number=? AND status='sent' LIMIT 1",
    ).get(input.campaignId, input.leadId, sequenceNumber - 1);
    if (!previousStep) throw new DeliveryError("Previous sequence step has not been sent", false, "PREVIOUS_STEP_PENDING");
  }

  let account: any;
  if (input.smtpAccountId) {
    account = db.prepare("SELECT * FROM smtp_accounts WHERE id=? AND is_active=1").get(input.smtpAccountId) as any;
  } else {
    const accounts = db.prepare("SELECT * FROM smtp_accounts WHERE is_active=1 ORDER BY created_at").all() as any[];
    account = accounts.map((candidate) => {
      const sentToday = Number((db.prepare("SELECT COUNT(*) c FROM email_tracking WHERE sender_email=? AND date(sent_at)=date('now') AND status='sent'").get(candidate.from_email) as any)?.c || 0);
      const limit = Math.max(1, Number(candidate.daily_limit || 100));
      return { ...candidate, sentToday, utilization: sentToday / limit, available: sentToday < limit };
    }).filter((candidate) => candidate.available).sort((left, right) => left.utilization - right.utilization || left.sentToday - right.sentToday)[0];
  }
  if (!account) throw new DeliveryError("No active SMTP account with available capacity", false, "NO_SENDER");

  const senderLimit = Number(account.daily_limit || 100);
  const campaignLimit = Number(campaign.daily_limit || 200);
  const senderSent = Number((db.prepare(
    "SELECT COUNT(*) c FROM email_tracking WHERE sender_email=? AND date(sent_at)=date('now') AND status='sent'",
  ).get(account.from_email) as any)?.c || 0);
  const campaignSent = Number((db.prepare(
    "SELECT COUNT(*) c FROM email_tracking WHERE campaign_id=? AND date(sent_at)=date('now') AND status='sent'",
  ).get(input.campaignId) as any)?.c || 0);
  if (senderSent >= senderLimit) throw new DeliveryError(`Daily sender limit reached (${senderLimit})`, false, "SENDER_DAILY_LIMIT");
  if (campaignSent >= campaignLimit) throw new DeliveryError(`Campaign daily limit reached (${campaignLimit})`, false, "CAMPAIGN_DAILY_LIMIT");

  const trackingId = input.idempotencyKey || uuidv4();
  const pixelId = uuidv4();
  const values = {
    business_name: lead.business_name,
    email: recipient,
    phone: lead.phone,
    website: lead.website,
    city: lead.city,
    state: lead.state,
    niche: lead.niche,
  };
  const subject = personalize(input.subject, values);
  const body = personalize(input.body, values);
  const base = appBaseUrl();
  const tenantId = tenantLocalStorage.getStore()?.tenantId || "default";
  const unsubscribeToken = lead.unsubscribe_token || uuidv4();
  if (!lead.unsubscribe_token) db.prepare("UPDATE leads SET unsubscribe_token=? WHERE id=?").run(unsubscribeToken, input.leadId);

  const trackingShare = encodeURIComponent(publicToken(tenantId, "tracking", pixelId));
  const unsubscribeShare = encodeURIComponent(publicToken(tenantId, "unsubscribe", String(unsubscribeToken)));
  const openUrl = `${base}/track/open/${pixelId}?share=${trackingShare}`;
  const unsubscribeUrl = `${base}/unsubscribe/${encodeURIComponent(unsubscribeToken)}?share=${unsubscribeShare}`;
  const html = input.bodyHtml
    ? personalize(input.bodyHtml, values)
    : body.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#333;max-width:600px">${html}<p style="font-size:11px;color:#777;margin-top:20px">Don't want these emails? <a href="${unsubscribeUrl}">Unsubscribe</a></p><img src="${openUrl}" width="1" height="1" style="display:none" alt=""></div>`;

  db.prepare(`
    INSERT INTO email_tracking(id,lead_id,campaign_id,sender_email,tracking_pixel_id,subject,recipient_email,sequence_number,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,'sending',datetime('now'),datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      sender_email=excluded.sender_email,
      tracking_pixel_id=excluded.tracking_pixel_id,
      subject=excluded.subject,
      recipient_email=excluded.recipient_email,
      status='sending',
      updated_at=datetime('now')
  `).run(trackingId, input.leadId, input.campaignId, account.from_email, pixelId, subject, recipient, sequenceNumber);

  try {
    const transporter = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure === 1,
      auth: { user: account.username, pass: decryptCredential(account.password) },
    });
    await transporter.sendMail({
      from: `"${account.from_name}" <${account.from_email}>`,
      to: recipient,
      subject,
      text: body,
      html: htmlBody,
    });
    db.prepare("UPDATE email_tracking SET status='sent',sent_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(trackingId);
    db.prepare("UPDATE email_campaigns SET total_sent=COALESCE(total_sent,0)+1,updated_at=datetime('now') WHERE id=?").run(input.campaignId);
    db.prepare("UPDATE leads SET status=CASE WHEN status IN ('new','verified') THEN 'contacted' ELSE status END,updated_at=datetime('now') WHERE id=?").run(input.leadId);
    return { trackingId, status: "sent" };
  } catch (error: any) {
    const message = String(error?.message || "send failed").slice(0, 500);
    db.prepare("UPDATE email_tracking SET status='failed',bounce_reason=?,updated_at=datetime('now') WHERE id=?").run(message, trackingId);
    const hardBounce = /\b(550|551|553)\b|mailbox.*not.*exist|user.*unknown|does not exist/i.test(message);
    if (hardBounce) {
      db.prepare("INSERT OR IGNORE INTO email_suppression(id,email,reason,campaign_id,notes) VALUES(?,?,'bounced',?,?)")
        .run(uuidv4(), recipient, input.campaignId, message.slice(0, 200));
      db.prepare("UPDATE leads SET status='bounced',bounced_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(input.leadId);
      db.prepare("UPDATE email_campaigns SET total_bounced=COALESCE(total_bounced,0)+1,updated_at=datetime('now') WHERE id=?").run(input.campaignId);
      throw new DeliveryError(message, true, "HARD_BOUNCE");
    }
    throw new DeliveryError(message, false, "SMTP_ERROR");
  }
}