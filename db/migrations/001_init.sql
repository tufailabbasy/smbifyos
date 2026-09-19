CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
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
  gmb_profile_incomplete INTEGER NOT NULL DEFAULT 0,
  citations_found INTEGER NOT NULL DEFAULT 0,
  lead_score INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);

CREATE TABLE IF NOT EXISTS lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_niche TEXT,
  target_city TEXT,
  sequence_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails_sent (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  lead_id TEXT,
  step_number INTEGER NOT NULL DEFAULT 1,
  smtp_account_id TEXT,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  opened_at TEXT,
  replied_at TEXT,
  bounced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  audit_type TEXT NOT NULL,
  score INTEGER,
  verdict TEXT,
  data_json TEXT,
  ai_insights_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  business_name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  website TEXT,
  package_type TEXT,
  monthly_budget REAL,
  start_date TEXT,
  assigned_team_member TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  target_city TEXT,
  keyword_group TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ranks (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  keyword_id TEXT,
  check_date TEXT NOT NULL,
  organic_rank INTEGER,
  map_pack_rank INTEGER,
  data_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (keyword_id) REFERENCES keywords(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  directory_name TEXT NOT NULL,
  citation_url TEXT,
  nap_submitted TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  nap_consistent INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  client_id TEXT,
  title TEXT NOT NULL,
  due_date TEXT,
  is_done INTEGER NOT NULL DEFAULT 0,
  include_in_report INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  client_id TEXT,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  template_json TEXT,
  is_template INTEGER NOT NULL DEFAULT 1,
  client_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS google_tokens (
  client_id TEXT PRIMARY KEY,
  google_account_email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TEXT,
  gmb_connected INTEGER NOT NULL DEFAULT 0,
  gsc_connected INTEGER NOT NULL DEFAULT 0,
  connected_at TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gmb_reviews (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  reviewer_name TEXT,
  rating REAL,
  review_text TEXT,
  review_time TEXT,
  has_owner_reply INTEGER NOT NULL DEFAULT 0,
  owner_reply_text TEXT,
  owner_reply_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gmb_posts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  post_id TEXT,
  post_type TEXT,
  summary TEXT,
  action_url TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gsc_performance (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  avg_position REAL NOT NULL DEFAULT 0,
  dimension_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gsc_keywords (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  avg_position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scraper_jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT,
  output_file TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS api_quota_logs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
