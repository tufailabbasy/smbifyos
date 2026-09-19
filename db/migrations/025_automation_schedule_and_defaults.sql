-- Add scheduling and default input support to automation_workflows

ALTER TABLE automation_workflows ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE automation_workflows ADD COLUMN schedule_spec TEXT;
ALTER TABLE automation_workflows ADD COLUMN default_input_json TEXT DEFAULT '{}';
