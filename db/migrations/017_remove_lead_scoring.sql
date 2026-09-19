UPDATE leads
SET lead_score = 0
WHERE lead_score <> 0;

DROP INDEX IF EXISTS idx_leads_score;
DROP TABLE IF EXISTS lead_scoring_settings;
