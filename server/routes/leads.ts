import express from "express";
import crypto from "node:crypto";
import multer from "multer";
import { getDb } from "../db/database.js";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { parse } from "csv-parse/sync";
import {
  addLeadActivity,
  addLeadNote,
  bulkDeleteLeads,
  bulkUpdateLeadStatus,
  createLead,
  deleteLead,
  getLeadById,
  importLeads,
  listLeadActivities,
  listLeadNotes,
  listLeads,
  updateLead,
} from "../modules/leads/repository.js";
import { checkLeadLimit } from "../utils/limitsMiddleware.js";
import { normalizeBoolean } from "../utils/normalizeBoolean.js";
import { splitAddress } from "../utils/address.js";
import type { LeadInput, LeadSource, LeadStatus } from "../types/lead.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file upload size
  },
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.originalname.toLowerCase().endsWith(".csv") ||
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/vnd.ms-excel";
    if (isCsv) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files (.csv) are allowed for import"));
    }
  },
});

const VALID_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "audit_sent",
  "proposal_sent",
  "negotiating",
  "closed_won",
  "closed_lost",
  "retained_client",
];

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return normalizeBoolean(value, false);
}

function parseDateQuery(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return raw.length <= 10 ? raw : parsed.toISOString().slice(0, 10);
}

function parseStatus(value: unknown): LeadStatus | undefined {
  const normalized = String(value ?? "").trim() as LeadStatus;
  if (!normalized) {
    return undefined;
  }

  return VALID_STATUSES.includes(normalized) ? normalized : undefined;
}

function normalizeManualLeadInput(raw: Record<string, unknown>, source: LeadSource): Partial<LeadInput> {
  const address = String(raw.address ?? "").trim();
  const addressParts = splitAddress(address);

  return {
    business_name: String(raw.business_name ?? "").trim(),
    phone: String(raw.phone ?? "").trim(),
    email: String(raw.email ?? "").trim(),
    website: String(raw.website ?? "").trim(),
    address: addressParts.address,
    city: String(raw.city ?? "").trim() || addressParts.city,
    state: String(raw.state ?? "").trim() || addressParts.state,
    zip: String(raw.zip ?? "").trim() || addressParts.zip,
    niche: String(raw.niche ?? "").trim(),
    gmb_url: String(raw.gmb_url ?? "").trim(),
    gmb_claimed: normalizeBoolean(raw.gmb_claimed, false),
    gmb_rating: toNumber(raw.gmb_rating) ?? null,
    gmb_review_count: toNumber(raw.gmb_review_count) ?? null,
    has_website: normalizeBoolean(raw.has_website, Boolean(raw.website)),
    gmb_profile_incomplete: normalizeBoolean(raw.gmb_profile_incomplete, false),
    citations_found: normalizeBoolean(raw.citations_found, false),
    source,
    status: parseStatus(raw.status) || "new",
    notes: String(raw.notes ?? "").trim(),
  };
}

function sanitizeCsvInputCell(value: unknown): string {
  let s = String(value ?? "").trim();
  if (/^[=+\-@\t\r]/.test(s)) {
    s = s.replace(/^[=+\-@\t\r]+/, "").trim();
  }
  return s;
}

function findMappedValue(
  record: Record<string, string>,
  field: string,
  mapping: Record<string, string | string[]>
): string {
  const candidates = mapping[field];
  const keys = Array.isArray(candidates) ? candidates : [candidates];

  for (const key of keys) {
    if (!key) continue;
    const direct = record[key];
    if (direct !== undefined) {
      return sanitizeCsvInputCell(direct);
    }

    const insensitiveKey = Object.keys(record).find(
      (existing) => existing.toLowerCase() === key.toLowerCase()
    );
    if (insensitiveKey) {
      return sanitizeCsvInputCell(record[insensitiveKey]);
    }
  }

  return "";
}

