import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import "./db/migrate.js";
import { getDb } from "./db/database.js";
import { authRouter } from "./routes/auth.js";
import { authMiddleware } from "./utils/authMiddleware.js";
import { leadsRouter } from "./routes/leads.js";
import { scraperRouter, startScraperQueueRecovery } from "./routes/scrapers.js";
import { outreachRouter } from "./routes/outreach.js";
import { clientsRouter } from "./routes/clients.js";
import { settingsRouter } from "./routes/settings.js";
import { seoRouter } from "./routes/seo.js";
import { seoTeamRouter } from "./routes/seoTeam.js";
import { seoChecklistRouter } from "./routes/seoChecklist.js";
import { seoWorkspaceRouter } from "./routes/seoWorkspace.js";
import { googleCallbackRouter, googleIntegrationRouter } from "./routes/googleIntegration.js";
import { aiRouter } from "./routes/ai.js";
import { eeatRouter } from "./routes/eeat.js";
import { siteAuditRouter } from "./routes/siteAudit.js";
import { automationRouter } from "./routes/automation.js";
import { publicRouter } from "./routes/public.js";
import { shareRouter } from "./routes/share.js";
import { startAutomationScheduler, reloadAutomationSchedules } from "./modules/automation/scheduler.js";
import { listWorkflows, createWorkflow } from "./modules/automation/repository.js";
import { emailRouter, registerTrackingRoutes } from "./routes/email.js";
import { startEmailFollowupScheduler } from "./modules/email/followup-scheduler.js";
import { startEmailDispatchWorker } from "./modules/email/dispatchQueue.js";
import {
  listEarningsByCurrency,
  listRecentFinanceEntries,
  resolveFinancePeriod,
} from "./modules/finance/reporting.js";
import { attachSiteAuditRealtimeServer } from "./modules/siteAuditRealtime.js";
import { authRateLimiter, publicRateLimiter, apiRateLimiter } from "./utils/rateLimiter.js";
import { startAutomatedBackupScheduler } from "./modules/backup/databaseBackup.js";
import { startAutoAuditRecovery } from "./modules/leads/autoAudit.js";

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception:", error);
  // Let the supervisor restart a fresh API process after fatal runtime failures.
  process.exit(1);
});

dotenv.config();

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "smbify_super_secret_saas_key_2026" || process.env.JWT_SECRET === "your_super_secret_jwt_key_2026")) {
  console.error("FATAL SECURITY ERROR: JWT_SECRET environment variable is not configured or uses default fallback value in production!");
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 5050);
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY.split(",").map(s => s.trim()));
const corsOrigins = new Set(
  (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.has(origin) || corsOrigins.has("*")) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "smbify-os", timestamp: new Date().toISOString() });
});

app.use("/public-api", publicRateLimiter, publicRouter);
app.use("/api/google/callback", publicRateLimiter, googleCallbackRouter);
app.use("/api/auth", (req, res, next) => {
  if (req.method === "POST" && (req.path === "/login" || req.path === "/signup")) {
    authRateLimiter(req, res, next);
    return;
  }
  next();
}, authRouter);
app.use("/api", apiRateLimiter, authMiddleware);

