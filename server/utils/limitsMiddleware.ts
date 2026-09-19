import { Request, Response, NextFunction } from "express";
import { getMainDb } from "../db/mainDb.js";
import { getDb } from "../db/database.js";

interface PlanLimits {
  leads: number;
  activeCampaigns: number;
  scraperJobs: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    leads: 50,
    activeCampaigns: 1,
    scraperJobs: 5,
  },
  pro: {
    leads: 1000,
    activeCampaigns: 10,
    scraperJobs: 50,
  },
  enterprise: {
    leads: Infinity,
    activeCampaigns: Infinity,
    scraperJobs: Infinity,
  },
};

function getTenantPlan(tenantId: string): string {
  try {
    const mainDb = getMainDb();
    const tenant = mainDb.prepare("SELECT subscription_plan FROM tenants WHERE id = ?").get(tenantId) as { subscription_plan: string } | undefined;
    return tenant?.subscription_plan || "free";
  } catch {
    return "free";
  }
}

export function checkLeadLimit(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.user?.tenantId || "default";
  const plan = getTenantPlan(tenantId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (limits.leads === Infinity) {
    next();
    return;
  }

  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number };
    const count = row?.count || 0;

    if (count >= limits.leads) {
      res.status(403).json({
        error: `Lead limit reached (${count}/${limits.leads} leads). Please upgrade your plan to add more leads.`,
        limitExceeded: "leads",
        current: count,
        limit: limits.leads,
      });
      return;
    }
    next();
  } catch (error) {
    next(); // Pass through on DB error to not break the application
  }
}

export function checkCampaignLimit(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.user?.tenantId || "default";
  const plan = getTenantPlan(tenantId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (limits.activeCampaigns === Infinity) {
    next();
    return;
  }

  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT (SELECT COUNT(*) FROM campaigns WHERE LOWER(COALESCE(status, 'draft')) NOT IN ('completed', 'cancelled', 'archived')) +
             (SELECT COUNT(*) FROM email_campaigns WHERE LOWER(COALESCE(status, 'draft')) NOT IN ('complete', 'completed', 'cancelled', 'archived')) as count
    `).get() as { count: number };
    const count = row?.count || 0;

    if (count >= limits.activeCampaigns) {
      res.status(403).json({
        error: `Active campaign limit reached (${count}/${limits.activeCampaigns} campaigns). Please upgrade your plan to create more active campaigns.`,
        limitExceeded: "campaigns",
        current: count,
        limit: limits.activeCampaigns,
      });
      return;
    }
    next();
  } catch (error) {
    next();
  }
}

export function checkScraperLimit(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.user?.tenantId || "default";
  const plan = getTenantPlan(tenantId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (limits.scraperJobs === Infinity) {
    next();
    return;
  }

  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM scraper_jobs").get() as { count: number };
    const count = row?.count || 0;

    if (count >= limits.scraperJobs) {
      res.status(403).json({
        error: `Scraper jobs limit reached (${count}/${limits.scraperJobs} jobs). Please upgrade your plan to run more search discovery jobs.`,
        limitExceeded: "scrapers",
        current: count,
        limit: limits.scraperJobs,
      });
      return;
    }
    next();
  } catch (error) {
    next();
  }
}
export { PLAN_LIMITS };
