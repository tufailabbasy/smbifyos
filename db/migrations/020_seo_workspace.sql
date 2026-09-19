-- ============================================================
-- 020_seo_workspace.sql  --  SEO Workspace: team, checklists, activity
-- ============================================================

-- ── Team Members ──
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'specialist',
  avatar_color TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role);
CREATE INDEX IF NOT EXISTS idx_team_members_active ON team_members(is_active);

-- ── SEO Checklist Templates (master playbook) ──
CREATE TABLE IF NOT EXISTS seo_checklist_templates (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_interval TEXT,
  default_priority TEXT NOT NULL DEFAULT 'medium',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_category ON seo_checklist_templates(category);

-- ── Business Checklist Items (per-business instances) ──
CREATE TABLE IF NOT EXISTS business_checklist_items (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  template_id TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_to TEXT,
  due_date TEXT,
  completed_at TEXT,
  completed_by TEXT,
  period_month TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES client_businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES seo_checklist_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES team_members(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_by) REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bci_business_id ON business_checklist_items(business_id);
CREATE INDEX IF NOT EXISTS idx_bci_status ON business_checklist_items(status);
CREATE INDEX IF NOT EXISTS idx_bci_assigned_to ON business_checklist_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_bci_period_month ON business_checklist_items(period_month);
CREATE INDEX IF NOT EXISTS idx_bci_template_id ON business_checklist_items(template_id);

-- ── Activity Log ──
CREATE TABLE IF NOT EXISTS seo_activity_log (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  business_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES seo_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES client_businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES team_members(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_seo_activity_client ON seo_activity_log(client_id);
CREATE INDEX IF NOT EXISTS idx_seo_activity_business ON seo_activity_log(business_id);
CREATE INDEX IF NOT EXISTS idx_seo_activity_created ON seo_activity_log(created_at);

-- ── Seed: Checklist Templates ──

-- SETUP (one-time)
INSERT OR IGNORE INTO seo_checklist_templates (id, category, title, description, is_recurring, default_priority, sort_order) VALUES
  ('tpl-setup-01', 'setup', 'Verify Google Search Console ownership', 'Add and verify the website in Google Search Console.', 0, 'critical', 1),
  ('tpl-setup-02', 'setup', 'Claim/verify Google Business Profile', 'Ensure the GMB listing is claimed and verified.', 0, 'critical', 2),
  ('tpl-setup-03', 'setup', 'Install analytics tracking', 'Set up Google Analytics 4 or equivalent.', 0, 'high', 3),
  ('tpl-setup-04', 'setup', 'Submit XML sitemap', 'Generate and submit sitemap.xml to GSC.', 0, 'high', 4),
  ('tpl-setup-05', 'setup', 'Configure robots.txt', 'Review and configure robots.txt for proper crawling.', 0, 'medium', 5),
  ('tpl-setup-06', 'setup', 'Set up rank tracking', 'Configure target keywords and cities in the rank tracker.', 0, 'high', 6),
  ('tpl-setup-07', 'setup', 'Run initial website audit', 'Perform a comprehensive baseline audit.', 0, 'high', 7),
  ('tpl-setup-08', 'setup', 'Run initial GMB audit', 'Perform a baseline GMB profile audit.', 0, 'high', 8);

-- ON-PAGE (one-time)
INSERT OR IGNORE INTO seo_checklist_templates (id, category, title, description, is_recurring, default_priority, sort_order) VALUES
  ('tpl-onpage-01', 'on-page', 'Optimize title tags for target keywords', 'Ensure each page has a unique, keyword-rich title tag.', 0, 'high', 1),
  ('tpl-onpage-02', 'on-page', 'Write meta descriptions for all pages', 'Compelling meta descriptions with local keywords.', 0, 'medium', 2),
  ('tpl-onpage-03', 'on-page', 'Fix H1 tag structure', 'Ensure each page has exactly one H1 with target keyword.', 0, 'medium', 3),
  ('tpl-onpage-04', 'on-page', 'Add schema markup (LocalBusiness)', 'Implement structured data for local business.', 0, 'high', 4),
  ('tpl-onpage-05', 'on-page', 'Optimize image alt tags', 'Add descriptive alt text to all images.', 0, 'low', 5),
  ('tpl-onpage-06', 'on-page', 'Internal linking audit and optimization', 'Ensure logical internal link structure.', 0, 'medium', 6);

-- TECHNICAL (one-time)
INSERT OR IGNORE INTO seo_checklist_templates (id, category, title, description, is_recurring, default_priority, sort_order) VALUES
  ('tpl-tech-01', 'technical', 'Fix broken links (404s)', 'Identify and fix all broken internal/external links.', 0, 'high', 1),
  ('tpl-tech-02', 'technical', 'Ensure HTTPS across entire site', 'All pages must load over HTTPS with no mixed content.', 0, 'critical', 2),
  ('tpl-tech-03', 'technical', 'Improve page speed (Core Web Vitals)', 'Optimize LCP, FID, CLS metrics.', 0, 'high', 3),
  ('tpl-tech-04', 'technical', 'Mobile responsiveness check', 'Verify site works on all screen sizes.', 0, 'medium', 4),
  ('tpl-tech-05', 'technical', 'Fix canonical tag issues', 'Ensure proper canonical tags on all pages.', 0, 'medium', 5);

-- LOCAL (one-time)
INSERT OR IGNORE INTO seo_checklist_templates (id, category, title, description, is_recurring, default_priority, sort_order) VALUES
  ('tpl-local-01', 'local', 'NAP consistency audit', 'Verify Name, Address, Phone is consistent across all listings.', 0, 'high', 1),
  ('tpl-local-02', 'local', 'Submit to top citation directories', 'List business on Yelp, YP, BBB, industry-specific dirs.', 0, 'medium', 2),
  ('tpl-local-03', 'local', 'Create location-specific service pages', 'Build city+service landing pages.', 0, 'medium', 3),
  ('tpl-local-04', 'local', 'Optimize GMB categories and attributes', 'Select best primary/secondary categories.', 0, 'high', 4);

-- CONTENT (one-time)
INSERT OR IGNORE INTO seo_checklist_templates (id, category, title, description, is_recurring, default_priority, sort_order) VALUES
  ('tpl-content-01', 'content', 'Create About page with E-E-A-T signals', 'Build a strong About page with credentials, experience, and trust signals.', 0, 'high', 1),
  ('tpl-content-02', 'content', 'Add testimonials/reviews to website', 'Display social proof from satisfied clients.', 0, 'medium', 2),
  ('tpl-content-03', 'content', 'Create FAQ page for target keywords', 'Build a keyword-optimized FAQ section.', 0, 'medium', 3),
  ('tpl-content-04', 'content', 'Set up blog with content calendar', 'Plan and schedule SEO-optimized blog posts.', 0, 'medium', 4);

-- OFF-PAGE (one-time)
INSERT OR IGNORE INTO seo_checklist_templates (id, category, title, description, is_recurring, default_priority, sort_order) VALUES
  ('tpl-offpage-01', 'off-page', 'Backlink profile audit', 'Analyze current backlinks for quality and toxic links.', 0, 'high', 1),
  ('tpl-offpage-02', 'off-page', 'Disavow toxic backlinks', 'Submit disavow file for harmful backlinks.', 0, 'medium', 2),
  ('tpl-offpage-03', 'off-page', 'Set up local link building outreach', 'Identify and outreach to local partners, sponsors, and directories.', 0, 'medium', 3);

-- MONTHLY RECURRING
INSERT OR IGNORE INTO seo_checklist_templates (id, category, title, description, is_recurring, recurrence_interval, default_priority, sort_order) VALUES
  ('tpl-monthly-01', 'monthly', 'Check keyword rankings', 'Review ranking changes and update tracking.', 1, 'monthly', 'high', 1),
  ('tpl-monthly-02', 'monthly', 'Submit GMB post', 'Publish a Google Business Profile post.', 1, 'monthly', 'medium', 2),
  ('tpl-monthly-03', 'monthly', 'Review and respond to GMB reviews', 'Reply to all new reviews.', 1, 'monthly', 'high', 3),
  ('tpl-monthly-04', 'monthly', 'Review GSC performance data', 'Analyze clicks, impressions, and position changes.', 1, 'monthly', 'medium', 4),
  ('tpl-monthly-05', 'monthly', 'Check for new technical issues', 'Run a quick audit to catch regressions.', 1, 'monthly', 'medium', 5),
  ('tpl-monthly-06', 'monthly', 'Update/publish blog content', 'Publish at least one SEO-optimized blog post.', 1, 'monthly', 'low', 6),
  ('tpl-monthly-07', 'monthly', 'Build/earn backlinks', 'Execute link building outreach for the month.', 1, 'monthly', 'medium', 7),
  ('tpl-monthly-08', 'monthly', 'Client progress report', 'Compile and send monthly SEO report to client.', 1, 'monthly', 'high', 8);
