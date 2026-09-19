import type { NextFunction, Request, Response } from "express";
import { getMainDb } from "../../db/mainDb.js";

export const USER_ROLES = ["admin", "manager", "member", "viewer"] as const;
export type UserRole = typeof USER_ROLES[number] | "super_admin";
export type Permission =
  | "dashboard.view" | "leads.view" | "leads.manage" | "audits.run"
  | "outreach.manage" | "automation.manage" | "integrations.manage"
  | "settings.manage" | "users.manage" | "platform.manage";

const ALL_PERMISSIONS: Permission[] = [
  "dashboard.view", "leads.view", "leads.manage", "audits.run", "outreach.manage",
  "automation.manage", "integrations.manage", "settings.manage", "users.manage", "platform.manage",
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((permission) => permission !== "platform.manage"),
  manager: ["dashboard.view", "leads.view", "leads.manage", "audits.run", "outreach.manage", "automation.manage"],
  member: ["dashboard.view", "leads.view", "leads.manage", "audits.run", "outreach.manage"],
  viewer: ["dashboard.view", "leads.view"],
};

export type PlanKey = "free" | "pro" | "enterprise";
export type PlanDefinition = {
  key: PlanKey; name: string; description: string;
  pricing: { currency: "USD"; monthly: number; yearly: number };
  limits: { users: number; leads: number; activeCampaigns: number; scraperJobs: number };
  features: { multiUser: boolean; automation: boolean; advancedAudits: boolean; apiIntegrations: boolean; priorityWorkflows: boolean };
};

export const PLAN_CATALOG: Record<PlanKey, PlanDefinition> = {
  free: {
    key: "free", name: "Starter", description: "Single-user workspace for validating the lead workflow.",
    pricing: { currency: "USD", monthly: 0, yearly: 0 },
    limits: { users: 1, leads: 50, activeCampaigns: 1, scraperJobs: 5 },
    features: { multiUser: false, automation: false, advancedAudits: true, apiIntegrations: true, priorityWorkflows: false },
  },
  pro: {
    key: "pro", name: "Growth", description: "Team workspace with automation and higher operating limits.",
    pricing: { currency: "USD", monthly: 49, yearly: 490 },
    limits: { users: 5, leads: 1000, activeCampaigns: 10, scraperJobs: 50 },
    features: { multiUser: true, automation: true, advancedAudits: true, apiIntegrations: true, priorityWorkflows: true },
  },
  enterprise: {
    key: "enterprise", name: "Agency", description: "Full agency controls, unlimited seats and workflows.",
    pricing: { currency: "USD", monthly: 149, yearly: 1490 },
    limits: { users: -1, leads: -1, activeCampaigns: -1, scraperJobs: -1 },
    features: { multiUser: true, automation: true, advancedAudits: true, apiIntegrations: true, priorityWorkflows: true },
  },
};

export function normalizeRole(role: unknown, platformRole?: unknown): UserRole {
  if (String(platformRole || "").toLowerCase() === "super_admin" || String(role || "").toLowerCase() === "super_admin") return "super_admin";
  const normalized = String(role || "viewer").toLowerCase();
  return USER_ROLES.includes(normalized as typeof USER_ROLES[number]) ? normalized as UserRole : "viewer";
}

export function normalizePlan(plan: unknown): PlanKey {
  const normalized = String(plan || "free").toLowerCase();
  return normalized === "pro" || normalized === "enterprise" ? normalized : "free";
}

export function permissionsFor(role: UserRole): Permission[] { return [...ROLE_PERMISSIONS[role]]; }
export function hasPermission(role: UserRole, permission: Permission): boolean { return ROLE_PERMISSIONS[role].includes(permission); }

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = normalizeRole(req.user?.role);
    if (!hasPermission(role, permission)) {
      res.status(403).json({ error: "Your role does not allow this action.", requiredPermission: permission });
      return;
    }
    next();
  };
}

function permissionForRequest(req: Request): Permission | null {
  const path = req.path.toLowerCase();
  const readOnly = req.method === "GET" || req.method === "HEAD";
  if (path.startsWith("/platform")) return "platform.manage";
  if (path.startsWith("/users")) return "users.manage";
  if (path.startsWith("/settings") && (!readOnly || path.includes("api") || path === "/settings" || path.startsWith("/settings/"))) return "settings.manage";
  if (path.startsWith("/ai") || path.startsWith("/google")) return "integrations.manage";
  if (path.startsWith("/automation")) return readOnly ? "dashboard.view" : "automation.manage";
  if (path.startsWith("/email") || path.startsWith("/outreach")) return readOnly ? "dashboard.view" : "outreach.manage";
  if (path.startsWith("/scrapers") || path.startsWith("/import") || path.startsWith("/leads") || path.startsWith("/clients")) return readOnly ? "leads.view" : "leads.manage";
  if (path.startsWith("/seo") || path.startsWith("/site-audit") || path.startsWith("/eeat") || path.startsWith("/audit")) return readOnly ? "dashboard.view" : "audits.run";
  if (path.startsWith("/share")) return readOnly ? "dashboard.view" : "outreach.manage";
  return readOnly ? "dashboard.view" : "leads.manage";
}

export function enforceSaasAccess(req: Request, res: Response, next: NextFunction): void {
  const role = normalizeRole(req.user?.role);
  if (role === "super_admin") { next(); return; }
  const tenant = getMainDb().prepare("SELECT subscription_plan, billing_status FROM tenants WHERE id = ?").get(req.user?.tenantId || "") as { subscription_plan?: string; billing_status?: string } | undefined;
  if (!tenant || ["suspended", "canceled"].includes(String(tenant.billing_status || "").toLowerCase())) {
    res.status(403).json({ error: "This workspace is suspended. Contact the platform administrator." });
    return;
  }
  const plan = PLAN_CATALOG[normalizePlan(tenant.subscription_plan)];
  if (req.path.toLowerCase().startsWith("/automation") && !plan.features.automation) {
    res.status(403).json({ error: "Automation is available on the Growth and Agency plans.", planRequired: "pro" });
    return;
  }
  const permission = permissionForRequest(req);
  if (permission && !hasPermission(role, permission)) {
    res.status(403).json({ error: "Your role does not allow this action.", requiredPermission: permission });
    return;
  }
  next();
}
