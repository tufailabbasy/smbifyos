import express from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";
import { runEeatAuditReport, sanitizeDomainInput, type EeatAuditReport } from "../modules/audits/eeat.js";

type AuditRow = {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  business_id: string | null;
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

type RateWindow = {
  startedAt: number;
  count: number;
};

type CachedAuditResponse = {
  storedAt: number;
  payload: {
    audit: Record<string, unknown>;
    report: EeatAuditReport;
  };
};

const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 60 * 60 * 1000;

const requestRateMap = new Map<string, RateWindow>();
const reportCache = new Map<string, CachedAuditResponse>();

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function parseBoolean(value: unknown): boolean {
  const normalized = cleanText(value).toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
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

function formatRetryAfterSeconds(window: RateWindow): number {
  const elapsed = Date.now() - window.startedAt;
  return Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000));
}

function isRateLimited(ip: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = requestRateMap.get(ip);

  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestRateMap.set(ip, { startedAt: now, count: 1 });
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      limited: true,
      retryAfterSeconds: formatRetryAfterSeconds(current),
    };
  }

  current.count += 1;
  requestRateMap.set(ip, current);
  return { limited: false, retryAfterSeconds: 0 };
}

function getRequestIp(req: express.Request): string {
  const header = cleanText(req.headers["x-forwarded-for"] || "");
  if (header) {
    return header.split(",")[0].trim();
  }

  return cleanText(req.ip || req.socket.remoteAddress || "unknown");
}

function rowToAudit(row: AuditRow) {
  const result = parseJson<Record<string, unknown>>(row.data_json, {});
  const issueCount = Array.isArray(result.issues) ? result.issues.length : 0;
  const winCount = Array.isArray(result.wins) ? result.wins.length : 0;

  return {
    id: row.id,
    lead_id: row.lead_id || "",
    client_id: row.client_id || "",
    business_id: row.business_id || "",
    audit_type: row.audit_type,
    score: row.score,
    verdict: row.verdict || "",
    target_name: row.target_name || "Audit target",
    status: row.status || "completed",
    summary: typeof result.summary === "string" ? result.summary : "",
    issue_count: issueCount,
    win_count: winCount,
    ai_insights: parseJson<Record<string, unknown> | null>(row.ai_insights_json, null),
    result,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

function saveAuditRecord(args: {
  clientId?: string;
  businessId?: string;
  leadId?: string;
  targetName: string;
  report: EeatAuditReport;
}) {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO audits (
      id, lead_id, client_id, business_id, audit_type, score, verdict,
      data_json, ai_insights_json, target_name, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    nullableText(args.leadId),
    nullableText(args.clientId),
    nullableText(args.businessId),
    "eeat",
    args.report.score,
    args.report.rating,
    JSON.stringify(args.report),
    null,
    args.targetName,
    "completed",
    now,
    now
  );

  const row = db
    .prepare(
      `SELECT id, lead_id, client_id, business_id, audit_type, score, verdict, data_json,
              ai_insights_json, target_name, status, created_at, updated_at
       FROM audits
       WHERE id = ?`
    )
    .get(id) as AuditRow;

  return rowToAudit(row);
}

function withCacheMetadata(report: EeatAuditReport, storedAt: number, cached: boolean): EeatAuditReport {
  const ageMs = Math.max(0, Date.now() - storedAt);
  return {
    ...report,
    cache: {
      cached,
      cached_at: new Date(storedAt).toISOString(),
      age_ms: ageMs,
      expires_at: new Date(storedAt + CACHE_TTL_MS).toISOString(),
    },
  };
}

export const eeatRouter = express.Router();

eeatRouter.post("/eeat-audit", async (req, res) => {
  try {
    const ip = getRequestIp(req);
    const limiter = isRateLimited(ip);
    if (limiter.limited) {
      res.status(429).json({
        error: "Rate limit exceeded. Max 5 requests per IP per hour.",
        retryAfterSeconds: limiter.retryAfterSeconds,
      });
      return;
    }

    const websiteInput = cleanText(req.query.website) || cleanText(req.body?.website);
    const domain = sanitizeDomainInput(websiteInput);
    const forceRefresh = parseBoolean(req.query.force) || parseBoolean(req.body?.force);

    if (forceRefresh) {
      reportCache.delete(domain);
    }

    const cached = reportCache.get(domain);
    if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
      const report = withCacheMetadata(cached.payload.report, cached.storedAt, true);
      res.json({
        audit: cached.payload.audit,
        report,
      });
      return;
    }

    if (cached) {
      reportCache.delete(domain);
    }

    const generated = await runEeatAuditReport({
      domain,
      timeoutMs: 10_000,
    });

    const now = Date.now();
    const report = withCacheMetadata(generated, now, false);
    const audit = saveAuditRecord({
      clientId: cleanText(req.body?.client_id),
      businessId: cleanText(req.body?.business_id),
      leadId: cleanText(req.body?.lead_id),
      targetName: cleanText(req.body?.business_name) || domain,
      report,
    });

    const payload = { audit, report };
    reportCache.set(domain, {
      storedAt: now,
      payload,
    });

    res.status(201).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run EEAT audit";
    res.status(400).json({ error: message });
  }
});

eeatRouter.delete("/eeat-audit/cache", (req, res) => {
  try {
    const websiteInput = cleanText(req.query.website) || cleanText(req.body?.website);
    const domain = sanitizeDomainInput(websiteInput);
    reportCache.delete(domain);
    res.json({ ok: true, message: `Cache cleared for ${domain}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear cache";
    res.status(400).json({ error: message });
  }
});
