CREATE TABLE IF NOT EXISTS scraper_staged_leads (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  niche TEXT,
  gmb_url TEXT,
  gmb_claimed INTEGER NOT NULL DEFAULT 0,
  gmb_rating REAL,
  gmb_review_count INTEGER,
  has_website INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  is_selected INTEGER NOT NULL DEFAULT 1,
  added_to_dashboard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  added_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scraper_staged_leads_job_id
  ON scraper_staged_leads(job_id);

CREATE INDEX IF NOT EXISTS idx_scraper_staged_leads_pending
  ON scraper_staged_leads(job_id, added_to_dashboard, is_selected);
