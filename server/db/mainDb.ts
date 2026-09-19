import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

dotenv.config();

let mainDbInstance: DatabaseSync | null = null;

export function resolveMainDatabasePath(): string {
  const configuredPath = process.env.MAIN_DATABASE_PATH?.trim() || "./db/main.db";
  const absolutePath = path.resolve(process.cwd(), configuredPath);
  const directory = path.dirname(absolutePath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return absolutePath;
}

export function getMainDb(): DatabaseSync {
  if (!mainDbInstance) {
    mainDbInstance = new DatabaseSync(resolveMainDatabasePath());
    mainDbInstance.exec("PRAGMA journal_mode = WAL;");
    mainDbInstance.exec("PRAGMA foreign_keys = ON;");
    initMainDbSchema(mainDbInstance);
  }
  return mainDbInstance;
}

function initMainDbSchema(db: DatabaseSync): void {
  // Create tenants table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subscription_plan TEXT NOT NULL DEFAULT 'free', -- 'free', 'pro', 'enterprise'
      billing_status TEXT NOT NULL DEFAULT 'active', -- 'active', 'past_due', 'canceled'
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin', -- 'admin', 'member'
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);


  const existingUserColumns = new Set((db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((column) => column.name));
  const userColumnMigrations: Array<[string, string]> = [
    ["platform_role", "TEXT NOT NULL DEFAULT 'user'"],
    ["is_active", "INTEGER NOT NULL DEFAULT 1"],
    ["last_login_at", "TEXT"],
    ["created_by", "TEXT"],
  ];
  for (const [name, definition] of userColumnMigrations) {
    if (!existingUserColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
  `);
  // Index on email for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Ensure default tenant and user exist to preserve backwards compatibility / existing setup
  try {
    const defaultTenant = db.prepare("SELECT id FROM tenants WHERE id = ?").get("default");
    if (!defaultTenant) {
      db.prepare(`
        INSERT INTO tenants (id, name, subscription_plan, billing_status) 
        VALUES ('default', 'Default Tenant', 'enterprise', 'active')
      `).run();
      console.log("[mainDb] Created default tenant");
    }

    const bootstrap: Array<{email:string;password:string}> = [];
    const configuredEmail = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
    const configuredPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
    if (configuredEmail && configuredPassword.length >= 12) {
      const user = db.prepare("SELECT id FROM users WHERE email=?").get(configuredEmail) as { id?: string } | undefined;
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = "v2:100000:" + salt + ":" + crypto.pbkdf2Sync(configuredPassword, salt, 100000, 64, "sha512").toString("hex");
      if (user?.id) db.prepare("UPDATE users SET password_hash=?,updated_at=datetime('now') WHERE id=?").run(hash, user.id);
      else db.prepare("INSERT INTO users(id,name,email,password_hash,tenant_id,role) VALUES (?,?,?,?,?,'admin')").run(crypto.randomUUID(), "Workspace Admin", configuredEmail, hash, "default");
      console.log(`[auth] Deployment admin ready: ${configuredEmail}`);
    } else {
      for (const email of ["admin@smbify.com", "admin@localrank.com"]) {
        const user=db.prepare("SELECT id,password_hash FROM users WHERE email=?").get(email) as any;
        if(!user && email!=="admin@smbify.com")continue;
        const weak=["Smbify2026!Admin","admin","password","admin123","smbify"].some(pwd=>{
          if(!user)return true;
          const parts=user.password_hash.split(":");
          const salt=parts[0]==="v2"?parts[2]:parts[0], rounds=parts[0]==="v2"?Number(parts[1]):1000;
          const hash=crypto.pbkdf2Sync(pwd,salt,rounds,64,"sha512").toString("hex");
          return hash===(parts[0]==="v2"?parts[3]:parts[1]);
        });
        if(!weak)continue;
        const password=crypto.randomBytes(24).toString("base64url"),salt=crypto.randomBytes(16).toString("hex");
        const hash="v2:100000:"+salt+":"+crypto.pbkdf2Sync(password,salt,100000,64,"sha512").toString("hex");
        if(user)db.prepare("UPDATE users SET password_hash=?,updated_at=datetime('now') WHERE id=?").run(hash,user.id);
        else db.prepare("INSERT INTO users(id,name,email,password_hash,tenant_id,role) VALUES ('default-admin-id','Admin User',?,?,'default','admin')").run(email,hash);
        bootstrap.push({email,password});
      }
      if(bootstrap.length){
        const file=path.join(path.dirname(resolveMainDatabasePath()),".bootstrap-admin-credentials.json");
        fs.writeFileSync(file,JSON.stringify(bootstrap,null,2),{mode:0o600});
        console.warn("[auth] Replaced insecure bootstrap credentials. Read the local db/.bootstrap-admin-credentials.json file to sign in.");
      }
    }
    const superAdminEmail = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
    const superAdminPassword = String(process.env.SUPER_ADMIN_PASSWORD || configuredPassword || "");
    if (superAdminEmail) {
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(superAdminEmail) as { id: string } | undefined;
      if (existing) {
        db.prepare("UPDATE users SET role = 'super_admin', platform_role = 'super_admin', is_active = 1, tenant_id = 'default', updated_at = datetime('now') WHERE id = ?").run(existing.id);
        if (superAdminPassword.length >= 12) {
          const salt = crypto.randomBytes(16).toString("hex");
          const hash = "v2:100000:" + salt + ":" + crypto.pbkdf2Sync(superAdminPassword, salt, 100000, 64, "sha512").toString("hex");
          db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, existing.id);
        }
      } else if (superAdminPassword.length >= 12) {
        const salt = crypto.randomBytes(16).toString("hex");
        const hash = "v2:100000:" + salt + ":" + crypto.pbkdf2Sync(superAdminPassword, salt, 100000, 64, "sha512").toString("hex");
        db.prepare(`INSERT INTO users (id, name, email, password_hash, tenant_id, role, platform_role, is_active)
          VALUES (?, 'Muhammad Tufail', ?, ?, 'default', 'super_admin', 'super_admin', 1)`)
          .run(crypto.randomUUID(), superAdminEmail, hash);
      } else {
        console.warn("[auth] SUPER_ADMIN_EMAIL is set but no secure SUPER_ADMIN_PASSWORD is available.");
      }
      console.log(`[auth] Platform super admin ready: ${superAdminEmail}`);
    }
  } catch (error) {
    console.error("[mainDb] Failed to seed default data:", error);
  }
}
