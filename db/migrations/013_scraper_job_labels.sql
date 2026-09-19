ALTER TABLE scraper_jobs ADD COLUMN job_label TEXT;

UPDATE scraper_jobs
SET job_label = 'localos' || (
  SELECT COUNT(*)
  FROM scraper_jobs older
  WHERE datetime(older.created_at) < datetime(scraper_jobs.created_at)
     OR (
       datetime(older.created_at) = datetime(scraper_jobs.created_at)
       AND older.id <= scraper_jobs.id
     )
)
WHERE COALESCE(TRIM(job_label), '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_jobs_job_label
  ON scraper_jobs(job_label);