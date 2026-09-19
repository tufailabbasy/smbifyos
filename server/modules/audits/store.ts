import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db/database.js";

type StoredAuditRow = {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  business_id: string | null;
  scraper_job_id: string | null;
  staged_lead_id: string | null;
  audit_type: string;
  score: number | null;
  verdict: string | null;
  data_json: string | null;
  ai_insights_json: string | null;
  target_name: string | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
};

export type StoredAuditRecord<TResult = Record<string, unknown>> = {
  id: string;
  lead_id: string;
  client_id: string;
  business_id: string;
  scraper_job_id: string;
  staged_lead_id: string;
  audit_type: string;
  score: number | null;
  verdict: string;
  target_name: string;
  status: string;
  summary: string;
  issue_count: number;
  win_count: number;
  ai_insights: Record<string, unknown> | null;
  result: TResult;
  created_at: string;
  updated_at: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const normalized = cleanText(value);
  return normalized || null;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeStoredAuditRow<TResult = Record<string, unknown>>(
  row: StoredAuditRow
): StoredAuditRecord<TResult> {
  const result = parseJson<TResult>(row.data_json, {} as TResult);
  const issueCount = Array.isArray((result as Record<string, unknown>).issues)
    ? ((result as Record<string, unknown>).issues as unknown[]).length
    : 0;
  const winCount = Array.isArray((result as Record<string, unknown>).wins)
    ? ((result as Record<string, unknown>).wins as unknown[]).length
    : 0;

  return {
    id: row.id,
    lead_id: row.lead_id || "",
    client_id: row.client_id || "",
    business_id: row.business_id || "",
    scraper_job_id: row.scraper_job_id || "",
    staged_lead_id: row.staged_lead_id || "",
    audit_type: row.audit_type,
    score: row.score,
    verdict: row.verdict || "",
    target_name: row.target_name || "Audit target",
    status: row.status || "completed",
    summary:
      typeof (result as Record<string, unknown>).summary === "string"
        ? ((result as Record<string, unknown>).summary as string)
        : "",
    issue_count: issueCount,
    win_count: winCount,
    ai_insights: parseJson<Record<string, unknown> | null>(row.ai_insights_json, null),
    result,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

export function insertStoredAuditRecord<TResult = Record<string, unknown>>(args: {
  leadId?: string;
  clientId?: string;
  businessId?: string;
  scraperJobId?: string;
  stagedLeadId?: string;
  auditType: string;
  targetName: string;
  verdict?: string;
  score?: number | null;
  status?: string;
  result: TResult;
  aiInsights?: Record<string, unknown> | null;
}): StoredAuditRecord<TResult> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO audits (
      id, lead_id, client_id, business_id, scraper_job_id, staged_lead_id,
      audit_type, score, verdict, data_json, ai_insights_json,
      target_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    nullableText(args.leadId),
    nullableText(args.clientId),
    nullableText(args.businessId),
    nullableText(args.scraperJobId),
    nullableText(args.stagedLeadId),
    cleanText(args.auditType),
    typeof args.score === "number" ? Math.round(args.score) : null,
    nullableText(args.verdict),
    JSON.stringify(args.result),
    args.aiInsights ? JSON.stringify(args.aiInsights) : null,
    cleanText(args.targetName) || "Audit target",
    cleanText(args.status) || "completed",
    now,
    now
  );

  if (args.leadId) {
    import("../leads/repository.js")
      .then(({ updateLeadScore }) => {
        try {
          updateLeadScore(args.leadId!);
        } catch (error) {
          console.warn(`[store] Failed to update lead score on audit save: ${args.leadId}`, error);
        }
      })
      .catch((error) => {
        console.warn("[store] Failed to load leads repository dynamically:", error);
      });
  }

  const row = db
    .prepare(
      `SELECT id, lead_id, client_id, business_id, scraper_job_id, staged_lead_id,
              audit_type, score, verdict, data_json, ai_insights_json,
              target_name, status, created_at, updated_at
       FROM audits
       WHERE id = ?`
    )
    .get(id) as StoredAuditRow;

  return normalizeStoredAuditRow<TResult>(row);
}

export function getStoredAuditById<TResult = Record<string, unknown>>(
  auditId: string
): StoredAuditRecord<TResult> | null {
  const id = cleanText(auditId);
  if (!id) {
    return null;
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, lead_id, client_id, business_id, scraper_job_id, staged_lead_id,
              audit_type, score, verdict, data_json, ai_insights_json,
              target_name, status, created_at, updated_at
       FROM audits
       WHERE id = ?`
    )
    .get(id) as StoredAuditRow | undefined;

  return row ? normalizeStoredAuditRow<TResult>(row) : null;
}

export function listStoredAuditsByIds<TResult = Record<string, unknown>>(
  auditIds: string[]
): Map<string, StoredAuditRecord<TResult>> {
  const normalized = Array.from(new Set(auditIds.map(cleanText).filter(Boolean)));
  if (normalized.length === 0) {
    return new Map();
  }

  const db = getDb();
  const placeholders = normalized.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, lead_id, client_id, business_id, scraper_job_id, staged_lead_id,
              audit_type, score, verdict, data_json, ai_insights_json,
              target_name, status, created_at, updated_at
       FROM audits
       WHERE id IN (${placeholders})`
    )
    .all(...normalized) as StoredAuditRow[];

  return new Map(rows.map((row) => [row.id, normalizeStoredAuditRow<TResult>(row)]));
}