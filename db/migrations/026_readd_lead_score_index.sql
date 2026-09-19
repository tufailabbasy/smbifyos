-- Recreate index on lead_score to optimize sorting/filtering on the Leads Directory page
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score);
