import express from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/database.js";

const router = express.Router();

/* ── GET /overview — workspace-level dashboard summary ── */
router.get("/overview", (_req, res) => {
  try {
    const db = getDb();

    const totalClients = (db.prepare(`SELECT COUNT(*) AS c FROM seo_clients`).get() as any).c;
    const activeBusinesses = (db.prepare(`SELECT COUNT(*) AS c FROM client_businesses WHERE order_status = 'active'`).get() as any).c;
    const totalTeamMembers = (db.prepare(`SELECT COUNT(*) AS c FROM team_members WHERE is_active = 1`).get() as any).c;

    // Task stats
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const tasksDueToday = (db.prepare(`SELECT COUNT(*) AS c FROM business_checklist_items WHERE due_date = ? AND status != 'done' AND status != 'skipped'`).get(today) as any).c;
    const tasksOverdue = (db.prepare(`SELECT COUNT(*) AS c FROM business_checklist_items WHERE due_date < ? AND due_date IS NOT NULL AND status != 'done' AND status != 'skipped'`).get(today) as any).c;
    const tasksPending = (db.prepare(`SELECT COUNT(*) AS c FROM business_checklist_items WHERE status = 'pending'`).get() as any).c;
    const tasksInProgress = (db.prepare(`SELECT COUNT(*) AS c FROM business_checklist_items WHERE status = 'in_progress'`).get() as any).c;
    const tasksCompletedThisMonth = (db.prepare(`SELECT COUNT(*) AS c FROM business_checklist_items WHERE status = 'done' AND completed_at >= ?`).get(`${currentMonth}-01`) as any).c;

    // Tasks by team member
    const tasksByMember = db.prepare(`
      SELECT tm.id, tm.name, tm.avatar_color,
        COUNT(bci.id) AS total_tasks,
        SUM(CASE WHEN bci.status = 'done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN bci.status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN bci.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress
      FROM team_members tm
      LEFT JOIN business_checklist_items bci ON bci.assigned_to = tm.id
      WHERE tm.is_active = 1
      GROUP BY tm.id
      ORDER BY tm.name
    `).all();

    // Recent activity
    const recentActivity = db.prepare(`
      SELECT al.*, sc.name AS client_name, cb.name AS business_name, tm.name AS actor_name
      FROM seo_activity_log al
      LEFT JOIN seo_clients sc ON al.client_id = sc.id
      LEFT JOIN client_businesses cb ON al.business_id = cb.id
      LEFT JOIN team_members tm ON al.actor_id = tm.id
      ORDER BY al.created_at DESC
      LIMIT 20
    `).all();

    // Average audit score across the workspace
    const auditStats = db.prepare(`
      SELECT ROUND(AVG(score)) AS avg_score, COUNT(id) AS total_audits
      FROM audits
      WHERE score IS NOT NULL AND audit_type IN ('gmb', 'gmb_advanced', 'website', 'eeat')
    `).get() as { avg_score: number | null; total_audits: number } | undefined;

    const avgCrawlHealth = auditStats?.avg_score ?? null;
    const totalAuditsCompleted = auditStats?.total_audits ?? 0;

    // Clients with progress & real audit averages
    const clientsWithProgress = db.prepare(`
      SELECT sc.*,
        COUNT(DISTINCT cb.id) AS business_count,
        COUNT(bci.id) AS total_tasks,
        SUM(CASE WHEN bci.status = 'done' THEN 1 ELSE 0 END) AS tasks_done,
        SUM(CASE WHEN bci.due_date < ? AND bci.due_date IS NOT NULL AND bci.status != 'done' AND bci.status != 'skipped' THEN 1 ELSE 0 END) AS tasks_overdue,
        (
          SELECT ROUND(AVG(a.score))
          FROM audits a
          LEFT JOIN client_businesses b ON b.id = a.business_id
          WHERE (a.client_id = sc.id OR b.client_id = sc.id)
            AND a.score IS NOT NULL
        ) AS avg_audit_score
      FROM seo_clients sc
      LEFT JOIN client_businesses cb ON cb.client_id = sc.id
      LEFT JOIN business_checklist_items bci ON bci.business_id = cb.id
      GROUP BY sc.id
      ORDER BY sc.name
    `).all(today);

    res.json({
      totalClients,
      activeBusinesses,
      totalTeamMembers,
      tasksDueToday,
      tasksOverdue,
      tasksPending,
      tasksInProgress,
      tasksCompletedThisMonth,
      tasksByMember,
      recentActivity,
      clients: clientsWithProgress,
      avgCrawlHealth,
      totalAuditsCompleted,
    });
  } catch (err) {
    console.error("[seoWorkspace] GET /overview", err);
    res.status(500).json({ error: "Failed to fetch workspace overview" });
  }
});

