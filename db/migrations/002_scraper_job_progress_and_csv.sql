ALTER TABLE scraper_jobs ADD COLUMN csv_file TEXT;
ALTER TABLE scraper_jobs ADD COLUMN total_found INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scraper_jobs ADD COLUMN progress_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE scraper_jobs ADD COLUMN progress_message TEXT;
