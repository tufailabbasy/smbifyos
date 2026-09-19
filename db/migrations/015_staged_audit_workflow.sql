ALTER TABLE audits ADD COLUMN scraper_job_id TEXT;
ALTER TABLE audits ADD COLUMN staged_lead_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audits_scraper_job_id
  ON audits(scraper_job_id);

CREATE INDEX IF NOT EXISTS idx_audits_staged_lead
  ON audits(staged_lead_id, audit_type, created_at);

ALTER TABLE scraper_staged_leads ADD COLUMN website_audit_id TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN website_audit_score INTEGER;
ALTER TABLE scraper_staged_leads ADD COLUMN website_audit_verdict TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN website_audit_status TEXT NOT NULL DEFAULT 'not_run';
ALTER TABLE scraper_staged_leads ADD COLUMN website_audit_summary TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN gmb_audit_id TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN gmb_audit_score INTEGER;
ALTER TABLE scraper_staged_leads ADD COLUMN gmb_audit_verdict TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN gmb_audit_status TEXT NOT NULL DEFAULT 'not_run';
ALTER TABLE scraper_staged_leads ADD COLUMN gmb_audit_summary TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN audit_readiness TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE scraper_staged_leads ADD COLUMN audit_readiness_reason TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN last_audited_at TEXT;

CREATE INDEX IF NOT EXISTS idx_scraper_staged_leads_audit_readiness
  ON scraper_staged_leads(job_id, audit_readiness);

UPDATE scraper_staged_leads
SET website_audit_status = COALESCE(website_audit_status, 'not_run'),
    gmb_audit_status = COALESCE(gmb_audit_status, 'not_run'),
    audit_readiness = COALESCE(audit_readiness, 'pending')
WHERE 1 = 1;