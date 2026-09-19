CREATE TABLE IF NOT EXISTS smtp_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  secure INTEGER NOT NULL DEFAULT 0,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  from_name TEXT,
  from_email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_smtp_accounts_active ON smtp_accounts(is_active);

CREATE TABLE IF NOT EXISTS content_articles (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  title TEXT,
  content_markdown TEXT,
  meta_description TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  tone TEXT NOT NULL DEFAULT 'Professional',
  word_count_target INTEGER NOT NULL DEFAULT 1200,
  word_count_actual INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  model_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_articles_status ON content_articles(status);
CREATE INDEX IF NOT EXISTS idx_content_articles_created_at ON content_articles(created_at);
