ALTER TABLE smtp_accounts ADD COLUMN daily_limit INTEGER NOT NULL DEFAULT 100;
ALTER TABLE email_tracking ADD COLUMN status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE email_tracking ADD COLUMN updated_at TEXT;
ALTER TABLE client_businesses ADD COLUMN last_website_audit_score REAL;
ALTER TABLE client_businesses ADD COLUMN last_gmb_audit_score REAL;
ALTER TABLE client_businesses ADD COLUMN next_audit_at TEXT;
ALTER TABLE email_campaigns ADD COLUMN legacy_campaign_id TEXT;
ALTER TABLE email_campaigns ADD COLUMN subject TEXT;
ALTER TABLE email_campaigns ADD COLUMN body TEXT;
ALTER TABLE email_campaigns ADD COLUMN body_html TEXT;
ALTER TABLE email_campaigns ADD COLUMN scheduled_at TEXT;
CREATE UNIQUE INDEX idx_email_campaign_legacy ON email_campaigns(legacy_campaign_id) WHERE legacy_campaign_id IS NOT NULL;
CREATE TABLE email_dispatch_jobs (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, lead_id TEXT NOT NULL,
 recipient_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, body_html TEXT,
 smtp_account_id TEXT, sequence_id TEXT, sequence_number INTEGER NOT NULL DEFAULT 1,
 scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempt_count INTEGER NOT NULL DEFAULT 0,
 claimed_at TEXT, sent_at TEXT, error_message TEXT, tracking_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(campaign_id,lead_id,sequence_number)
);
CREATE INDEX idx_dispatch_due ON email_dispatch_jobs(status,scheduled_at);
CREATE TABLE recurring_audit_runs (
 id TEXT PRIMARY KEY, business_id TEXT NOT NULL, status TEXT NOT NULL, previous_score REAL,
 new_score REAL, audit_id TEXT, error_message TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Old generated recurring scores were not measurements. Preserve them but exclude from completed audit views.
UPDATE audits SET status='unverified', score=NULL, verdict='Historical simulation — not a measured audit'
 WHERE data_json LIKE '%"recurringCycle":"monthly"%';
UPDATE automation_workflows SET is_active=0
 WHERE name='Daily Google Maps → Website Audit → Campaign';
