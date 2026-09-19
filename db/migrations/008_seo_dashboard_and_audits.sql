CREATE TABLE IF NOT EXISTS seo_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  primary_contact TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  lifecycle_stage TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_seo_clients_name ON seo_clients(name);
CREATE INDEX IF NOT EXISTS idx_seo_clients_stage ON seo_clients(lifecycle_stage);

CREATE TABLE IF NOT EXISTS client_businesses (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  lead_id TEXT,
  name TEXT NOT NULL,
  website TEXT,
  gmb_url TEXT,
  city TEXT,
  state TEXT,
  service_type TEXT,
  package_type TEXT,
  monthly_budget REAL,
  order_status TEXT NOT NULL DEFAULT 'active',
  assigned_team_member TEXT,
  start_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES seo_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_businesses_client_id ON client_businesses(client_id);
CREATE INDEX IF NOT EXISTS idx_client_businesses_lead_id ON client_businesses(lead_id);
CREATE INDEX IF NOT EXISTS idx_client_businesses_status ON client_businesses(order_status);

ALTER TABLE audits ADD COLUMN client_id TEXT;
ALTER TABLE audits ADD COLUMN business_id TEXT;
ALTER TABLE audits ADD COLUMN target_name TEXT;
ALTER TABLE audits ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE audits ADD COLUMN updated_at TEXT;

INSERT INTO seo_clients (
  id,
  name,
  lifecycle_stage,
  notes,
  created_at,
  updated_at
)
SELECT
  'seo-' || c.id,
  c.business_name,
  'active',
  'Imported from client projects',
  c.created_at,
  c.updated_at
FROM clients c
WHERE NOT EXISTS (
  SELECT 1
  FROM seo_clients sc
  WHERE sc.id = 'seo-' || c.id
);

INSERT INTO client_businesses (
  id,
  client_id,
  lead_id,
  name,
  website,
  gmb_url,
  city,
  state,
  service_type,
  package_type,
  monthly_budget,
  order_status,
  assigned_team_member,
  start_date,
  notes,
  created_at,
  updated_at
)
SELECT
  'biz-' || c.id,
  'seo-' || c.id,
  c.lead_id,
  c.business_name,
  c.website,
  l.gmb_url,
  c.city,
  c.state,
  NULL,
  c.package_type,
  c.monthly_budget,
  'active',
  c.assigned_team_member,
  c.start_date,
  'Imported from client projects',
  c.created_at,
  c.updated_at
FROM clients c
LEFT JOIN leads l ON l.id = c.lead_id
WHERE NOT EXISTS (
  SELECT 1
  FROM client_businesses cb
  WHERE cb.id = 'biz-' || c.id
);

UPDATE audits
SET
  client_id = COALESCE(
    client_id,
    (
      SELECT cb.client_id
      FROM client_businesses cb
      WHERE cb.lead_id = audits.lead_id
      ORDER BY datetime(cb.created_at) ASC
      LIMIT 1
    )
  ),
  business_id = COALESCE(
    business_id,
    (
      SELECT cb.id
      FROM client_businesses cb
      WHERE cb.lead_id = audits.lead_id
      ORDER BY datetime(cb.created_at) ASC
      LIMIT 1
    )
  ),
  target_name = COALESCE(
    target_name,
    (
      SELECT cb.name
      FROM client_businesses cb
      WHERE cb.id = business_id
      LIMIT 1
    ),
    (
      SELECT l.business_name
      FROM leads l
      WHERE l.id = audits.lead_id
      LIMIT 1
    ),
    audit_type || ' audit'
  ),
  status = COALESCE(NULLIF(status, ''), 'completed'),
  updated_at = COALESCE(updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_audits_client_id ON audits(client_id);
CREATE INDEX IF NOT EXISTS idx_audits_business_id ON audits(business_id);
CREATE INDEX IF NOT EXISTS idx_audits_type_created_at ON audits(audit_type, created_at);