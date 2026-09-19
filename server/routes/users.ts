import express from "express";
import crypto from "node:crypto";
import { getMainDb } from "../db/mainDb.js";
import { generateTemporaryPassword, hashPassword, validatePassword } from "../utils/password.js";
import { PLAN_CATALOG, USER_ROLES, normalizePlan, normalizeRole, requirePermission } from "../modules/saas/access.js";

export const usersRouter = express.Router();
export const platformRouter = express.Router();

const clean = (value: unknown) => String(value ?? "").trim();
const emailValue = (value: unknown) => clean(value).toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function audit(actorId: string, action: string, targetType: string, targetId: string, details: unknown = null) {
  getMainDb().prepare(`INSERT INTO admin_audit_log (id, actor_user_id, action, target_type, target_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), actorId, action, targetType, targetId, details ? JSON.stringify(details) : null);
}

function tenantUserCount(tenantId: string): number {
  const row = getMainDb().prepare("SELECT COUNT(*) count FROM users WHERE tenant_id = ? AND is_active = 1").get(tenantId) as { count: number };
  return Number(row?.count || 0);
}

usersRouter.use(requirePermission("users.manage"));

usersRouter.get("/plan", (req, res) => {
  const db = getMainDb();
  const tenant = db.prepare("SELECT id, name, subscription_plan, billing_status FROM tenants WHERE id = ?").get(req.user!.tenantId) as any;
  const plan = PLAN_CATALOG[normalizePlan(tenant?.subscription_plan)];
  res.json({ tenant, plan, seatUsage: tenantUserCount(req.user!.tenantId), catalog: Object.values(PLAN_CATALOG) });
});

usersRouter.get("/", (req, res) => {
  const rows = getMainDb().prepare(`SELECT id, name, email, CASE WHEN platform_role = 'super_admin' THEN 'super_admin' ELSE role END role, role workspace_role, platform_role, is_active, last_login_at, created_at, updated_at
    FROM users WHERE tenant_id = ? AND (? = 'super_admin' OR platform_role != 'super_admin') ORDER BY is_active DESC, created_at ASC`).all(req.user!.tenantId, req.user!.role);
  res.json({ items: rows });
});

usersRouter.post("/", (req, res) => {
  const db = getMainDb();
  const tenant = db.prepare("SELECT subscription_plan FROM tenants WHERE id = ?").get(req.user!.tenantId) as { subscription_plan?: string } | undefined;
  const plan = PLAN_CATALOG[normalizePlan(tenant?.subscription_plan)];
  const activeUsers = tenantUserCount(req.user!.tenantId);
  if (plan.limits.users !== -1 && activeUsers >= plan.limits.users) {
    res.status(403).json({ error: `Your ${plan.name} plan allows ${plan.limits.users} active user${plan.limits.users === 1 ? "" : "s"}.`, limitExceeded: "users", current: activeUsers, limit: plan.limits.users });
    return;
  }
  const name = clean(req.body?.name);
  const email = emailValue(req.body?.email);
  const requestedRole = clean(req.body?.role || "member").toLowerCase();
  const role = USER_ROLES.includes(requestedRole as any) ? requestedRole : "member";
  const password = clean(req.body?.password) || generateTemporaryPassword();
  const passwordError = validatePassword(password);
  if (!name || !validEmail(email) || passwordError) { res.status(400).json({ error: passwordError || "A valid name and email are required." }); return; }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) { res.status(409).json({ error: "This email is already registered." }); return; }
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, tenant_id, role, platform_role, is_active, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'user', 1, ?)`).run(id, name, email, hashPassword(password), req.user!.tenantId, role, req.user!.userId);
  audit(req.user!.userId, "user.created", "user", id, { role, email });
  res.status(201).json({ user: { id, name, email, role, is_active: 1 }, temporaryPassword: password });
});

