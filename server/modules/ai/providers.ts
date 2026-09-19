import { getDb } from "../../db/database.js";
import { encryptCredential, decryptCredential } from "../../utils/encryption.js";

export type AiProviderProtocol = "openai" | "anthropic" | "gemini";
export type AiTask = "email" | "audit" | "general";

type ProviderCatalogEntry = {
  providerKey: string;
  label: string;
  protocol: AiProviderProtocol;
  baseUrl: string;
  defaultModel: string;
  description: string;
};

type AiProviderConfigRow = {
  provider_key: string;
  label: string;
  protocol: string;
  base_url: string;
  api_key: string;
  model: string;
  is_enabled: number;
  use_for_email: number;
  use_for_audit: number;
  use_for_general: number;
  created_at: string;
  updated_at: string;
};

type RuntimeProvider = AiProviderConfigRow & {
  description: string;
  protocol: AiProviderProtocol;
};

export type AiProviderConfig = {
  providerKey: string;
  label: string;
  protocol: AiProviderProtocol;
  description: string;
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  useForEmail: boolean;
  useForAudit: boolean;
  useForGeneral: boolean;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
};

const providerCatalog: ProviderCatalogEntry[] = [
  {
    providerKey: "openrouter",
    label: "OpenRouter",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    description: "One managed gateway with automatic model routing for email writing, audits, and general AI tasks.",
  },
]

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function hasOwnValue(record: unknown, key: string): boolean {
  return Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key));
}

function getCatalogEntry(providerKey: string): ProviderCatalogEntry {
  const entry = providerCatalog.find((item) => item.providerKey === providerKey);
  if (!entry) {
    throw new Error(`Unsupported AI provider: ${providerKey}`);
  }

  return entry;
}

function buildDefaultRow(entry: ProviderCatalogEntry): AiProviderConfigRow {
  const now = new Date(0).toISOString();
  return {
    provider_key: entry.providerKey,
    label: entry.label,
    protocol: entry.protocol,
    base_url: entry.baseUrl,
    api_key: "",
    model: entry.defaultModel,
    is_enabled: 0,
    use_for_email: 0,
    use_for_audit: 0,
    use_for_general: 0,
    created_at: now,
    updated_at: now,
  };
}

function usesManagedDefaults(entry: ProviderCatalogEntry): boolean {
  return true;
}

function listRows(): AiProviderConfigRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT provider_key, label, protocol, base_url, api_key, model, is_enabled,
              use_for_email, use_for_audit, use_for_general, created_at, updated_at
       FROM ai_provider_configs`
    )
    .all() as AiProviderConfigRow[];
}

function getRow(providerKey: string): AiProviderConfigRow {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT provider_key, label, protocol, base_url, api_key, model, is_enabled,
              use_for_email, use_for_audit, use_for_general, created_at, updated_at
       FROM ai_provider_configs
       WHERE provider_key = ?`
    )
    .get(providerKey) as AiProviderConfigRow | undefined;

  return row || buildDefaultRow(getCatalogEntry(providerKey));
}

function maskApiKey(apiKey: string): string {
  const trimmed = cleanText(apiKey);
  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }

  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

function normalizeRuntimeProvider(row: AiProviderConfigRow): RuntimeProvider {
  const entry = getCatalogEntry(row.provider_key);
  const managedDefaults = usesManagedDefaults(entry);
  const decryptedApiKey = decryptCredential(row.api_key);

  return {
    ...row,
    api_key: decryptedApiKey,
    label: cleanText(row.label) || entry.label,
    protocol: (cleanText(row.protocol) || entry.protocol) as AiProviderProtocol,
    base_url: managedDefaults ? entry.baseUrl : cleanText(row.base_url) || entry.baseUrl,
    model: managedDefaults ? entry.defaultModel : cleanText(row.model) || entry.defaultModel,
    description: entry.description,
  };
}

function listRuntimeProviders(): RuntimeProvider[] {
  const rows = new Map(listRows().map((row) => [row.provider_key, row]));
  return providerCatalog.map((entry) => normalizeRuntimeProvider(rows.get(entry.providerKey) || buildDefaultRow(entry)));
}

