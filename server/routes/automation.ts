import express from "express";
import { getDb } from "../db/database.js";
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listAutomationRuns,
  getAutomationRun,
  createAutomationRun,
} from "../modules/automation/repository.js";
import { executeAutomationRun } from "../modules/automation/engine.js";
import { reloadAutomationSchedules } from "../modules/automation/scheduler.js";
import type { AutomationStep } from "../modules/automation/repository.js";
import { parseLeadCommand } from "../modules/automation/commandParser.js";

export const automationRouter = express.Router();

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseOptionalString(value: unknown): string | undefined {
  const s = cleanText(value);
  return s || undefined;
}

/* ── Workflow CRUD ── */

automationRouter.post("/commands/interpret", (req, res) => {
  try { res.json({ plan: parseLeadCommand(req.body?.prompt) }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Instruction could not be understood" }); }
});

automationRouter.get("/commands/readiness", (_req, res) => {
  try {
    const db = getDb();
    const settings = db.prepare("SELECT google_places_api_key, dataforseo_login, dataforseo_password, booking_url FROM app_settings LIMIT 1").get() as { google_places_api_key?: string; dataforseo_login?: string; dataforseo_password?: string; booking_url?: string } | undefined;
    const smtp = db.prepare("SELECT COUNT(*) count FROM smtp_accounts WHERE is_active=1").get() as { count: number };
    const ai = db.prepare("SELECT COUNT(*) count FROM ai_provider_configs WHERE provider_key='openrouter' AND is_enabled=1 AND api_key<>''").get() as { count: number };
    const checks = { googlePlaces:Boolean(settings?.google_places_api_key), dataForSeo:Boolean(settings?.dataforseo_login && settings?.dataforseo_password), emailSender:Number(smtp?.count||0)>0, openRouter:Number(ai?.count||0)>0, bookingLink:Boolean(cleanText(settings?.booking_url)) };
    res.json({ checks, launchReady:checks.googlePlaces||checks.dataForSeo, sendReady:checks.emailSender, meetingReady:checks.bookingLink });
  } catch { res.status(500).json({ error:"Integration readiness could not be loaded" }); }
});

automationRouter.post("/commands", (req, res) => {
  try {
    const parsed = parseLeadCommand(req.body?.prompt);
    const plan = { ...parsed, city:cleanText(req.body?.city)||parsed.city, state:cleanText(req.body?.state).toUpperCase()||parsed.state, niche:cleanText(req.body?.niche)||parsed.niche, query:cleanText(req.body?.niche)||parsed.query, maxLeads:Math.max(1,Math.min(200,Number(req.body?.maxLeads)||parsed.maxLeads)) };
    if (!plan.city) return res.status(400).json({ error:"Confirm a city before launching this instruction." });
    const placesReady = getDb().prepare("SELECT google_places_api_key FROM app_settings LIMIT 1").get() as { google_places_api_key?: string } | undefined;
    if (!placesReady?.google_places_api_key) return res.status(409).json({ error:"Connect Google Places in API Setup before launching." });
    const workflow = createWorkflow({ name:`Lead command: ${plan.niche} in ${plan.city}`, description:plan.prompt, steps:plan.steps as AutomationStep[], scheduleType:"none", defaultInput:plan });
    const input = { ...plan, campaignName:`${plan.niche} - ${plan.city} opportunity outreach` };
    const run = createAutomationRun({ workflowId:workflow.id, workflowName:workflow.name, totalSteps:plan.steps.length, inputJson:JSON.stringify(input) });
    executeAutomationRun(run.id, plan.steps as AutomationStep[], input).catch((error) => console.error(`Lead command failed (run=${run.id})`, error));
    res.status(201).json({ plan, workflow, run });
  } catch (error) { res.status(400).json({ error:error instanceof Error?error.message:"Lead command could not be launched" }); }
});

automationRouter.get("/pipeline/summary", (_req, res) => {
  try {
    const db=getDb();
    const rows=db.prepare("SELECT COALESCE(NULLIF(status,''),'new') status, COUNT(*) count FROM leads GROUP BY status").all() as Array<{status:string;count:number}>;
    const map=Object.fromEntries(rows.map((row)=>[row.status,row.count]));
    const meetings=db.prepare("SELECT COUNT(*) count FROM lead_meetings WHERE status='scheduled' AND datetime(starts_at)>=datetime('now')").get() as {count:number};
    res.json({ stages:{ discovered:Number(map.new||0), contacted:Number(map.contacted||0)+Number(map.audit_sent||0), replied:Number(map.conversing||0), qualified:Number(map.proposal_sent||0), meetings:Number(meetings?.count||0), won:Number(map.retained_client||0) } });
  } catch { res.status(500).json({ error:"Pipeline summary could not be loaded" }); }
});

automationRouter.get("/meetings", (_req, res) => {
  try { res.json({ items:getDb().prepare("SELECT * FROM lead_meetings ORDER BY datetime(starts_at) ASC").all() }); }
  catch { res.status(500).json({ error:"Meetings could not be loaded" }); }
});

automationRouter.post("/meetings", (req, res) => {
  try {
    const businessName=cleanText(req.body?.businessName), startsAt=cleanText(req.body?.startsAt);
    if(!businessName||!startsAt||Number.isNaN(Date.parse(startsAt))) return res.status(400).json({ error:"Business name and a valid meeting time are required" });
    const id=crypto.randomUUID(), stamp=new Date().toISOString();
    getDb().prepare("INSERT INTO lead_meetings (id,lead_id,business_name,contact_name,contact_email,starts_at,duration_minutes,meeting_url,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id,cleanText(req.body?.leadId)||null,businessName,cleanText(req.body?.contactName)||null,cleanText(req.body?.contactEmail)||null,new Date(startsAt).toISOString(),Math.max(15,Math.min(180,Number(req.body?.durationMinutes)||30)),cleanText(req.body?.meetingUrl)||null,"scheduled",cleanText(req.body?.notes)||null,stamp,stamp);
    res.status(201).json({ meeting:getDb().prepare("SELECT * FROM lead_meetings WHERE id=?").get(id) });
  } catch { res.status(500).json({ error:"Meeting could not be saved" }); }
});

automationRouter.patch("/meetings/:id", (req, res) => {
  const status=cleanText(req.body?.status);
  if(!["scheduled","completed","cancelled","no_show"].includes(status)) return res.status(400).json({ error:"Invalid meeting status" });
  const result=getDb().prepare("UPDATE lead_meetings SET status=?,updated_at=? WHERE id=?").run(status,new Date().toISOString(),req.params.id);
  if(!result.changes) return res.status(404).json({ error:"Meeting not found" });
  res.json({ meeting:getDb().prepare("SELECT * FROM lead_meetings WHERE id=?").get(req.params.id) });
});

automationRouter.get("/workflows", (_req, res) => {
  try {
    const workflows = listWorkflows();
    res.json({ items: workflows });
  } catch (error) {
    console.error("Failed to list workflows", error);
    res.status(500).json({ error: "Failed to list automation workflows" });
  }
});

automationRouter.get("/workflows/:id", (req, res) => {
  try {
    const workflow = getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }
    res.json({ workflow });
  } catch (error) {
    console.error("Failed to get workflow", error);
    res.status(500).json({ error: "Failed to get automation workflow" });
  }
});

automationRouter.post("/workflows", (req, res) => {
  try {
    const { name, description, steps } = req.body;

    if (!name || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ error: "Workflow name and at least one step are required" });
      return;
    }

    // Validate step types
    const validTypes = [
      "scrape_google_maps",
      "scrape_google_places",
      "scrape_yellow_pages",
      "scrape_yelp",
      "scrape_bbb",
      "scrape_state_directory",
      "scrape_chamber_directory",
      "audit_website",
      "audit_gmb",
      "audit_eeat",
      "enrich_business_dna",
      "score_opportunities",
      "create_campaign",
    ];
    for (const step of steps) {
      if (!validTypes.includes(step.type)) {
        res.status(400).json({ error: `Invalid step type: ${step.type}` });
        return;
      }
    }

    const workflow = createWorkflow({
      name: cleanText(name),
      description: parseOptionalString(description),
      steps: steps as AutomationStep[],
      scheduleType: parseOptionalString(req.body?.scheduleType) || "none",
      scheduleSpec: parseOptionalString(req.body?.scheduleSpec) || null,
      defaultInput: req.body?.defaultInput || {},
    });

    // Reload scheduler so new workflow takes effect
    try { reloadAutomationSchedules(); } catch {}

    res.status(201).json({ workflow });
  } catch (error) {
    console.error("Failed to create workflow", error);
    res.status(500).json({ error: "Failed to create automation workflow" });
  }
});

