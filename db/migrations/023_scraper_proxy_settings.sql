ALTER TABLE app_settings ADD COLUMN scraper_proxy_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN scraper_proxy_urls TEXT NOT NULL DEFAULT '';
ALTER TABLE app_settings ADD COLUMN scraper_proxy_cursor INTEGER NOT NULL DEFAULT 0;
