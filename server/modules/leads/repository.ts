import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db/database.js";
import { normalizeBoolean } from "../../utils/normalizeBoolean.js";
import type { ImportResult, Lead, LeadFilters, LeadInput, LeadSource, LeadStatus } from "../../types/lead.js";

type LeadRow = {
  id: string;
  business_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  niche: string | null;
  gmb_url: string | null;
  gmb_claimed: number;
  gmb_rating: number | null;
  gmb_review_count: number | null;
  has_website: number;
  gmb_profile_incomplete: number;
  citations_found: number;
  lead_score: number;
  last_gmb_audit_score?: number | null;
  last_website_audit_score?: number | null;
  source: LeadSource;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
  notes: string | null;
};

type LeadActivityRow = {
  id: string;
  lead_id: string;
  activity_type: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
};

type LeadNoteRow = {
  id: string;
  lead_id: string;
  note: string;
  created_at: string;
};

import { autoAuditQueue } from "./autoAudit.js";

type BindValue = string | number | bigint | Uint8Array | null;

export function calculateLeadScore(
  lead: {
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    has_website?: boolean | number;
    gmb_url?: string | null;
    gmb_claimed?: boolean | number;
    gmb_rating?: number | null;
    gmb_review_count?: number | null;
    gmb_profile_incomplete?: boolean | number;
    citations_found?: boolean | number;
  },
  auditScores?: { websiteScore?: number | null; gmbScore?: number | null } | null
): number {
  let score = 0;

  // 1. Contact Info availability (Total: 30 points)
  const hasEmail = Boolean(lead.email && lead.email.trim() !== "");
  const hasPhone = Boolean(lead.phone && lead.phone.trim() !== "");
  if (hasEmail) score += 20;
  if (hasPhone) score += 10;

  // 2. Website & SEO Status (Total: 35 points)
  const websiteVal = lead.website !== undefined ? lead.website : null;
  const hasWebsite = Boolean(websiteVal && String(websiteVal).trim() !== "") || lead.has_website === 1 || lead.has_website === true;

  if (!hasWebsite) {
    // No website is a HOT opportunity for web design services (+35 points)
    score += 35;
  } else {
    const websiteScore = auditScores?.websiteScore !== undefined ? auditScores.websiteScore : null;
    if (websiteScore !== null) {
      if (websiteScore < 60) {
        score += 25; // Hot lead for SEO
      } else if (websiteScore < 80) {
        score += 15; // Warm lead for optimization
      }
    } else {
      score += 15; // Baseline points for website presence (not yet audited)
    }
  }

  // 3. GMB Status (Total: 35 points)
  const hasGmb = Boolean(lead.gmb_url && String(lead.gmb_url).trim() !== "");
  const gmbScore = auditScores?.gmbScore !== undefined ? auditScores.gmbScore : null;

  if (gmbScore !== null) {
    if (gmbScore < 60) {
      score += 25;
    } else if (gmbScore < 82) {
      score += 15;
    }
  } else {
    // Heuristic points when not audited yet
    const isClaimed = lead.gmb_claimed === 1 || lead.gmb_claimed === true;
    const rating = lead.gmb_rating;
    const reviews = lead.gmb_review_count;
    const isIncomplete = lead.gmb_profile_incomplete === 1 || lead.gmb_profile_incomplete === true;
    const noCitations = lead.citations_found === 0 || lead.citations_found === false;

    // Unclaimed GMB is a hot lead for claiming/verifying service
    if (!isClaimed && hasGmb) {
      score += 15;
    }
    // Low GMB rating
    if (rating !== null && rating !== undefined && rating > 0) {
      if (rating < 4.2) {
        score += 10;
      } else if (rating < 4.5) {
        score += 5;
      }
    }
    // Low review count
    if (reviews !== null && reviews !== undefined && reviews >= 0) {
      if (reviews < 20) {
        score += 5;
      }
    }
    // Profile incomplete
    if (isIncomplete) {
      score += 5;
    }
    // Citations missing
    if (noCitations) {
      score += 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function getLeadLatestAuditScores(leadId: string): { websiteScore: number | null; gmbScore: number | null } {
  const db = getDb();
  try {
    const gmb = db
      .prepare(
        `SELECT score FROM audits
         WHERE lead_id = ? AND audit_type = 'gmb' AND status = 'completed'
         ORDER BY datetime(created_at) DESC
         LIMIT 1`
      )
      .get(leadId) as { score: number | null } | undefined;

    const website = db
      .prepare(
        `SELECT score FROM audits
         WHERE lead_id = ? AND audit_type = 'website' AND status = 'completed'
         ORDER BY datetime(created_at) DESC
         LIMIT 1`
      )
      .get(leadId) as { score: number | null } | undefined;

    return {
      gmbScore: gmb?.score ?? null,
      websiteScore: website?.score ?? null,
    };
  } catch (error) {
    console.warn("Failed to get latest audit scores:", error);
    return { gmbScore: null, websiteScore: null };
  }
}

export function updateLeadScore(leadId: string): number {
  const db = getDb();
  const lead = getLeadById(leadId);
  if (!lead) return 0;

  const audits = getLeadLatestAuditScores(leadId);
  const score = calculateLeadScore(lead, audits);

  db.prepare("UPDATE leads SET lead_score = ?, updated_at = ? WHERE id = ?").run(
    score,
    new Date().toISOString(),
    leadId
  );
  return score;
}


export type LeadActivity = {
  id: string;
  leadId: string;
  type: string;
  message: string;
  metadata: unknown;
  createdAt: string;
};

export type LeadNote = {
  id: string;
  leadId: string;
  note: string;
  createdAt: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function websiteHost(value: unknown): string {
  const raw = cleanText(value);
  if (!raw) return "";

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function nullableText(value: unknown): string | null {
  const cleaned = cleanText(value);
  return cleaned ? cleaned : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    business_name: row.business_name,
    phone: row.phone || "",
    email: row.email || "",
    website: row.website || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || "",
    niche: row.niche || "",
    gmb_url: row.gmb_url || "",
    gmb_claimed: row.gmb_claimed === 1,
    gmb_rating: row.gmb_rating,
    gmb_review_count: row.gmb_review_count,
    has_website: row.has_website === 1,
    gmb_profile_incomplete: row.gmb_profile_incomplete === 1,
    citations_found: row.citations_found === 1,
    lead_score: row.lead_score,
    last_gmb_audit_score: row.last_gmb_audit_score ?? null,
    last_website_audit_score: row.last_website_audit_score ?? null,
    source: row.source,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    notes: row.notes || "",
  };
}

function normalizeLeadInput(input: Partial<LeadInput>, fallbackSource: LeadSource = "manual"): LeadInput {
  const website = cleanText(input.website);
  const hasWebsite = Boolean(website) || normalizeBoolean(input.has_website, false);
  const normalized: LeadInput = {
    business_name: cleanText(input.business_name),
    phone: cleanText(input.phone),
    email: cleanText(input.email),
    website,
    address: cleanText(input.address),
    city: cleanText(input.city),
    state: cleanText(input.state),
    zip: cleanText(input.zip),
    niche: cleanText(input.niche),
    gmb_url: cleanText(input.gmb_url),
    gmb_claimed: normalizeBoolean(input.gmb_claimed, false),
    gmb_rating: nullableNumber(input.gmb_rating),
    gmb_review_count: nullableNumber(input.gmb_review_count),
    has_website: hasWebsite,
    gmb_profile_incomplete: normalizeBoolean(input.gmb_profile_incomplete, false),
    citations_found: normalizeBoolean(input.citations_found, false),
    source: (cleanText(input.source) as LeadSource) || fallbackSource,
    status: ((cleanText(input.status) as LeadStatus) || "new") as LeadStatus,
    notes: cleanText(input.notes),
  };

  if (!normalized.business_name) {
    throw new Error("business_name is required");
  }

  return normalized;
}

export function listLeads(filters: LeadFilters): {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
} {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.niche) {
    where.push("LOWER(niche) = LOWER(?)");
    params.push(filters.niche);
  }

  if (filters.city) {
    where.push("LOWER(city) = LOWER(?)");
    params.push(filters.city);
  }

  if (filters.status) {
    where.push("status = ?");
    params.push(filters.status);
  }

  if (filters.source) {
    where.push("source = ?");
    params.push(filters.source);
  }

  if (typeof filters.hasWebsite === "boolean") {
    where.push("has_website = ?");
    params.push(boolToInt(filters.hasWebsite));
  }

  if (typeof filters.gmbClaimed === "boolean") {
    where.push("gmb_claimed = ?");
    params.push(boolToInt(filters.gmbClaimed));
  }

  if (typeof filters.gmbRatingMin === "number") {
    where.push("gmb_rating IS NOT NULL AND gmb_rating >= ?");
    params.push(filters.gmbRatingMin);
  }

  if (typeof filters.gmbRatingMax === "number") {
    where.push("gmb_rating IS NOT NULL AND gmb_rating <= ?");
    params.push(filters.gmbRatingMax);
  }

  if (typeof filters.gmbReviewCountMin === "number") {
    where.push("gmb_review_count IS NOT NULL AND gmb_review_count >= ?");
    params.push(filters.gmbReviewCountMin);
  }

  if (typeof filters.gmbReviewCountMax === "number") {
    where.push("gmb_review_count IS NOT NULL AND gmb_review_count <= ?");
    params.push(filters.gmbReviewCountMax);
  }

  if (filters.createdFrom) {
    where.push("DATE(created_at) >= DATE(?)");
    params.push(filters.createdFrom);
  }

  if (filters.createdTo) {
    where.push("DATE(created_at) <= DATE(?)");
    params.push(filters.createdTo);
  }

  if (typeof filters.hasEmail === "boolean") {
    if (filters.hasEmail) {
      where.push("TRIM(COALESCE(email, '')) <> ''");
    } else {
      where.push("TRIM(COALESCE(email, '')) = ''");
    }
  }

  if (filters.query) {
    where.push("(LOWER(business_name) LIKE LOWER(?) OR LOWER(city) LIKE LOWER(?) OR LOWER(niche) LIKE LOWER(?) OR LOWER(phone) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?))");
    const value = `%${filters.query}%`;
    params.push(value, value, value, value, value);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(10000, Math.max(1, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const bindParams = params as BindValue[];

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM leads ${whereClause}`)
    .get(...bindParams) as { count: number };

  const rows = db
    .prepare(
      `SELECT
         leads.*,
         (
           SELECT a.score
           FROM audits a
           WHERE a.lead_id = leads.id AND a.audit_type = 'gmb'
           ORDER BY datetime(a.created_at) DESC
           LIMIT 1
         ) as last_gmb_audit_score,
         (
           SELECT a.score
           FROM audits a
           WHERE a.lead_id = leads.id AND a.audit_type = 'website'
           ORDER BY datetime(a.created_at) DESC
           LIMIT 1
         ) as last_website_audit_score
       FROM leads ${whereClause}
       ORDER BY datetime(created_at) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...bindParams, pageSize, offset) as LeadRow[];

  return {
    items: rows.map(rowToLead),
    total: totalRow.count,
    page,
    pageSize,
  };
}

export function getLeadById(leadId: string): Lead | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         leads.*,
         (
           SELECT a.score
           FROM audits a
           WHERE a.lead_id = leads.id AND a.audit_type = 'gmb'
           ORDER BY datetime(a.created_at) DESC
           LIMIT 1
         ) as last_gmb_audit_score,
         (
           SELECT a.score
           FROM audits a
           WHERE a.lead_id = leads.id AND a.audit_type = 'website'
           ORDER BY datetime(a.created_at) DESC
           LIMIT 1
         ) as last_website_audit_score
       FROM leads
       WHERE id = ?`
    )
    .get(leadId) as LeadRow | undefined;

  return row ? rowToLead(row) : null;
}


export function addLeadActivity(
  leadId: string,
  activityType: string,
  message: string,
  metadata: unknown = null
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO lead_activities (id, lead_id, activity_type, message, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), leadId, activityType, message, metadata ? JSON.stringify(metadata) : null, now);
}

export function listLeadActivities(leadId: string): LeadActivity[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY datetime(created_at) DESC")
    .all(leadId) as LeadActivityRow[];

  return rows.map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    type: row.activity_type,
    message: row.message,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at,
  }));
}

export function addLeadNote(leadId: string, note: string): LeadNote {
  const db = getDb();
  const now = new Date().toISOString();
  const id = uuidv4();

  db.prepare("INSERT INTO notes (id, lead_id, note, created_at) VALUES (?, ?, ?, ?)").run(id, leadId, note, now);
  addLeadActivity(leadId, "note_added", "Note added", { note });

  return {
    id,
    leadId,
    note,
    createdAt: now,
  };
}

export function listLeadNotes(leadId: string): LeadNote[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, lead_id, note, created_at FROM notes WHERE lead_id = ? ORDER BY datetime(created_at) DESC")
    .all(leadId) as LeadNoteRow[];

  return rows.map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export function createLead(input: Partial<LeadInput>): Lead {
  const db = getDb();
  const normalized = normalizeLeadInput(input, "manual");
  const now = new Date().toISOString();
  const id = uuidv4();
  const leadScore = calculateLeadScore(normalized);

  db.prepare(
    `INSERT INTO leads (
      id, business_name, phone, email, website, address, city, state, zip, niche,
      gmb_url, gmb_claimed, gmb_rating, gmb_review_count, has_website,
      gmb_profile_incomplete, citations_found, lead_score, source, status,
      created_at, updated_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    normalized.business_name,
    nullableText(normalized.phone),
    nullableText(normalized.email),
    nullableText(normalized.website),
    nullableText(normalized.address),
    nullableText(normalized.city),
    nullableText(normalized.state),
    nullableText(normalized.zip),
    nullableText(normalized.niche),
    nullableText(normalized.gmb_url),
    boolToInt(Boolean(normalized.gmb_claimed)),
    nullableNumber(normalized.gmb_rating),
    nullableNumber(normalized.gmb_review_count),
    boolToInt(Boolean(normalized.has_website)),
    boolToInt(Boolean(normalized.gmb_profile_incomplete)),
    boolToInt(Boolean(normalized.citations_found)),
    leadScore,
    normalized.source,
    normalized.status || "new",
    now,
    now,
    nullableText(normalized.notes)
  );

  addLeadActivity(id, "lead_created", "Lead created", {
    source: normalized.source,
  });

  const lead = getLeadById(id);
  if (!lead) {
    throw new Error("Lead creation failed");
  }

  // Trigger background auto-audit
  autoAuditQueue.enqueue(id);

  return lead;
}


function findMatchingLeadId(input: LeadInput): string | null {
  const db = getDb();

  const host = websiteHost(input.website);
  if (host) {
    const byWebsite = db
      .prepare(
        `SELECT id FROM leads
         WHERE website IS NOT NULL
           AND website <> ''
           AND LOWER(REPLACE(REPLACE(REPLACE(COALESCE(website, ''), 'https://', ''), 'http://', ''), 'www.', '')) LIKE ?
         LIMIT 1`
      )
      .get(`${host}%`) as { id: string } | undefined;

    if (byWebsite?.id) {
      return byWebsite.id;
    }
  }

  const byPhone = input.phone ?
    (db
      .prepare(
        `SELECT id FROM leads
         WHERE LOWER(business_name) = LOWER(?)
           AND phone = ?
           AND LOWER(COALESCE(city, '')) = LOWER(?)
           AND LOWER(COALESCE(state, '')) = LOWER(?)
         LIMIT 1`
      )
      .get(input.business_name, input.phone, input.city || "", input.state || "") as { id: string } | undefined)
    : undefined;

  if (byPhone?.id) {
    return byPhone.id;
  }

  const byBusiness = db
    .prepare(
      `SELECT id FROM leads
       WHERE LOWER(business_name) = LOWER(?)
         AND LOWER(COALESCE(city, '')) = LOWER(?)
         AND LOWER(COALESCE(state, '')) = LOWER(?)
       LIMIT 1`
    )
    .get(input.business_name, input.city || "", input.state || "") as { id: string } | undefined;

  return byBusiness?.id || null;
}

export function updateLead(leadId: string, patch: Partial<LeadInput>): Lead | null {
  const db = getDb();
  const existing = getLeadById(leadId);

  if (!existing) {
    return null;
  }

  const merged = normalizeLeadInput(
    {
      ...existing,
      ...patch,
      source: (patch.source || existing.source) as LeadSource,
      status: (patch.status || existing.status) as LeadStatus,
    },
    existing.source
  );

  const now = new Date().toISOString();
  const audits = getLeadLatestAuditScores(leadId);
  const leadScore = calculateLeadScore(merged, audits);

  db.prepare(
    `UPDATE leads SET
      business_name = ?,
      phone = ?,
      email = ?,
      website = ?,
      address = ?,
      city = ?,
      state = ?,
      zip = ?,
      niche = ?,
      gmb_url = ?,
      gmb_claimed = ?,
      gmb_rating = ?,
      gmb_review_count = ?,
      has_website = ?,
      gmb_profile_incomplete = ?,
      citations_found = ?,
      lead_score = ?,
      source = ?,
      status = ?,
      notes = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    merged.business_name,
    nullableText(merged.phone),
    nullableText(merged.email),
    nullableText(merged.website),
    nullableText(merged.address),
    nullableText(merged.city),
    nullableText(merged.state),
    nullableText(merged.zip),
    nullableText(merged.niche),
    nullableText(merged.gmb_url),
    boolToInt(Boolean(merged.gmb_claimed)),
    nullableNumber(merged.gmb_rating),
    nullableNumber(merged.gmb_review_count),
    boolToInt(Boolean(merged.has_website)),
    boolToInt(Boolean(merged.gmb_profile_incomplete)),
    boolToInt(Boolean(merged.citations_found)),
    leadScore,
    merged.source,
    merged.status || "new",
    nullableText(merged.notes),
    now,
    leadId
  );

  addLeadActivity(leadId, "lead_updated", "Lead updated");

  return getLeadById(leadId);
}

export function deleteLead(leadId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM leads WHERE id = ?").run(leadId);
  return result.changes > 0;
}

export function bulkDeleteLeads(leadIds: string[]): number {
  if (leadIds.length === 0) {
    return 0;
  }

  const db = getDb();
  let deleted = 0;
  db.exec("BEGIN");

  try {
    const stmt = db.prepare("DELETE FROM leads WHERE id = ?");
    for (const id of leadIds) {
      deleted += Number(stmt.run(id).changes);
    }

    db.exec("COMMIT");
    return deleted;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function bulkUpdateLeadStatus(leadIds: string[], status: LeadStatus): number {
  if (leadIds.length === 0) {
    return 0;
  }

  const db = getDb();
  let updated = 0;
  const now = new Date().toISOString();
  db.exec("BEGIN");

  try {
    const stmt = db.prepare("UPDATE leads SET status = ?, updated_at = ? WHERE id = ?");
    for (const id of leadIds) {
      const res = stmt.run(status, now, id);
      if (Number(res.changes) > 0) {
        updated += 1;
        addLeadActivity(id, "status_changed", `Status changed to ${status} via bulk update`, { status });
      }
    }

    db.exec("COMMIT");
    return updated;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function importLeads(entries: Partial<LeadInput>[], defaultSource: LeadSource): ImportResult {
  const db = getDb();

  let inserted = 0;
  let updated = 0;
  const leadIds: string[] = [];

  db.exec("BEGIN");

  try {
    for (const item of entries) {
      const normalized = normalizeLeadInput(item, defaultSource);
      const existingLeadId = findMatchingLeadId(normalized);

      if (existingLeadId) {
        const existing = getLeadById(existingLeadId);

        const merged: Partial<LeadInput> = {
          ...normalized,
          phone: normalized.phone || existing?.phone || "",
          email: normalized.email || existing?.email || "",
          website: normalized.website || existing?.website || "",
          address: normalized.address || existing?.address || "",
          city: normalized.city || existing?.city || "",
          state: normalized.state || existing?.state || "",
          zip: normalized.zip || existing?.zip || "",
          niche: normalized.niche || existing?.niche || "",
          gmb_url: normalized.gmb_url || existing?.gmb_url || "",
          notes: normalized.notes || existing?.notes || "",
          source: normalized.source,
          status: normalized.status,
          has_website: Boolean(normalized.website || existing?.website) || normalizeBoolean(
            normalized.has_website,
            false
          ),
        };

        updateLead(existingLeadId, merged);
        addLeadActivity(existingLeadId, "lead_imported", "Lead refreshed from import", {
          source: normalized.source,
        });
        updated += 1;
        leadIds.push(existingLeadId);
      } else {
        const lead = createLead(normalized);
        addLeadActivity(lead.id, "lead_imported", "Lead imported", {
          source: normalized.source,
        });
        inserted += 1;
        leadIds.push(lead.id);
      }
    }

    db.exec("COMMIT");
    return { inserted, updated, leadIds };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

