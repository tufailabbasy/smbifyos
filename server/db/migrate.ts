import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDb, registerDbInitializer } from "./database.js";

function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function listMigrationFiles(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

function applyMigration(db: DatabaseSync, version: string, sql: string): void {
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(version);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function hasMigration(db: DatabaseSync, version: string): boolean {
  const row = db
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(version) as { version?: string } | undefined;

  return Boolean(row?.version);
}

// Expose a function to run migrations on a specific DatabaseSync connection
export function runMigrationsForDb(db: DatabaseSync): void {
  const migrationsDir = path.resolve(process.cwd(), "db", "migrations");
  ensureMigrationsTable(db);

  const files = listMigrationFiles(migrationsDir);
  if (files.length === 0) {
    return;
  }

  for (const file of files) {
    const version = file;
    if (hasMigration(db, version)) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    try {
      applyMigration(db, version, sql);
      console.log(`[migrate] Applied migration: ${version}`);
    } catch (error) {
      console.error(`[migrate] Error applying migration: ${version}`, error);
      throw error;
    }
  }
}

// Register the initializer so dynamic database connections run migrations on open
registerDbInitializer((db) => {
  runMigrationsForDb(db);
});

// Run migrations on default DB immediately when this module is loaded at server start
try {
  const defaultDb = getDb();
  runMigrationsForDb(defaultDb);
  console.log("[migrate] Migrations checked/applied for default tenant DB");
} catch (error) {
  console.error("[migrate] Failed to apply migrations to default tenant DB:", error);
}