usersRouter.patch("/:id", (req, res) => {
  const db = getMainDb();
  const target = db.prepare("SELECT id, email, role, platform_role, is_active FROM users WHERE id = ? AND tenant_id = ?").get(req.params.id, req.user!.tenantId) as any;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.platform_role === "super_admin" && req.user!.role !== "super_admin") { res.status(403).json({ error: "Platform super-admin accounts are protected." }); return; }
  if (target.id === req.user!.userId && (req.body?.isActive === false || req.body?.role && req.body.role !== target.role)) {
    res.status(400).json({ error: "You cannot deactivate or change your own role." }); return;
  }
  const name = clean(req.body?.name);
  const email = req.body?.email === undefined ? "" : emailValue(req.body.email);
  if (email && !validEmail(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  if (email && db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, target.id)) { res.status(409).json({ error: "This email is already registered." }); return; }
  const requestedRole = clean(req.body?.role).toLowerCase();
  const role = requestedRole && USER_ROLES.includes(requestedRole as any) ? requestedRole : target.role;
  const isActive = typeof req.body?.isActive === "boolean" ? (req.body.isActive ? 1 : 0) : Number(target.is_active);
  if (target.role === "admin" && (!isActive || role !== "admin")) {
    const admins = db.prepare("SELECT COUNT(*) count FROM users WHERE tenant_id = ? AND role = 'admin' AND is_active = 1").get(req.user!.tenantId) as { count: number };
    if (admins.count <= 1) { res.status(400).json({ error: "Every workspace must keep at least one active admin." }); return; }
  }
  db.prepare("UPDATE users SET name = COALESCE(NULLIF(?, ''), name), email = COALESCE(NULLIF(?, ''), email), role = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, email, role, isActive, target.id);
  audit(req.user!.userId, "user.updated", "user", target.id, { name: name || undefined, email: email || undefined, role, isActive });
  res.json({ ok: true });
});
usersRouter.post("/:id/reset-password", (req, res) => {
  const db = getMainDb();
  const target = db.prepare("SELECT id, platform_role FROM users WHERE id = ? AND tenant_id = ?").get(req.params.id, req.user!.tenantId) as any;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.platform_role === "super_admin" && req.user!.role !== "super_admin") { res.status(403).json({ error: "Platform super-admin accounts are protected." }); return; }
  const password = clean(req.body?.password) || generateTemporaryPassword();
  const error = validatePassword(password);
  if (error) { res.status(400).json({ error }); return; }
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashPassword(password), target.id);
  audit(req.user!.userId, "user.password_reset", "user", target.id);
  res.json({ ok: true, temporaryPassword: password });
});

usersRouter.delete("/:id", (req, res) => {
  const db = getMainDb();
  if (req.params.id === req.user!.userId) { res.status(400).json({ error: "You cannot remove your own account." }); return; }
  const target = db.prepare("SELECT id, role, platform_role FROM users WHERE id = ? AND tenant_id = ?").get(req.params.id, req.user!.tenantId) as any;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.platform_role === "super_admin") { res.status(403).json({ error: "Platform super-admin accounts cannot be removed here." }); return; }
  if (target.role === "admin") {
    const admins = db.prepare("SELECT COUNT(*) count FROM users WHERE tenant_id = ? AND role = 'admin' AND is_active = 1").get(req.user!.tenantId) as { count: number };
    if (admins.count <= 1) { res.status(400).json({ error: "Every workspace must keep at least one active admin." }); return; }
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
  audit(req.user!.userId, "user.deleted", "user", target.id);
  res.json({ ok: true });
});

platformRouter.use(requirePermission("platform.manage"));

platformRouter.get("/summary", (_req, res) => {
  const db = getMainDb();
  const one = (sql: string) => Number((db.prepare(sql).get() as any)?.count || 0);
  res.json({ tenants: one("SELECT COUNT(*) count FROM tenants"), activeTenants: one("SELECT COUNT(*) count FROM tenants WHERE billing_status = 'active'"), users: one("SELECT COUNT(*) count FROM users"), activeUsers: one("SELECT COUNT(*) count FROM users WHERE is_active = 1"), plans: db.prepare("SELECT subscription_plan plan, COUNT(*) count FROM tenants GROUP BY subscription_plan").all() });
});

platformRouter.get("/tenants", (_req, res) => {
  const rows = getMainDb().prepare(`SELECT t.id, t.name, t.subscription_plan, t.billing_status, t.created_at, t.updated_at,
    COUNT(u.id) user_count, SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) active_user_count
    FROM tenants t LEFT JOIN users u ON u.tenant_id = t.id GROUP BY t.id ORDER BY t.created_at DESC`).all();
  res.json({ items: rows, plans: Object.values(PLAN_CATALOG) });
});

platformRouter.get("/users", (req, res) => {
  const search = `%${clean(req.query.search)}%`;
  const rows = getMainDb().prepare(`SELECT u.id, u.name, u.email, CASE WHEN u.platform_role = 'super_admin' THEN 'super_admin' ELSE u.role END role, u.role workspace_role, u.platform_role, u.is_active, u.last_login_at, u.created_at,
    t.id tenant_id, t.name tenant_name, t.subscription_plan FROM users u JOIN tenants t ON t.id = u.tenant_id
    WHERE (? = '%%' OR u.name LIKE ? OR u.email LIKE ? OR t.name LIKE ?) ORDER BY u.created_at DESC LIMIT 500`).all(search, search, search, search);
  res.json({ items: rows });
});