app.get("/api/dashboard/summary", (req, res) => {
  try {
    const db = getDb();
    const period = resolveFinancePeriod({
      range: req.query.range,
      month: req.query.month,
      year: req.query.year,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });

    // 1. Core KPIs
    const totalLeads = (db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number }).count || 0;
    const totalCampaigns = (db.prepare("SELECT COUNT(*) as count FROM campaigns").get() as { count: number }).count || 0;
    const activeCampaigns =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM campaigns WHERE LOWER(COALESCE(status, 'draft')) NOT IN ('completed', 'cancelled', 'archived')"
        )
        .get() as { count: number }).count || 0;
    const totalClients =
      (db.prepare("SELECT COUNT(*) as count FROM seo_clients").get() as { count: number }).count || 0;
    const activeBusinesses =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM client_businesses WHERE LOWER(COALESCE(order_status, 'active')) NOT IN ('archived', 'cancelled', 'completed')"
        )
        .get() as { count: number }).count || 0;
    const auditsThisMonth =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM audits WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
        )
        .get() as { count: number }).count || 0;
    const tasksDueToday =
      (db
        .prepare(
          "SELECT COUNT(*) as count FROM tasks WHERE is_done = 0 AND due_date IS NOT NULL AND date(due_date) = date('now')"
        )
        .get() as { count: number }).count || 0;

    // 2. Weekly Trend Indicators
    const leadsThisWeek = (db.prepare("SELECT COUNT(*) as count FROM leads WHERE created_at >= datetime('now', '-7 days')").get() as { count: number }).count || 0;
    const leadsLastWeek = (db.prepare("SELECT COUNT(*) as count FROM leads WHERE created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')").get() as { count: number }).count || 0;
    const leadsTrendPercent = leadsLastWeek > 0 ? Math.round(((leadsThisWeek - leadsLastWeek) / leadsLastWeek) * 100) : (leadsThisWeek > 0 ? 100 : 0);

    const auditsThisWeek = (db.prepare("SELECT COUNT(*) as count FROM audits WHERE created_at >= datetime('now', '-7 days')").get() as { count: number }).count || 0;

    // 3. Breakdown by Source
    const sourceMap: Record<string, string> = {
      csv: "CSV Import",
      gmb_scraper: "Google Maps",
      google_maps: "Google Maps",
      yelp: "Yelp Directory",
      yellowpages: "Yellow Pages",
      seed: "Seed Data",
      manual: "Manual Entry",
    };
    const sourcesRaw = db.prepare("SELECT COALESCE(NULLIF(source, ''), 'google_maps') as source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC LIMIT 6").all() as Array<{ source: string; count: number }>;
    const leadsBySource = sourcesRaw.map((s) => ({
      name: sourceMap[s.source] || s.source,
      value: s.count,
    }));

    // 4. Breakdown by Pipeline Status
    const statusMap: Record<string, string> = {
      new: "New Leads",
      contacted: "Contacted",
      conversing: "In Dialogue",
      invalid_email: "Invalid Email",
      bounced: "Bounced",
      proposal_sent: "Proposal Sent",
      audit_sent: "Audit Dispatched",
      retained_client: "Won Clients",
    };
    const statusesRaw = db.prepare("SELECT COALESCE(NULLIF(status, ''), 'new') as status, COUNT(*) as count FROM leads GROUP BY status ORDER BY count DESC LIMIT 5").all() as Array<{ status: string; count: number }>;
    const leadsByStatus = statusesRaw.map((s) => ({
      name: statusMap[s.status] || s.status,
      value: s.count,
    }));

    // 5. Ingestion Trend over time
    const dailyRaw = db.prepare("SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count FROM leads GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY date DESC LIMIT 14").all() as Array<{ date: string; count: number }>;
    const leadsGrowthTrend = dailyRaw.map((d) => ({
      date: d.date ? new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Unknown",
      count: d.count,
    }));

    // 6. Actionable Grouped Attention Categories (Deduplicated)
    const attentionCategories: Array<{
      id: string;
      category: "audits" | "leads" | "tasks" | "suppression";
      count: number;
      urgency: "critical" | "warning" | "info";
      title: string;
      description: string;
      actionLabel: string;
      actionLink: string;
      sampleItems: Array<{ name: string; detail: string; link?: string }>;
    }> = [];

    const needsAttention: Array<{
      id: string;
      type: "audit" | "lead" | "task" | "campaign";
      urgency: "critical" | "warning" | "info";
      title: string;
      subtitle: string;
      link: string;
    }> = [];

    // Critical Audits (Deduplicated by business name)
    const allAudits = db.prepare("SELECT id, target_name, audit_type, score, verdict, created_at FROM audits ORDER BY created_at DESC").all() as Array<{
      id: string;
      target_name: string | null;
      audit_type: string;
      score: number | null;
      verdict: string | null;
      created_at: string;
    }>;

    const seenAuditNames = new Set<string>();
    const uniqueCriticalAudits: typeof allAudits = [];
    for (const a of allAudits) {
      const key = (a.target_name || "").trim().toLowerCase();
      if (!key || seenAuditNames.has(key)) continue;
      seenAuditNames.add(key);
      if (a.score != null && a.score < 60) {
        uniqueCriticalAudits.push(a);
      }
    }

    if (uniqueCriticalAudits.length > 0) {
      attentionCategories.push({
        id: "cat-critical-audits",
        category: "audits",
        count: uniqueCriticalAudits.length,
        urgency: "critical",
        title: "Critical Diagnostic Failures",
        description: `${uniqueCriticalAudits.length} businesses diagnosed with low scores (<60/100) needing technical fixes`,
        actionLabel: "Review All Audits",
        actionLink: "/audit-tools/hub",
        sampleItems: uniqueCriticalAudits.slice(0, 3).map((a) => ({
          name: a.target_name || "Prospect",
          detail: `Score: ${a.score}/100 · ${a.verdict || "Urgent Fixes Needed"}`,
          link: "/audit-tools/hub",
        })),
      });

      // Backward compatible individual list (deduplicated)
      uniqueCriticalAudits.slice(0, 3).forEach((a) => {
        needsAttention.push({
          id: "audit-" + a.id,
          type: "audit",
          urgency: "critical",
          title: `Critical Diagnostic: ${a.target_name || "Prospect"}`,
          subtitle: `Score: ${a.score}/100 (${a.verdict || "Urgent fixes needed"})`,
          link: "/audit-tools/hub",
        });
      });
    }

    // High-value prospects missing website
    const highValueLeadsCountRes = db.prepare("SELECT COUNT(*) as count FROM leads WHERE (website IS NULL OR website = '') AND gmb_review_count >= 5").get() as { count: number };
    const highValueLeadsCount = highValueLeadsCountRes?.count || 0;
    const topHighValueLeads = db.prepare("SELECT id, business_name, city, state, phone, gmb_review_count FROM leads WHERE (website IS NULL OR website = '') AND gmb_review_count >= 5 ORDER BY gmb_review_count DESC LIMIT 3").all() as Array<{
      id: string;
      business_name: string;
      city: string | null;
      state: string | null;
      phone: string | null;
      gmb_review_count: number;
    }>;

    if (highValueLeadsCount > 0) {
      attentionCategories.push({
        id: "cat-high-intent-no-site",
        category: "leads",
        count: highValueLeadsCount,
        urgency: "warning",
        title: "High-Intent Prospects Without Websites",
        description: `${highValueLeadsCount.toLocaleString()} established businesses with active customer reviews but no web presence`,
        actionLabel: "Review All Prospects",
        actionLink: "/leads?hasWebsite=false",
        sampleItems: topHighValueLeads.map((l) => ({
          name: l.business_name,
          detail: `${l.gmb_review_count} GBP reviews · ${l.city || "Local area"}`,
          link: `/leads/${l.id}`,
        })),
      });

      topHighValueLeads.forEach((l) => {
        needsAttention.push({
          id: "lead-" + l.id,
          type: "lead",
          urgency: "warning",
          title: `High-Intent: ${l.business_name}`,
          subtitle: `${l.gmb_review_count} reviews in ${l.city || "local area"} without website`,
          link: `/leads/${l.id}`,
        });
      });
    }

    // Overdue tasks
    const overdueTasksCountRes = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE is_done = 0 AND due_date IS NOT NULL AND date(due_date) <= date('now')").get() as { count: number };
    const overdueTasksCount = overdueTasksCountRes?.count || 0;
    const topOverdueTasks = db.prepare("SELECT id, title, due_date FROM tasks WHERE is_done = 0 AND due_date IS NOT NULL AND date(due_date) <= date('now') ORDER BY due_date ASC LIMIT 3").all() as Array<{
      id: string;
      title: string;
      due_date: string;
    }>;

    if (overdueTasksCount > 0) {
      attentionCategories.push({
        id: "cat-overdue-tasks",
        category: "tasks",
        count: overdueTasksCount,
        urgency: "critical",
        title: "Overdue Client Deliverables",
        description: `${overdueTasksCount} client task${overdueTasksCount > 1 ? "s" : ""} past scheduled due date`,
        actionLabel: "Review Tasks",
        actionLink: "/seo/dashboard",
        sampleItems: topOverdueTasks.map((t) => ({
          name: t.title,
          detail: `Due: ${t.due_date}`,
          link: "/seo/dashboard",
        })),
      });

      topOverdueTasks.forEach((t) => {
        needsAttention.push({
          id: "task-" + t.id,
          type: "task",
          urgency: "critical",
          title: `Overdue Task: ${t.title}`,
          subtitle: `Due ${t.due_date}`,
          link: "/seo/dashboard",
        });
      });
    }

    // Suppressed / Bounced Leads
    const suppressedCountRes = db.prepare("SELECT COUNT(*) as count FROM leads WHERE LOWER(status) IN ('bounced', 'invalid_email', 'unsubscribed')").get() as { count: number };
    const suppressedCount = suppressedCountRes?.count || 0;
    if (suppressedCount > 0) {
      attentionCategories.push({
        id: "cat-suppressed-leads",
        category: "suppression",
        count: suppressedCount,
        urgency: "info",
        title: "Deliverability Suppressions",
        description: `${suppressedCount.toLocaleString()} invalid or bounced email addresses suppressed to protect domain reputation`,
        actionLabel: "Review Suppression",
        actionLink: "/email/suppression",
        sampleItems: [
          { name: "Domain Protection Active", detail: `${suppressedCount} addresses suppressed`, link: "/email/suppression" }
        ],
      });
    }

    // 7. Live Activity Feed
    const activityFeed: Array<{
      id: string;
      type: "audit" | "lead" | "campaign" | "automation";
      title: string;
      description: string;
      timestamp: string;
      link: string;
    }> = [];

    // Recent Audits
    const recentAudits = db.prepare("SELECT id, target_name, audit_type, score, created_at FROM audits ORDER BY created_at DESC LIMIT 6").all() as Array<{
      id: string;
      target_name: string | null;
      audit_type: string;
      score: number | null;
      created_at: string;
    }>;
    recentAudits.forEach((a) => {
      activityFeed.push({
        id: "act-audit-" + a.id,
        type: "audit",
        title: `${a.audit_type === "gmb" ? "GBP / Local Maps" : "Website SEO"} Audit Completed`,
        description: `${a.target_name || "Target business"} scored ${a.score ?? "N/A"}/100`,
        timestamp: a.created_at,
        link: "/audit-tools/hub",
      });
    });

    // Recent Leads
    const recentLeads = db.prepare("SELECT id, business_name, city, state, source, created_at FROM leads ORDER BY created_at DESC LIMIT 6").all() as Array<{
      id: string;
      business_name: string;
      city: string | null;
      state: string | null;
      source: string | null;
      created_at: string;
    }>;
    recentLeads.forEach((l) => {
      activityFeed.push({
        id: "act-lead-" + l.id,
        type: "lead",
        title: `New Lead Captured: ${l.business_name}`,
        description: `${l.city ? l.city + ", " + (l.state || "") : "Harvested via " + (sourceMap[l.source || ""] || l.source || "System")}`,
        timestamp: l.created_at,
        link: `/leads/${l.id}`,
      });
    });

    // Recent Automation
    const recentRuns = db.prepare("SELECT id, workflow_id, status, progress_message, created_at FROM automation_runs ORDER BY created_at DESC LIMIT 4").all() as Array<{
      id: string;
      workflow_id: string;
      status: string;
      progress_message: string | null;
      created_at: string;
    }>;
    recentRuns.forEach((r) => {
      activityFeed.push({
        id: "act-run-" + r.id,
        type: "automation",
        title: `Automation Pipeline Run (${r.status})`,
        description: r.progress_message || "Multi-step harvesting and diagnostic flow",
        timestamp: r.created_at,
        link: "/automation",
      });
    });

    // Sort activity feed by timestamp descending
    activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const earningsByCurrency = listEarningsByCurrency({
      startDate: period.startDate,
      endDate: period.endDate,
    });
    const recentFinanceEntries = listRecentFinanceEntries({
      startDate: period.startDate,
      endDate: period.endDate,
      limit: 6,
    });

    res.json({
      totalLeads,
      totalCampaigns,
      activeCampaigns,
      totalClients,
      activeBusinesses,
      auditsThisMonth,
      tasksDueToday,
      leadsThisWeek,
      leadsTrendPercent,
      auditsThisWeek,
      leadsBySource,
      leadsByStatus,
      leadsGrowthTrend,
      attentionCategories,
      needsAttention,
      activityFeed,
      earningsByCurrency,
      recentFinanceEntries,
      period,
    });
  } catch (error) {
    console.error("Failed to build dashboard summary", error);
    res.status(500).json({ error: "Failed to load dashboard summary" });
  }
});

