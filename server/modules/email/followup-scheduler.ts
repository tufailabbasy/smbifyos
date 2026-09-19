import { getDb, tenantLocalStorage } from "../../db/database.js";
import { getMainDb } from "../../db/mainDb.js";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import tls from "node:tls";
import { decryptCredential } from "../../utils/encryption.js";
import { appBaseUrl, publicToken } from "../../utils/publicLinks.js";

/**
 * Email Follow-up Scheduler
 * Runs every hour and sends due follow-up emails from the queue
 */

interface SmtpAccount {
  id: string;
  username: string;
  password: string;
  host: string;
  port: number;
  secure: number;
  from_name: string;
  from_email: string;
}

interface QueueItem {
  id: string;
  lead_id: string;
  campaign_id: string;
  sequence_id: string | null;
  sequence_number: number;
  recipient_email: string;
  scheduled_at: string;
}

const FOLLOWUP_TEMPLATES: Record<number, { subject: string; body: string }> = {
  2: {
    subject: "Following up — quick GMB checklist for {business_name}",
    body: `Hey {business_name} team,

Just following up on my earlier email about your Google Business Profile.

Here are three profile checks that are useful for most local businesses:

1. Add recent, accurate photos that represent current services and completed work
2. Reply to recent reviews with specific, helpful responses
3. Confirm that hours, phone number, services, and service area are accurate

These checks reduce customer confusion and strengthen the information available to searchers.

If useful, I can run an evidence-based audit and label every item as measured or not checked.

Regards,
Tufi
SMBify Team`,
  },
  3: {
    subject: "Last note from SMBify — {business_name}",
    body: `Hey {business_name} team,

I know inboxes get busy, so this will be my last email.

If you want an evidence-based review of your website and business profile later, reply and I will outline what can be checked.

If you want an evidence-based review of your Google Business Profile, reply and I will confirm the scope and delivery timing.

Wishing you a great week ahead!

Regards,
Tufi
SMBify Team`,
  },
};

async function processFollowupQueue() {
  const db = getDb();
  const dueItems = db.prepare(`
    SELECT * FROM email_followup_queue
    WHERE status = 'pending' AND datetime(scheduled_at) <= datetime('now')
    ORDER BY datetime(scheduled_at) ASC LIMIT 100
  `).all() as unknown as QueueItem[];
  if (!dueItems.length) return;

  let migrated = 0;
  let skipped = 0;
  for (const item of dueItems) {
    const lead = db.prepare("SELECT email,status,business_name,city,niche FROM leads WHERE id=?").get(item.lead_id) as any;
    const email = String(lead?.email || item.recipient_email || "").trim().toLowerCase();
    const suppressed = email ? db.prepare("SELECT 1 FROM email_suppression WHERE LOWER(email)=LOWER(?) LIMIT 1").get(email) : null;
    const replied = db.prepare("SELECT 1 FROM email_tracking WHERE lead_id=? AND replied=1 LIMIT 1").get(item.lead_id);
    if (!lead || !email || suppressed || replied || ["unsubscribed", "bounced", "invalid_email", "closed_lost"].includes(String(lead.status))) {
      db.prepare("UPDATE email_followup_queue SET status='skipped',sent_at=datetime('now') WHERE id=?").run(item.id);
      skipped += 1;
      continue;
    }

    let subject = FOLLOWUP_TEMPLATES[item.sequence_number]?.subject || "Following up — {business_name}";
    let body = FOLLOWUP_TEMPLATES[item.sequence_number]?.body || "Hi {business_name} team,\n\nJust following up on my earlier message.\n\nRegards,\nSMBify Team";
    if (item.sequence_id) {
      const sequence = db.prepare("SELECT steps_json FROM email_sequences WHERE id=?").get(item.sequence_id) as any;
      try {
        const step = sequence ? JSON.parse(sequence.steps_json || "[]")[item.sequence_number - 1] : null;
        if (step?.subject && step?.body) { subject = String(step.subject); body = String(step.body); }
      } catch { /* use the evidence-safe default */ }
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      const result = db.prepare(`
        INSERT INTO email_dispatch_jobs(id,campaign_id,lead_id,recipient_email,subject,body,body_html,smtp_account_id,sequence_id,sequence_number,scheduled_at,status)
        VALUES(?,?,?,?,?,?,NULL,NULL,?,?,?,'pending')
        ON CONFLICT(campaign_id,lead_id,sequence_number) DO NOTHING
      `).run(item.id, item.campaign_id, item.lead_id, email, subject, body, item.sequence_id, item.sequence_number, item.scheduled_at);
      db.prepare("UPDATE email_followup_queue SET status=? WHERE id=?").run(result.changes ? "migrated" : "skipped", item.id);
      db.exec("COMMIT");
      if (result.changes) migrated += 1; else skipped += 1;
    } catch (error) {
      db.exec("ROLLBACK");
      console.error(`[followup-scheduler] Failed to migrate follow-up ${item.id}`, error);
    }
  }
  console.log(`[followup-scheduler] Migrated ${migrated} follow-ups to durable dispatch; skipped ${skipped}.`);
}
function getImapHost(smtpHost: string): string {
  const host = smtpHost.toLowerCase().trim();
  if (host === 'smtp.gmail.com') return 'imap.gmail.com';
  if (host === 'smtp.office365.com') return 'outlook.office365.com';
  if (host.startsWith('smtp.')) {
    return host.replace('smtp.', 'imap.');
  }
  return 'imap.' + host;
}

