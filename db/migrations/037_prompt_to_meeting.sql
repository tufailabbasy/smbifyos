ALTER TABLE app_settings ADD COLUMN booking_url TEXT NOT NULL DEFAULT '';

ALTER TABLE scraper_staged_leads ADD COLUMN facebook_url TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN instagram_url TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN linkedin_url TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN twitter_url TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN business_dna_json TEXT;
ALTER TABLE scraper_staged_leads ADD COLUMN opportunity_score INTEGER NOT NULL DEFAULT 0;

ALTER TABLE leads ADD COLUMN facebook_url TEXT;
ALTER TABLE leads ADD COLUMN instagram_url TEXT;
ALTER TABLE leads ADD COLUMN linkedin_url TEXT;
ALTER TABLE leads ADD COLUMN twitter_url TEXT;
ALTER TABLE leads ADD COLUMN business_dna_json TEXT;
ALTER TABLE leads ADD COLUMN opportunity_score INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS lead_meetings (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled','no_show')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_meetings_starts_at ON lead_meetings(starts_at);
CREATE INDEX IF NOT EXISTS idx_lead_meetings_lead_id ON lead_meetings(lead_id);
