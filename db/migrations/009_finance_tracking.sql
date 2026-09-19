ALTER TABLE seo_clients ADD COLUMN default_currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE client_businesses ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE client_businesses ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';

CREATE TABLE IF NOT EXISTS finance_entries (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  business_id TEXT,
  label TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  entry_type TEXT NOT NULL DEFAULT 'income',
  entry_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES seo_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES client_businesses(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_client_id ON finance_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_business_id ON finance_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_finance_entries_currency_date ON finance_entries(currency, entry_date);

UPDATE seo_clients
SET default_currency = COALESCE(NULLIF(default_currency, ''), 'USD');

UPDATE client_businesses
SET
  currency = COALESCE(NULLIF(currency, ''), 'USD'),
  billing_cycle = COALESCE(NULLIF(billing_cycle, ''), 'monthly');