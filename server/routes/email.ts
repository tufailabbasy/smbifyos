import { Router } from "express";
import { getDb } from "../db/database.js";
import { v4 as uuidv4 } from "uuid";
import nodemailer from "nodemailer";
import dns from "node:dns";
import net from "node:net";
import { syncBounces } from "../modules/email/followup-scheduler.js";
import { decryptCredential } from "../utils/encryption.js";
import { publicRateLimiter } from "../utils/rateLimiter.js";
import { appBaseUrl, publicTenant, publicToken } from "../utils/publicLinks.js";
import { syncLegacyCampaigns } from "../modules/email/campaignBridge.js";
import { checkCampaignLimit } from "../utils/limitsMiddleware.js";
import { enqueueCampaignDispatches, enqueueManualDispatch, processTenantDispatchQueue } from "../modules/email/dispatchQueue.js";

export const emailRouter = Router();

try {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
} catch (e: any) {
  console.error("[email-dns-setup] Failed to set DNS servers:", e.message);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SmtpAccount {
  id: string;
  username: string;
  password: string;
  host: string;
  port: number;
  secure: number;
  from_name: string;
  from_email: string;
  is_active: number;
  daily_limit?: number;
}

interface EmailCampaign {
  id: string;
  name: string;
  status: string;
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_unsubscribed: number;
  niche?: string;
  city?: string;
  sequence_id?: string;
  delay_seconds?: number;
}

// ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

emailRouter.get("/dashboard", (req, res) => {
  try {
    const db = getDb();

    const totalSent = (db.prepare("SELECT COUNT(*) as c FROM email_tracking WHERE status = 'sent'").get() as any).c || 0;
    const totalOpened = (db.prepare("SELECT COUNT(*) as c FROM email_tracking WHERE open_count > 0").get() as any).c || 0;
    const totalClicked = (db.prepare("SELECT COUNT(*) as c FROM email_tracking WHERE click_count > 0").get() as any).c || 0;
    const totalBounced = (db.prepare("SELECT COUNT(*) as c FROM email_tracking WHERE bounced = 1").get() as any).c || 0;
    const totalSuppressed = (db.prepare("SELECT COUNT(*) as c FROM email_suppression").get() as any).c || 0;
    const totalUnsubscribed = (db.prepare("SELECT COUNT(*) as c FROM email_suppression WHERE reason = 'unsubscribed'").get() as any).c || 0;

    const openRate = totalSent > 0 ? Number(((totalOpened / totalSent) * 100).toFixed(1)) : 0;
    const clickRate = totalSent > 0 ? Number(((totalClicked / totalSent) * 100).toFixed(1)) : 0;
    const bounceRate = totalSent > 0 ? Number(((totalBounced / totalSent) * 100).toFixed(1)) : 0;

    // Recent campaigns
    const campaigns = db.prepare(`
      SELECT id, name, status, 
             total_sent as sent, 
             total_opened as opens, 
             total_clicked as clicks, 
             total_bounced as bounced, 
             created_at
      FROM email_campaigns ORDER BY created_at DESC LIMIT 10
    `).all();

    // Recent tracking activity
    const recentActivity = db.prepare(`
      SELECT et.*, l.business_name
      FROM email_tracking et
      LEFT JOIN leads l ON l.id = et.lead_id
      ORDER BY et.sent_at DESC LIMIT 20
    `).all();

    // Sender account health
    const senders = db.prepare(`
      SELECT id, from_email, from_name, is_active,
        (SELECT COUNT(*) FROM email_tracking WHERE sender_email = smtp_accounts.from_email 
         AND date(sent_at) = date('now') AND status = 'sent') as sent_today
      FROM smtp_accounts WHERE is_active = 1
    `).all();

    res.json({
      stats: { totalSent, totalOpened, totalClicked, totalBounced, totalSuppressed, totalUnsubscribed, openRate, clickRate, bounceRate },
      campaigns,
      recentActivity,
      senders,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── SENDERS ─────────────────────────────────────────────────────────────────
emailRouter.get("/senders", (req, res) => {
  try {
    const db = getDb();
    const senders = db.prepare(`
      SELECT id, username, host, port, secure, from_name, from_email, is_active, daily_limit, created_at,
        (SELECT COUNT(*) FROM email_tracking WHERE sender_email = smtp_accounts.from_email 
         AND date(sent_at) = date('now') AND status = 'sent') as sent_today
      FROM smtp_accounts
      ORDER BY is_active DESC, created_at DESC
    `).all();
    res.json({ items: senders });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── CAMPAIGNS ───────────────────────────────────────────────────────────────

emailRouter.get("/campaigns", (req, res) => {
  syncLegacyCampaigns();
  try {
    const db = getDb();
    const campaigns = db.prepare(`
      SELECT c.*, 
        c.total_sent as sent,
        c.total_opened as opens,
        c.total_clicked as clicks,
        c.total_bounced as bounced,
        sa.from_name as sender_from_name,
        sa.from_email as sender_from_email,
        (SELECT COUNT(*) FROM email_tracking WHERE campaign_id = c.id AND status = 'sent') as emails_tracked,
        (SELECT COUNT(*) FROM email_followup_queue WHERE campaign_id = c.id AND status = 'pending') as pending_followups
      FROM email_campaigns c
      LEFT JOIN smtp_accounts sa ON sa.id = c.sender_id
      ORDER BY c.created_at DESC
    `).all();
    res.json({ items: campaigns });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

emailRouter.post("/campaigns", checkCampaignLimit, (req, res) => {
  try {
    const db = getDb();
    const { name, description, niche, city, sequence_id, daily_limit, delay_seconds, sender_strategy, sender_id } = req.body;
    if (!name) return res.status(400).json({ error: "Campaign name required" });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO email_campaigns (id, name, description, niche, city, sequence_id, daily_limit, delay_seconds, sender_strategy, sender_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(id, name, description || null, niche || null, city || null, sequence_id || null, daily_limit || 200, delay_seconds || 60, sender_strategy || "round_robin", sender_id || null);

    const campaign = db.prepare("SELECT * FROM email_campaigns WHERE id = ?").get(id);
    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

emailRouter.delete("/campaigns/:id", (req, res) => {
  try {
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM email_dispatch_jobs WHERE campaign_id=? AND status NOT IN ('sent')").run(req.params.id);
      db.prepare("UPDATE email_followup_queue SET status='skipped' WHERE campaign_id=? AND status='pending'").run(req.params.id);
      db.prepare("DELETE FROM email_campaigns WHERE id = ?").run(req.params.id);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET campaign detail with tracking
emailRouter.get("/campaigns/:id", (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare(`
      SELECT *, 
        total_sent as sent, 
        total_opened as opens, 
        total_clicked as clicks, 
        total_bounced as bounced 
      FROM email_campaigns WHERE id = ?
    `).get(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Not found" });

    const tracking = db.prepare(`
      SELECT et.*, l.business_name, l.city
      FROM email_tracking et
      LEFT JOIN leads l ON l.id = et.lead_id
      WHERE et.campaign_id = ?
      ORDER BY et.sent_at DESC LIMIT 100
    `).all(req.params.id);

    res.json({ campaign, tracking });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

interface VerificationResult {
  valid: boolean;
  reason: string;
}

export async function verifyEmailHelper(email: string): Promise<VerificationResult> {
  const parts = email.split('@');
  if (parts.length !== 2) return { valid: false, reason: 'Invalid format' };
  
  const domain = parts[1].toLowerCase().trim();

  // 1. Resolve MX records
  let mxRecords;
  try {
    mxRecords = await dns.promises.resolveMx(domain);
  } catch (err: any) {
    return { valid: false, reason: `No MX records: ${err.message}` };
  }

  if (!mxRecords || mxRecords.length === 0) {
    return { valid: false, reason: 'No MX records' };
  }

  // Sort MX records by priority
  mxRecords.sort((a, b) => a.priority - b.priority);
  const mxHost = mxRecords[0].exchange;

  // 2. SMTP Handshake Check
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    socket.setTimeout(6000);
    socket.setEncoding('utf8');

    let step = 0;
    let resolved = false;

    const finish = (valid: boolean, reason: string) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ valid, reason });
    };

    socket.on('connect', () => {
      // socket connected
    });

    socket.on('data', (data) => {
      const dataStr = data.toString();
      const code = parseInt(dataStr.substring(0, 3));

      if (step === 0 && code === 220) {
        socket.write('HELO smbify.email\r\n');
        step = 1;
      } else if (step === 1 && code === 250) {
        socket.write('MAIL FROM:<Tufi@smbify.email>\r\n');
        step = 2;
      } else if (step === 2 && code === 250) {
        socket.write(`RCPT TO:<${email}>\r\n`);
        step = 3;
      } else if (step === 3) {
        if (code === 250) {
          finish(true, 'SMTP account exists');
        } else if (code >= 500) {
          finish(false, `SMTP server rejected recipient: ${dataStr.trim()}`);
        } else {
          finish(true, `SMTP server responded with code ${code}`);
        }
      }
    });

    socket.on('timeout', () => {
      finish(true, 'SMTP timeout (MX verified)');
    });

    socket.on('error', (err) => {
      finish(true, `SMTP connection failed: ${err.message} (MX verified)`);
    });

    socket.on('end', () => {
      finish(true, 'SMTP socket ended (MX verified)');
    });
  });
}

// ─── VERIFY LEADS ────────────────────────────────────────────────────────────

emailRouter.post("/campaigns/:id/verify", async (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare("SELECT * FROM email_campaigns WHERE id = ?").get(req.params.id) as EmailCampaign | undefined;
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Fetch leads to verify
    let query = "SELECT * FROM leads WHERE status = 'new'";
    const params: any[] = [];
    if (campaign.niche) {
      query += " AND niche = ?";
      params.push(campaign.niche);
    }
    if (campaign.city) {
      query += " AND city = ?";
      params.push(campaign.city);
    }
    const leads = db.prepare(query).all(...params) as any[];

    if (leads.length === 0) {
      return res.json({ ok: true, message: "No new leads to verify." });
    }

    // Set campaign status to verifying
    db.prepare("UPDATE email_campaigns SET status = 'verifying', updated_at = datetime('now') WHERE id = ?").run(campaign.id);

    res.json({ ok: true, message: `Verifying ${leads.length} leads in the background...` });

    // Run verification in background
    setImmediate(async () => {
      console.log(`[verifier] Starting bulk verification for ${leads.length} leads...`);
      let validCount = 0;
      let invalidCount = 0;

      for (const lead of leads) {
        if (!lead.email) {
          db.prepare("UPDATE leads SET status = 'invalid_email', updated_at = datetime('now') WHERE id = ?").run(lead.id);
          invalidCount++;
          continue;
        }

        const cleanEmail = lead.email.toLowerCase().trim();
        const verification = await verifyEmailHelper(cleanEmail);
        
        if (verification.valid) {
          validCount++;
        } else {
          db.prepare("UPDATE leads SET status = 'invalid_email', updated_at = datetime('now') WHERE id = ?").run(lead.id);
          db.prepare(`
            INSERT OR IGNORE INTO email_suppression (id, email, reason, campaign_id, notes, created_at)
            VALUES (?, ?, 'bounced', ?, ?, datetime('now'))
          `).run(uuidv4(), cleanEmail, campaign.id, `Verification failed: ${verification.reason}`);
          invalidCount++;
        }
      }

      // Reset campaign status back to draft
      db.prepare("UPDATE email_campaigns SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(campaign.id);
      console.log(`[verifier] Bulk verification completed. Valid: ${validCount}, Invalid: ${invalidCount}`);
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SEND CAMPAIGN ────────────────────────────────────────────────────────────

emailRouter.post("/campaigns/:id/send", async (req, res) => {
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") {
    return res.status(409).json({ error: "Outbound email is paused until public hosting and sender verification are configured." });
  }
  try {
    const db = getDb();
    const campaign = db.prepare("SELECT * FROM email_campaigns WHERE id = ?").get(req.params.id) as EmailCampaign | undefined;
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    if (["cancelled", "archived"].includes(String(campaign.status))) return res.status(409).json({ error: "Campaign is not active" });

    const subject = String(req.body?.subject || "").trim();
    const body = String(req.body?.body || "").trim();
    const bodyHtml = req.body?.body_html ? String(req.body.body_html) : null;
    if (!subject || !body) return res.status(400).json({ error: "Subject and body required" });

    const smtpAccounts = db.prepare("SELECT id FROM smtp_accounts WHERE is_active = 1 ORDER BY created_at").all() as Array<{ id: string }>;
    if (!smtpAccounts.length) return res.status(400).json({ error: "No active SMTP accounts" });
    const requestedSenderId = String(req.body?.sender_id || (campaign as any).sender_id || "").trim();
    const senderId = requestedSenderId && requestedSenderId !== "auto" ? requestedSenderId : null;
    if (senderId && !smtpAccounts.some((account) => account.id === senderId)) {
      return res.status(400).json({ error: "Selected SMTP account is missing or inactive" });
    }

    let leadIds = Array.isArray(req.body?.leads) ? req.body.leads.map(String) : [];
    if (!leadIds.length) {
      let query = "SELECT id FROM leads WHERE status IN ('new','verified')";
      const params: string[] = [];
      if (campaign.niche) { query += " AND niche = ?"; params.push(campaign.niche); }
      if (campaign.city) { query += " AND city = ?"; params.push(campaign.city); }
      leadIds = (db.prepare(query).all(...params) as Array<{ id: string }>).map((row) => row.id);
    }
    if (!leadIds.length) return res.status(400).json({ error: "No eligible leads found for this campaign." });

    const result = enqueueCampaignDispatches(db, {
      campaignId: campaign.id,
      leadIds,
      subject,
      body,
      bodyHtml,
      smtpAccountId: senderId,
      scheduleFollowups: Boolean(req.body?.schedule_followups),
      delaySeconds: Number((campaign as any).delay_seconds || 60),
    });
    if (!result.queued) {
      return res.status(409).json({ error: "No new eligible recipients were queued.", skipped: result.skipped });
    }

    void processTenantDispatchQueue().catch((error) => console.error(`[email-dispatch] Campaign ${campaign.id} start failed`, error));
    return res.status(202).json({ ok: true, queued: result.queued, skipped: result.skipped, message: `${result.queued} recipients queued for durable delivery.` });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to queue campaign" });
  }
});
// ─── SEQUENCES ────────────────────────────────────────────────────────────────

function seedSequencesIfEmpty(db: any) {
  const count = (db.prepare("SELECT COUNT(*) as c FROM email_sequences").get() as any)?.c || 0;
  if (count > 0) return;

  const defaults = [
    {
      id: uuidv4(),
      name: "Google Business Profile Unclaimed Alert",
      niche: "Local Services",
      description: "Warns business owners about their unclaimed or unverified Google Maps listing and offers a free 1-click claim fix.",
      steps: [
        {
          step_number: 1,
          delay_days: 0,
          subject: "Urgent: {{business_name}} Google Maps listing is currently unclaimed",
          body: "Hey {{business_name}} Team,\n\nI was looking up local businesses in {{city}} today and noticed something critical: your Google Business Profile appears to be unclaimed.\n\nWhen a listing is unclaimed, anyone can click 'Claim this business' and request ownership, which can lead to your phone number or business hours being altered by competitors.\n\nWe help local businesses in {{city}} secure and fully optimize their Google listings so you capture all local calls without risk.\n\nWould you like me to walk you through how to secure it in 5 minutes?\n\nRegards, Tufi\nSMBify Team"
        },
        {
          step_number: 2,
          delay_days: 3,
          subject: "Quick follow-up regarding {{business_name}}'s Google listing",
          body: "Hey {{business_name}} Team,\n\nJust wanted to make sure my previous note didn't get buried.\n\nIf the profile is unclaimed, the next step is to verify ownership and confirm that its public business details are accurate. I have not estimated traffic or call loss without analytics evidence.\n\nHappy to send over a quick screenshot walkthrough if you're interested.\n\nRegards, Tufi\nSMBify Team"
        },
        {
          step_number: 3,
          delay_days: 4,
          subject: "Last try / {{business_name}} Google Maps presence",
          body: "Hey there at {{business_name}},\n\nI don't want to clutter your inbox if this isn't a priority right now.\n\nIf you ever want help claiming or improving the accuracy of your Google Business Profile in {{city}}, feel free to reach out anytime.\n\nWishing you all the best with {{business_name}}!\n\nRegards, Tufi\nSMBify Team"
        }
      ]
    },
    {
      id: uuidv4(),
      name: "Local Website Speed & SEO Teardown",
      niche: "General",
      description: "Pitches website performance, mobile responsiveness, and SEO ranking fixes based on automated audit data.",
      steps: [
        {
          step_number: 1,
          delay_days: 0,
          subject: "Notice regarding {{business_name}}'s mobile website speed",
          body: "Hey {{business_name}} Team,\n\nI ran a quick performance audit on {{website}} and noticed a couple of technical bottlenecks that might be hurting your local Google ranking in {{city}}.\n\nThe report should only reference the speed, metadata, schema, and mobile findings that were measured during the live crawl.\n\nWe can provide a short report with the crawl evidence, affected pages, and prioritized fixes.\n\nWould you be open to seeing the report?\n\nRegards, Tufi\nSMBify Team"
        },
        {
          step_number: 2,
          delay_days: 3,
          subject: "3 quick fixes for {{website}}",
          body: "Hey {{business_name}} Team,\n\nFollowing up on my note from earlier this week. The audit can check image weight, LocalBusiness structured data, and mobile contact actions. I will only recommend these changes when the crawl evidence supports them.\n\nWould you like me to share our full audit breakdown?\n\nRegards, Tufi\nSMBify Team"
        },
        {
          step_number: 3,
          delay_days: 4,
          subject: "Closing the loop on {{business_name}}'s site",
          body: "Hey there at {{business_name}},\n\nAssuming you are all set on your web development side right now!\n\nIf you ever want a hand boosting {{website}}'s conversion rate or local SEO rankings in {{city}}, our door is always open.\n\nRegards, Tufi\nSMBify Team"
        }
      ]
    },
    {
      id: uuidv4(),
      name: "Customer Review Request and Response",
      niche: "Home Services & Healthcare",
      description: "Offers an automated customer review system for businesses with low review count or rating gaps.",
      steps: [
        {
          step_number: 1,
          delay_days: 0,
          subject: "Customer review growth for {{business_name}}",
          body: "Hey {{business_name}} Team,\n\nI was looking at {{city}} service providers and noticed {{business_name}} does solid work, but your Google review count doesn't reflect the true quality of your service compared to competitors.\n\nA compliant post-job request process can make it easier for real customers to leave honest feedback. Results depend on job volume and response rates.\n\nWould you be interested in a brief demo of how it works?\n\nRegards, Tufi\nSMBify Team"
        },
        {
          step_number: 2,
          delay_days: 3,
          subject: "Quick example for {{business_name}}",
          body: "Hey there at {{business_name}},\n\nJust following up. A review program should focus on recent, authentic customer feedback and timely owner responses; it cannot guarantee a map ranking.\n\nLet me know if you'd like to check out the workflow.\n\nRegards, Tufi\nSMBify Team"
        }
      ]
    },
    {
      id: uuidv4(),
      name: "No-Website Opportunity Pitch",
      niche: "Small Business",
      description: "Pitches modern mobile-first web design for local businesses operating without a website.",
      steps: [
        {
          step_number: 1,
          delay_days: 0,
          subject: "Website opportunity for {{business_name}} in {{city}}",
          body: "Hey {{business_name}} Team,\n\nI was searching for top {{city}} businesses and came across {{business_name}}. I noticed you don't currently have a live official website linked to your business listing.\n\nRight now, customers searching online for your services on Google have no way to view your pricing, read past testimonials, or book an appointment directly.\n\nWe build mobile-ready websites for local service businesses with clear service, trust, and contact information.\n\nCan I send over a preview mockup designed specifically for {{business_name}}?\n\nRegards, Tufi\nSMBify Team"
        },
        {
          step_number: 2,
          delay_days: 3,
          subject: "Design mockup idea for {{business_name}}",
          body: "Hey {{business_name}} Team,\n\nQuick follow-up — having a fast, clean website would also allow you to capture emergency weekend requests and direct phone calls from Google Ads and Maps.\n\nWould you be open to taking a look at a quick draft concept we put together for you?\n\nRegards, Tufi\nSMBify Team"
        },
        {
          step_number: 3,
          delay_days: 4,
          subject: "Last note regarding {{business_name}}",
          body: "Hey there at {{business_name}},\n\nI'll assume you have enough word-of-mouth business for now and don't need a website right away!\n\nIf you ever decide to launch an online presence to scale your {{city}} customer base, feel free to reach back out.\n\nRegards, Tufi\nSMBify Team"
        }
      ]
    }
  ];

  db.exec("BEGIN");
  try {
    const stmt = db.prepare(`
      INSERT INTO email_sequences (id, name, niche, description, steps_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    for (const seq of defaults) {
      stmt.run(seq.id, seq.name, seq.niche, seq.description, JSON.stringify(seq.steps));
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("[email] Failed to seed default sequences:", err);
  }
}

emailRouter.post("/quick-send", async (req, res) => {
  if (process.env.OUTBOUND_EMAIL_ENABLED !== "true") return res.status(409).json({ error: "Outbound email is paused until public hosting and sender verification are configured." });
  try {
    const db = getDb();
    const to = String(req.body?.to || "").trim().toLowerCase();
    const subject = String(req.body?.subject || "").trim();
    const body = String(req.body?.body || "").trim();
    const bodyHtml = req.body?.bodyHtml ? String(req.body.bodyHtml) : null;
    const leadId = String(req.body?.leadId || "").trim();
    const smtpAccountId = String(req.body?.smtpAccountId || "").trim() || null;
    if (!to || !subject || !body || !leadId) return res.status(400).json({ error: "Lead, recipient email, subject, and body are required." });

    const lead = db.prepare("SELECT id,email FROM leads WHERE id=?").get(leadId) as { id: string; email: string | null } | undefined;
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    if (String(lead.email || "").trim().toLowerCase() !== to) return res.status(400).json({ error: "Recipient must match the lead email. Update the lead before sending." });
    if (smtpAccountId && !db.prepare("SELECT 1 FROM smtp_accounts WHERE id=? AND is_active=1").get(smtpAccountId)) return res.status(400).json({ error: "Selected SMTP account is missing or inactive" });

    const result = enqueueManualDispatch(db, { leadId, subject, body, bodyHtml, smtpAccountId, name: "Quick outreach pitch" });
    void processTenantDispatchQueue().catch((error) => console.error("[email/quick-send] Dispatch start failed", error));
    return res.status(202).json({ ok: true, queued: true, campaignId: result.campaignId, message: `Pitch queued for ${to}.` });
  } catch (error) {
    console.error("[email/quick-send] Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to queue pitch email." });
  }
});
emailRouter.get("/sequences", (req, res) => {
  try {
    const db = getDb();
    seedSequencesIfEmpty(db);
    const sequences = db.prepare("SELECT * FROM email_sequences ORDER BY created_at DESC").all();
    res.json({ items: sequences });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

emailRouter.post("/sequences", (req, res) => {
  try {
    const db = getDb();
    const { name, niche, description, steps } = req.body;
    if (!name || !steps?.length) return res.status(400).json({ error: "Name and steps required" });

    const id = uuidv4();
    db.prepare(`
      INSERT INTO email_sequences (id, name, niche, description, steps_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, niche || null, description || null, JSON.stringify(steps));

    res.json(db.prepare("SELECT * FROM email_sequences WHERE id = ?").get(id));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

emailRouter.put("/sequences/:id", (req, res) => {
  try {
    const db = getDb();
    const { name, niche, description, steps } = req.body;
    db.prepare(`
      UPDATE email_sequences SET name = ?, niche = ?, description = ?, steps_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, niche || null, description || null, JSON.stringify(steps), req.params.id);
    res.json(db.prepare("SELECT * FROM email_sequences WHERE id = ?").get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

emailRouter.delete("/sequences/:id", (req, res) => {
  try {
    const db = getDb();
    db.prepare("DELETE FROM email_sequences WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── SUPPRESSION LIST ─────────────────────────────────────────────────────────

emailRouter.get("/suppression", (req, res) => {
  try {
    const db = getDb();
    const { reason, page = "1", limit = "50" } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = "SELECT * FROM email_suppression";
    const params: any[] = [];
    if (reason) { query += " WHERE reason = ?"; params.push(reason); }
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), offset);

    const items = db.prepare(query).all(...params);
    const total = (db.prepare(`SELECT COUNT(*) as c FROM email_suppression${reason ? " WHERE reason = ?" : ""}`).get(...(reason ? [reason] : [])) as any).c;

    res.json({ items, total });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

emailRouter.post("/suppression", (req, res) => {
  try {
    const db = getDb();
    const { email, reason, notes } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    db.prepare(`
      INSERT OR REPLACE INTO email_suppression (id, email, reason, notes)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), email.toLowerCase().trim(), reason || "manual", notes || null);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

emailRouter.post("/suppression/sync", async (req, res) => {
  try {
    await syncBounces();
    res.json({ ok: true, message: "Bounces synchronized successfully from active email inboxes." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

emailRouter.delete("/suppression/:id", (req, res) => {
  try {
    const db = getDb();
    db.prepare("DELETE FROM email_suppression WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── TRACKING (open pixel + click redirect) ──────────────────────────────────

// These are registered at root level (not under /api) in index.ts
export function registerTrackingRoutes(app: any) {
  // 1px transparent GIF for open tracking
  const PIXEL = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  app.get("/track/open/:pixelId", publicRateLimiter, publicTenant("tracking", "pixelId"), (req: any, res: any) => {
    const { pixelId } = req.params;
    try {
      const db = getDb();
      const record = db.prepare("SELECT id, lead_id, campaign_id, open_count FROM email_tracking WHERE tracking_pixel_id = ? AND status = 'sent'").get(pixelId) as any;
      if (record) {
        db.prepare(`
          UPDATE email_tracking SET open_count = open_count + 1, opened_at = COALESCE(opened_at, datetime('now')), updated_at = datetime('now')
          WHERE tracking_pixel_id = ?
        `).run(pixelId);
        if (Number(record.open_count || 0) === 0 && record.campaign_id) {
          db.prepare("UPDATE email_campaigns SET total_opened=COALESCE(total_opened,0)+1 WHERE id=?").run(record.campaign_id);
        }
        if (record.lead_id) {
          db.prepare("UPDATE leads SET email_open_count = COALESCE(email_open_count,0) + 1, last_opened_at = datetime('now') WHERE id = ?").run(record.lead_id);
        }
      }
    } catch { /* silent */ }

    res.set({ "Content-Type": "image/gif", "Cache-Control": "no-cache, no-store" });
    res.send(PIXEL);
  });

  app.get("/track/click/:pixelId", publicRateLimiter, publicTenant("tracking", "pixelId"), (req: any, res: any) => {
    const { pixelId } = req.params;
    const { url } = req.query as any;

    try {
      const db = getDb();
      const record = db.prepare("SELECT campaign_id,click_count FROM email_tracking WHERE tracking_pixel_id=? AND status='sent'").get(pixelId) as any;
      if (record) {
        db.prepare("UPDATE email_tracking SET click_count=click_count+1,clicked_at=COALESCE(clicked_at,datetime('now')),updated_at=datetime('now') WHERE tracking_pixel_id=?").run(pixelId);
        if (Number(record.click_count || 0) === 0 && record.campaign_id) db.prepare("UPDATE email_campaigns SET total_clicked=COALESCE(total_clicked,0)+1 WHERE id=?").run(record.campaign_id);
      }
    } catch { /* silent */ }

    let target = "/";
    try {
      const parsed = new URL(url ? decodeURIComponent(String(url)) : appBaseUrl());
      if (parsed.protocol === "http:" || parsed.protocol === "https:") target = parsed.toString();
    } catch { /* use safe local fallback */ }
    res.redirect(302, target);
  });

  app.get("/unsubscribe/:token", publicRateLimiter, publicTenant("unsubscribe", "token"), (req: any, res: any) => {
    const { token } = req.params;
    try {
      const db = getDb();
      const lead = db.prepare("SELECT id, email, business_name FROM leads WHERE unsubscribe_token = ?").get(token) as any;
      if (lead) {
        db.prepare("UPDATE leads SET status = 'unsubscribed', unsubscribed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(lead.id);
        db.prepare(`
          INSERT OR IGNORE INTO email_suppression (id, email, reason)
          VALUES (?, ?, 'unsubscribed')
        `).run(uuidv4(), lead.email.toLowerCase().trim());
        db.prepare("UPDATE email_campaigns SET total_unsubscribed = total_unsubscribed + 1 WHERE id IN (SELECT campaign_id FROM email_tracking WHERE lead_id = ? ORDER BY sent_at DESC LIMIT 1)").run(lead.id);
      }
    } catch { /* silent */ }

    res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { min-height:100vh; display:flex; align-items:center; justify-content:center; background:#f8fafc; font-family:system-ui,sans-serif; }
  .card { background:#fff; border-radius:16px; padding:48px 40px; text-align:center; max-width:420px; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .icon { font-size:48px; margin-bottom:16px; }
  h1 { font-size:22px; font-weight:700; color:#1e293b; margin-bottom:8px; }
  p { font-size:14px; color:#64748b; line-height:1.6; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>You're unsubscribed</h1>
    <p>You've been successfully removed from our mailing list. You won't receive any more emails from us.</p>
  </div>
</body>
</html>`);
  });
}