function mapCsvRecordToLead(
  record: Record<string, string>,
  mapping: Record<string, string | string[]>
): Partial<LeadInput> {
  const addressRaw = findMappedValue(record, "address", mapping);
  const addressParts = splitAddress(addressRaw);

  const website = findMappedValue(record, "website", mapping);
  return {
    business_name: findMappedValue(record, "business_name", mapping),
    phone: findMappedValue(record, "phone", mapping),
    email: findMappedValue(record, "email", mapping),
    website,
    address: addressParts.address,
    city: findMappedValue(record, "city", mapping) || addressParts.city,
    state: findMappedValue(record, "state", mapping) || addressParts.state,
    zip: findMappedValue(record, "zip", mapping) || addressParts.zip,
    niche: findMappedValue(record, "niche", mapping),
    gmb_url: findMappedValue(record, "gmb_url", mapping),
    gmb_claimed: normalizeBoolean(findMappedValue(record, "gmb_claimed", mapping), false),
    gmb_rating: toNumber(findMappedValue(record, "gmb_rating", mapping)) ?? null,
    gmb_review_count: toNumber(findMappedValue(record, "gmb_review_count", mapping)) ?? null,
    has_website: normalizeBoolean(findMappedValue(record, "has_website", mapping), Boolean(website)),
    gmb_profile_incomplete: normalizeBoolean(
      findMappedValue(record, "gmb_profile_incomplete", mapping),
      false
    ),
    citations_found: normalizeBoolean(findMappedValue(record, "citations_found", mapping), false),
    source: "csv",
    status: (parseStatus(findMappedValue(record, "status", mapping)) || "new") as LeadStatus,
    notes: findMappedValue(record, "notes", mapping),
  };
}

function getDefaultCsvMapping(): Record<string, string[]> {
  return {
    business_name: ["business_name", "business name", "name", "company", "company_name"],
    phone: ["phone", "phone_number", "phone number", "contact_phone"],
    email: ["email", "email_address", "contact_email"],
    website: ["website", "site", "url"],
    address: ["address", "street_address", "full_address"],
    city: ["city", "town"],
    state: ["state", "province"],
    zip: ["zip", "zip_code", "postal_code"],
    niche: ["niche", "industry", "category"],
    gmb_url: ["gmb_url", "google_maps_url", "gmb link"],
    gmb_claimed: ["gmb_claimed", "claimed", "gmb claimed"],
    gmb_rating: ["gmb_rating", "rating", "google_rating"],
    gmb_review_count: ["gmb_review_count", "review_count", "reviews"],
    has_website: ["has_website", "website_present", "has website"],
    gmb_profile_incomplete: ["gmb_profile_incomplete", "profile_incomplete"],
    citations_found: ["citations_found", "has_citations"],
    status: ["status", "lead_status"],
    notes: ["notes", "note"],
  };
}

export const leadsRouter = express.Router();

leadsRouter.get("/", (req, res) => {
  try {
    const data = listLeads({
      niche: String(req.query.niche ?? "").trim() || undefined,
      city: String(req.query.city ?? "").trim() || undefined,
      status: parseStatus(req.query.status),
      source: (String(req.query.source ?? "").trim() as LeadSource) || undefined,
      hasWebsite: parseBooleanQuery(req.query.hasWebsite),
      hasEmail: parseBooleanQuery(req.query.hasEmail),
      gmbClaimed: parseBooleanQuery(req.query.gmbClaimed),
      gmbRatingMin: toNumber(req.query.gmbRatingMin),
      gmbRatingMax: toNumber(req.query.gmbRatingMax),
      gmbReviewCountMin: toNumber(req.query.gmbReviewCountMin),
      gmbReviewCountMax: toNumber(req.query.gmbReviewCountMax),
      createdFrom: parseDateQuery(req.query.createdFrom),
      createdTo: parseDateQuery(req.query.createdTo),
      query: String(req.query.query ?? "").trim() || undefined,
      page: toNumber(req.query.page) || 1,
      pageSize: toNumber(req.query.pageSize) || 25,
    });

    res.json(data);
  } catch (error) {
    console.error("Failed to list leads", error);
    res.status(500).json({ error: "Failed to list leads" });
  }
});

