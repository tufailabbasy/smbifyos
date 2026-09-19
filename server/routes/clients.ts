import express from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";

type ClientRow = {
  id: string;
  lead_id: string | null;
  business_name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  package_type: string | null;
  monthly_budget: number | null;
  start_date: string | null;
  assigned_team_member: string | null;
  created_at: string;
  updated_at: string;
  open_tasks: number;
  total_keywords: number;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hasOwnValue(record: unknown, key: string): boolean {
  return Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key));
}

function rowToClient(row: ClientRow) {
  return {
    id: row.id,
    lead_id: row.lead_id || "",
    business_name: row.business_name,
    city: row.city || "",
    state: row.state || "",
    website: row.website || "",
    package_type: row.package_type || "",
    monthly_budget: row.monthly_budget,
    start_date: row.start_date || "",
    assigned_team_member: row.assigned_team_member || "",
    open_tasks: Number(row.open_tasks || 0),
    total_keywords: Number(row.total_keywords || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const clientsRouter = express.Router();

clientsRouter.get("/", (req, res) => {
  try {
    const db = getDb();
    const query = cleanText(req.query.query).toLowerCase();
    const where = query
      ? `WHERE LOWER(c.business_name) LIKE ? OR LOWER(COALESCE(c.city, '')) LIKE ? OR LOWER(COALESCE(c.assigned_team_member, '')) LIKE ?`
      : "";
    const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];

    const rows = db
      .prepare(
        `SELECT
          c.*,
          COUNT(DISTINCT CASE WHEN t.is_done = 0 THEN t.id END) as open_tasks,
          COUNT(DISTINCT k.id) as total_keywords
         FROM clients c
         LEFT JOIN tasks t ON t.client_id = c.id
         LEFT JOIN keywords k ON k.client_id = c.id
         ${where}
         GROUP BY c.id
         ORDER BY datetime(c.updated_at) DESC, datetime(c.created_at) DESC`
      )
      .all(...params) as ClientRow[];

    res.json({ items: rows.map(rowToClient) });
  } catch (error) {
    console.error("Failed to list clients", error);
    res.status(500).json({ error: "Failed to list clients" });
  }
});

clientsRouter.post("/", (req, res) => {
  try {
    const leadId = nullableText(req.body?.lead_id);
    const businessName = cleanText(req.body?.business_name);
    const city = nullableText(req.body?.city);
    const state = nullableText(req.body?.state);
    const website = nullableText(req.body?.website);
    const packageType = nullableText(req.body?.package_type);
    const monthlyBudget = nullableNumber(req.body?.monthly_budget);
    const startDate = nullableText(req.body?.start_date);
    const assignedTeamMember = nullableText(req.body?.assigned_team_member);

    if (!businessName) {
      res.status(400).json({ error: "business_name is required" });
      return;
    }

    const db = getDb();
    const now = new Date().toISOString();
    const id = uuidv4();

    db.prepare(
      `INSERT INTO clients (
        id, lead_id, business_name, city, state, website, package_type,
        monthly_budget, start_date, assigned_team_member, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      leadId,
      businessName,
      city,
      state,
      website,
      packageType,
      monthlyBudget,
      startDate,
      assignedTeamMember,
      now,
      now
    );

    const row = db
      .prepare(
        `SELECT c.*, 0 as open_tasks, 0 as total_keywords
         FROM clients c
         WHERE c.id = ?`
      )
      .get(id) as ClientRow;

    res.status(201).json(rowToClient(row));
  } catch (error) {
    console.error("Failed to create client", error);
    res.status(500).json({ error: "Failed to create client" });
  }
});

clientsRouter.patch("/:id", (req, res) => {
  try {
    const clientId = cleanText(req.params.id);
    if (!clientId) {
      res.status(400).json({ error: "Client id is required" });
      return;
    }

    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM clients WHERE id = ?")
      .get(clientId) as Omit<ClientRow, "open_tasks" | "total_keywords"> | undefined;

    if (!existing) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const next = {
      lead_id: hasOwnValue(req.body, "lead_id") ? nullableText(req.body?.lead_id) : existing.lead_id,
      business_name: hasOwnValue(req.body, "business_name")
        ? cleanText(req.body?.business_name)
        : existing.business_name,
      city: hasOwnValue(req.body, "city") ? nullableText(req.body?.city) : existing.city,
      state: hasOwnValue(req.body, "state") ? nullableText(req.body?.state) : existing.state,
      website: hasOwnValue(req.body, "website") ? nullableText(req.body?.website) : existing.website,
      package_type: hasOwnValue(req.body, "package_type")
        ? nullableText(req.body?.package_type)
        : existing.package_type,
      monthly_budget: hasOwnValue(req.body, "monthly_budget")
        ? nullableNumber(req.body?.monthly_budget)
        : existing.monthly_budget,
      start_date: hasOwnValue(req.body, "start_date")
        ? nullableText(req.body?.start_date)
        : existing.start_date,
      assigned_team_member: hasOwnValue(req.body, "assigned_team_member")
        ? nullableText(req.body?.assigned_team_member)
        : existing.assigned_team_member,
    };

    if (!next.business_name) {
      res.status(400).json({ error: "business_name is required" });
      return;
    }

    db.prepare(
      `UPDATE clients SET
        lead_id = ?,
        business_name = ?,
        city = ?,
        state = ?,
        website = ?,
        package_type = ?,
        monthly_budget = ?,
        start_date = ?,
        assigned_team_member = ?,
        updated_at = ?
       WHERE id = ?`
    ).run(
      next.lead_id,
      next.business_name,
      next.city,
      next.state,
      next.website,
      next.package_type,
      next.monthly_budget,
      next.start_date,
      next.assigned_team_member,
      new Date().toISOString(),
      clientId
    );

    const row = db
      .prepare(
        `SELECT
          c.*,
          COUNT(DISTINCT CASE WHEN t.is_done = 0 THEN t.id END) as open_tasks,
          COUNT(DISTINCT k.id) as total_keywords
         FROM clients c
         LEFT JOIN tasks t ON t.client_id = c.id
         LEFT JOIN keywords k ON k.client_id = c.id
         WHERE c.id = ?
         GROUP BY c.id`
      )
      .get(clientId) as ClientRow;

    res.json(rowToClient(row));
  } catch (error) {
    console.error("Failed to update client", error);
    res.status(500).json({ error: "Failed to update client" });
  }
});