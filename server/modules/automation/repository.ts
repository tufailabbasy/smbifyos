import { getDb } from "../../db/database.js";

export type AutomationWorkflow = {
  id: string;
  name: string;
  description: string | null;
  steps_json: string;
  is_active: number;
  schedule_type: string; // 'none' | 'daily' | 'cron'
  schedule_spec: string | null; // e.g. '09:30' for daily or cron expression for cron
  default_input_json: string; // JSON string for default input used by scheduled runs
  created_at: string;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  current_step: number;
  total_steps: number;
  steps_progress_json: string;
  input_json: string;
  result_json: string | null;
  error_message: string | null;
  progress_percent: number;
  progress_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type AutomationStep = {
  type:
    | "scrape"
    | "scrape_google_maps"
    | "scrape_google_places"
    | "scrape_yellow_pages"
    | "scrape_yelp"
    | "scrape_bbb"
    | "scrape_state_directory"
    | "scrape_chamber_directory"
    | "audit_website"
    | "audit_gmb"
    | "audit_eeat"
    | "enrich_business_dna"
    | "score_opportunities"
    | "create_campaign";
  label: string;
  config: Record<string, unknown>;
};

export type WorkflowInput = {
  source: string;
  query: string;
  city: string;
  state: string;
  niche: string;
  maxLeads: number;
  campaignName?: string;
  campaignSubject?: string;
  campaignBody?: string;
  prompt?: string;
  filters?: {
    minRating?: number;
    maxRating?: number;
    maxReviews?: number;
    websitePreference?: "any" | "missing" | "weak";
  };
  channels?: string[];
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function listWorkflows(): AutomationWorkflow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM automation_workflows ORDER BY datetime(created_at) DESC"
    )
    .all() as AutomationWorkflow[];
}

export function getWorkflow(id: string): AutomationWorkflow | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM automation_workflows WHERE id = ?")
      .get(id) as AutomationWorkflow | undefined) || null
  );
}

export function createWorkflow(input: {
  name: string;
  description?: string;
  steps: AutomationStep[];
  scheduleType?: string;
  scheduleSpec?: string | null;
  defaultInput?: Record<string, unknown> | string;
}): AutomationWorkflow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  const stepsJson = JSON.stringify(input.steps);
  const scheduleType = cleanText(input.scheduleType) || "none";
  const scheduleSpec = input.scheduleSpec ? String(input.scheduleSpec) : null;
  const defaultInputJson = typeof input.defaultInput === "string" ? input.defaultInput : JSON.stringify(input.defaultInput || {});

  db.prepare(
    `INSERT INTO automation_workflows (id, name, description, steps_json, is_active, schedule_type, schedule_spec, default_input_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ).run(
    id,
    cleanText(input.name),
    cleanText(input.description) || null,
    stepsJson,
    scheduleType,
    scheduleSpec,
    defaultInputJson,
    now,
    now
  );

  return getWorkflow(id) as AutomationWorkflow;
}

export function updateWorkflow(
  id: string,
  patch: Partial<Pick<AutomationWorkflow, "name" | "description" | "steps_json" | "is_active" | "schedule_type" | "schedule_spec" | "default_input_json">>
): AutomationWorkflow | null {
  const db = getDb();
  const existing = getWorkflow(id);
  if (!existing) return null;

  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE automation_workflows SET name=?, description=?, steps_json=?, is_active=?, schedule_type=?, schedule_spec=?, default_input_json=?, updated_at=? WHERE id=?`
  ).run(
    merged.name,
    merged.description,
    merged.steps_json,
    merged.is_active,
    merged.schedule_type,
    merged.schedule_spec,
    merged.default_input_json,
    merged.updated_at,
    id
  );

  return getWorkflow(id);
}

export function deleteWorkflow(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM automation_workflows WHERE id = ?").run(id);
  return Number(result.changes || 0) > 0;
}

// ── Run management ──

export function createAutomationRun(input: {
  workflowId: string;
  workflowName: string;
  totalSteps: number;
  inputJson: string;
}): AutomationRun {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  const stepsProgress = JSON.stringify(
    Array.from({ length: input.totalSteps }, (_, i) => ({
      step: i + 1,
      status: "pending",
      label: "",
      message: null,
      completed_at: null,
    }))
  );

  db.prepare(
    `INSERT INTO automation_runs (
      id, workflow_id, workflow_name, status, current_step, total_steps,
      steps_progress_json, input_json, result_json, error_message,
      progress_percent, progress_message, created_at, started_at, completed_at
    ) VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, NULL, NULL, 0, NULL, ?, NULL, NULL)`
  ).run(
    id,
    input.workflowId,
    input.workflowName,
    input.totalSteps,
    stepsProgress,
    input.inputJson,
    now
  );

  return getAutomationRun(id) as AutomationRun;
}

export function getAutomationRun(id: string): AutomationRun | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM automation_runs WHERE id = ?")
      .get(id) as AutomationRun | undefined) || null
  );
}

export function listAutomationRuns(workflowId?: string, limit = 20): AutomationRun[] {
  const db = getDb();
  if (workflowId) {
    return db
      .prepare(
        "SELECT * FROM automation_runs WHERE workflow_id = ? ORDER BY datetime(created_at) DESC LIMIT ?"
      )
      .all(workflowId, limit) as AutomationRun[];
  }
  return db
    .prepare("SELECT * FROM automation_runs ORDER BY datetime(created_at) DESC LIMIT ?")
    .all(limit) as AutomationRun[];
}

export function updateAutomationRun(
  id: string,
  patch: Partial<AutomationRun>
): AutomationRun | null {
  const db = getDb();
  const existing = getAutomationRun(id);
  if (!existing) return null;

  const merged = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(
    `UPDATE automation_runs SET
      status=?, current_step=?, total_steps=?, steps_progress_json=?,
      input_json=?, result_json=?, error_message=?,
      progress_percent=?, progress_message=?, started_at=?, completed_at=?
     WHERE id=?`
  ).run(
    merged.status,
    merged.current_step,
    merged.total_steps,
    merged.steps_progress_json,
    merged.input_json,
    merged.result_json,
    merged.error_message,
    merged.progress_percent,
    merged.progress_message,
    merged.started_at,
    merged.completed_at,
    id
  );

  return getAutomationRun(id);
}