leadsRouter.get("/export-csv", (req, res) => {
  try {
    const data = listLeads({
      niche: String(req.query.niche ?? "").trim() || undefined,
      city: String(req.query.city ?? "").trim() || undefined,
      status: parseStatus(req.query.status),
      source: (String(req.query.source ?? "").trim() as LeadSource) || undefined,
      hasWebsite: parseBooleanQuery(req.query.hasWebsite),
      hasEmail: parseBooleanQuery(req.query.hasEmail),
      gmbClaimed: parseBooleanQuery(req.query.gmbClaimed),
      gmbRatingMin: toNumber(req.query.gmbRatingMin),
      gmbRatingMax: toNumber(req.query.gmbRatingMax),
      gmbReviewCountMin: toNumber(req.query.gmbReviewCountMin),
      gmbReviewCountMax: toNumber(req.query.gmbReviewCountMax),
      createdFrom: parseDateQuery(req.query.createdFrom),
      createdTo: parseDateQuery(req.query.createdTo),
      query: String(req.query.query ?? "").trim() || undefined,
      page: 1,
      pageSize: 100000,
    });

    if (!data.items.length) {
      res.status(404).json({ error: "No leads found" });
      return;
    }

    const headers = [
      "Business Name","Phone","Email","Website","Address","City","State","Zip","Niche",
      "GMB URL","GMB Claimed","GMB Rating","GMB Reviews","Has Website",
      "Source","Status","Website Audit Score","GMB Audit Score","Created At",
    ];

    const esc = (v: string | number | boolean | null | undefined): string => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) {
        s = `'${s}`;
      }
      if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const csvRows = [headers.map(esc).join(",")];
    for (const r of data.items) {
      csvRows.push(
        [
          r.business_name, r.phone, r.email, r.website, r.address, r.city, r.state, r.zip, r.niche,
          r.gmb_url, r.gmb_claimed ? "Yes" : "No", r.gmb_rating, r.gmb_review_count,
          r.has_website ? "Yes" : "No", r.source, r.status,
          r.last_website_audit_score, r.last_gmb_audit_score, r.created_at,
        ].map(esc).join(",")
      );
    }

    res.setHeader("Content-Disposition", 'attachment; filename="leads_export.csv"');
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csvRows.join("\n"));
  } catch (error) {
    console.error("Failed to export leads CSV", error);
    res.status(500).json({ error: "Failed to export leads" });
  }
});

leadsRouter.post("/", checkLeadLimit, (req, res) => {
  try {
    const input = normalizeManualLeadInput(req.body as Record<string, unknown>, "manual");
    const lead = createLead(input);
    res.status(201).json(lead);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create lead";
    res.status(400).json({ error: message });
  }
});

leadsRouter.post("/import/csv", checkLeadLimit, upload.single("file"), (req, res) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "CSV file is required" });
      return;
    }

    const rawRows = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    }) as Record<string, string>[];

    const mappingFromBody = req.body.mapping ? JSON.parse(req.body.mapping) : {};
    const mapping = {
      ...getDefaultCsvMapping(),
      ...mappingFromBody,
    } as Record<string, string | string[]>;

    const items = rawRows.map((row) => mapCsvRecordToLead(row, mapping));
    const result = importLeads(items, "csv");

    res.json({
      message: "CSV imported",
      ...result,
      totalRows: rawRows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import CSV";
    res.status(400).json({ error: message });
  }
});

leadsRouter.post("/bulk-delete", (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const deleted = bulkDeleteLeads(ids);
    res.json({ deleted });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete leads" });
  }
});

