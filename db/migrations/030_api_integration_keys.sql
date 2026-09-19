-- 030_api_integration_keys.sql
-- Add Google Places API, SERP API, and Apify API keys to app_settings
ALTER TABLE app_settings ADD COLUMN google_places_api_key TEXT;
ALTER TABLE app_settings ADD COLUMN serp_api_key TEXT;
ALTER TABLE app_settings ADD COLUMN apify_api_token TEXT;