export async function syncBounces(): Promise<void> {
  const db = getDb();
  try {
    const smtpAccounts = db.prepare("SELECT * FROM smtp_accounts WHERE is_active = 1").all() as unknown as SmtpAccount[];
    if (!smtpAccounts.length) return;

    console.log(`[bounce-sync] Running bounce check for ${smtpAccounts.length} active SMTP senders...`);

    for (const acc of smtpAccounts) {
      const imapHost = getImapHost(acc.host);
      try {
        const bouncedEmails = await checkInboxForBounces(imapHost, acc.username, decryptCredential(acc.password));
        if (bouncedEmails.length > 0) {
          db.exec("BEGIN");
          let addedCount = 0;
          for (const bEmail of bouncedEmails) {
            const clean = bEmail.toLowerCase().trim();
            const suppressed = db.prepare("SELECT id FROM email_suppression WHERE email = ?").get(clean);
            if (!suppressed) {
              db.prepare(`
                INSERT INTO email_suppression (id, email, reason, campaign_id, notes, created_at)
                VALUES (?, ?, 'bounced', NULL, 'IMAP auto-detected bounce', datetime('now'))
              `).run(uuidv4(), clean);
              addedCount++;
            }
            db.prepare("UPDATE leads SET status = 'bounced', bounced_at = datetime('now'), updated_at = datetime('now') WHERE LOWER(email) = ?").run(clean);
            db.prepare("UPDATE email_tracking SET bounced = 1, bounce_reason = 'Undelivered Mail Returned to Sender' WHERE LOWER(recipient_email) = ?").run(clean);

            const tracking = db.prepare("SELECT campaign_id, lead_id FROM email_tracking WHERE LOWER(recipient_email) = ? LIMIT 1").get(clean) as any;
            if (tracking) {
              db.prepare("UPDATE email_campaigns SET total_bounced = total_bounced + 1 WHERE id = ?").run(tracking.campaign_id);
              db.prepare(`
                INSERT INTO lead_activities (id, lead_id, activity_type, message, metadata_json, created_at)
                VALUES (?, ?, 'email_bounced', 'Outreach email bounced back', ?, datetime('now'))
              `).run(uuidv4(), tracking.lead_id, JSON.stringify({ sender_email: acc.from_email }));
            }
          }
          db.exec("COMMIT");
          if (addedCount > 0) {
            console.log(`[bounce-sync] ✓ Synced ${addedCount} new bounces for ${acc.from_email}`);
          }
        }
      } catch (err: any) {
        console.error(`[bounce-sync] Failed check for ${acc.from_email}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`[bounce-sync] Fatal error:`, err.message);
  }
}

function checkInboxForBounces(imapHost: string, username: string, password: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(993, imapHost, {}, () => {});
    socket.setEncoding("utf8");

    let buffer = "";
    let step = 0;
    const bounceEmails: string[] = [];

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("IMAP connection timed out"));
    }, 15000);

    socket.on("data", (data) => {
      buffer += data;
      if (buffer.includes("\r\n")) {
        if (step === 0 && buffer.includes("* OK")) {
          step = 1; buffer = "";
          socket.write(`A1 LOGIN "${username}" "${password}"\r\n`);
        } else if (step === 1 && buffer.includes("A1 OK")) {
          step = 2; buffer = "";
          socket.write(`A2 SELECT INBOX\r\n`);
        } else if (step === 2 && buffer.includes("A2 OK")) {
          step = 3; buffer = "";
          socket.write(`A3 SEARCH SUBJECT "Undelivered Mail"\r\n`);
        } else if (step === 3 && buffer.includes("A3 OK")) {
          const match = buffer.match(/\* SEARCH ([\d\s]+)/);
          const ids = match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
          if (ids.length > 0) {
            step = 4; buffer = "";
            socket.write(`A4 FETCH ${ids.join(",")} BODY[TEXT]\r\n`);
          } else {
            step = 5; buffer = "";
            socket.write(`A5 LOGOUT\r\n`);
          }
        } else if (step === 4 && buffer.includes("A4 OK")) {
          const finalRecipientRegex = /Final-Recipient:\s*rfc822;\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
          const matches = [...buffer.matchAll(finalRecipientRegex)];
          for (const m of matches) {
            const parsedEmail = m[1].toLowerCase().trim();
            if (!bounceEmails.includes(parsedEmail)) bounceEmails.push(parsedEmail);
          }

          const fallbackRegex = /<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>:\s*host/gi;
          const fallbackMatches = [...buffer.matchAll(fallbackRegex)];
          for (const m of fallbackMatches) {
            const parsedEmail = m[1].toLowerCase().trim();
            if (!bounceEmails.includes(parsedEmail)) bounceEmails.push(parsedEmail);
          }

          step = 5; buffer = "";
          socket.write(`A5 LOGOUT\r\n`);
        } else if (step === 5 && buffer.includes("A5 OK")) {
          socket.end();
        }
      }
    });

    socket.on("end", () => {
      clearTimeout(timeout);
      resolve(bounceEmails);
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function processAllTenantQueues() {
  const tenants = getMainDb().prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
  for (const tenant of tenants) await tenantLocalStorage.run({ tenantId: tenant.id }, () => processFollowupQueue());
}

async function syncAllTenantBounces() {
  const tenants = getMainDb().prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
  for (const tenant of tenants) await tenantLocalStorage.run({ tenantId: tenant.id }, () => syncBounces());
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let bounceInterval: ReturnType<typeof setInterval> | null = null;

export function startEmailFollowupScheduler() {
  if (schedulerInterval) return;
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") {
    console.log("[followup-scheduler] Paused — OUTBOUND_EMAIL_ENABLED is not true");
    return;
  }

  console.log("[followup-scheduler] Started — checking queue every 60 minutes");

  // Run followups immediately on startup (after 30s delay)
  setTimeout(() => {
    processAllTenantQueues().catch(console.error);
  }, 30_000);

  // Run bounce check immediately on startup (after 45s delay)
  setTimeout(() => {
    syncAllTenantBounces().catch(console.error);
  }, 45_000);

  // Followups every 60 minutes
  schedulerInterval = setInterval(() => {
    processAllTenantQueues().catch(console.error);
  }, 60 * 60 * 1000);

  // Bounce check every 30 minutes
  bounceInterval = setInterval(() => {
    syncAllTenantBounces().catch(console.error);
  }, 30 * 60 * 1000);
}

export function stopEmailFollowupScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (bounceInterval) {
    clearInterval(bounceInterval);
    bounceInterval = null;
  }
}
