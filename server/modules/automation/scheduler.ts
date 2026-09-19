import cron from "node-cron";
import { listWorkflows, createAutomationRun } from "./repository.js";
import { executeAutomationRun } from "./engine.js";
import { getMainDb } from "../../db/mainDb.js";
import { getDb, tenantLocalStorage } from "../../db/database.js";

interface ScheduledJob {
  key: string;
  task: cron.ScheduledTask;
}

let jobs: ScheduledJob[] = [];

function toCronExpression(scheduleType: string, scheduleSpec?: string | null): string | null {
  if (!scheduleType || scheduleType === "none") return null;
  if (scheduleType === "cron") {
    return scheduleSpec || null;
  }
  if (scheduleType === "daily") {
    if (!scheduleSpec) return null;
    const parts = String(scheduleSpec).split(":");
    const hour = Number(parts[0] ?? 0);
    const minute = Number(parts[1] ?? 0);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return `${minute} ${hour} * * *`;
  }
  return null;
}

export function reloadAutomationSchedules(): void {
  // Stop existing cron jobs
  for (const j of jobs) {
    try {
      j.task.stop();
    } catch {}
  }
  jobs = [];

  try {
    const mainDb = getMainDb();
    const tenants = mainDb.prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;

    for (const tenant of tenants) {
      tenantLocalStorage.run({ tenantId: tenant.id }, () => {
        loadTenantSchedules(tenant.id);
      });
    }
  } catch (err) {
    console.error("[scheduler] Failed to query tenants for schedules:", err);
  }
}

function loadTenantSchedules(tenantId: string): void {
  try {
    const workflows = listWorkflows();
    for (const wf of workflows) {
      if (!wf.is_active) continue;
      if (!wf.schedule_type || wf.schedule_type === "none") continue;
      
      const cronExpr = toCronExpression(wf.schedule_type, wf.schedule_spec);
      if (!cronExpr) continue;

      const steps = JSON.parse(wf.steps_json);
      const defaultInput = wf.default_input_json ? JSON.parse(wf.default_input_json) : {};

      const task = cron.schedule(cronExpr, () => {
        try {
          console.log(`[automation] Triggering scheduled workflow ${wf.id} (${wf.name}) for tenant: ${tenantId}`);
          tenantLocalStorage.run({ tenantId }, () => {
            const activeRun = getDb().prepare("SELECT id FROM automation_runs WHERE workflow_id=? AND status IN ('queued','running') LIMIT 1").get(wf.id);
            if (activeRun) { console.log(`[automation] Skipping overlapping run for workflow ${wf.id}`); return; }
            const run = createAutomationRun({
              workflowId: wf.id,
              workflowName: wf.name,
              totalSteps: steps.length,
              inputJson: JSON.stringify(defaultInput),
            });
            executeAutomationRun(run.id, steps, defaultInput).catch((err) => {
              console.error(`[automation] Scheduled run failed for workflow ${wf.id} (run=${run.id}, tenant: ${tenantId}):`, err);
            });
          });
        } catch (err) {
          console.error(`[automation] Error starting scheduled run for workflow ${wf.id} (tenant: ${tenantId}):`, err);
        }
      });

      jobs.push({ key: `${tenantId}:${wf.id}`, task });
      console.log(`[automation] Scheduled workflow ${wf.id} (${wf.name}) for tenant: ${tenantId} -> ${cronExpr}`);
    }
  } catch (err) {
    console.error(`[scheduler] Failed to load schedules for tenant: ${tenantId}`, err);
  }
}

function recoverTenantRuns(tenantId: string): void {
  tenantLocalStorage.run({ tenantId }, () => {
    const db = getDb();
    db.prepare(`UPDATE automation_runs SET status='failed',error_message='Server restarted while this run was active; review completed outputs before rerunning.',progress_message='Interrupted by server restart',completed_at=datetime('now') WHERE status='running'`).run();
    const queued = db.prepare("SELECT id,workflow_id,input_json FROM automation_runs WHERE status='queued' ORDER BY datetime(created_at) LIMIT 20").all() as Array<{ id: string; workflow_id: string; input_json: string }>;
    for (const run of queued) {
      const workflow = db.prepare("SELECT steps_json FROM automation_workflows WHERE id=? AND is_active=1").get(run.workflow_id) as { steps_json: string } | undefined;
      if (!workflow) {
        db.prepare("UPDATE automation_runs SET status='failed',error_message='Workflow is missing or inactive',completed_at=datetime('now') WHERE id=?").run(run.id);
        continue;
      }
      try {
        const steps = JSON.parse(workflow.steps_json);
        const input = JSON.parse(run.input_json || "{}");
        void executeAutomationRun(run.id, steps, input).catch((error) => console.error(`[automation] Recovered run ${run.id} failed`, error));
      } catch (error) {
        db.prepare("UPDATE automation_runs SET status='failed',error_message=?,completed_at=datetime('now') WHERE id=?").run(error instanceof Error ? error.message : "Invalid stored workflow", run.id);
      }
    }
  });
}
export function startAutomationScheduler(): void {
  reloadAutomationSchedules();
  const tenants = getMainDb().prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
  for (const tenant of tenants) recoverTenantRuns(tenant.id);
  // Also refresh schedules every 5 minutes in case DB changed
  setInterval(() => {
    try {
      reloadAutomationSchedules();
    } catch (err) {
      console.error("[scheduler] Failed to refresh schedules:", err);
    }
  }, 1000 * 60 * 5);
}