platformRouter.post("/tenants", (req, res) => {
  const db = getMainDb();
  const name = clean(req.body?.name);
  const ownerName = clean(req.body?.ownerName);
  const ownerEmail = emailValue(req.body?.ownerEmail);
  const plan = normalizePlan(req.body?.plan);
  const password = clean(req.body?.password) || generateTemporaryPassword();
  const passwordError = validatePassword(password);
  if (!name || !ownerName || !validEmail(ownerEmail) || passwordError) { res.status(400).json({ error: passwordError || "Organization and owner details are required." }); return; }
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(ownerEmail)) { res.status(409).json({ error: "Owner email already exists." }); return; }
  const tenantId = crypto.randomUUID(); const userId = crypto.randomUUID();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO tenants (id, name, subscription_plan, billing_status) VALUES (?, ?, ?, 'active')").run(tenantId, name, plan);
    db.prepare("INSERT INTO users (id, name, email, password_hash, tenant_id, role, platform_role, is_active, created_by) VALUES (?, ?, ?, ?, ?, 'admin', 'user', 1, ?)")
      .run(userId, ownerName, ownerEmail, hashPassword(password), tenantId, req.user!.userId);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  audit(req.user!.userId, "tenant.created", "tenant", tenantId, { plan, ownerEmail });
  res.status(201).json({ tenant: { id: tenantId, name, plan }, owner: { id: userId, name: ownerName, email: ownerEmail }, temporaryPassword: password });
});

platformRouter.patch("/tenants/:id", (req, res) => {
  const db = getMainDb();
  const target = db.prepare("SELECT id FROM tenants WHERE id = ?").get(req.params.id);
  if (!target) { res.status(404).json({ error: "Workspace not found." }); return; }
  const name = clean(req.body?.name);
  const plan = req.body?.plan ? normalizePlan(req.body.plan) : null;
  const status = ["active", "suspended", "past_due", "canceled"].includes(clean(req.body?.status)) ? clean(req.body.status) : null;
  db.prepare("UPDATE tenants SET name = COALESCE(NULLIF(?, ''), name), subscription_plan = COALESCE(?, subscription_plan), billing_status = COALESCE(?, billing_status), updated_at = datetime('now') WHERE id = ?")
    .run(name, plan, status, req.params.id);
  audit(req.user!.userId, "tenant.updated", "tenant", req.params.id, { plan, status });
  res.json({ ok: true });
});

platformRouter.patch("/users/:id", (req, res) => {
  const db = getMainDb();
  const target = db.prepare("SELECT id, email, role, platform_role, is_active, tenant_id FROM users WHERE id = ?").get(req.params.id) as any;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  if (target.id === req.user!.userId && req.body?.isActive === false) { res.status(400).json({ error: "You cannot deactivate your own super-admin account." }); return; }
  const name = clean(req.body?.name);
  const email = req.body?.email === undefined ? "" : emailValue(req.body.email);
  if (email && !validEmail(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  if (email && db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, target.id)) { res.status(409).json({ error: "This email is already registered." }); return; }
  const roleInput = clean(req.body?.role).toLowerCase();
  const role = target.platform_role === "super_admin" ? null : (USER_ROLES.includes(roleInput as any) ? roleInput : null);
  const isActive = typeof req.body?.isActive === "boolean" ? (req.body.isActive ? 1 : 0) : null;
  if (target.role === "admin" && target.platform_role !== "super_admin" && ((isActive === 0) || (role && role !== "admin"))) {
    const admins = db.prepare("SELECT COUNT(*) count FROM users WHERE tenant_id = ? AND role = 'admin' AND is_active = 1").get(target.tenant_id) as { count: number };
    if (admins.count <= 1) { res.status(400).json({ error: "Assign another workspace admin before removing this admin's access." }); return; }
  }
  db.prepare("UPDATE users SET name = COALESCE(NULLIF(?, ''), name), email = COALESCE(NULLIF(?, ''), email), role = COALESCE(?, role), is_active = COALESCE(?, is_active), updated_at = datetime('now') WHERE id = ?")
    .run(name, email, role, isActive, target.id);
  audit(req.user!.userId, "platform.user_updated", "user", target.id, { name: name || undefined, email: email || undefined, role, isActive });
  res.json({ ok: true });
});

platformRouter.post("/users/:id/reset-password", (req, res) => {
  const db = getMainDb();
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id) as any;
  if (!target) { res.status(404).json({ error: "User not found." }); return; }
  const password = clean(req.body?.password) || generateTemporaryPassword();
  const error = validatePassword(password);
  if (error) { res.status(400).json({ error }); return; }
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashPassword(password), target.id);
  audit(req.user!.userId, "platform.user_password_reset", "user", target.id);
  res.json({ ok: true, temporaryPassword: password });
});
platformRouter.get("/audit-log", (_req, res) => {
  const rows = getMainDb().prepare(`SELECT a.*, u.name actor_name, u.email actor_email FROM admin_audit_log a
    LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT 200`).all();
  res.json({ items: rows });
});
