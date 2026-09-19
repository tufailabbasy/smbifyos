-- Dispatch reliability and case-insensitive suppression integrity.
UPDATE email_dispatch_jobs SET status='pending',claimed_at=NULL,error_message='Recovered during migration' WHERE status='processing';
CREATE INDEX IF NOT EXISTS idx_dispatch_campaign_status ON email_dispatch_jobs(campaign_id,status);
CREATE INDEX IF NOT EXISTS idx_dispatch_claimed ON email_dispatch_jobs(status,claimed_at);
DELETE FROM email_suppression WHERE rowid NOT IN (SELECT MIN(rowid) FROM email_suppression GROUP BY LOWER(TRIM(email)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_nocase ON email_suppression(email COLLATE NOCASE);