function rowToConfig(row: AiProviderConfigRow): AiProviderConfig {
  const runtime = normalizeRuntimeProvider(row);
  const apiKeyConfigured = Boolean(cleanText(runtime.api_key));

  return {
    providerKey: runtime.provider_key,
    label: runtime.label,
    protocol: runtime.protocol,
    description: runtime.description,
    baseUrl: runtime.base_url,
    model: runtime.model,
    isEnabled: runtime.is_enabled === 1,
    useForEmail: runtime.use_for_email === 1,
    useForAudit: runtime.use_for_audit === 1,
    useForGeneral: runtime.use_for_general === 1,
    apiKeyConfigured,
    apiKeyMasked: apiKeyConfigured ? maskApiKey(runtime.api_key) : "",
    createdAt: runtime.created_at,
    updatedAt: runtime.updated_at,
  };
}

function buildOpenAiEndpoint(baseUrl: string): string {
  const trimmed = cleanText(baseUrl).replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
}

function buildAnthropicEndpoint(baseUrl: string): string {
  const trimmed = cleanText(baseUrl).replace(/\/+$/, "");
  if (trimmed.endsWith("/messages")) {
    return trimmed;
  }

  return `${trimmed}/messages`;
}

function buildGeminiEndpoint(baseUrl: string, model: string, apiKey: string): string {
  const trimmed = cleanText(baseUrl).replace(/\/+$/, "");
  const separator = trimmed.includes("?") ? "&" : "?";
  return `${trimmed}/models/${encodeURIComponent(model)}:generateContent${separator}key=${encodeURIComponent(apiKey)}`;
}

async function parseErrorResponse(response: Response): Promise<string> {
  const raw = await response.text();
  if (!raw.trim()) {
    return `Provider request failed (${response.status})`;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const errorBlock = parsed.error as Record<string, unknown> | undefined;
    const message = cleanText(errorBlock?.message) || cleanText(parsed.message) || cleanText(parsed.error);
    return message || raw.slice(0, 240);
  } catch {
    return raw.slice(0, 240);
  }
}

function extractOpenAiText(payload: Record<string, unknown>): string {
  const directOutputText = cleanText(payload.output_text);
  if (directOutputText) {
    return directOutputText;
  }

  const extractStructuredText = (value: unknown, depth = 0): string => {
    if (!value || depth > 5) {
      return "";
    }

    if (typeof value === "string") {
      return value.trim();
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => extractStructuredText(item, depth + 1))
        .filter(Boolean)
        .join("\n")
        .trim();
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const directText = cleanText(record.text) || cleanText(record.output_text) || cleanText(record.value);
      if (directText) {
        return directText;
      }

      if (record.content !== undefined) {
        const nested = extractStructuredText(record.content, depth + 1);
        if (nested) {
          return nested;
        }
      }
    }

    return "";
  };

  const outputBlock = extractStructuredText(payload.output);
  if (outputBlock) {
    return outputBlock;
  }

  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  if (choice && typeof choice === "object") {
    const choiceText = cleanText((choice as Record<string, unknown>).text);
    if (choiceText) {
      return choiceText;
    }
  }

  const message = choice && typeof choice === "object" ? (choice as Record<string, unknown>).message : undefined;
  const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : undefined;

  if (typeof content === "string") {
    return content.trim();
  }

  const structuredContent = extractStructuredText(content);
  if (structuredContent) {
    return structuredContent;
  }

  return "";
}

function supportsMaxCompletionTokens(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/i.test(cleanText(model));
}

function isOpenAiReasoningModel(model: string): boolean {
  return supportsMaxCompletionTokens(model);
}

function isOpenAiHostedProvider(baseUrl: string): boolean {
  return /api\.openai\.com/i.test(cleanText(baseUrl));
}

function isOpenRouterProvider(baseUrl: string): boolean {
  return /openrouter\.ai/i.test(cleanText(baseUrl));
}

