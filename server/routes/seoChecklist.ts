import express from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";

const router = express.Router();

/* ── Helpers ── */
function cleanText(v: unknown): string { return String(v ?? "").trim(); }
function nullableText(v: unknown): string | null { const s = cleanText(v); return s || null; }

/* ═══════════════════════════════════════════════
   TEMPLATES
   ═══════════════════════════════════════════════ */

/* ── GET /templates ── */
router.get("/templates", (_req, res) => {
  try {
    const db = getDb();
    const category = cleanText(_req.query.category);
    let sql = `SELECT * FROM seo_checklist_templates WHERE is_active = 1`;
    const params: any[] = [];
    if (category) { sql += ` AND category = ?`; params.push(category); }
    sql += ` ORDER BY category, sort_order`;
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    console.error("[seoChecklist] GET /templates", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

/* ── POST /templates ── */
router.post("/templates", (req, res) => {
  try {
    const db = getDb();
    const title = cleanText(req.body.title);
    const category = cleanText(req.body.category);
    if (!title || !category) return res.status(400).json({ error: "title and category are required" });

    const id = req.body.id || uuidv4();
    db.prepare(`INSERT INTO seo_checklist_templates (id, category, title, description, is_recurring, recurrence_interval, default_priority, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, category, title, nullableText(req.body.description),
        req.body.is_recurring ? 1 : 0, nullableText(req.body.recurrence_interval),
        cleanText(req.body.default_priority) || "medium",
        Number(req.body.sort_order) || 0);

    const row = db.prepare(`SELECT * FROM seo_checklist_templates WHERE id = ?`).get(id);
    res.status(201).json(row);
  } catch (err) {
    console.error("[seoChecklist] POST /templates", err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

/* ── PATCH /templates/:id ── */
router.patch("/templates/:id", (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM seo_checklist_templates WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Template not found" });

    const fields: string[] = [];
    const params: any[] = [];

    for (const key of ["category", "title", "description", "default_priority", "recurrence_interval"] as const) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(key === "description" || key === "recurrence_interval" ? nullableText(req.body[key]) : cleanText(req.body[key]));
      }
    }
    if (req.body.is_recurring !== undefined) { fields.push(`is_recurring = ?`); params.push(req.body.is_recurring ? 1 : 0); }
    if (req.body.sort_order !== undefined) { fields.push(`sort_order = ?`); params.push(Number(req.body.sort_order)); }
    if (req.body.is_active !== undefined) { fields.push(`is_active = ?`); params.push(req.body.is_active ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    fields.push(`updated_at = datetime('now')`);
    params.push(id);
    db.prepare(`UPDATE seo_checklist_templates SET ${fields.join(", ")} WHERE id = ?`).run(...params);

    const row = db.prepare(`SELECT * FROM seo_checklist_templates WHERE id = ?`).get(id);
    res.json(row);
  } catch (err) {
    console.error("[seoChecklist] PATCH /templates/:id", err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

/* ═══════════════════════════════════════════════
   BUSINESS CHECKLIST ITEMS
   ═══════════════════════════════════════════════ */

/* ── GET /business/:businessId ── */
router.get("/business/:businessId", (req, res) => {
  try {
    const db = getDb();
    const { businessId } = req.params;
    const month = cleanText(req.query.month);
    const status = cleanText(req.query.status);
    const category = cleanText(req.query.category);

    let sql = `SELECT bci.*, tm.name AS assigned_to_name, tm.avatar_color AS assigned_to_color
      FROM business_checklist_items bci
      LEFT JOIN team_members tm ON bci.assigned_to = tm.id
      WHERE bci.business_id = ?`;
    const params: any[] = [businessId];

    if (month) {
      sql += ` AND (bci.period_month = ? OR bci.period_month IS NULL)`;
      params.push(month);
    }
    if (status) { sql += ` AND bci.status = ?`; params.push(status); }
    if (category) { sql += ` AND bci.category = ?`; params.push(category); }

    sql += ` ORDER BY bci.category, bci.sort_order, bci.created_at`;
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    console.error("[seoChecklist] GET /business/:businessId", err);
    res.status(500).json({ error: "Failed to fetch checklist items" });
  }
});

/* ── POST /business/:businessId/generate — generate from templates ── */
router.post("/business/:businessId/generate", (req, res) => {
  try {
    const db = getDb();
    const { businessId } = req.params;

    // Verify business exists
    const biz = db.prepare(`SELECT id, client_id FROM client_businesses WHERE id = ?`).get(businessId) as any;
    if (!biz) return res.status(404).json({ error: "Business not found" });

    const now = new Date();
    const month = cleanText(req.body.month) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const categories: string[] | undefined = req.body.categories;

    let tplSql = `SELECT * FROM seo_checklist_templates WHERE is_active = 1`;
    const tplParams: any[] = [];
    if (categories?.length) {
      tplSql += ` AND category IN (${categories.map(() => "?").join(",")})`;
      tplParams.push(...categories);
    }
    tplSql += ` ORDER BY category, sort_order`;
    const templates = db.prepare(tplSql).all(...tplParams) as any[];

    // Get existing items for this business
    const existingItems = db.prepare(
      `SELECT template_id, period_month FROM business_checklist_items WHERE business_id = ? AND template_id IS NOT NULL`
    ).all(businessId) as any[];

    const existingSet = new Set(existingItems.map((e: any) => `${e.template_id}|${e.period_month || ""}`));

    const insert = db.prepare(`INSERT INTO business_checklist_items
      (id, business_id, template_id, category, title, description, is_recurring, priority, status, period_month, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`);

    let created = 0;
    for (const tpl of templates) {
      if (tpl.is_recurring) {
        const key = `${tpl.id}|${month}`;
        if (existingSet.has(key)) continue;
        insert.run(uuidv4(), businessId, tpl.id, tpl.category, tpl.title, tpl.description, 1, tpl.default_priority, month, tpl.sort_order);
        created++;
      } else {
        const hasItem = existingItems.some((e: any) => e.template_id === tpl.id);
        if (hasItem) continue;
        insert.run(uuidv4(), businessId, tpl.id, tpl.category, tpl.title, tpl.description, 0, tpl.default_priority, null, tpl.sort_order);
        created++;
      }
    }

    // Log activity
    db.prepare(`INSERT INTO seo_activity_log (id, client_id, business_id, action, detail) VALUES (?, ?, ?, 'checklist_generated', ?)`)
      .run(uuidv4(), biz.client_id, businessId, `Generated ${created} checklist items for ${month}`);

    res.json({ created, month });
  } catch (err) {
    console.error("[seoChecklist] POST /business/:businessId/generate", err);
    res.status(500).json({ error: "Failed to generate checklist" });
  }
});

/* ── POST /business/:businessId — create custom item ── */
router.post("/business/:businessId", (req, res) => {
  try {
    const db = getDb();
    const { businessId } = req.params;
    const title = cleanText(req.body.title);
    const category = cleanText(req.body.category) || "custom";
    if (!title) return res.status(400).json({ error: "title is required" });

    const id = uuidv4();
    db.prepare(`INSERT INTO business_checklist_items
      (id, business_id, category, title, description, is_recurring, priority, status, assigned_to, due_date, period_month, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`)
      .run(id, businessId, category, title, nullableText(req.body.description),
        req.body.is_recurring ? 1 : 0,
        cleanText(req.body.priority) || "medium",
        nullableText(req.body.assigned_to),
        nullableText(req.body.due_date),
        nullableText(req.body.period_month),
        Number(req.body.sort_order) || 0);

    const row = db.prepare(`SELECT bci.*, tm.name AS assigned_to_name, tm.avatar_color AS assigned_to_color
      FROM business_checklist_items bci LEFT JOIN team_members tm ON bci.assigned_to = tm.id
      WHERE bci.id = ?`).get(id);
    res.status(201).json(row);
  } catch (err) {
    console.error("[seoChecklist] POST /business/:businessId", err);
    res.status(500).json({ error: "Failed to create checklist item" });
  }
});

/* ── PATCH /business/:businessId/items/:itemId ── */
router.patch("/business/:businessId/items/:itemId", (req, res) => {
  try {
    const db = getDb();
    const { itemId } = req.params;
    const existing = db.prepare(`SELECT * FROM business_checklist_items WHERE id = ?`).get(itemId) as any;
    if (!existing) return res.status(404).json({ error: "Item not found" });

    const fields: string[] = [];
    const params: any[] = [];

    for (const key of ["title", "description", "category", "priority", "status", "assigned_to", "due_date", "notes", "period_month"] as const) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(["description", "assigned_to", "due_date", "notes", "period_month"].includes(key) ? nullableText(req.body[key]) : cleanText(req.body[key]));
      }
    }

    // Handle completion
    if (req.body.status === "done" && existing.status !== "done") {
      fields.push(`completed_at = datetime('now')`);
      if (req.body.completed_by) { fields.push(`completed_by = ?`); params.push(cleanText(req.body.completed_by)); }
    }
    if (req.body.status && req.body.status !== "done" && existing.status === "done") {
      fields.push(`completed_at = NULL`, `completed_by = NULL`);
    }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    fields.push(`updated_at = datetime('now')`);
    params.push(itemId);
    db.prepare(`UPDATE business_checklist_items SET ${fields.join(", ")} WHERE id = ?`).run(...params);

    // Log status changes
    if (req.body.status && req.body.status !== existing.status) {
      const biz = db.prepare(`SELECT client_id FROM client_businesses WHERE id = ?`).get(existing.business_id) as any;
      db.prepare(`INSERT INTO seo_activity_log (id, client_id, business_id, action, detail) VALUES (?, ?, ?, ?, ?)`)
        .run(uuidv4(), biz?.client_id, existing.business_id,
          req.body.status === "done" ? "task_completed" : "task_updated",
          `${existing.title} → ${req.body.status}`);
    }

    const row = db.prepare(`SELECT bci.*, tm.name AS assigned_to_name, tm.avatar_color AS assigned_to_color
      FROM business_checklist_items bci LEFT JOIN team_members tm ON bci.assigned_to = tm.id
      WHERE bci.id = ?`).get(itemId);
    res.json(row);
  } catch (err) {
    console.error("[seoChecklist] PATCH item", err);
    res.status(500).json({ error: "Failed to update checklist item" });
  }
});

/* ── DELETE /business/:businessId/items/:itemId ── */
router.delete("/business/:businessId/items/:itemId", (req, res) => {
  try {
    const db = getDb();
    db.prepare(`DELETE FROM business_checklist_items WHERE id = ?`).run(req.params.itemId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[seoChecklist] DELETE item", err);
    res.status(500).json({ error: "Failed to delete checklist item" });
  }
});

export { router as seoChecklistRouter };
