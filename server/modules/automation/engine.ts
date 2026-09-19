import { decryptCredential } from "../../utils/encryption.js";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { getDb } from "../../db/database.js";
import { runWebsiteAudit } from "../audits/website.js";
import { runGmbAudit } from "../audits/gmb.js";
import { runEeatAuditReport } from "../audits/eeat.js";
import { insertStoredAuditRecord } from "../audits/store.js";
import {
  createCampaignDraftFromLeadIds,
  type CampaignDraftResult,
} from "../outreach/repository.js";
import { getRecommendedCampaignTemplate } from "../outreach/templates.js";
import type { LeadSource } from "../../types/lead.js";
import { importLeads, addLeadActivity } from "../leads/repository.js";
import nodemailer from "nodemailer";
import { plainTextToEmailHtml } from "../outreach/html.js";
import { runBusinessDiscovery, enrichBusinessDna, scoreOpportunities } from "./leadCommandSteps.js";
import {
  createAutomationRun,
  updateAutomationRun,
  getAutomationRun,
  type AutomationRun,
  type AutomationStep,
  type WorkflowInput,
} from "./repository.js";

// Realtime broadcast is optional — define a noop function
// When server/modules/automation/realtime.ts is created, wire it here
let publishAutomationRunUpdate: (run: AutomationRun) => void = () => {};

type StepResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWorkflowInput(value: Partial<WorkflowInput> | null | undefined): WorkflowInput {
  const input = value || {};
  return {
    source: cleanText(input.source) || "google_maps",
    query: cleanText(input.query),
    city: cleanText(input.city),
    state: cleanText(input.state),
    niche: cleanText(input.niche),
    maxLeads: Math.max(1, Math.min(500, Number(input.maxLeads) || 100)),
    campaignName: cleanText(input.campaignName) || undefined,
    campaignSubject: cleanText(input.campaignSubject) || undefined,
    campaignBody: cleanText(input.campaignBody) || undefined,
    prompt: cleanText(input.prompt) || undefined,
    filters: input.filters || {},
    channels: Array.isArray(input.channels) ? input.channels.map(cleanText).filter(Boolean) : ["email"],
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOutputDirectory(): string {
  const configured = process.env.SCRAPER_OUTPUT_DIR?.trim() || "./db/scraper-output";
  const resolved = path.resolve(process.cwd(), configured);
  return resolved;
}

function updateRunProgress(
  runId: string,
  patch: Partial<AutomationRun>
): AutomationRun | null {
  const updated = updateAutomationRun(runId, patch as Partial<AutomationRun>);
  if (updated) {
    publishAutomationRunUpdate(updated);
  }
  return updated;
}

function updateStepProgress(
  run: AutomationRun,
  stepIndex: number,
  stepPatch: { status: string; label?: string; message?: string | null; completed_at?: string | null }
): string {
  const steps = JSON.parse(run.steps_progress_json) as Array<Record<string, unknown>>;
  if (stepIndex >= 0 && stepIndex < steps.length) {
    steps[stepIndex] = { ...steps[stepIndex], ...stepPatch };
    if (stepPatch.completed_at) {
      steps[stepIndex].completed_at = stepPatch.completed_at;
    }
  }
  return JSON.stringify(steps);
}

// ── STEP 1: Scrape leads ──

function sourceFromStepType(stepType: string): string {
  return stepType.replace("scrape_", "");
}

function parseSimpleCsv(csvContent: string): Record<string, unknown>[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  // Parse rows
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parsing (handles quoted values)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    
    const row: Record<string, unknown> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = values[j] || '';
    }
    rows.push(row);
  }
  
  return rows;
}

function createScraperJob(
  source: string,
  input: WorkflowInput,
  outputFile: string
): string {
  const db = getDb();
  const jobId = `automation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO scraper_jobs (
      id, job_label, source, status, input_json, output_file, csv_file,
      imported_count, total_found, progress_percent, progress_message,
      error_message, created_at, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, ?, NULL, NULL)`
  ).run(
    jobId,
    `job-${Math.random().toString(36).slice(2, 8)}`,
    source,
    "running",
    JSON.stringify(input),
    outputFile,
    null,
    "Scraping leads...",
    now
  );

  return jobId;
}

