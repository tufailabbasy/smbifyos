ALTER TABLE app_settings ADD COLUMN dataforseo_login TEXT;
ALTER TABLE app_settings ADD COLUMN dataforseo_password TEXT;

UPDATE ai_provider_configs
SET is_enabled = 0, use_for_email = 0, use_for_audit = 0, use_for_general = 0
WHERE provider_key <> 'openrouter';

INSERT INTO ai_provider_configs (
  provider_key, label, protocol, base_url, api_key, model, is_enabled,
  use_for_email, use_for_audit, use_for_general, created_at, updated_at
)
VALUES (
  'openrouter', 'OpenRouter', 'openai', 'https://openrouter.ai/api/v1', '', 'openrouter/auto', 0,
  0, 0, 0, datetime('now'), datetime('now')
)
ON CONFLICT(provider_key) DO UPDATE SET
  label = 'OpenRouter',
  protocol = 'openai',
  base_url = 'https://openrouter.ai/api/v1',
  model = 'openrouter/auto',
  updated_at = datetime('now');