/* ── GET /clients/:clientId — full client detail with business progress ── */
router.get("/clients/:clientId", (req, res) => {
  try {
    const db = getDb();
    const { clientId } = req.params;
    const today = new Date().toISOString().slice(0, 10);

    const client = db.prepare(`SELECT * FROM seo_clients WHERE id = ?`).get(clientId);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const businesses = db.prepare(`
      SELECT cb.*,
        COUNT(bci.id) AS checklist_total,
        SUM(CASE WHEN bci.status = 'done' THEN 1 ELSE 0 END) AS checklist_done,
        SUM(CASE WHEN bci.status = 'in_progress' THEN 1 ELSE 0 END) AS checklist_in_progress,
        SUM(CASE WHEN bci.due_date < ? AND bci.due_date IS NOT NULL AND bci.status != 'done' AND bci.status != 'skipped' THEN 1 ELSE 0 END) AS checklist_overdue,
        (SELECT score FROM audits WHERE business_id = cb.id AND audit_type = 'website' ORDER BY created_at DESC LIMIT 1) AS last_website_audit_score,
        (SELECT score FROM audits WHERE business_id = cb.id AND audit_type = 'gmb' ORDER BY created_at DESC LIMIT 1) AS last_gmb_audit_score
      FROM client_businesses cb
      LEFT JOIN business_checklist_items bci ON bci.business_id = cb.id
      WHERE cb.client_id = ?
      GROUP BY cb.id
      ORDER BY cb.name
    `).all(today, clientId);

    const recentActivity = db.prepare(`
      SELECT al.*, cb.name AS business_name, tm.name AS actor_name
      FROM seo_activity_log al
      LEFT JOIN client_businesses cb ON al.business_id = cb.id
      LEFT JOIN team_members tm ON al.actor_id = tm.id
      WHERE al.client_id = ?
      ORDER BY al.created_at DESC
      LIMIT 20
    `).all(clientId);

    res.json({ client, businesses, recentActivity });
  } catch (err) {
    console.error("[seoWorkspace] GET /clients/:clientId", err);
    res.status(500).json({ error: "Failed to fetch client detail" });
  }
});

/* ── GET /businesses/:businessId — full business detail ── */
router.get("/businesses/:businessId", (req, res) => {
  try {
    const db = getDb();
    const { businessId } = req.params;
    const today = new Date().toISOString().slice(0, 10);

    const business = db.prepare(`
      SELECT cb.*, sc.name AS client_name
      FROM client_businesses cb
      LEFT JOIN seo_clients sc ON cb.client_id = sc.id
      WHERE cb.id = ?
    `).get(businessId) as any;
    if (!business) return res.status(404).json({ error: "Business not found" });

    // Checklist summary by category
    const checklistSummary = db.prepare(`
      SELECT category,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN due_date < ? AND due_date IS NOT NULL AND status != 'done' AND status != 'skipped' THEN 1 ELSE 0 END) AS overdue
      FROM business_checklist_items
      WHERE business_id = ?
      GROUP BY category
      ORDER BY category
    `).all(today, businessId);

    // Recent audits
    const recentAudits = db.prepare(`
      SELECT id, audit_type, score, verdict, target_name, status, created_at
      FROM audits WHERE business_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).all(businessId);

    const recentActivity = db.prepare(`
      SELECT al.*, tm.name AS actor_name
      FROM seo_activity_log al
      LEFT JOIN team_members tm ON al.actor_id = tm.id
      WHERE al.business_id = ?
      ORDER BY al.created_at DESC
      LIMIT 15
    `).all(businessId);

    // Project members
    const projectMembers = db.prepare(`
      SELECT pm.*, tm.name, tm.email, tm.role AS team_role, tm.avatar_color, tm.is_active
      FROM project_members pm
      JOIN team_members tm ON pm.team_member_id = tm.id
      WHERE pm.business_id = ?
      ORDER BY pm.role, tm.name
    `).all(businessId);

    res.json({ business, checklistSummary, recentAudits, recentActivity, projectMembers });
  } catch (err) {
    console.error("[seoWorkspace] GET /businesses/:businessId", err);
    res.status(500).json({ error: "Failed to fetch business detail" });
  }
});

/* ═══════════════════════════════════════════════
   PROJECT MEMBERS — assign team/clients to projects
   ═══════════════════════════════════════════════ */

/* ── GET /businesses/:businessId/members ── */
router.get("/businesses/:businessId/members", (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT pm.*, tm.name, tm.email, tm.role AS team_role, tm.avatar_color, tm.is_active
      FROM project_members pm
      JOIN team_members tm ON pm.team_member_id = tm.id
      WHERE pm.business_id = ?
      ORDER BY pm.role, tm.name
    `).all(req.params.businessId);
    res.json(rows);
  } catch (err) {
    console.error("[seoWorkspace] GET members", err);
    res.status(500).json({ error: "Failed to fetch project members" });
  }
});