app.use("/api/leads", leadsRouter);
app.use("/api/import", scraperRouter);
app.use("/api/outreach", outreachRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/ai", aiRouter);
app.use("/api", eeatRouter);
app.use("/api", siteAuditRouter);
app.use("/api/seo", seoRouter);
app.use("/api/seo/team", seoTeamRouter);
app.use("/api/seo/checklist", seoChecklistRouter);
app.use("/api/seo/workspace", seoWorkspaceRouter);
app.use("/api/google", googleIntegrationRouter);
app.use("/api/automation", automationRouter);
app.use("/api/share", shareRouter);
app.use("/api/email", emailRouter);

// Register public tracking routes (no auth required)
registerTrackingRoutes(app);

app.get("/api/navigation", (_req, res) => {
  res.json({
    sidebar: [
      "Dashboard",
      "Lead Engine",
      "Lead Management",
      "Campaigns",
      "Automation",
      "Audit Tools",
      "Settings",
    ],
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  console.error("[server-error]", err);
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ error: "An unexpected internal server error occurred." });
  } else {
    res.status(500).json({ error: message });
  }
});

const clientDist = path.resolve(process.cwd(), "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const httpServer = http.createServer(app);
attachSiteAuditRealtimeServer(httpServer);

httpServer.listen(port, process.env.HOST || "0.0.0.0", () => {
  console.log(`SMBify OS API running on http://localhost:${port}`);
  try { startAutomationScheduler(); } catch (err) { console.error("Failed to start automation scheduler", err); }
  try { startScraperQueueRecovery(); } catch (err) { console.error("Failed to recover scraper queue", err); }
  try { startAutoAuditRecovery(); } catch (err) { console.error("Failed to recover auto-audit queue", err); }
  try { startEmailFollowupScheduler(); } catch (err) { console.error("Failed to start email followup scheduler", err); }
  try { startEmailDispatchWorker(); } catch (err) { console.error("Failed to start email dispatch worker", err); }
  try { startAutomatedBackupScheduler(); } catch (err) { console.error("Failed to start automated backup scheduler", err); }

  // Seed an example workflow if none exist
  try {
    const existing = listWorkflows();
    if (Array.isArray(existing) && existing.length === 0) {
      console.log("Seeding sample automation workflow: Daily Google Maps → Website Audit → Campaign");
      try {
        createWorkflow({
          name: "Daily Google Maps → Website Audit → Campaign",
          description: "Sample daily workflow that scrapes Google Maps, runs website audits, and creates campaign drafts",
          steps: [
            { type: "scrape_google_maps", label: "Scrape Google Maps", config: {} },
            { type: "audit_website", label: "Website Audit", config: {} },
            { type: "create_campaign", label: "Create Campaign", config: {} },
          ],
          scheduleType: "daily",
          scheduleSpec: "09:00",
          defaultInput: { source: "google_maps", query: "plumber", city: "Miami", state: "FL", niche: "Home Services", maxLeads: 50 },
        });
        getDb().prepare("UPDATE automation_workflows SET is_active=0 WHERE name=?").run("Daily Google Maps → Website Audit → Campaign");
        // Sample workflows remain paused until explicitly enabled.
        reloadAutomationSchedules();
      } catch (err) {
        console.error("Failed to create sample workflow", err);
      }
    }
  } catch (err) {
    console.error("Failed to seed sample workflow:", err);
  }
});
