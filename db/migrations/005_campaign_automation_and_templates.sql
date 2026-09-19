CREATE TABLE IF NOT EXISTS campaign_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_key TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  send_interval_ms INTEGER NOT NULL DEFAULT 250,
  follow_up_enabled INTEGER NOT NULL DEFAULT 0,
  follow_up_delay_hours INTEGER NOT NULL DEFAULT 72,
  follow_up_subject TEXT,
  follow_up_body TEXT,
  max_retries INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_source_key
  ON campaign_templates(source_key, is_default);

ALTER TABLE campaigns ADD COLUMN template_id TEXT;
ALTER TABLE campaigns ADD COLUMN scheduled_at TEXT;
ALTER TABLE campaigns ADD COLUMN last_run_at TEXT;

ALTER TABLE emails_sent ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails_sent ADD COLUMN last_attempt_at TEXT;
ALTER TABLE emails_sent ADD COLUMN next_attempt_at TEXT;
ALTER TABLE emails_sent ADD COLUMN error_message TEXT;

INSERT INTO campaign_templates (
  id,
  name,
  source_key,
  subject,
  body,
  send_interval_ms,
  follow_up_enabled,
  follow_up_delay_hours,
  follow_up_subject,
  follow_up_body,
  max_retries,
  is_default,
  created_at,
  updated_at
) VALUES
(
  'tpl-general-default',
  'General Prospecting',
  NULL,
  'Quick idea for {{business_name}}',
  'Hi {{business_name}},\n\nI found a few local visibility gaps around {{city}} that may be costing qualified leads.\n\nIf you want, I can send a short 3-point plan tailored to your business and website.\n\nBest regards,\nSMBify Lead OS Team',
  250,
  1,
  72,
  'Following up on {{business_name}}',
  'Hi {{business_name}},\n\nFollowing up in case my last note got buried. I can send a concise local SEO plan with the highest-impact fixes for {{city}}.\n\nReply with yes and I will send it over.\n\nBest regards,\nSMBify Lead OS Team',
  1,
  1,
  datetime('now'),
  datetime('now')
),
(
  'tpl-gmb-default',
  'Google Maps Recovery',
  'gmb_scraper',
  'A few Google Maps fixes for {{business_name}}',
  'Hi {{business_name}},\n\nI reviewed your Google Maps presence and noticed a few ranking and conversion gaps in {{city}}.\n\nIf helpful, I can send a short action list focused on profile trust, reviews, and local landing-page alignment.\n\nBest regards,\nSMBify Lead OS Team',
  350,
  1,
  48,
  'Still open to the Google Maps audit?',
  'Hi {{business_name}},\n\nJust checking back. I can still send the Google Maps action list for {{city}} if that would help your team.\n\nBest regards,\nSMBify Lead OS Team',
  1,
  1,
  datetime('now'),
  datetime('now')
),
(
  'tpl-yelp-default',
  'Yelp Lead Recovery',
  'yelp_scraper',
  'Quick Yelp visibility idea for {{business_name}}',
  'Hi {{business_name}},\n\nYour Yelp listing already has demand signals, but there may be missed opportunities to convert more searches into booked calls in {{city}}.\n\nI can send a brief breakdown if useful.\n\nBest regards,\nSMBify Lead OS Team',
  300,
  1,
  72,
  'Should I send the Yelp breakdown?',
  'Hi {{business_name}},\n\nFollowing up here. If you want, I can send the short Yelp visibility breakdown I mentioned for {{city}}.\n\nBest regards,\nSMBify Lead OS Team',
  1,
  1,
  datetime('now'),
  datetime('now')
),
(
  'tpl-bbb-default',
  'Trust Signal Outreach',
  'bbb_scraper',
  'Trust and lead quality ideas for {{business_name}}',
  'Hi {{business_name}},\n\nI came across your business while reviewing local trust signals in {{city}}. There are a few straightforward improvements that can strengthen conversion quality and search visibility.\n\nI can send the short version if useful.\n\nBest regards,\nSMBify Lead OS Team',
  300,
  1,
  72,
  'Following up with the trust-signal notes',
  'Hi {{business_name}},\n\nWanted to follow up in case the previous note was missed. I can still send the trust-signal notes for {{city}} if you want them.\n\nBest regards,\nSMBify Lead OS Team',
  1,
  1,
  datetime('now'),
  datetime('now')
),
(
  'tpl-yellowpages-default',
  'Directory Conversion Outreach',
  'yellowpages',
  'A quick lead-flow idea for {{business_name}}',
  'Hi {{business_name}},\n\nI found your business while reviewing directory visibility in {{city}}. There are a few easy wins that could improve response quality from search and directory traffic.\n\nIf you want, I can send a concise outline.\n\nBest regards,\nSMBify Lead OS Team',
  250,
  1,
  72,
  'Want the short directory-growth outline?',
  'Hi {{business_name}},\n\nFollowing up on the note about your directory and search visibility in {{city}}. Happy to send the short outline if helpful.\n\nBest regards,\nSMBify Lead OS Team',
  1,
  1,
  datetime('now'),
  datetime('now')
),
(
  'tpl-state-default',
  'Local Presence Outreach',
  'state_directory',
  'A local growth idea for {{business_name}}',
  'Hi {{business_name}},\n\nI found a few local presence opportunities that may help your business capture more qualified demand in {{city}}.\n\nIf useful, I can send over the short action list.\n\nBest regards,\nSMBify Lead OS Team',
  250,
  1,
  72,
  'Should I send the local action list?',
  'Hi {{business_name}},\n\nChecking back on the local growth note for {{city}}. I can still send the short action list if you want it.\n\nBest regards,\nSMBify Lead OS Team',
  1,
  1,
  datetime('now'),
  datetime('now')
);
