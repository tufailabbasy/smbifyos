CREATE TABLE IF NOT EXISTS audit_crawl_jobs (
  id TEXT PRIMARY KEY,
  audit_scope TEXT NOT NULL DEFAULT 'website',
  target_name TEXT,
  start_url TEXT NOT NULL,
  host TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  max_pages INTEGER NOT NULL DEFAULT 10,
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT,
  ai_insights_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_crawl_jobs_scope_created
  ON audit_crawl_jobs(audit_scope, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_crawl_pages (
  id TEXT PRIMARY KEY,
  crawl_job_id TEXT NOT NULL,
  url TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  title TEXT,
  meta_description TEXT,
  h1_count INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  internal_link_count INTEGER NOT NULL DEFAULT 0,
  has_schema INTEGER NOT NULL DEFAULT 0,
  has_contact_signal INTEGER NOT NULL DEFAULT 0,
  images_count INTEGER NOT NULL DEFAULT 0,
  images_without_alt INTEGER NOT NULL DEFAULT 0,
  canonical_url TEXT,
  page_summary TEXT,
  raw_metrics_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (crawl_job_id) REFERENCES audit_crawl_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_crawl_pages_job
  ON audit_crawl_pages(crawl_job_id, depth, created_at);