/* ── POST /businesses/:businessId/members ── */
router.post("/businesses/:businessId/members", (req, res) => {
  try {
    const db = getDb();
    const { businessId } = req.params;
    const teamMemberId = String(req.body.team_member_id || "").trim();
    const role = String(req.body.role || "member").trim();
    if (!teamMemberId) return res.status(400).json({ error: "team_member_id is required" });

    // Check for existing assignment
    const existing = db.prepare(`SELECT id FROM project_members WHERE business_id = ? AND team_member_id = ?`).get(businessId, teamMemberId);
    if (existing) return res.status(409).json({ error: "Member already assigned to this project" });

    const id = uuidv4();
    db.prepare(`INSERT INTO project_members (id, business_id, team_member_id, role) VALUES (?, ?, ?, ?)`)
      .run(id, businessId, teamMemberId, role);

    // Log activity
    const biz = db.prepare(`SELECT client_id FROM client_businesses WHERE id = ?`).get(businessId) as any;
    const member = db.prepare(`SELECT name FROM team_members WHERE id = ?`).get(teamMemberId) as any;
    db.prepare(`INSERT INTO seo_activity_log (id, client_id, business_id, action, detail) VALUES (?, ?, ?, 'member_added', ?)`)
      .run(uuidv4(), biz?.client_id, businessId, `${member?.name || "Member"} added as ${role}`);

    const row = db.prepare(`
      SELECT pm.*, tm.name, tm.email, tm.role AS team_role, tm.avatar_color, tm.is_active
      FROM project_members pm JOIN team_members tm ON pm.team_member_id = tm.id
      WHERE pm.id = ?
    `).get(id);
    res.status(201).json(row);
  } catch (err) {
    console.error("[seoWorkspace] POST member", err);
    res.status(500).json({ error: "Failed to add project member" });
  }
});

/* ── PATCH /businesses/:businessId/members/:memberId ── */
router.patch("/businesses/:businessId/members/:memberId", (req, res) => {
  try {
    const db = getDb();
    const role = String(req.body.role || "").trim();
    if (!role) return res.status(400).json({ error: "role is required" });
    db.prepare(`UPDATE project_members SET role = ? WHERE id = ?`).run(role, req.params.memberId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[seoWorkspace] PATCH member", err);
    res.status(500).json({ error: "Failed to update project member" });
  }
});

/* ── DELETE /businesses/:businessId/members/:memberId ── */
router.delete("/businesses/:businessId/members/:memberId", (req, res) => {
  try {
    const db = getDb();
    db.prepare(`DELETE FROM project_members WHERE id = ?`).run(req.params.memberId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[seoWorkspace] DELETE member", err);
    res.status(500).json({ error: "Failed to remove project member" });
  }
});

export { router as seoWorkspaceRouter };
