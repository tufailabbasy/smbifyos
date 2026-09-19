import { Router } from "express";
import crypto from "node:crypto";
import { getMainDb } from "../db/mainDb.js";
import { getDb, tenantLocalStorage } from "../db/database.js";
import { generateToken } from "../utils/token.js";
import { authMiddleware } from "../utils/authMiddleware.js";

export const authRouter = Router();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return `v2:${iterations}:${salt}:${hash}`;
}

function verifyPassword(password: string, storedHashRecord: string): boolean {
  try {
    if (storedHashRecord.startsWith("v2:")) {
      const parts = storedHashRecord.split(":");
      if (parts.length !== 4) return false;
      const iterations = parseInt(parts[1], 10) || 100000;
      const salt = parts[2];
      const storedHash = parts[3];
      const computedHash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
      return crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(storedHash, "hex"));
    }

    // Legacy format: salt:hash (1000 iterations)
    const [salt, storedHash] = storedHashRecord.split(":");
    if (!salt || !storedHash) return false;
    const computedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

// POST /api/auth/signup
authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password, name, organizationName } = req.body;

    if (!email || !password || !name) {
       res.status(400).json({ error: "Email, password and name are required" });
       return;
    }

    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters long" });
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      res.status(400).json({ error: "Password must contain both letters and numbers" });
      return;
    }

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
      SELECT u.*, t.name as tenant_name, t.subscription_plan as tenant_plan
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
    } | undefined;

    if (!user) {
       res.status(401).json({ error: "Invalid email or password" });
       return;
    }

    if (!verifyPassword(password, user.password_hash)) {
       res.status(401).json({ error: "Invalid email or password" });
       return;
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
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
      SELECT u.id, u.name, u.email, u.role, u.tenant_id,
             t.name as tenant_name, t.subscription_plan as tenant_plan, t.billing_status
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = ?
    `).get(req.user.userId) as {
      id: string;
      name: string;
      email: string;
      role: string;
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

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: user.tenant_id,
        name: user.tenant_name,
        plan: user.tenant_plan,
        billingStatus: user.billing_status,
      },
      usage: {
        leads: leadsCount,
        activeCampaigns: activeCampaignsCount,
        scraperJobs: scraperJobsCount,
      }
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
