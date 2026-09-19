-- 027_email_marketing_suite.sql
-- Email Marketing Suite — Full Schema

-- 1. Email Tracking (per sent email record)
CREATE TABLE IF NOT EXISTS email_tracking (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  campaign_id TEXT,
  sender_email TEXT,
  sequence_number INTEGER DEFAULT 1,
  tracking_pixel_id TEXT UNIQUE,
  subject TEXT,
  recipient_email TEXT,
  sent_at TEXT,
  opened_at TEXT,
  open_count INTEGER DEFAULT 0,
  clicked_at TEXT,
  click_count INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  bounce_reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_tracking_campaign ON email_tracking(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_lead ON email_tracking(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_pixel ON email_tracking(tracking_pixel_id);

-- 2. Follow-up Queue (automated sequence scheduler)
CREATE TABLE IF NOT EXISTS email_followup_queue (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  campaign_id TEXT,
  sequence_id TEXT,
  sequence_number INTEGER NOT NULL DEFAULT 1,
  recipient_email TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_followup_scheduled ON email_followup_queue(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_followup_lead ON email_followup_queue(lead_id);

-- 3. Suppression List (bounced + unsubscribed)
CREATE TABLE IF NOT EXISTS email_suppression (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  reason TEXT DEFAULT 'manual',
  campaign_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_suppression_email ON email_suppression(email);

-- 4. Email Sequences (template sequences)
CREATE TABLE IF NOT EXISTS email_sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  niche TEXT,
  description TEXT,
  steps_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 5. Email Campaigns (the new dedicated email marketing campaigns)
CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  niche TEXT,
  city TEXT,
  status TEXT DEFAULT 'draft',
  sequence_id TEXT,
  sender_strategy TEXT DEFAULT 'round_robin',
  daily_limit INTEGER DEFAULT 200,
  delay_seconds INTEGER DEFAULT 60,
  total_sent INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 6. Add email intelligence columns to leads (safe ALTER with IF NOT EXISTS workaround)
CREATE TABLE IF NOT EXISTS _leads_email_cols_applied (applied INTEGER PRIMARY KEY);

INSERT OR IGNORE INTO _leads_email_cols_applied VALUES (0);
