import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";

dotenv.config();

// Store tenant context for async request scoping
export const tenantLocalStorage = new AsyncLocalStorage<{ tenantId: string }>();

// Cache tenant connections: tenantId -> DatabaseSync
const tenantDbs = new Map<string, DatabaseSync>();

// Database initialization callback (e.g. to run migrations) to avoid circular imports
let dbInitializerCallback: ((db: DatabaseSync) => void) | null = null;
const initializedDbs = new Set<string>();

export function registerDbInitializer(callback: (db: DatabaseSync) => void): void {
  dbInitializerCallback = callback;
}

export function resolveDatabasePath(tenantId = "default"): string {
  if (tenantId === "default") {
    const configuredPath = process.env.DATABASE_PATH?.trim() || "./db/smbify_lead_os.db";
    return path.resolve(process.cwd(), configuredPath);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error("Invalid tenant ID");
  return path.resolve(process.cwd(), `./db/tenants/tenant_${tenantId}.db`);
}

export function getDb(): DatabaseSync {
  const store = tenantLocalStorage.getStore();
  const tenantId = store?.tenantId || "default";

  let cachedDb = tenantDbs.get(tenantId);
  if (!cachedDb) {
    const dbPath = resolveDatabasePath(tenantId);
    const directory = path.dirname(dbPath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    cachedDb = new DatabaseSync(dbPath);
    cachedDb.exec("PRAGMA journal_mode = WAL;");
    cachedDb.exec("PRAGMA foreign_keys = ON;");
    cachedDb.exec("PRAGMA busy_timeout = 5000;");
    tenantDbs.set(tenantId, cachedDb);

  }
  if (!initializedDbs.has(tenantId) && dbInitializerCallback) {
    try { dbInitializerCallback(cachedDb); initializedDbs.add(tenantId); }
    catch (error) { tenantDbs.delete(tenantId); cachedDb.close(); throw error; }
  }
  return cachedDb;
}
