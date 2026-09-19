CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  agency_name TEXT NOT NULL DEFAULT '',
  agency_email TEXT NOT NULL DEFAULT '',
  agency_phone TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',
  default_city TEXT NOT NULL DEFAULT '',
  default_state TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  brand_notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO app_settings (
  id,
  agency_name,
  agency_email,
  agency_phone,
  business_address,
  default_city,
  default_state,
  timezone,
  brand_notes
) VALUES (1, '', '', '', '', '', '', 'America/New_York', '');