function extractAnthropicText(payload: Record<string, unknown>): string {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .map((item) => (item && typeof item === "object" ? cleanText((item as Record<string, unknown>).text) : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractGeminiText(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];
  if (!first || typeof first !== "object") {
    return "";
  }

  const content = (first as Record<string, unknown>).content;
  const parts = content && typeof content === "object" ? (content as Record<string, unknown>).parts : undefined;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((item) => (item && typeof item === "object" ? cleanText((item as Record<string, unknown>).text) : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function callOpenAiCompatible(
  provider: RuntimeProvider,
  systemPrompt: string,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const reasoningModel = isOpenAiReasoningModel(provider.model);
  const requestBody: Record<string, unknown> = {
    model: provider.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  };

  if (!reasoningModel) {
    requestBody.temperature = temperature;
  }

  if (supportsMaxCompletionTokens(provider.model)) {
    requestBody.max_completion_tokens = maxTokens;
  } else {
    requestBody.max_tokens = maxTokens;
  }

  if (reasoningModel) {
    if (isOpenAiHostedProvider(provider.base_url)) {
      requestBody.reasoning_effort = "minimal";
    } else if (isOpenRouterProvider(provider.base_url)) {
      requestBody.reasoning = { effort: "minimal" };
    }
  }

  const response = await fetch(buildOpenAiEndpoint(provider.base_url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const output = extractOpenAiText(payload);
  if (!output) {
    throw new Error("Provider returned an empty response.");
  }

  return output;
}

async function callAnthropic(
  provider: RuntimeProvider,
  systemPrompt: string,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(buildAnthropicEndpoint(provider.base_url), {
    method: "POST",
    headers: {
      "x-api-key": provider.api_key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const output = extractAnthropicText(payload);
  if (!output) {
    throw new Error("Provider returned an empty response.");
  }

  return output;
}

async function callGemini(
  provider: RuntimeProvider,
  systemPrompt: string,
  prompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const response = await fetch(buildGeminiEndpoint(provider.base_url, provider.model, provider.api_key), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const output = extractGeminiText(payload);
  if (!output) {
    throw new Error("Provider returned an empty response.");
  }

  return output;
}

function upsertRow(row: RuntimeProvider): void {
  const db = getDb();
  const encryptedApiKey = encryptCredential(row.api_key);
  db.prepare(
    `INSERT INTO ai_provider_configs (
      provider_key, label, protocol, base_url, api_key, model, is_enabled,
      use_for_email, use_for_audit, use_for_general, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_key) DO UPDATE SET
      label = excluded.label,
      protocol = excluded.protocol,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      model = excluded.model,
      is_enabled = excluded.is_enabled,
      use_for_email = excluded.use_for_email,
      use_for_audit = excluded.use_for_audit,
      use_for_general = excluded.use_for_general,
      updated_at = excluded.updated_at`
  ).run(
    row.provider_key,
    row.label,
    row.protocol,
    row.base_url,
    encryptedApiKey,
    row.model,
    row.is_enabled,
    row.use_for_email,
    row.use_for_audit,
    row.use_for_general,
    row.created_at,
    row.updated_at
  );
}

function resolveProvider(
  task: AiTask,
  preferredProviderKey?: string,
  overrides?: Partial<{ apiKey: string; baseUrl: string; model: string }>,
  allowDisabledPreferred = false
): RuntimeProvider {
  if (preferredProviderKey) {
    const preferred = normalizeRuntimeProvider(getRow(preferredProviderKey));
    const merged: RuntimeProvider = {
      ...preferred,
      api_key: hasOwnValue(overrides, "apiKey") ? cleanText(overrides?.apiKey) : preferred.api_key,
      base_url: hasOwnValue(overrides, "baseUrl") ? cleanText(overrides?.baseUrl) || preferred.base_url : preferred.base_url,
      model: hasOwnValue(overrides, "model") ? cleanText(overrides?.model) || preferred.model : preferred.model,
    };

    if (!cleanText(merged.api_key)) {
      throw new Error(`${merged.label} API key is not configured.`);
    }

    if (!allowDisabledPreferred && merged.is_enabled !== 1) {
      throw new Error(`${merged.label} is saved but not enabled.`);
    }

    return merged;
  }

  const ready = listRuntimeProviders().filter((row) => row.is_enabled === 1 && Boolean(cleanText(row.api_key)));

  const taskMatched = ready.filter((row) => {
    if (task === "email") return row.use_for_email === 1;
    if (task === "audit") return row.use_for_audit === 1;
    return row.use_for_general === 1;
  });

  const selected = taskMatched[0] || ready[0];
  if (!selected) {
    throw new Error(`No enabled AI provider with an API key is assigned for ${task}.`);
  }

  return selected;
}

export function listAiProviderConfigs(): AiProviderConfig[] {
  const rows = new Map(listRows().map((row) => [row.provider_key, row]));
  return providerCatalog.map((entry) => rowToConfig(rows.get(entry.providerKey) || buildDefaultRow(entry)));
}

export function getAiSystemSummary(): {
  activeProviders: number;
  providerCatalogSize: number;
  emailProvider: string;
  auditProvider: string;
  generalProvider: string;
} {
  const items = listAiProviderConfigs();
  const ready = items.filter((item) => item.isEnabled && item.apiKeyConfigured);
  const selectLabel = (task: "email" | "audit" | "general"): string => {
    const matching = ready.find((item) => {
      if (task === "email") return item.useForEmail;
      if (task === "audit") return item.useForAudit;
      return item.useForGeneral;
    });

    return matching?.label || ready[0]?.label || "Not configured";
  };

  return {
    activeProviders: ready.length,
    providerCatalogSize: items.length,
    emailProvider: selectLabel("email"),
    auditProvider: selectLabel("audit"),
    generalProvider: selectLabel("general"),
  };
}

export function updateAiProviderConfig(
  providerKey: string,
  patch: Partial<{
    baseUrl: string;
    model: string;
    apiKey: string;
    clearApiKey: boolean;
    isEnabled: boolean;
    useForEmail: boolean;
    useForAudit: boolean;
    useForGeneral: boolean;
  }>
): AiProviderConfig {
  const entry = getCatalogEntry(providerKey);
  const current = normalizeRuntimeProvider(getRow(providerKey));
  const managedDefaults = usesManagedDefaults(entry);
  const now = new Date().toISOString();
  const next: RuntimeProvider = {
    ...current,
    base_url: managedDefaults
      ? entry.baseUrl
      : hasOwnValue(patch, "baseUrl")
        ? cleanText(patch.baseUrl) || current.base_url
        : current.base_url,
    model: managedDefaults
      ? entry.defaultModel
      : hasOwnValue(patch, "model")
        ? cleanText(patch.model) || current.model
        : current.model,
    api_key: patch.clearApiKey
      ? ""
      : hasOwnValue(patch, "apiKey")
        ? cleanText(patch.apiKey) || current.api_key
        : current.api_key,
    is_enabled: hasOwnValue(patch, "isEnabled") ? (patch.isEnabled ? 1 : 0) : current.is_enabled,
    use_for_email: hasOwnValue(patch, "useForEmail") ? (patch.useForEmail ? 1 : 0) : current.use_for_email,
    use_for_audit: hasOwnValue(patch, "useForAudit") ? (patch.useForAudit ? 1 : 0) : current.use_for_audit,
    use_for_general: hasOwnValue(patch, "useForGeneral") ? (patch.useForGeneral ? 1 : 0) : current.use_for_general,
    updated_at: now,
  };

  upsertRow(next);

  const db = getDb();
  if (patch.useForEmail) {
    db.prepare("UPDATE ai_provider_configs SET use_for_email = 0 WHERE provider_key <> ?").run(providerKey);
  }
  if (patch.useForAudit) {
    db.prepare("UPDATE ai_provider_configs SET use_for_audit = 0 WHERE provider_key <> ?").run(providerKey);
  }
  if (patch.useForGeneral) {
    db.prepare("UPDATE ai_provider_configs SET use_for_general = 0 WHERE provider_key <> ?").run(providerKey);
  }

  return rowToConfig(getRow(providerKey));
}

export async function generateAiText(args: {
  task: AiTask;
  systemPrompt: string;
  prompt: string;
  preferredProviderKey?: string;
  overrides?: Partial<{ apiKey: string; baseUrl: string; model: string }>;
  temperature?: number;
  maxTokens?: number;
  allowDisabledPreferred?: boolean;
}): Promise<{ providerKey: string; label: string; model: string; output: string }> {
  const provider = resolveProvider(
    args.task,
    cleanText(args.preferredProviderKey),
    args.overrides,
    Boolean(args.allowDisabledPreferred)
  );
  const temperature = Number.isFinite(args.temperature) ? Number(args.temperature) : 0.7;
  const maxTokens = Number.isFinite(args.maxTokens) ? Number(args.maxTokens) : 800;

  let output = "";
  if (provider.protocol === "anthropic") {
    output = await callAnthropic(provider, args.systemPrompt, args.prompt, temperature, maxTokens);
  } else if (provider.protocol === "gemini") {
    output = await callGemini(provider, args.systemPrompt, args.prompt, temperature, maxTokens);
  } else {
    output = await callOpenAiCompatible(provider, args.systemPrompt, args.prompt, temperature, maxTokens);
  }

  return {
    providerKey: provider.provider_key,
    label: provider.label,
    model: provider.model,
    output,
  };
}