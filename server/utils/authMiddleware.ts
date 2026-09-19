import type { Request, Response, NextFunction } from "express";
import { tenantLocalStorage } from "../db/database.js";
import { getMainDb } from "../db/mainDb.js";
import { verifyToken, type TokenPayload } from "./token.js";
import { normalizeRole } from "../modules/saas/access.js";

declare global { namespace Express { interface Request { user?: Omit<TokenPayload, "exp">; } } }

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : (req.method === "GET" ? String(req.query.token || "") : "");
  const decoded = verifyToken(token);
  if (!decoded) { res.status(401).json({ error: "Please sign in with a valid account." }); return; }
  const user = getMainDb().prepare(`SELECT u.id, u.tenant_id, u.role, u.platform_role, u.is_active, u.name, u.email,
    t.billing_status FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`).get(decoded.userId) as any;
  if (!user || user.tenant_id !== decoded.tenantId) { res.status(401).json({ error: "This account is no longer available." }); return; }
  if (!Number(user.is_active)) { res.status(403).json({ error: "This user account has been deactivated." }); return; }
  const effectiveRole = normalizeRole(user.role, user.platform_role);
  if (effectiveRole !== "super_admin" && ["suspended", "canceled"].includes(String(user.billing_status || "").toLowerCase())) {
    res.status(403).json({ error: "This workspace is suspended. Contact the platform administrator." }); return;
  }
  req.user = { ...decoded, role: effectiveRole, name: user.name, email: user.email };
  tenantLocalStorage.run({ tenantId: decoded.tenantId }, next);
}
