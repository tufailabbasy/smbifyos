-- ============================================================
-- 022_google_integration.sql  --  Google OAuth + GSC/GMB tokens per business
-- ============================================================

-- Store Google OAuth credentials at the app level (settings)
ALTER TABLE app_settings ADD COLUMN google_client_id TEXT NOT NULL DEFAULT '';
ALTER TABLE app_settings ADD COLUMN google_client_secret TEXT NOT NULL DEFAULT '';

-- Business-level Google connection tokens
CREATE TABLE IF NOT EXISTS business_google_tokens (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  google_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TEXT,
  scopes TEXT,
  gsc_site_url TEXT,
  gsc_connected INTEGER NOT NULL DEFAULT 0,
  gmb_account_id TEXT,
  gmb_location_id TEXT,
  gmb_connected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES client_businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bgt_business ON business_google_tokens(business_id);

-- Add business_id to gsc tables for business-level tracking
ALTER TABLE gsc_performance ADD COLUMN business_id TEXT;
ALTER TABLE gsc_keywords ADD COLUMN business_id TEXT;
