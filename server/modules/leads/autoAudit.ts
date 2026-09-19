import { v4 as uuidv4 } from "uuid";
import { runGmbAudit, type GmbAuditResult } from "../audits/gmb.js";
import { runWebsiteAudit, type WebsiteAuditResult } from "../audits/website.js";
import { insertStoredAuditRecord } from "../audits/store.js";
import { getDb, tenantLocalStorage } from "../../db/database.js";
import { getMainDb } from "../../db/mainDb.js";

class AutoAuditQueue {
  private processingTenants = new Set<string>();

  public enqueue(leadId: string): void {
    if (!leadId) return;
    const tenantId = tenantLocalStorage.getStore()?.tenantId || "default";
    const db = getDb();
    const active = db.prepare("SELECT 1 FROM auto_audit_jobs WHERE lead_id=? AND status IN ('pending','running') LIMIT 1").get(leadId);
    if (!active) db.prepare("INSERT INTO auto_audit_jobs(id,lead_id,status,scheduled_at) VALUES(?,?,'pending',datetime('now'))").run(uuidv4(), leadId);
    void this.processTenant(tenantId);
  }

  public recoverAllTenants(recoverRunning = true): void {
    const tenants = getMainDb().prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;
    for (const tenant of tenants) {
      tenantLocalStorage.run({ tenantId: tenant.id }, () => {
        if (recoverRunning) getDb().prepare("UPDATE auto_audit_jobs SET status='pending',claimed_at=NULL,error_message='Recovered after server restart' WHERE status='running'").run();
      });
      void this.processTenant(tenant.id);
    }
  }

  private claimNext(): { id: string; lead_id: string; attempt_count: number } | null {
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db.prepare("SELECT id,lead_id,attempt_count FROM auto_audit_jobs WHERE status='pending' AND datetime(scheduled_at)<=datetime('now') ORDER BY datetime(scheduled_at),created_at LIMIT 1").get() as any;
      if (!row) { db.exec("COMMIT"); return null; }
      const claimed = db.prepare("UPDATE auto_audit_jobs SET status='running',claimed_at=datetime('now'),attempt_count=attempt_count+1 WHERE id=? AND status='pending'").run(row.id);
      db.exec("COMMIT");
      return claimed.changes ? { ...row, attempt_count: Number(row.attempt_count || 0) + 1 } : null;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }

  private async processTenant(tenantId: string): Promise<void> {
    if (this.processingTenants.has(tenantId)) return;
    this.processingTenants.add(tenantId);
    try {
      await tenantLocalStorage.run({ tenantId }, async () => {
        while (true) {
          const job = this.claimNext();
          if (!job) break;
          try {
            await this.runAudit(job.lead_id);
            getDb().prepare("UPDATE auto_audit_jobs SET status='completed',completed_at=datetime('now'),error_message=NULL WHERE id=?").run(job.id);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Auto-audit failed";
            if (job.attempt_count >= 3) getDb().prepare("UPDATE auto_audit_jobs SET status='failed',completed_at=datetime('now'),error_message=? WHERE id=?").run(message.slice(0,500),job.id);
            else getDb().prepare("UPDATE auto_audit_jobs SET status='pending',claimed_at=NULL,scheduled_at=datetime('now',?),error_message=? WHERE id=?").run(`+${job.attempt_count * 5} minutes`,message.slice(0,500),job.id);
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      });
    } finally { this.processingTenants.delete(tenantId); }
  }

  private async runAudit(leadId: string): Promise<void> {
    const { getLeadById, updateLeadScore } = await import("./repository.js");
    const lead = getLeadById(leadId);
    if (!lead) throw new Error("Lead no longer exists");
    const db = getDb();
    const errors: string[] = [];

    const existingGmb = db.prepare("SELECT id FROM audits WHERE lead_id=? AND audit_type='gmb' AND status='completed' LIMIT 1").get(leadId);
    if (!existingGmb && lead.business_name) {
      try {
        const result = runGmbAudit({ businessName: lead.business_name, city: lead.city || undefined, state: lead.state || undefined, website: lead.website || undefined, gmbUrl: lead.gmb_url || undefined, gmbClaimed: lead.gmb_claimed, gmbRating: lead.gmb_rating, gmbReviewCount: lead.gmb_review_count, phone: lead.phone || undefined, email: lead.email || undefined, gmbProfileIncomplete: lead.gmb_profile_incomplete, citationsFound: lead.citations_found });
        insertStoredAuditRecord<GmbAuditResult>({ leadId: lead.id, auditType: "gmb", targetName: lead.business_name, verdict: result.verdict, score: result.score, result });
      } catch (error) { errors.push(`GMB audit: ${error instanceof Error ? error.message : 'failed'}`); }
    }

    const existingWebsite = db.prepare("SELECT id FROM audits WHERE lead_id=? AND audit_type='website' AND status='completed' LIMIT 1").get(leadId);
    if (!existingWebsite && lead.website && lead.has_website) {
      try {
        const result = await runWebsiteAudit({ website: lead.website, businessName: lead.business_name, city: lead.city || undefined, state: lead.state || undefined });
        insertStoredAuditRecord<WebsiteAuditResult>({ leadId: lead.id, auditType: "website", targetName: lead.business_name, verdict: result.verdict, score: result.score, result });
      } catch (error) { errors.push(`Website audit: ${error instanceof Error ? error.message : 'failed'}`); }
    }

    updateLeadScore(leadId);
    if (errors.length) throw new Error(errors.join("; "));
  }
}

export const autoAuditQueue = new AutoAuditQueue();
let recoveryInterval: ReturnType<typeof setInterval> | null = null;
export function startAutoAuditRecovery(): void {
  autoAuditQueue.recoverAllTenants();
  if (!recoveryInterval) {
    recoveryInterval = setInterval(() => autoAuditQueue.recoverAllTenants(false), 60_000);
    recoveryInterval.unref?.();
  }
}