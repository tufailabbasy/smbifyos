CREATE TABLE auto_audit_jobs (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auto_audit_due ON auto_audit_jobs(status,scheduled_at);
CREATE UNIQUE INDEX idx_auto_audit_active_lead ON auto_audit_jobs(lead_id) WHERE status IN ('pending','running');