import express from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";

const router = express.Router();

/* ── Helpers ── */
function cleanText(v: unknown): string { return String(v ?? "").trim(); }
function nullableText(v: unknown): string | null { const s = cleanText(v); return s || null; }

const ROLES = ["admin", "manager", "specialist", "client"] as const;

/* ── GET /  — list team members ── */
router.get("/", (_req, res) => {
  try {
    const db = getDb();
    const role = cleanText(_req.query.role);
    const active = _req.query.active;

    let sql = `SELECT * FROM team_members WHERE 1=1`;
    const params: any[] = [];

    if (role) { sql += ` AND role = ?`; params.push(role); }
    if (active !== undefined) { sql += ` AND is_active = ?`; params.push(Number(active)); }

    sql += ` ORDER BY name ASC`;
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    console.error("[seoTeam] GET /", err);
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

/* ── POST /  — create team member ── */
router.post("/", (req, res) => {
  try {
    const db = getDb();
    const name = cleanText(req.body.name);
    if (!name) return res.status(400).json({ error: "Name is required" });

    const role = cleanText(req.body.role) || "specialist";
    if (!ROLES.includes(role as any)) return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(", ")}` });

    const id = uuidv4();
    const email = nullableText(req.body.email);
    const avatarColor = cleanText(req.body.avatar_color) || "#5e6ad2";

    db.prepare(`INSERT INTO team_members (id, name, email, role, avatar_color) VALUES (?, ?, ?, ?, ?)`)
      .run(id, name, email, role, avatarColor);

    const row = db.prepare(`SELECT * FROM team_members WHERE id = ?`).get(id);
    res.status(201).json(row);
  } catch (err) {
    console.error("[seoTeam] POST /", err);
    res.status(500).json({ error: "Failed to create team member" });
  }
});

/* ── PATCH /:id  — update team member ── */
router.patch("/:id", (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const existing = db.prepare(`SELECT * FROM team_members WHERE id = ?`).get(id);
    if (!existing) return res.status(404).json({ error: "Team member not found" });

    const fields: string[] = [];
    const params: any[] = [];

    for (const key of ["name", "email", "role", "avatar_color"] as const) {
      if (req.body[key] !== undefined) {
        if (key === "role" && !ROLES.includes(req.body[key])) {
          return res.status(400).json({ error: `Invalid role` });
        }
        fields.push(`${key} = ?`);
        params.push(key === "email" ? nullableText(req.body[key]) : cleanText(req.body[key]));
      }
    }

    if (req.body.is_active !== undefined) {
      fields.push(`is_active = ?`);
      params.push(Number(req.body.is_active));
    }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    fields.push(`updated_at = datetime('now')`);
    params.push(id);
    db.prepare(`UPDATE team_members SET ${fields.join(", ")} WHERE id = ?`).run(...params);

    const row = db.prepare(`SELECT * FROM team_members WHERE id = ?`).get(id);
    res.json(row);
  } catch (err) {
    console.error("[seoTeam] PATCH /:id", err);
    res.status(500).json({ error: "Failed to update team member" });
  }
});

/* ── DELETE /:id  — soft-delete (deactivate) ── */
router.delete("/:id", (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    db.prepare(`UPDATE team_members SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[seoTeam] DELETE /:id", err);
    res.status(500).json({ error: "Failed to deactivate team member" });
  }
});

export { router as seoTeamRouter };
