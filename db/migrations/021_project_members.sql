-- ============================================================
-- 021_project_members.sql  --  Project-level team/client access
-- ============================================================

-- Links team members (and clients) to specific businesses (projects).
-- A team member only sees projects they are assigned to.
-- A client-role member only sees their own projects.
CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  team_member_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- owner | manager | member | viewer | client
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES client_businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE,
  UNIQUE(business_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_business ON project_members(business_id);
CREATE INDEX IF NOT EXISTS idx_project_members_member ON project_members(team_member_id);