automationRouter.put("/workflows/:id", (req, res) => {
  try {
    const { name, description, steps, is_active } = req.body;
    const patch: Record<string, unknown> = {};

    if (name !== undefined) patch.name = cleanText(name);
    if (description !== undefined) patch.description = parseOptionalString(description);
    if (steps !== undefined) {
      if (!Array.isArray(steps) || steps.length === 0) {
        res.status(400).json({ error: "Steps must be a non-empty array" });
        return;
      }
      patch.steps_json = JSON.stringify(steps);
    }
    if (is_active !== undefined) patch.is_active = is_active ? 1 : 0;
    if (req.body?.scheduleType !== undefined) patch.schedule_type = parseOptionalString(req.body.scheduleType) || 'none';
    if (req.body?.scheduleSpec !== undefined) patch.schedule_spec = parseOptionalString(req.body.scheduleSpec) || null;
    if (req.body?.defaultInput !== undefined) patch.default_input_json = typeof req.body.defaultInput === 'string' ? req.body.defaultInput : JSON.stringify(req.body.defaultInput || {});

    const workflow = updateWorkflow(req.params.id, patch as any);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    // Reload scheduler so updates take effect
    try { reloadAutomationSchedules(); } catch {}

    res.json({ workflow });
  } catch (error) {
    console.error("Failed to update workflow", error);
    res.status(500).json({ error: "Failed to update automation workflow" });
  }
});

