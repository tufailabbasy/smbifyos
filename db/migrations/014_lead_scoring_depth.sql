ALTER TABLE lead_scoring_settings ADD COLUMN unclaimed_profile_points INTEGER NOT NULL DEFAULT 10;
ALTER TABLE lead_scoring_settings ADD COLUMN very_low_rating_points INTEGER NOT NULL DEFAULT 6;
ALTER TABLE lead_scoring_settings ADD COLUMN very_low_rating_threshold REAL NOT NULL DEFAULT 2.8;
ALTER TABLE lead_scoring_settings ADD COLUMN very_low_reviews_points INTEGER NOT NULL DEFAULT 5;
ALTER TABLE lead_scoring_settings ADD COLUMN very_low_reviews_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE lead_scoring_settings ADD COLUMN email_available_bonus INTEGER NOT NULL DEFAULT 6;
ALTER TABLE lead_scoring_settings ADD COLUMN multi_signal_bonus INTEGER NOT NULL DEFAULT 8;
ALTER TABLE lead_scoring_settings ADD COLUMN multi_signal_threshold INTEGER NOT NULL DEFAULT 3;
ALTER TABLE lead_scoring_settings ADD COLUMN paid_ads_source_points INTEGER NOT NULL DEFAULT 18;

UPDATE lead_scoring_settings
SET unclaimed_profile_points = COALESCE(unclaimed_profile_points, 10),
    very_low_rating_points = COALESCE(very_low_rating_points, 6),
    very_low_rating_threshold = COALESCE(very_low_rating_threshold, 2.8),
    very_low_reviews_points = COALESCE(very_low_reviews_points, 5),
    very_low_reviews_threshold = COALESCE(very_low_reviews_threshold, 5),
    email_available_bonus = COALESCE(email_available_bonus, 6),
    multi_signal_bonus = COALESCE(multi_signal_bonus, 8),
    multi_signal_threshold = COALESCE(multi_signal_threshold, 3),
    paid_ads_source_points = COALESCE(paid_ads_source_points, 18),
    updated_at = datetime('now')
WHERE id = 1;