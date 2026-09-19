import type { DatabaseSync } from "node:sqlite";
import { v4 as uuidv4 } from "uuid";
import { getDb, tenantLocalStorage } from "../../db/database.js";
import { getMainDb } from "../../db/mainDb.js";
import { DeliveryError, guardedSend, isValidEmail } from "./delivery.js";

export interface DispatchJob {
  id: string; campaign_id: string; lead_id: string; recipient_email: string;
  subject: string; body: string; body_html: string | null; smtp_account_id: string | null;
  sequence_id: string | null; sequence_number: number; scheduled_at: string;
  status: string; attempt_count: number; claimed_at: string | null;
}
export interface EnqueueCampaignInput {
  campaignId: string; leadIds: string[]; subject: string; body: string;
  bodyHtml?: string | null; smtpAccountId?: string | null; scheduleFollowups?: boolean; delaySeconds?: number;
}
const DEFAULT_FOLLOWUPS = [
  { days: 3, subject: "Following up — useful local visibility checks for {business_name}", body: "Hi {business_name} team,\n\nI wanted to follow up on my earlier note. If useful, I can share an evidence-based website and local search audit that clearly separates measured findings from items that still need checking.\n\nRegards,\nSMBify Team" },
  { days: 8, subject: "Last note — {business_name}", body: "Hi {business_name} team,\n\nThis is my last follow-up. If a measured website and local search review would be useful later, reply and I can outline what will be checked.\n\nRegards,\nSMBify Team" },
];
function sequenceFollowups(db: DatabaseSync, sequenceId: string | null): Array<{ days: number; subject: string; body: string; bodyHtml?: string | null }> {
  if (!sequenceId) return DEFAULT_FOLLOWUPS;
  const row = db.prepare("SELECT steps_json FROM email_sequences WHERE id=? AND is_active=1").get(sequenceId) as { steps_json?: string } | undefined;
  if (!row?.steps_json) return DEFAULT_FOLLOWUPS;
  try {
    const steps = JSON.parse(row.steps_json) as Array<Record<string, unknown>>;
    const followups = steps.slice(1).map((step, index) => ({
      days: Math.max(1, Number(step.delay_days ?? step.delayDays ?? (index === 0 ? 3 : 8))),
      subject: String(step.subject || "Following up — {business_name}"),
      body: String(step.body || "Hi {business_name} team,\n\nJust following up on my earlier message.\n\nRegards,\nSMBify Team"),
      bodyHtml: step.body_html ? String(step.body_html) : step.bodyHtml ? String(step.bodyHtml) : null,
    })).filter((step) => step.subject.trim() && step.body.trim());
    return followups.length ? followups : DEFAULT_FOLLOWUPS;
  } catch { return DEFAULT_FOLLOWUPS; }
}
export function enqueueCampaignDispatches(db: DatabaseSync, input: EnqueueCampaignInput): { queued: number; skipped: number } {
  const campaign = db.prepare("SELECT sequence_id,delay_seconds FROM email_campaigns WHERE id=?").get(input.campaignId) as any;
  if (!campaign) throw new Error("Campaign not found");
  const uniqueLeadIds = [...new Set(input.leadIds.map(String).filter(Boolean))];
  const insert = db.prepare(`INSERT INTO email_dispatch_jobs(id,campaign_id,lead_id,recipient_email,subject,body,body_html,smtp_account_id,sequence_id,sequence_number,scheduled_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending') ON CONFLICT(campaign_id,lead_id,sequence_number) DO NOTHING`);
  const delaySeconds = Math.max(0, Math.min(3600, Number(input.delaySeconds ?? campaign.delay_seconds ?? 60)));
  const followups = input.scheduleFollowups ? sequenceFollowups(db, campaign.sequence_id || null) : [];
  let queued = 0, skipped = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < uniqueLeadIds.length; index += 1) {
      const leadId = uniqueLeadIds[index];
      const lead = db.prepare("SELECT email,status FROM leads WHERE id=?").get(leadId) as any;
      const email = String(lead?.email || "").trim().toLowerCase();
      const suppressed = email ? db.prepare("SELECT 1 FROM email_suppression WHERE LOWER(email)=LOWER(?) LIMIT 1").get(email) : null;
      if (!lead || !isValidEmail(email) || suppressed || ["unsubscribed", "bounced", "invalid_email", "closed_lost"].includes(String(lead.status))) { skipped += 1; continue; }
      const firstAt = new Date(Date.now() + index * delaySeconds * 1000).toISOString();
      const result = insert.run(uuidv4(), input.campaignId, leadId, email, input.subject, input.body, input.bodyHtml || null, input.smtpAccountId || null, campaign.sequence_id || null, 1, firstAt);
      queued += Number(result.changes || 0);
      for (let followupIndex = 0; followupIndex < followups.length; followupIndex += 1) {
        const followup = followups[followupIndex];
        insert.run(uuidv4(), input.campaignId, leadId, email, followup.subject, followup.body, followup.bodyHtml || null, input.smtpAccountId || null, campaign.sequence_id || null, followupIndex + 2, new Date(Date.now() + followup.days * 86_400_000).toISOString());
      }
    }
    db.prepare(`UPDATE email_campaigns SET status='queued',subject=?,body=?,body_html=?,scheduled_at=datetime('now'),started_at=COALESCE(started_at,datetime('now')),updated_at=datetime('now') WHERE id=?`).run(input.subject, input.body, input.bodyHtml || null, input.campaignId);
    db.exec("COMMIT"); return { queued, skipped };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function enqueueManualDispatch(db: DatabaseSync, input: { leadId: string; subject: string; body: string; bodyHtml?: string | null; smtpAccountId?: string | null; name?: string }): { campaignId: string; queued: number } {
  const campaignId = uuidv4();
  db.prepare(`INSERT INTO email_campaigns(id,name,description,status,daily_limit,delay_seconds,sender_strategy,sender_id,subject,body,body_html) VALUES(?,?,?,'draft',1,0,'fixed',?,?,?,?)`)
    .run(campaignId, input.name || "Manual outreach", "One-off outreach queued through the guarded delivery system", input.smtpAccountId || null, input.subject, input.body, input.bodyHtml || null);
  const result = enqueueCampaignDispatches(db, { campaignId, leadIds: [input.leadId], subject: input.subject, body: input.body, bodyHtml: input.bodyHtml, smtpAccountId: input.smtpAccountId, delaySeconds: 0 });
  if (!result.queued) {
    db.prepare("DELETE FROM email_campaigns WHERE id=?").run(campaignId);
    throw new Error("Lead is missing a valid deliverable email or is suppressed");
  }
  return { campaignId, queued: result.queued };
}
export function enqueueLegacyCampaignDispatches(db: DatabaseSync, input: { legacyCampaignId: string; emailCampaignId: string; smtpAccountId: string }): { queued: number } {
  const recipients = db.prepare(`SELECT id,lead_id,step_number,subject,body,body_html,COALESCE(next_attempt_at,datetime('now')) scheduled_at FROM emails_sent WHERE campaign_id=? AND status IN ('pending','queued') AND lead_id IS NOT NULL`).all(input.legacyCampaignId) as any[];
  const insert = db.prepare(`INSERT INTO email_dispatch_jobs(id,campaign_id,lead_id,recipient_email,subject,body,body_html,smtp_account_id,sequence_number,scheduled_at,status) SELECT ?,?,?,?,?,?,?,?,?,?,'pending' WHERE EXISTS(SELECT 1 FROM leads WHERE id=? AND TRIM(COALESCE(email,''))<>'') ON CONFLICT(campaign_id,lead_id,sequence_number) DO NOTHING`);
  let queued = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const recipient of recipients) {
      const lead = db.prepare("SELECT email FROM leads WHERE id=?").get(recipient.lead_id) as any;
      const result = insert.run(recipient.id, input.emailCampaignId, recipient.lead_id, String(lead?.email || "").trim().toLowerCase(), recipient.subject, recipient.body, recipient.body_html || null, input.smtpAccountId, Number(recipient.step_number || 1), recipient.scheduled_at, recipient.lead_id);
      if (result.changes) queued += 1;
      if (result.changes || db.prepare("SELECT 1 FROM email_dispatch_jobs WHERE id=?").get(recipient.id)) db.prepare("UPDATE emails_sent SET status='queued',last_attempt_at=datetime('now') WHERE id=?").run(recipient.id);
    }
    db.prepare("UPDATE email_campaigns SET status='queued',sender_id=?,started_at=COALESCE(started_at,datetime('now')),updated_at=datetime('now') WHERE id=?").run(input.smtpAccountId, input.emailCampaignId);
    db.prepare("UPDATE campaigns SET status='queued',last_run_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(input.legacyCampaignId);
    db.exec("COMMIT");
    return { queued };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function syncLegacyRecipient(db: DatabaseSync, job: DispatchJob, status: 'sent' | 'queued' | 'bounced', errorMessage?: string): void {
  const exists = db.prepare("SELECT 1 FROM emails_sent WHERE id=?").get(job.id);
  if (!exists) return;
  if (status === 'sent') db.prepare("UPDATE emails_sent SET status='sent',sent_at=datetime('now'),attempt_count=?,last_attempt_at=datetime('now'),error_message=NULL WHERE id=?").run(job.attempt_count, job.id);
  else if (status === 'queued') db.prepare("UPDATE emails_sent SET status='queued',attempt_count=?,last_attempt_at=datetime('now'),error_message=? WHERE id=?").run(job.attempt_count, errorMessage || null, job.id);
  else db.prepare("UPDATE emails_sent SET status='bounced',bounced_at=datetime('now'),attempt_count=?,last_attempt_at=datetime('now'),error_message=? WHERE id=?").run(job.attempt_count, errorMessage || null, job.id);
}
export function claimNextDispatch(db: DatabaseSync): DispatchJob | null {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`UPDATE email_dispatch_jobs SET status='pending',claimed_at=NULL,error_message='Recovered stale worker claim' WHERE status='processing' AND datetime(claimed_at) < datetime('now','-10 minutes')`).run();
    const candidate = db.prepare(`SELECT * FROM email_dispatch_jobs WHERE status='pending' AND datetime(scheduled_at)<=datetime('now') ORDER BY datetime(scheduled_at),created_at LIMIT 1`).get() as DispatchJob | undefined;
    if (!candidate) { db.exec("COMMIT"); return null; }
    const claimed = db.prepare(`UPDATE email_dispatch_jobs SET status='processing',claimed_at=datetime('now'),attempt_count=attempt_count+1 WHERE id=? AND status='pending'`).run(candidate.id);
    db.exec("COMMIT");
    return claimed.changes ? db.prepare("SELECT * FROM email_dispatch_jobs WHERE id=?").get(candidate.id) as unknown as DispatchJob : null;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
function nextDayIso(): string { const date = new Date(); date.setUTCDate(date.getUTCDate() + 1); date.setUTCHours(0, 5, 0, 0); return date.toISOString(); }
function refreshCampaignStatus(db: DatabaseSync, campaignId: string): void {
  const counts = db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status IN ('pending','processing') THEN 1 ELSE 0 END) active FROM email_dispatch_jobs WHERE campaign_id=?`).get(campaignId) as any;
  if (!Number(counts?.total || 0)) return;
  if (Number(counts?.active || 0) === 0) db.prepare("UPDATE email_campaigns SET status='complete',completed_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(campaignId);
  else db.prepare("UPDATE email_campaigns SET status='sending',updated_at=datetime('now') WHERE id=? AND status NOT IN ('cancelled','archived')").run(campaignId);
}
export async function processTenantDispatchQueue(maxJobs = 25): Promise<number> {
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") return 0;
  const db = getDb(); let processed = 0;
  while (processed < maxJobs) {
    const job = claimNextDispatch(db); if (!job) break;
    try {
      const result = await guardedSend({ campaignId: job.campaign_id, leadId: job.lead_id, subject: job.subject, body: job.body, bodyHtml: job.body_html, sequenceNumber: job.sequence_number, smtpAccountId: job.smtp_account_id, idempotencyKey: job.id });
      db.prepare("UPDATE email_dispatch_jobs SET status='sent',sent_at=datetime('now'),tracking_id=?,error_message=NULL WHERE id=?").run(result.trackingId, job.id);
      syncLegacyRecipient(db, job, 'sent');
    } catch (error) {
      const deliveryError = error instanceof DeliveryError ? error : new DeliveryError(error instanceof Error ? error.message : "Dispatch failed");
      const terminal = deliveryError.permanent || job.attempt_count >= 3;
      if (terminal) {
        db.prepare("UPDATE email_dispatch_jobs SET status=?,error_message=? WHERE id=?").run(deliveryError.permanent ? "skipped" : "failed", deliveryError.message.slice(0, 500), job.id);
        syncLegacyRecipient(db, job, "bounced", deliveryError.message);
      }
      else {
        const retryAt = ["SENDER_DAILY_LIMIT", "CAMPAIGN_DAILY_LIMIT"].includes(deliveryError.code) ? nextDayIso() : new Date(Date.now() + Math.min(60, 5 * 2 ** Math.max(0, job.attempt_count - 1)) * 60_000).toISOString();
        db.prepare("UPDATE email_dispatch_jobs SET status='pending',scheduled_at=?,claimed_at=NULL,error_message=? WHERE id=?").run(retryAt, deliveryError.message.slice(0, 500), job.id);
        syncLegacyRecipient(db, job, 'queued', deliveryError.message);
      }
    }
    refreshCampaignStatus(db, job.campaign_id); processed += 1;
  }
  return processed;
}
let interval: ReturnType<typeof setInterval> | null = null; let running = false;
async function processAllTenants(): Promise<void> {
  if (running || process.env.OUTBOUND_EMAIL_ENABLED !== "true") return; running = true;
  try {
    const tenants = getMainDb().prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
    for (const tenant of tenants) await tenantLocalStorage.run({ tenantId: tenant.id }, () => processTenantDispatchQueue());
  } finally { running = false; }
}
export function startEmailDispatchWorker(): void {
  if (interval) return;
  void processAllTenants().catch((error) => console.error("[email-dispatch] Initial run failed", error));
  interval = setInterval(() => { void processAllTenants().catch((error) => console.error("[email-dispatch] Worker run failed", error)); }, 15_000);
  interval.unref?.();
}
export function stopEmailDispatchWorker(): void { if (interval) clearInterval(interval); interval = null; }