automationRouter.delete("/workflows/:id", (req, res) => {
  try {
    const deleted = deleteWorkflow(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    // Reload scheduler after deletion
    try { reloadAutomationSchedules(); } catch {}

    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete workflow", error);
    res.status(500).json({ error: "Failed to delete automation workflow" });
  }
});

/* ── Run management ── */

automationRouter.get("/runs", (req, res) => {
  try {
    const workflowId = parseOptionalString(req.query.workflowId);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const runs = listAutomationRuns(workflowId, limit);
    res.json({ items: runs });
  } catch (error) {
    console.error("Failed to list runs", error);
    res.status(500).json({ error: "Failed to list automation runs" });
  }
});

automationRouter.get("/runs/:id", (req, res) => {
  try {
    const run = getAutomationRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json({ run });
  } catch (error) {
    console.error("Failed to get run", error);
    res.status(500).json({ error: "Failed to get automation run" });
  }
});

automationRouter.post("/runs", async (req, res) => {
  try {
    const { workflowId, input } = req.body;

    if (!workflowId || !input) {
      res.status(400).json({ error: "workflowId and input are required" });
      return;
    }

    const workflow = getWorkflow(workflowId);
    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    if (!workflow.is_active) {
      res.status(400).json({ error: "Workflow is not active" });
      return;
    }

    const steps = JSON.parse(workflow.steps_json) as AutomationStep[];
    if (getDb().prepare("SELECT id FROM automation_runs WHERE workflow_id=? AND status IN ('queued','running') LIMIT 1").get(workflowId)) {
      return res.status(409).json({ error: "This workflow already has an active run" });
    }

    // Synchronously create the run record first
    const run = createAutomationRun({
      workflowId,
      workflowName: workflow.name,
      totalSteps: steps.length,
      inputJson: JSON.stringify(input),
    });

    // Execute the run asynchronously — respond immediately with the run info
    executeAutomationRun(run.id, steps, input).catch((err) => {
      console.error(`Automation run failed (run=${run.id}):`, err);
    });

    res.status(201).json({ run });
  } catch (error) {
    console.error("Failed to start automation run", error);
    res.status(500).json({ error: "Failed to start automation run" });
  }
});