leadsRouter.post("/bulk-status", (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const status = String(req.body?.status || "").trim() as LeadStatus;
    if (!ids.length || !status) {
      res.status(400).json({ error: "ids and status are required" });
      return;
    }
    if (!VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status: ${status}` });
      return;
    }
    const updated = bulkUpdateLeadStatus(ids, status);
    res.json({ updated, count: ids.length, status });
  } catch (error) {
    res.status(500).json({ error: "Failed to update lead statuses" });
  }
});

leadsRouter.get("/:id", (req, res) => {
  const lead = getLeadById(req.params.id);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const notes = listLeadNotes(lead.id);
  const activities = listLeadActivities(lead.id);

  res.json({
    ...lead,
    notes_log: notes,
    activity_log: activities,
  });
});

leadsRouter.patch("/:id", (req, res) => {
  try {
    const lead = updateLead(req.params.id, req.body as Partial<LeadInput>);

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    res.json(lead);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lead";
    res.status(400).json({ error: message });
  }
});

leadsRouter.delete("/:id", (req, res) => {
  const deleted = deleteLead(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.json({ deleted: true });
});

leadsRouter.post("/:id/notes", (req, res) => {
  const leadId = req.params.id;
  const lead = getLeadById(leadId);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const note = String(req.body?.note ?? "").trim();
  if (!note) {
    res.status(400).json({ error: "note is required" });
    return;
  }

  const created = addLeadNote(leadId, note);
  res.status(201).json(created);
});

leadsRouter.post("/:id/actions", (req, res) => {
  const leadId = req.params.id;
  const lead = getLeadById(leadId);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const action = String(req.body?.action ?? "").trim();
  const message = String(req.body?.message ?? "").trim();
  const nextStatus = parseStatus(req.body?.status);

  if (!action) {
    res.status(400).json({ error: "action is required" });
    return;
  }

  if (nextStatus && nextStatus !== lead.status) {
    updateLead(leadId, { status: nextStatus });
  }

  addLeadActivity(leadId, action, message || `Action executed: ${action}`, {
    status: nextStatus || lead.status,
  });

  res.json({ ok: true });
});

// POST /api/leads/:id/convert-to-client
leadsRouter.post("/:id/convert-to-client", (req, res) => {
  try {
    const leadId = req.params.id;
    const db = getDb();
    const lead = getLeadById(leadId);

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const now = new Date().toISOString();

    // Check if business already exists for this lead
    const existingBiz = db.prepare("SELECT * FROM client_businesses WHERE lead_id = ?").get(leadId) as any;
    if (existingBiz) {
      updateLead(leadId, { status: "retained_client" });
      res.json({
        ok: true,
        alreadyExisted: true,
        clientId: existingBiz.client_id,
        businessId: existingBiz.id,
      });
      return;
    }

    const clientId = `seo-${crypto.randomUUID()}`;
    const businessId = `biz-${crypto.randomUUID()}`;

    db.exec("BEGIN");
    try {
      db.prepare(`
        INSERT INTO seo_clients (
          id, name, primary_contact, contact_email, contact_phone, lifecycle_stage, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(
        clientId,
        lead.business_name,
        lead.business_name,
        lead.email || null,
        lead.phone || null,
        `Converted from Lead CRM on ${new Date().toLocaleDateString()}`,
        now,
        now
      );

      db.prepare(`
        INSERT INTO client_businesses (
          id, client_id, lead_id, name, website, gmb_url, city, state,
          service_type, package_type, monthly_budget, order_status, start_date, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
      `).run(
        businessId,
        clientId,
        lead.id,
        lead.business_name,
        lead.website || null,
        lead.gmb_url || null,
        lead.city || null,
        lead.state || null,
        lead.niche ? `${lead.niche} SEO` : "Local SEO",
        "Retainer",
        req.body?.monthlyBudget ? Number(req.body.monthlyBudget) : 1500,
        now.slice(0, 10),
        `Client retained from outreach campaign`,
        now,
        now
      );

      // Link any existing audits to this new client and business
      db.prepare(`
        UPDATE audits
        SET client_id = ?, business_id = ?
        WHERE lead_id = ?
      `).run(clientId, businessId, lead.id);

      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    // Mark lead status as retained_client
    updateLead(leadId, { status: "retained_client" });
    addLeadActivity(leadId, "converted_to_client", "Lead converted to retained SEO client", {
      clientId,
      businessId,
    });

    res.status(201).json({
      ok: true,
      clientId,
      businessId,
      message: "Lead successfully converted to SEO Client!",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to convert lead to SEO client";
    res.status(500).json({ error: message });
  }
});

// GET /api/leads/:id/sales-prep
leadsRouter.get("/:id/sales-prep", (req, res) => {
  try {
    const leadId = req.params.id;
    const db = getDb();
    const lead = getLeadById(leadId) as any;
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    const city = lead.city || "";
    const niche = lead.niche || "";
    let competitorsCount = 0;
    let avgRating = 4.5;

    if (city && niche) {
      const stats = db.prepare(`
        SELECT COUNT(*) as count, AVG(gmb_rating) as avg_rating 
        FROM leads 
        WHERE city = ? AND niche = ? AND id <> ?
      `).get(city, niche, leadId) as any;
      if (stats) {
        competitorsCount = stats.count || 0;
        avgRating = Number(Number(stats.avg_rating || 4.5).toFixed(1));
      }
    }

    const objections = [
      {
        objection: "We get all our work from word-of-mouth / referrals.",
        response: `Acknowledge and elevate: "That's exactly why we wanted to reach out. Word-of-mouth is the best, but did you know that 87% of customers look up reviews online even after a recommendation? Right now, if they search your name, competitor profiles with secondary categories are showing up above yours. We want to secure your existing word-of-mouth traffic."`
      },
      {
        objection: "We already pay a marketing agency / SEO company.",
        response: `Specific verification: "That's great, most active businesses do. Let's do a 2-minute check together: have they configured secondary service tags for Air Conditioning Repair and Duct Cleaning? If not, you are paying for broad SEO but missing out on the highest-intent local search calls."`
      },
      {
        objection: "How do we know this will actually get us calls?",
        response: `ROI projection: "We don't ask for a long contract. We run a 14-day local visibility check. If we add secondary categories and geotagged team photos, Google will immediately push your listing to the Top 3 map pack, which gets 70% of all local search clicks in ${city || 'your area'}."`
      }
    ];

    const packages = [
      { name: "Local GMB Quick-Start", price: "$199 setup", features: ["Claim & Verify Listing", "Add 5 Secondary Categories", "Optimize Main Services & Products", "Setup Google Reviews SMS Link"] },
      { name: "Local Dominator Package", price: "$399 setup + $99/mo", features: ["Everything in Quick-Start", "Geotagged Storefront Photo Setup", "3 Custom Product Showcases", "Monthly Review Loop Maintenance", "Quarterly competitor report"] }
    ];

    res.json({
      leadId,
      competitorsCount,
      avgRating,
      objections,
      packages
    });
  } catch (error: any) {
    console.error("Failed to load sales prep data:", error);
    res.status(500).json({ error: "Failed to generate sales prep battle cards." });
  }
});

// GET /api/leads/:id/proposal/download
leadsRouter.get("/:id/proposal/download", async (req, res) => {
  try {
    const leadId = req.params.id;
    const db = getDb();
    const lead = getLeadById(leadId) as any;
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    // Pull Agency White-Label Branding from app_settings
    let agencySettings: any = null;
    try {
      agencySettings = db.prepare("SELECT * FROM app_settings LIMIT 1").get();
    } catch {}

    const agencyName = agencySettings?.agency_name || "SMBify OS";
    const agencyEmail = agencySettings?.agency_email || "team@smbify.net";
    const agencyPhone = agencySettings?.agency_phone || "";

    const businessName = lead.business_name || "Valued Client";
    const city = lead.city || "Local Market";
    const niche = lead.niche || "Local Service";
    const rating = lead.gmb_rating || "4.2";
    const reviews = lead.gmb_review_count || 18;
    const score = lead.last_website_audit_score || lead.last_gmb_audit_score || 68;

    const letterGrade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "F";
    const gradeVerdict = score >= 80 ? "Healthy" : score >= 60 ? "Needs Optimization" : "Critical Attention Required";

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: `${agencyName.toUpperCase()}`,
            heading: HeadingLevel.HEADING_3,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Contact: ${agencyEmail} ${agencyPhone ? `| ${agencyPhone}` : ""}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: "\n" }),
          new Paragraph({
            text: "EXECUTIVE DIGITAL AUTHORITY & LOCAL GROWTH AUDIT",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Prepared Specifically for: ${businessName}`,
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Target Market: ${city} | Industry: ${niche} | Audit Date: ${new Date().toLocaleDateString()}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: "\n" }),

          // Section 1: Executive Summary & Letter Grade
          new Paragraph({
            text: `1. EXECUTIVE HEALTH RATING: GRADE ${letterGrade} (${score}/100 - ${gradeVerdict})`,
            heading: HeadingLevel.HEADING_3,
          }),
          new Paragraph({
            text: `Overall Assessment: ${businessName} currently maintains baseline visibility in ${city}, but technical friction and local citation gaps are limiting your reach for high-intent "${niche}" searches.`,
          }),
          new Paragraph({
            text: `Estimated Business Impact: These visibility bottlenecks are estimated to be diverting 25 to 45 high-intent prospective customer calls per month directly to competing providers in ${city}.`,
          }),
          new Paragraph({
            text: `Recommended Action: Immediately execute the prioritized action plan below to capture top 3 Google Maps rankings and drive direct inbound phone calls.`,
          }),
          new Paragraph({ text: "\n" }),

          // Section 2: Top 3 High-Impact Fixes
          new Paragraph({
            text: "2. TOP 3 PRIORITY HIGH-IMPACT FIXES",
            heading: HeadingLevel.HEADING_3,
          }),
          new Paragraph({
            text: `• Priority Fix #1: ${lead.gmb_claimed ? "Optimize Secondary Category Mapping" : "Claim & Verify Google Maps Business Profile"}`,
          }),
          new Paragraph({
            text: `  - Why This Matters: ${lead.gmb_claimed ? "Accurate primary and secondary categories help Google understand the services represented by the listing." : "Confirming ownership gives the business control over listing details and authorized managers."}`,
          }),
          new Paragraph({
            text: `  - Action: ${lead.gmb_claimed ? "Configure 5 verified secondary service categories." : "Submit direct Google verification and claim official rights."}`,
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: `• Priority Fix #2: Deploy Automated Review Follow-up (Currently ⭐️ ${rating} Stars across ${reviews} Reviews)`,
          }),
          new Paragraph({
            text: `  - Why This Matters: 92% of local consumers choose providers with 4.5+ stars and recent review velocity.`,
          }),
          new Paragraph({
            text: `  - Action: Implement a compliant post-service review request process and track request, response, and review trends.`,
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: `• Priority Fix #3: ${lead.website ? "Optimize Mobile Core Web Vitals & Schema Markup" : "Deploy Mobile-Friendly Conversion Landing Page"}`,
          }),
          new Paragraph({
            text: `  - Why This Matters: Over 68% of local service queries occur on mobile devices expecting instant click-to-call.`,
          }),
          new Paragraph({
            text: `  - Action: ${lead.website ? "Add structured LocalBusiness schema and compress mobile assets." : "Deploy a modern, conversion-optimized mobile site."}`,
          }),
          new Paragraph({ text: "\n" }),

          // Section 3: Competitor Benchmark
          new Paragraph({
            text: "3. LOCAL COMPETITOR BENCHMARK COMPARISON",
            heading: HeadingLevel.HEADING_3,
          }),
          new Paragraph({
            text: `In ${city}, top-ranking competitors in the "${niche}" space average 4.8 stars with 85+ reviews and complete LocalBusiness schema markup. Bridging this review and citation gap is the fastest path for ${businessName} to dominate the local 3-pack.`,
          }),
          new Paragraph({ text: "\n" }),

          // Section 4: Projected ROI
          new Paragraph({
            text: "4. PROJECTED MONTHLY REVENUE GROWTH (ROI)",
            heading: HeadingLevel.HEADING_3,
          }),
          new Paragraph({
            text: `• Projected Extra Monthly Calls (Top 3 Pack): +25 to +40 Calls`,
          }),
          new Paragraph({
            text: `• Estimated Conversion Value: +$3,500 to +$8,500 Monthly Net Revenue (Based on industry average job sizes)`,
          }),
          new Paragraph({ text: "\n" }),

          // Section 5: Retainer Packages & Next Steps
          new Paragraph({
            text: "5. RECOMMENDED RETROFIT & GROWTH PACKAGES",
            heading: HeadingLevel.HEADING_3,
          }),
          new Paragraph({
            text: "• Option A: Local GMB Fast-Track ($299 Setup) — Full listing claim, category expansion, and citation sync.",
          }),
          new Paragraph({
            text: "• Option B: Local Dominator Retainer ($499 Setup + $149/mo) — Full optimization, monthly review generation loop, ongoing geo-grid tracking, and monthly deliverable reports.",
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: "6. ACCEPTANCE OF AUDIT PROPOSAL",
            heading: HeadingLevel.HEADING_3,
          }),
          new Paragraph({
            text: `To authorize ${agencyName} to begin optimizing ${businessName}, please sign below:`,
          }),
          new Paragraph({ text: "\n" }),
          new Paragraph({
            text: "Authorized Signature: ___________________________________    Date: ________________________",
          }),
          new Paragraph({
            text: `Printed Name: ${lead.contact_name || businessName}                  Title: Owner / Officer`,
          }),
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Disposition", `attachment; filename="Proposal_${businessName.replace(/[^a-zA-Z0-9]/g, "_")}.docx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.send(buffer);

  } catch (error: any) {
    console.error("Failed to generate DOCX proposal:", error);
    res.status(500).json({ error: "Failed to download proposal." });
  }
});
