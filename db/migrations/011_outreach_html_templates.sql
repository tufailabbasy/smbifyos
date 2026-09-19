ALTER TABLE campaign_templates ADD COLUMN body_html TEXT;
ALTER TABLE campaign_templates ADD COLUMN follow_up_body_html TEXT;
ALTER TABLE emails_sent ADD COLUMN body_html TEXT;