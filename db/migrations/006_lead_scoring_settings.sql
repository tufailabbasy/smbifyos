CREATE TABLE IF NOT EXISTS lead_scoring_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_score INTEGER NOT NULL DEFAULT 80,
  hot_threshold INTEGER NOT NULL DEFAULT 60,
  warm_threshold INTEGER NOT NULL DEFAULT 35,
  no_website_points INTEGER NOT NULL DEFAULT 20,
  low_rating_points INTEGER NOT NULL DEFAULT 15,
  low_rating_threshold REAL NOT NULL DEFAULT 3.5,
  low_reviews_points INTEGER NOT NULL DEFAULT 10,
  low_reviews_threshold INTEGER NOT NULL DEFAULT 10,
  incomplete_profile_points INTEGER NOT NULL DEFAULT 15,
  no_citations_points INTEGER NOT NULL DEFAULT 10,
  phone_without_email_points INTEGER NOT NULL DEFAULT 10,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO lead_scoring_settings (
  id,
  max_score,
  hot_threshold,
  warm_threshold,
  no_website_points,
  low_rating_points,
  low_rating_threshold,
  low_reviews_points,
  low_reviews_threshold,
  incomplete_profile_points,
  no_citations_points,
  phone_without_email_points
) VALUES (1, 80, 60, 35, 20, 15, 3.5, 10, 10, 15, 10, 10);