CREATE TABLE IF NOT EXISTS site_audit_jobs (
  job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  input_json TEXT NOT NULL,
  options_json TEXT NOT NULL,
  progress_json TEXT NOT NULL,
  cache_json TEXT,
  result_json TEXT,
  error_message TEXT,
  requester_ip TEXT,
  cache_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_site_audit_jobs_status_updated
  ON site_audit_jobs(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_audit_jobs_ip_status
  ON site_audit_jobs(requester_ip, status);

CREATE INDEX IF NOT EXISTS idx_site_audit_jobs_cache_key
  ON site_audit_jobs(cache_key, created_at DESC);

CREATE TABLE IF NOT EXISTS site_audit_cache (
  cache_key TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  input_json TEXT NOT NULL,
  options_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  stored_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_site_audit_cache_expires
  ON site_audit_cache(expires_at);