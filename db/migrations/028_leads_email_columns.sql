-- Add email intelligence columns to leads table
-- SQLite doesn't support IF NOT EXISTS on ALTER TABLE so we use a safe approach

ALTER TABLE leads ADD COLUMN unsubscribe_token TEXT;
ALTER TABLE leads ADD COLUMN email_open_count INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN last_opened_at TEXT;
ALTER TABLE leads ADD COLUMN bounced_at TEXT;
ALTER TABLE leads ADD COLUMN unsubscribed_at TEXT;
