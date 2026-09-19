-- 029_campaign_sender_override.sql
-- Add sender_id column to email_campaigns for explicit sender override
ALTER TABLE email_campaigns ADD COLUMN sender_id TEXT;
