ALTER TABLE scraper_staged_leads ADD COLUMN eeat_audit_id TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN eeat_audit_score INTEGER;
ALTER TABLE scraper_staged_leads ADD COLUMN eeat_audit_verdict TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN eeat_audit_status TEXT NOT NULL DEFAULT 'not_run';
ALTER TABLE scraper_staged_leads ADD COLUMN eeat_audit_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_scraper_staged_leads_eeat_status
  ON scraper_staged_leads(job_id, eeat_audit_status);

ALTER TABLE emails_sent ADD COLUMN report_context_json TEXT;

UPDATE scraper_staged_leads
SET eeat_audit_status = COALESCE(eeat_audit_status, 'not_run')
WHERE 1 = 1;