function saveStagedLeadsFromRaw(
  jobId: string,
  source: string,
  rawRows: Record<string, unknown>[],
  fallback?: { city?: string; state?: string; niche?: string }
): number {
  const db = getDb();

  db.exec("BEGIN");
  try {
    // Clear existing leads for this job
    db.prepare("DELETE FROM scraper_staged_leads WHERE job_id = ?").run(jobId);

    const insertStmt = db.prepare(
      `INSERT INTO scraper_staged_leads (
        id, job_id, business_name, phone, email, website, address, city, state, zip,
        niche, gmb_url, gmb_claimed, gmb_rating, gmb_review_count, has_website,
        source, status, notes, is_selected, added_to_dashboard, created_at, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, NULL)`
    );

    const now = new Date().toISOString();
    let inserted = 0;

    for (const row of rawRows) {
      const businessName = cleanText(row.business_name || row.name || row.title);
      if (!businessName) continue;

      const leadId = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const website = cleanText(row.website);
      const gmbUrl = cleanText(row.gmb_url || row.locationLink);
      const isClaimed =
        row.gmb_claimed !== undefined
          ? (row.gmb_claimed ? 1 : 0)
          : row.unclaimed
          ? 0
          : 1;

      insertStmt.run(
        leadId,
        jobId,
        businessName,
        cleanText(row.phone),
        cleanText(row.email),
        website,
        cleanText(row.address),
        cleanText(row.city) || fallback?.city || "",
        cleanText(row.state) || fallback?.state || "",
        cleanText(row.zip),
        cleanText(row.niche || row.category) || fallback?.niche || "",
        gmbUrl,
        isClaimed,
        Number(row.gmb_rating || row.rating) || null,
        Number(row.gmb_review_count || row.reviews || row.reviewCount) || null,
        website ? 1 : 0,
        source,
        "pending",
        cleanText(row.notes || (row.gmb_claim_source ? `Claim source: ${row.gmb_claim_source}` : "")),
        now
      );

      inserted++;
    }

    db.exec("COMMIT");
    return inserted;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function runScrapeStep(
  input: WorkflowInput,
  run: AutomationRun,
  stepIndex: number,
  stepTypeOverride?: string
): Promise<{ jobId: string; stagedCount: number }> {
  const effectiveSource = stepTypeOverride
    ? sourceFromStepType(stepTypeOverride)
    : input.source;

  const runnerMap: Record<string, string> = {
    google_maps: "gmb-photo-runner.cjs",
    gmb_scraper: "gmb-photo-runner.cjs",
    yellow_pages: "yellow-pages-runner.cjs",
    yellowpages: "yellow-pages-runner.cjs",
    yelp: "yelp-runner.cjs",
    yelp_scraper: "yelp-runner.cjs",
    bbb: "bbb-runner.cjs",
    bbb_scraper: "bbb-runner.cjs",
    state_directory: "state-directory-runner.cjs",
    chamber_directory: "chamber-directory-runner.cjs",
    license_registry: "license-registry-runner.cjs",
    ads_google: "ads-google-runner.cjs",
  };

  const runner = runnerMap[effectiveSource] || "gmb-photo-runner.cjs";
  const runnerPath = path.resolve(
    process.cwd(),
    "server/modules/scraper-runners",
    runner
  );

  const keyword = cleanText(input.query) || cleanText(input.niche) || "Plumber";
  const locationParts = [cleanText(input.city), cleanText(input.state)].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(", ") : "Miami, FL";
  const maxLeads = Math.min(Math.max(1, input.maxLeads || 20), 200);

  const inputDir = path.resolve(process.cwd(), "db/scraper-input");
  if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir, { recursive: true });
  const inputPath = path.join(inputDir, `automation-input-${run.id}-${Date.now()}.json`);

  const outputDir = getOutputDirectory();
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputFileName = `automation-${run.id}-${Date.now()}.json`;
  const outputPath = path.join(outputDir, outputFileName);

  const payloadObj: Record<string, unknown> = {
    keyword,
    businessType: keyword,
    location,
    state: cleanText(input.state) || "FL",
    limit: maxLeads,
    maxItems: maxLeads,
    listingsPerQuery: maxLeads,
  };

  fs.writeFileSync(inputPath, JSON.stringify(payloadObj, null, 2), "utf8");

  // Create scraper_job entry first
  const jobId = createScraperJob(effectiveSource, input, outputPath);

  return new Promise((resolve, reject) => {
    const child = spawn("node", [runnerPath, "--input", inputPath, "--output", outputPath], {
      env: {
        ...process.env,
        SCRAPER_PAYLOAD: JSON.stringify(payloadObj),
        SCRAPER_OUTPUT_FILE: outputPath,
        SCRAPER_PROXY_URL: process.env.SCRAPER_PROXY_URL || "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        if (text.startsWith("__PROGRESS__")) {
          try {
            const p = JSON.parse(text.slice("__PROGRESS__".length).trim());
            updateRunProgress(run.id, {
              progress_message: `Scraping (${p.percent || 50}%): ${p.message || "Extracting leads..."}`,
            });
          } catch {}
        } else {
          updateRunProgress(run.id, {
            progress_message: `Scraping: ${text.slice(0, 120)}`,
          });
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", async (code) => {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      } catch {}

      if (code !== 0 && !fs.existsSync(outputPath)) {
        reject(new Error(`Scraper exited with code ${code}: ${stderr.slice(0, 300)}`));
        return;
      }

      // Wait a moment for output to flush
      await sleep(500);

      // Read and parse output (supports both JSON array and CSV fallback)
      let stagedCount = 0;
      try {
        if (fs.existsSync(outputPath)) {
          const rawContent = fs.readFileSync(outputPath, "utf8").replace(/^\uFEFF/, "").trim();
          let rawRows: Record<string, unknown>[] = [];
          if (rawContent.startsWith("[") || rawContent.startsWith("{")) {
            const parsed = JSON.parse(rawContent);
            rawRows = Array.isArray(parsed) ? parsed : [parsed];
          } else {
            rawRows = parseSimpleCsv(rawContent);
          }

          if (rawRows.length > 0) {
            stagedCount = saveStagedLeadsFromRaw(jobId, effectiveSource, rawRows, {
              city: cleanText(input.city),
              state: cleanText(input.state),
              niche: keyword,
            });
            updateRunProgress(run.id, {
              progress_message: `Scraped ${stagedCount} real leads from ${effectiveSource}`,
            });
          }
        }
      } catch (err) {
        console.error("Error parsing/saving scraper results in automation:", err);
      }

      // Update scraper_job as complete
      const db = getDb();
      db.prepare(
        `UPDATE scraper_jobs 
         SET status = ?, total_found = ?, imported_count = ?, progress_percent = 100, completed_at = ?
         WHERE id = ?`
      ).run("complete", stagedCount, 0, new Date().toISOString(), jobId);

      resolve({
        jobId,
        stagedCount,
      });
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start scraper: ${err.message}`));
    });
  });
}

// ── STEP 2-4: Run audits on staged leads ──

async function runAuditStep(
  run: AutomationRun,
  stepIndex: number,
  auditType: "website" | "gmb" | "eeat"
): Promise<{ auditedCount: number }> {
  const db = getDb();

  // Find staged leads from the scrape step that haven't been audited yet
  const input = normalizeWorkflowInput(JSON.parse(run.input_json) as Partial<WorkflowInput>);

  // Try to find the specific jobId from a previous scrape step in this run
  let jobId: string | undefined;
  try {
    const results = run.result_json ? JSON.parse(run.result_json) : {};
    for (const key of Object.keys(results)) {
      if (results[key]?.jobId) {
        jobId = results[key].jobId;
        break;
      }
    }
  } catch (err) {
    console.error("Failed to parse run results:", err);
  }

  const statusColumn = `${auditType}_audit_status`;

  // We look for leads that were most recently added (from the automation scrape)
  // or leads matching the input criteria
  let leads: Array<Record<string, unknown>> = [];
  if (jobId) {
    leads = db
      .prepare(
        `SELECT ssl.* FROM scraper_staged_leads ssl
         WHERE ssl.job_id = ?
           AND ssl.added_to_dashboard = 0
           AND (
             ssl.${statusColumn} IS NULL OR
             ssl.${statusColumn} = 'not_run'
           )
         ORDER BY ssl.created_at DESC
         LIMIT ?`
      )
      .all(jobId, input.maxLeads) as Array<Record<string, unknown>>;
  } else {
    leads = db
      .prepare(
        `SELECT ssl.* FROM scraper_staged_leads ssl
         JOIN scraper_jobs sj ON sj.id = ssl.job_id
         WHERE sj.source = ?
           AND ssl.added_to_dashboard = 0
           AND (
             ssl.${statusColumn} IS NULL OR
             ssl.${statusColumn} = 'not_run'
           )
         ORDER BY ssl.created_at DESC
         LIMIT ?`
      )
      .all(input.source, input.maxLeads) as Array<Record<string, unknown>>;
  }

  if (leads.length === 0) {
    updateRunProgress(run.id, {
      progress_message: `No leads found to audit (${auditType})`,
    });
    return { auditedCount: 0 };
  }

  updateRunProgress(run.id, {
    progress_message: `Running ${auditType} audits on ${leads.length} leads...`,
  });

  let auditedCount = 0;
  const batchSize = 5;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const batchResults: Array<{
      leadId: string;
      auditId: string;
      score: number;
      verdict: string;
      summary: string;
      status: string;
    }> = [];

    for (const lead of batch) {
      try {
        const businessName = cleanText(lead.business_name);
        const website = cleanText(lead.website);
        const gmbUrl = cleanText(lead.gmb_url);

        let auditResult:
          | { audit_id?: string; score?: number; verdict?: string; summary?: string }
          | undefined;

        if (auditType === "website" && website) {
          auditResult = await runWebsiteAudit({ website, businessName,
            city: cleanText(lead.city) || undefined,
            state: cleanText(lead.state) || undefined,
          });
        } else if (auditType === "gmb" && gmbUrl) {
          auditResult = await runGmbAudit({ gmbUrl, businessName });
        } else if (auditType === "eeat" && website) {
          const eeatResult = await runEeatAuditReport({
            domain: website,
          });
          auditResult = {
            score: eeatResult.score,
            verdict: eeatResult.rating,
            summary: eeatResult.summary,
          };
        }

        if (auditResult) {
          // Store the full audit record including issues/wins/recommendations
          const fullResult = auditResult as Record<string, unknown>;
          const stored = insertStoredAuditRecord({
            leadId: "",
            clientId: "",
            scraperJobId: cleanText(lead.job_id),
            stagedLeadId: cleanText(lead.id),
            auditType,
            score: auditResult.score ?? 0,
            verdict: auditResult.verdict || "unknown",
            targetName: businessName,
            status: "completed",
            result: {
              summary: auditResult.summary || "",
              issues: (fullResult.issues as unknown[]) ?? [],
              wins: (fullResult.wins as unknown[]) ?? [],
              recommendations: (fullResult.recommendations as unknown[]) ?? [],
              metrics: fullResult.metrics ?? {},
              auditVersion: fullResult.auditVersion ?? "quick",
            },
          });

          batchResults.push({
            leadId: cleanText(lead.id),
            auditId: stored.id,
            score: auditResult.score ?? 0,
            verdict: auditResult.verdict || "unknown",
            summary: auditResult.summary || "",
            status: "completed",
          });

          auditedCount++;
        }
      } catch {
        // Mark as failed but continue
        batchResults.push({
          leadId: cleanText(lead.id),
          auditId: "",
          score: 0,
          verdict: "failed",
          summary: "Audit failed during automation",
          status: "failed",
        });
      }
    }

    // Update staged lead records with audit results
    const updateStmt = db.prepare(
      `UPDATE scraper_staged_leads SET
        ${auditType}_audit_id = ?,
        ${auditType}_audit_score = ?,
        ${auditType}_audit_verdict = ?,
        ${auditType}_audit_status = ?,
        ${auditType}_audit_summary = ?,
        last_audited_at = ?
       WHERE id = ?`
    );

    db.exec("BEGIN");
    try {
      for (const result of batchResults) {
        updateStmt.run(
          result.auditId,
          result.score,
          result.verdict,
          result.status,
          result.summary,
          nowIso(),
          result.leadId
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const percent = Math.round(((i + batch.length) / leads.length) * 100);
    updateRunProgress(run.id, {
      progress_percent: Math.min(99, percent),
      progress_message: `${auditType} audit: ${Math.min(i + batch.length, leads.length)}/${leads.length}`,
    });

    // Polite delay between batches
    await sleep(300);
  }

  return { auditedCount };
}

// ── STEP 5: Create campaign from audited leads ──

interface SmtpAccount {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: number;
  username: string;
  password: string;
  from_name: string | null;
  from_email: string | null;
}

function getFirstActiveSmtpAccount(): SmtpAccount | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT *
       FROM smtp_accounts
       WHERE is_active = 1
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`
    )
    .get() as SmtpAccount | undefined;
  return row || null;
}

function personalizeTemplate(
  templateText: string,
  recipient: {
    business_name?: string;
    email?: string;
    phone?: string;
    website?: string;
    city?: string;
    state?: string;
  }
): string {
  let text = templateText;
  text = text.replace(/\{\{business_name\}\}/gi, recipient.business_name || "");
  text = text.replace(/\{\{email\}\}/gi, recipient.email || "");
  text = text.replace(/\{\{phone\}\}/gi, recipient.phone || "");
  text = text.replace(/\{\{website\}\}/gi, recipient.website || "");
  text = text.replace(/\{\{city\}\}/gi, recipient.city || "");
  text = text.replace(/\{\{state\}\}/gi, recipient.state || "");
  return text;
}

async function createCampaignStep(
  run: AutomationRun
): Promise<{ campaignId: string; campaignName: string; leadCount: number }> {
  const input = normalizeWorkflowInput(JSON.parse(run.input_json) as Partial<WorkflowInput>);
  const db = getDb();

  // Try to find the specific jobId from a previous scrape step in this run
  let jobId: string | undefined;
  try {
    const results = run.result_json ? JSON.parse(run.result_json) : {};
    for (const key of Object.keys(results)) {
      if (results[key]?.jobId) {
        jobId = results[key].jobId;
        break;
      }
    }
  } catch (err) {
    console.error("Failed to parse run results:", err);
  }

  // Find audited leads that are ready for outreach
  let readyLeads: Array<Record<string, unknown>> = [];
  let targetLeads: Array<Record<string, unknown>> = [];

  if (jobId) {
    readyLeads = db
      .prepare(
        `SELECT ssl.* FROM scraper_staged_leads ssl
         WHERE ssl.job_id = ?
           AND ssl.added_to_dashboard = 0
           AND ssl.is_selected = 1
           AND ssl.website_audit_status = 'completed'
         ORDER BY ssl.created_at DESC
         LIMIT ?`
      )
      .all(jobId, input.maxLeads) as Array<Record<string, unknown>>;

    targetLeads = readyLeads.length > 0
      ? readyLeads
      : db
          .prepare(
            `SELECT ssl.* FROM scraper_staged_leads ssl
             WHERE ssl.job_id = ?
               AND ssl.added_to_dashboard = 0
             ORDER BY ssl.created_at DESC
             LIMIT ?`
          )
          .all(jobId, input.maxLeads) as Array<Record<string, unknown>>;
  } else {
    readyLeads = db
      .prepare(
        `SELECT ssl.* FROM scraper_staged_leads ssl
         JOIN scraper_jobs sj ON sj.id = ssl.job_id
         WHERE sj.source = ?
           AND ssl.added_to_dashboard = 0
           AND ssl.is_selected = 1
           AND ssl.website_audit_status = 'completed'
         ORDER BY ssl.created_at DESC
         LIMIT ?`
      )
      .all(input.source, input.maxLeads) as Array<Record<string, unknown>>;

    targetLeads = readyLeads.length > 0
      ? readyLeads
      : db
          .prepare(
            `SELECT ssl.* FROM scraper_staged_leads ssl
             JOIN scraper_jobs sj ON sj.id = ssl.job_id
             WHERE sj.source = ?
               AND ssl.added_to_dashboard = 0
             ORDER BY ssl.created_at DESC
             LIMIT ?`
          )
          .all(input.source, input.maxLeads) as Array<Record<string, unknown>>;
  }

  if (targetLeads.length === 0) {
    // Try finding leads from dashboard that match the niche
    const dashboardLeads = db
      .prepare(
        `SELECT id, business_name, city, state, website, email, niche
         FROM leads
         WHERE LOWER(COALESCE(niche, '')) LIKE ?
            OR LOWER(COALESCE(city, '')) = LOWER(?)
         ORDER BY datetime(created_at) DESC
         LIMIT ?`
      )
      .all(
        `%${input.niche.toLowerCase()}%`,
        cleanText(input.city),
        input.maxLeads
      ) as Array<Record<string, unknown>>;

    if (dashboardLeads.length === 0) {
      throw new Error("No leads found to create campaign from");
    }

    const leadIds = dashboardLeads.map((l) => cleanText(l.id));
    const campaignName =
      cleanText(input.campaignName) ||
      `Auto: ${input.niche} in ${input.city} ${input.state}`;

    const smtpAccount = getFirstActiveSmtpAccount();
    const smtpAccountId = smtpAccount?.id || undefined;

    // Create campaign draft with these leads
    const campaign: CampaignDraftResult = createCampaignDraftFromLeadIds({
      name: campaignName,
      leadIds,
      subject:
        cleanText(input.campaignSubject) ||
        `Quick question regarding {{business_name}}'s Google visibility in {{city}}`,
      body:
        cleanText(input.campaignBody) ||
        `Hey {{business_name}} Team,\n\nI was reviewing local service providers in {{city}} and noticed a couple of quick opportunities on your Google profile and website performance that could bring you more inbound customer calls each week.\n\nI put together a brief teardown of what your neighborhood competitors are currently doing.\n\nWould you be open to checking out the notes?\n\nRegards, Tufi\nSMBify Team`,
      targetCity: cleanText(input.city),
      targetNiche: cleanText(input.niche),
      smtpAccountId,
    });

    // Execute sending if SMTP active
    updateRunProgress(run.id, { progress_message: "Campaign draft created. Review recipients and explicitly send it from Campaigns." });

    return {
      campaignId: campaign.campaignId,
      campaignName,
      leadCount: leadIds.length,
    };
  }

  // Import to dashboard first, then create campaign
  const leadsToImport = targetLeads.map((row) => ({
    business_name: cleanText(row.business_name),
    phone: cleanText(row.phone),
    email: cleanText(row.email),
    website: cleanText(row.website),
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state),
    zip: cleanText(row.zip),
    niche: cleanText(row.niche) || cleanText(input.niche),
    gmb_url: cleanText(row.gmb_url),
    gmb_claimed: Number(row.gmb_claimed) === 1,
    gmb_rating: Number(row.gmb_rating) || undefined,
    gmb_review_count: Number(row.gmb_review_count) || undefined,
    has_website: Boolean(row.website),
    source: cleanText(row.source) as LeadSource,
    notes: cleanText(row.notes),
  }));

  const importResult = importLeads(leadsToImport, (cleanText(targetLeads[0]?.source || input.source)) as LeadSource);

  // Mark staged leads as added to dashboard
  const now = nowIso();
  const markStmt = db.prepare(
    `UPDATE scraper_staged_leads
     SET added_to_dashboard = 1, added_at = ?
     WHERE id = ?`
  );

  db.exec("BEGIN");
  try {
    for (const row of targetLeads) {
      markStmt.run(now, cleanText(row.id));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  // Find the imported lead IDs
  const importedLeadIds: string[] = [];
  const personalizedByLeadId: Record<string, { subject: string; body: string }> = {};
  const reportContextByLeadId: Record<string, Record<string, unknown>> = {};
  const bookingRow = db.prepare("SELECT booking_url FROM app_settings LIMIT 1").get() as { booking_url?: string } | undefined;
  for (const row of targetLeads) {
    const email = cleanText(row.email);
    const businessName = cleanText(row.business_name);
    const city = cleanText(row.city);

    let matched = email
      ? (db
          .prepare(
            "SELECT id FROM leads WHERE LOWER(COALESCE(email,'')) = LOWER(?) ORDER BY datetime(updated_at) DESC LIMIT 1"
          )
          .get(email) as { id: string } | undefined)
      : undefined;

    if (!matched) {
      matched = db
        .prepare(
          "SELECT id FROM leads WHERE LOWER(business_name) = LOWER(?) AND LOWER(COALESCE(city,'')) = LOWER(?) ORDER BY datetime(updated_at) DESC LIMIT 1"
        )
        .get(businessName, city) as { id: string } | undefined;
    }

    if (matched?.id) {
      importedLeadIds.push(matched.id);
      db.prepare(`UPDATE leads SET facebook_url=?, instagram_url=?, linkedin_url=?, twitter_url=?, business_dna_json=?, opportunity_score=? WHERE id=?`).run(
        cleanText(row.facebook_url) || null, cleanText(row.instagram_url) || null, cleanText(row.linkedin_url) || null,
        cleanText(row.twitter_url) || null, cleanText(row.business_dna_json) || null, Number(row.opportunity_score || 0), matched.id
      );
      const findings: string[] = [];
      const websiteScore = Number(row.website_audit_score || 0);
      const gmbScore = Number(row.gmb_audit_score || 0);
      const reviews = Number(row.gmb_review_count || 0);
      if (!cleanText(row.website)) findings.push("your business does not appear to have a website linked from its public listing");
      else if (websiteScore > 0 && websiteScore < 75) findings.push(`the website audit scored ${websiteScore}/100 and identified practical SEO and conversion gaps`);
      if (gmbScore > 0 && gmbScore < 75) findings.push(`the Google profile audit scored ${gmbScore}/100`);
      if (reviews < 100) findings.push(`the profile currently shows ${reviews} reviews, leaving room to strengthen local trust signals`);
      const evidence = findings.slice(0, 2);
      const recipientName = cleanText(row.business_name);
      const location = [cleanText(row.city), cleanText(row.state)].filter(Boolean).join(", ");
      personalizedByLeadId[matched.id] = {
        subject: `${recipientName}: a quick local visibility observation`,
        body: [
          `Hi ${recipientName} team,`, "",
          `I was reviewing ${cleanText(input.niche) || "local service"} businesses in ${location || "your area"} and looked at your public website and Google profile.`,
          evidence.length ? `Two items stood out: ${evidence.join("; ")}.` : "I found a few areas worth reviewing, but I would like to verify them with you before making any claims.", "",
          "I can share the short evidence report and the highest-priority fixes. Would that be useful?",
          cleanText(bookingRow?.booking_url) ? `If easier, you can choose a time here: ${cleanText(bookingRow?.booking_url)}` : "", "",
          "Regards,", "SMBify Team",
        ].filter(Boolean).join("\n"),
      };
      reportContextByLeadId[matched.id] = { websiteScore: websiteScore || null, gmbScore: gmbScore || null, reviewCount: reviews, findings: evidence, opportunityScore: Number(row.opportunity_score || 0) };
    }
  }

  if (importedLeadIds.length === 0) {
    throw new Error("Failed to import leads to dashboard");
  }

  const campaignName =
    cleanText(input.campaignName) ||
    `Auto: ${input.niche} in ${input.city} ${input.state}`;

  const template = getRecommendedCampaignTemplate({
    source: cleanText(targetLeads[0]?.source || input.source) as any,
    city: cleanText(input.city),
    niche: cleanText(input.niche),
  });

  const smtpAccount = getFirstActiveSmtpAccount();
  const smtpAccountId = smtpAccount?.id || undefined;

  const campaign: CampaignDraftResult = createCampaignDraftFromLeadIds({
    name: campaignName,
    leadIds: importedLeadIds,
    subject:
      cleanText(input.campaignSubject) || template?.subject || "",
    body:
      cleanText(input.campaignBody) || template?.body || "",
    targetCity: cleanText(input.city),
    targetNiche: cleanText(input.niche),
    smtpAccountId,
    personalizedByLeadId,
    reportContextByLeadId,
  });

  // Execute sending if SMTP active
  updateRunProgress(run.id, { progress_message: "Campaign draft created. Review recipients and explicitly send it from Campaigns." });

  return {
    campaignId: campaign.campaignId,
    campaignName,
    leadCount: importedLeadIds.length,
  };
}

export async function executeAutomationRun(
  runId: string,
  steps: AutomationStep[],
  input: WorkflowInput
): Promise<void> {
  input = normalizeWorkflowInput(input);
  const run = getAutomationRun(runId);
  if (!run) {
    throw new Error(`Automation run not found: ${runId}`);
  }

  // Set initial steps labels
  const initialSteps = JSON.parse(run.steps_progress_json) as Array<Record<string, unknown>>;
  for (let i = 0; i < steps.length; i++) {
    initialSteps[i] = { ...initialSteps[i], label: steps[i].label || steps[i].type };
  }
  updateRunProgress(runId, {
    steps_progress_json: JSON.stringify(initialSteps),
  });

  // Mark as running
  updateRunProgress(runId, {
    status: "running",
    started_at: nowIso(),
    progress_message: "Starting automation...",
  });

  const results: Record<string, unknown> = {};

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepIndex = i + 1;

    updateRunProgress(runId, {
      current_step: stepIndex,
      progress_message: `Step ${stepIndex}/${steps.length}: ${step.label || step.type}`,
    });

    // Update step progress
    const stepProgress = updateStepProgress(run, i, {
      status: "running",
      message: `Running ${step.label || step.type}...`,
    });
    updateRunProgress(runId, { steps_progress_json: stepProgress });

    try {
      let stepResult: StepResult;

      if (step.type === "scrape_google_places") {
        const scrapeResult = await runBusinessDiscovery(input);
        stepResult = { success: true, data: { ...scrapeResult, type: step.type } };
      } else if (step.type === "scrape" || step.type.startsWith("scrape_")) {
        const scrapeResult = await runScrapeStep(input, run, i, step.type.startsWith("scrape_") ? step.type : undefined);
        stepResult = {
          success: true,
          data: {
            jobId: scrapeResult.jobId,
            stagedCount: scrapeResult.stagedCount,
            type: step.type,
          },
        };
      } else if (step.type === "enrich_business_dna") {
        const result = await enrichBusinessDna(run, input);
        stepResult = { success: true, data: { ...result, type: step.type } };
      } else if (step.type === "score_opportunities") {
        const result = scoreOpportunities(run, input);
        stepResult = { success: true, data: { ...result, type: step.type } };
      } else if (step.type === "audit_website") {
        const auditResult = await runAuditStep(run, i, "website");
        stepResult = {
          success: true,
          data: {
            auditedCount: auditResult.auditedCount,
            type: "audit_website",
          },
        };
      } else if (step.type === "audit_gmb") {
        const auditResult = await runAuditStep(run, i, "gmb");
        stepResult = {
          success: true,
          data: {
            auditedCount: auditResult.auditedCount,
            type: "audit_gmb",
          },
        };
      } else if (step.type === "audit_eeat") {
        const auditResult = await runAuditStep(run, i, "eeat");
        stepResult = {
          success: true,
          data: {
            auditedCount: auditResult.auditedCount,
            type: "audit_eeat",
          },
        };
      } else if (step.type === "create_campaign") {
        const campaignResult = await createCampaignStep(run);
        stepResult = {
          success: true,
          data: {
            campaignId: campaignResult.campaignId,
            campaignName: campaignResult.campaignName,
            leadCount: campaignResult.leadCount,
            type: "create_campaign",
          },
        };
      } else {
        stepResult = {
          success: false,
          error: `Unknown step type: ${(step as AutomationStep).type}`,
        };
      }

      if (!stepResult.success) {
        throw new Error(stepResult.error || `Step ${stepIndex} failed`);
      }

      // Store result
      results[`step_${stepIndex}`] = stepResult.data || {};
      updateRunProgress(runId, {
        result_json: JSON.stringify(results),
      });

      // Mark step as completed
      const completedStepProgress = updateStepProgress(run, i, {
        status: "completed",
        message: stepResult.data
          ? `Completed: ${JSON.stringify(stepResult.data).slice(0, 100)}`
          : "Completed",
        completed_at: nowIso(),
      });
      updateRunProgress(runId, { steps_progress_json: completedStepProgress });

      // Calculate overall progress
      const percent = Math.round(((i + 1) / steps.length) * 100);
      updateRunProgress(runId, {
        progress_percent: Math.min(99, percent),
      });

      // Refresh run object for next iteration
      const refreshed = getAutomationRun(runId);
      if (refreshed) {
        Object.assign(run, refreshed);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Mark step as failed
      const failedStepProgress = updateStepProgress(run, i, {
        status: "failed",
        message: errorMessage,
        completed_at: nowIso(),
      });

      updateRunProgress(runId, {
        steps_progress_json: failedStepProgress,
        status: "failed",
        error_message: `Step ${stepIndex} (${step.type}) failed: ${errorMessage}`,
        completed_at: nowIso(),
      });

      return;
    }
  }

  // Mark entire run as completed
  updateRunProgress(runId, {
    status: "completed",
    progress_percent: 100,
    progress_message: "Automation completed successfully!",
    completed_at: nowIso(),
  });
}
