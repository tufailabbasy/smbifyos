import type { Request, Response, NextFunction } from "express";
import { tenantLocalStorage } from "../db/database.js";
import { getMainDb } from "../db/mainDb.js";
import { verifyToken, type TokenPayload } from "./token.js";
declare global { namespace Express { interface Request { user?: Omit<TokenPayload, "exp">; } } }
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || "";
  // Query tokens are retained only for existing authenticated download links.
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : (req.method === "GET" ? String(req.query.token || "") : "");
  const decoded = verifyToken(token);
  if (!decoded) { res.status(401).json({ error: "Please sign in with a valid account." }); return; }
  const user = getMainDb().prepare("SELECT id, tenant_id, role, name, email FROM users WHERE id = ?").get(decoded.userId) as any;
  if (!user || user.tenant_id !== decoded.tenantId) { res.status(401).json({error:"This account is no longer available."}); return; }
  req.user = { ...decoded, role: user.role, name: user.name, email: user.email };
  tenantLocalStorage.run({ tenantId: decoded.tenantId }, next);
}
