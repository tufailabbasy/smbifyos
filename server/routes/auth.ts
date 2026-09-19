import { Router } from "express";
import crypto from "node:crypto";
import { getMainDb } from "../db/mainDb.js";
import { getDb, tenantLocalStorage } from "../db/database.js";
import { generateToken } from "../utils/token.js";
import { authMiddleware } from "../utils/authMiddleware.js";
import { hashPassword, verifyPassword, validatePassword } from "../utils/password.js";
import { PLAN_CATALOG, normalizePlan, normalizeRole, permissionsFor } from "../modules/saas/access.js";

export const authRouter = Router();

// POST /api/auth/signup
authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password, name, organizationName } = req.body;

    if (!email || !password || !name) {
       res.status(400).json({ error: "Email, password and name are required" });
       return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) { res.status(400).json({ error: passwordError }); return; }

    const normalizedEmail = String(email).trim().toLowerCase();
    const mainDb = getMainDb();

    // Check if user already exists
    const existingUser = mainDb.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
    if (existingUser) {
       res.status(409).json({ error: "An account with this email already exists" });
       return;
    }

    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const tenantName = (organizationName || `${name}'s Org`).trim();

    // Securely hash password with 100,000 PBKDF2 rounds
    const passwordHash = hashPassword(password);

    // Insert tenant and user in central DB (using transactions to ensure both succeed)
    mainDb.exec("BEGIN");
    try {
      mainDb.prepare(`
        INSERT INTO tenants (id, name, subscription_plan, billing_status)
        VALUES (?, ?, 'free', 'active')
      `).run(tenantId, tenantName);

      mainDb.prepare(`
        INSERT INTO users (id, name, email, password_hash, tenant_id, role)
        VALUES (?, ?, ?, ?, ?, 'admin')
      `).run(userId, name.trim(), normalizedEmail, passwordHash, tenantId);

      mainDb.exec("COMMIT");
    } catch (dbErr) {
      mainDb.exec("ROLLBACK");
      throw dbErr;
    }

    // Force tenant database creation & migrations run
    tenantLocalStorage.run({ tenantId }, () => {
      getDb(); // This triggers creation and migration of tenant DB file
    });

    // Generate token
    const token = generateToken({
      userId,
      tenantId,
      email: normalizedEmail,
      role: "admin",
      name: name.trim(),
    });

    res.status(201).json({
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        role: "admin",
      },
      tenant: {
        id: tenantId,
        name: tenantName,
        plan: "free",
      }
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to complete signup process" });
  }
});

// POST /api/auth/login
authRouter.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
       res.status(400).json({ error: "Email and password are required" });
       return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const mainDb = getMainDb();

    // Get user and their tenant details
    const user = mainDb.prepare(`
      SELECT u.*, t.name as tenant_name, t.subscription_plan as tenant_plan, t.billing_status as tenant_status
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.email = ?
    `).get(normalizedEmail) as {
      id: string;
      name: string;
      email: string;
      password_hash: string;
      tenant_id: string;
      role: string;
      tenant_name: string;
      tenant_plan: string;
      tenant_status: string;
      platform_role: string;
      is_active: number;
    } | undefined;

    if (!user) {
       res.status(401).json({ error: "Invalid email or password" });
       return;
    }

    if (!verifyPassword(password, user.password_hash)) {
       res.status(401).json({ error: "Invalid email or password" });
       return;
    }
    if (!Number(user.is_active)) { res.status(403).json({ error: "This account has been deactivated." }); return; }
    const effectiveRole = normalizeRole(user.role, user.platform_role);
    if (effectiveRole !== "super_admin" && ["suspended", "canceled"].includes(String(user.tenant_status || "").toLowerCase())) {
      res.status(403).json({ error: "This workspace is suspended." }); return;
    }

    getMainDb().prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

    // Generate token
    const token = generateToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: effectiveRole,
      name: user.name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: effectiveRole,
      },
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        plan: user.tenant_plan,
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to process login request" });
  }
});

// GET /api/auth/me
authRouter.get("/me", authMiddleware, (req, res) => {
  if (!req.user) {
     res.status(401).json({ error: "Not authenticated" });
     return;
  }

  try {
    const mainDb = getMainDb();
    
    // Fetch fresh user/tenant state
    const user = mainDb.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.platform_role, u.is_active, u.tenant_id,
             t.name as tenant_name, t.subscription_plan as tenant_plan, t.billing_status
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = ?
    `).get(req.user.userId) as {
      id: string;
      name: string;
      email: string;
      role: string;
      platform_role: string;
      is_active: number;
      tenant_id: string;
      tenant_name: string;
      tenant_plan: string;
      billing_status: string;
    } | undefined;

    if (!user) {
       res.status(404).json({ error: "User not found" });
       return;
    }

    // Collect usage metrics from tenant database
    let leadsCount = 0;
    let activeCampaignsCount = 0;
    let scraperJobsCount = 0;

    try {
      const tenantDb = getDb();
      
      const leadsRes = tenantDb.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number };
      leadsCount = leadsRes?.count || 0;

      const campaignsRes = tenantDb.prepare(`
        SELECT COUNT(*) as count FROM campaigns 
        WHERE LOWER(COALESCE(status, 'draft')) NOT IN ('completed', 'cancelled', 'archived')
      `).get() as { count: number };
      activeCampaignsCount = campaignsRes?.count || 0;

      const scrapersRes = tenantDb.prepare("SELECT COUNT(*) as count FROM scraper_jobs").get() as { count: number };
      scraperJobsCount = scrapersRes?.count || 0;
    } catch (dbErr) {
      console.warn("Could not query tenant db usage metrics, using 0", dbErr);
    }

    const effectiveRole = normalizeRole(user.role, user.platform_role);
    const plan = PLAN_CATALOG[normalizePlan(user.tenant_plan)];
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: effectiveRole, isActive: Boolean(user.is_active) },
      tenant: { id: user.tenant_id, name: user.tenant_name, plan: plan.key, billingStatus: user.billing_status },
      permissions: permissionsFor(effectiveRole),
      entitlements: plan,
      usage: { leads: leadsCount, activeCampaigns: activeCampaignsCount, scraperJobs: scraperJobsCount },
    });
  } catch (error) {
    console.error("Auth profile fetch error:", error);
    res.status(500).json({ error: "Failed to load user profile information" });
  }
});

// Billing entitlements are provisioned by a trusted administrator, never by browser input.
authRouter.post("/upgrade", authMiddleware, (_req, res) => {
  res.status(403).json({error:"Plan changes require a verified billing or administrator update. Contact your administrator."});
});
