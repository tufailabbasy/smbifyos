CREATE TABLE IF NOT EXISTS ai_provider_configs (
  provider_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  use_for_email INTEGER NOT NULL DEFAULT 0,
  use_for_audit INTEGER NOT NULL DEFAULT 0,
  use_for_general INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO ai_provider_configs (
  provider_key,
  label,
  protocol,
  base_url,
  model,
  is_enabled,
  use_for_email,
  use_for_audit,
  use_for_general
) VALUES
  ('openai', 'OpenAI', 'openai', 'https://api.openai.com/v1', 'gpt-5-mini', 0, 1, 1, 1),
  ('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com/v1', 'claude-sonnet-4-5', 0, 0, 0, 0),
  ('gemini', 'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-pro', 0, 0, 0, 0),
  ('openrouter', 'OpenRouter', 'openai', 'https://openrouter.ai/api/v1', 'openai/gpt-5-mini', 0, 0, 0, 0),
  ('groq', 'Groq', 'openai', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile', 0, 0, 0, 0),
  ('deepseek', 'DeepSeek', 'openai', 'https://api.deepseek.com/v1', 'deepseek-chat', 0, 0, 0, 0),
  ('together', 'Together AI', 'openai', 'https://api.together.xyz/v1', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 0, 0, 0, 0),
  ('mistral', 'Mistral', 'openai', 'https://api.mistral.ai/v1', 'mistral-large-latest', 0, 0, 0, 0),
  ('xai', 'xAI', 'openai', 'https://api.x.ai/v1', 'grok-4', 0, 0, 0, 0),
  ('custom_openai', 'Custom OpenAI-Compatible', 'openai', 'https://api.example.com/v1', 'custom-model', 0, 0, 0, 0);