import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../db/database.js";
import { plainTextToEmailHtml } from "./html.js";

type LeadRecipientRow = {
  id: string;
  business_name: string;
  email: string | null;
};

type CampaignRow = {
  id: string;
  status: string;
  sequence_json: string | null;
  scheduled_at: string | null;
};

type BindValue = string | number | bigint | Uint8Array | null;

type CampaignRecipientPersonalization = {
  subject?: string;
  body?: string;
  bodyHtml?: string;
};

export type CampaignDraftInput = {
  name: string;
  description?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  leadIds: string[];
  smtpAccountId?: string;
  targetNiche?: string;
  targetCity?: string;
  templateId?: string;
  sendIntervalMs?: number;
  followUpEnabled?: boolean;
  followUpDelayHours?: number;
  followUpSubject?: string;
  followUpBody?: string;
  followUpBodyHtml?: string;
  maxRetries?: number;
  scheduledAt?: string;
  personalizedByLeadId?: Record<string, CampaignRecipientPersonalization>;
  reportContextByLeadId?: Record<string, Record<string, unknown>>;
};

export type CampaignDraftResult = {
  campaignId: string;
  queuedCount: number;
  matchedLeadIds: string[];
};

export type CampaignAppendResult = {
  campaignId: string;
  queuedCount: number;
  matchedLeadIds: string[];
  duplicateLeadIds: string[];
};

type NormalizedCampaignInput = {
  name: string;
  description: string | null;
  subject: string;
  body: string;
  bodyHtml: string | null;
  targetNiche: string | null;
  targetCity: string | null;
  smtpAccountId: string | null;
  templateId: string | null;
  sendIntervalMs: number;
  followUpEnabled: boolean;
  followUpDelayHours: number;
  followUpSubject: string | null;
  followUpBody: string | null;
  followUpBodyHtml: string | null;
  maxRetries: number;
  scheduledAt: string | null;
};

type CampaignSequence = Omit<NormalizedCampaignInput, "name" | "description" | "targetNiche" | "targetCity">;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(parsed);
}

function normalizeLeadIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const id = cleanText(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function ensureActiveSmtpAccount(smtpAccountId: string): void {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM smtp_accounts WHERE id = ? AND is_active = 1")
    .get(smtpAccountId) as { id?: string } | undefined;

  if (!row?.id) {
    throw new Error("Active SMTP account not found for this campaign");
  }
}

function normalizeCampaignInput(rawInput: CampaignDraftInput): NormalizedCampaignInput {
  return {
    name: cleanText(rawInput.name),
    description: cleanText(rawInput.description) || null,
    subject: cleanText(rawInput.subject),
    body: cleanText(rawInput.body),
    bodyHtml: cleanText(rawInput.bodyHtml) || null,
    targetNiche: cleanText(rawInput.targetNiche) || null,
    targetCity: cleanText(rawInput.targetCity) || null,
    smtpAccountId: cleanText(rawInput.smtpAccountId) || null,
    templateId: cleanText(rawInput.templateId) || null,
    sendIntervalMs: Math.max(0, toInteger(rawInput.sendIntervalMs, 250)),
    followUpEnabled: Boolean(rawInput.followUpEnabled),
    followUpDelayHours: Math.max(1, toInteger(rawInput.followUpDelayHours, 72)),
    followUpSubject: cleanText(rawInput.followUpSubject) || null,
    followUpBody: cleanText(rawInput.followUpBody) || null,
    followUpBodyHtml: cleanText(rawInput.followUpBodyHtml) || null,
    maxRetries: Math.max(0, toInteger(rawInput.maxRetries, 0)),
    scheduledAt: cleanText(rawInput.scheduledAt) || null,
  };
}

function validateCampaignInput(input: NormalizedCampaignInput, requireContent = true): void {
  if (!input.name) {
    throw new Error("Campaign name is required");
  }

  if (requireContent) {
    if (!input.subject) {
      throw new Error("Campaign subject is required");
    }

    if (!input.body) {
      throw new Error("Campaign body is required");
    }
  }

  if (input.smtpAccountId) {
    ensureActiveSmtpAccount(input.smtpAccountId);
  }
}

function toCampaignSequence(input: NormalizedCampaignInput): CampaignSequence {
  return {
    subject: input.subject,
    body: input.body,
    bodyHtml: input.bodyHtml,
    smtpAccountId: input.smtpAccountId,
    templateId: input.templateId,
    sendIntervalMs: input.sendIntervalMs,
    followUpEnabled: input.followUpEnabled,
    followUpDelayHours: input.followUpDelayHours,
    followUpSubject: input.followUpSubject,
    followUpBody: input.followUpBody,
    followUpBodyHtml: input.followUpBodyHtml,
    maxRetries: input.maxRetries,
    scheduledAt: input.scheduledAt,
  };
}

function parseSequenceJson(sequenceJson: string | null): CampaignSequence {
  const defaults: CampaignSequence = {
    subject: "",
    body: "",
    bodyHtml: null,
    smtpAccountId: null,
    templateId: null,
    sendIntervalMs: 250,
    followUpEnabled: false,
    followUpDelayHours: 72,
    followUpSubject: null,
    followUpBody: null,
    followUpBodyHtml: null,
    maxRetries: 0,
    scheduledAt: null,
  };

  if (!sequenceJson) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(sequenceJson) as Partial<CampaignSequence>;
    return {
      subject: cleanText(parsed.subject),
      body: cleanText(parsed.body),
      bodyHtml: cleanText(parsed.bodyHtml) || null,
      smtpAccountId: cleanText(parsed.smtpAccountId) || null,
      templateId: cleanText(parsed.templateId) || null,
      sendIntervalMs: Math.max(0, toInteger(parsed.sendIntervalMs, 250)),
      followUpEnabled: Boolean(parsed.followUpEnabled),
      followUpDelayHours: Math.max(1, toInteger(parsed.followUpDelayHours, 72)),
      followUpSubject: cleanText(parsed.followUpSubject) || null,
      followUpBody: cleanText(parsed.followUpBody) || null,
      followUpBodyHtml: cleanText(parsed.followUpBodyHtml) || null,
      maxRetries: Math.max(0, toInteger(parsed.maxRetries, 0)),
      scheduledAt: cleanText(parsed.scheduledAt) || null,
    };
  } catch {
    return defaults;
  }
}

function campaignStatusForPendingQueue(scheduledAt: string | null): string {
  if (scheduledAt) {
    const scheduledTime = new Date(scheduledAt).getTime();
    if (Number.isFinite(scheduledTime) && scheduledTime > Date.now()) {
      return "scheduled";
    }
  }

  return "queued";
}

function insertCampaignRecord(options: {
  campaignId: string;
  input: NormalizedCampaignInput;
  status: string;
  now: string;
}): void {
  const { campaignId, input, status, now } = options;
  const db = getDb();
  const sequenceJson = JSON.stringify(toCampaignSequence(input));

  db.prepare(
    `INSERT INTO campaigns (
      id,
      name,
      description,
      target_niche,
      target_city,
      sequence_json,
      template_id,
      status,
      scheduled_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    campaignId,
    input.name,
    input.description,
    input.targetNiche,
    input.targetCity,
    sequenceJson,
    input.templateId,
    status,
    input.scheduledAt,
    now,
    now
  );
}

function queueRecipients(options: {
  campaignId: string;
  recipients: LeadRecipientRow[];
  sequence: CampaignSequence;
  now: string;
  personalizedByLeadId?: Record<string, CampaignRecipientPersonalization>;
  reportContextByLeadId?: Record<string, Record<string, unknown>>;
}): number {
  const {
    campaignId,
    recipients,
    sequence,
    now,
    personalizedByLeadId,
    reportContextByLeadId,
  } = options;
  const db = getDb();
  const insertEmail = db.prepare(
    `INSERT INTO emails_sent (
      id,
      campaign_id,
      lead_id,
      step_number,
      smtp_account_id,
      subject,
      body,
      body_html,
      report_context_json,
      status,
      next_attempt_at,
      created_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  );

  for (const recipient of recipients) {
    const personalization = personalizedByLeadId?.[recipient.id];
    const subject = cleanText(personalization?.subject) || sequence.subject;
    const body = cleanText(personalization?.body) || sequence.body;
    const bodyHtml =
      cleanText(personalization?.bodyHtml) ||
      sequence.bodyHtml ||
      plainTextToEmailHtml(body);

    const reportContext = reportContextByLeadId?.[recipient.id];
    const reportContextJson = reportContext ? JSON.stringify(reportContext) : null;

    insertEmail.run(
      uuidv4(),
      campaignId,
      recipient.id,
      sequence.smtpAccountId,
      subject,
      body,
      bodyHtml,
      reportContextJson,
      sequence.scheduledAt,
      now
    );
  }

  return recipients.length;
}

function getCampaignRow(campaignId: string): CampaignRow | undefined {
  const db = getDb();
  return db.prepare("SELECT id, status, sequence_json, scheduled_at FROM campaigns WHERE id = ?").get(campaignId) as
    | CampaignRow
    | undefined;
}

function findExistingLeadIdsForCampaign(campaignId: string, leadIds: string[]): Set<string> {
  if (leadIds.length === 0) {
    return new Set<string>();
  }

  const db = getDb();
  const placeholders = leadIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT DISTINCT lead_id
       FROM emails_sent
       WHERE campaign_id = ?
         AND lead_id IN (${placeholders})`
    )
    .all(campaignId, ...(leadIds as BindValue[])) as Array<{ lead_id: string | null }>;

  return new Set(rows.map((row) => cleanText(row.lead_id)).filter(Boolean));
}

function findRecipientLeads(leadIds: string[]): LeadRecipientRow[] {
  if (leadIds.length === 0) {
    return [];
  }

  const db = getDb();
  const placeholders = leadIds.map(() => "?").join(", ");
  const params = leadIds as BindValue[];

  return db
    .prepare(
      `SELECT id, business_name, email
       FROM leads
       WHERE id IN (${placeholders})`
    )
    .all(...params) as LeadRecipientRow[];
}

export function createCampaignDraftFromLeadIds(rawInput: CampaignDraftInput): CampaignDraftResult {
  const input = normalizeCampaignInput(rawInput);
  const leadIds = normalizeLeadIds(rawInput.leadIds).slice(0, 1000);
  validateCampaignInput(input);

  if (leadIds.length === 0) {
    throw new Error("Select at least one lead to create a campaign");
  }

  const recipients = findRecipientLeads(leadIds).filter((row) => cleanText(row.email));
  if (recipients.length === 0) {
    throw new Error("No selected leads have a valid email address");
  }

  const db = getDb();
  const now = new Date().toISOString();
  const campaignId = uuidv4();
  const sequence = toCampaignSequence(input);

  db.exec("BEGIN");
  try {
    insertCampaignRecord({
      campaignId,
      input,
      status: campaignStatusForPendingQueue(sequence.scheduledAt),
      now,
    });

    queueRecipients({
      campaignId,
      recipients,
      sequence,
      now,
      personalizedByLeadId: rawInput.personalizedByLeadId,
      reportContextByLeadId: rawInput.reportContextByLeadId,
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    campaignId,
    queuedCount: recipients.length,
    matchedLeadIds: recipients.map((row) => row.id),
  };
}

export function createCampaignShell(rawInput: CampaignDraftInput): CampaignDraftResult {
  const input = normalizeCampaignInput(rawInput);
  validateCampaignInput(input, false);

  const db = getDb();
  const now = new Date().toISOString();
  const campaignId = uuidv4();

  db.exec("BEGIN");
  try {
    insertCampaignRecord({
      campaignId,
      input,
      status: "draft",
      now,
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    campaignId,
    queuedCount: 0,
    matchedLeadIds: [],
  };
}

export function appendLeadIdsToCampaign(
  campaignId: string,
  rawLeadIds: unknown,
  options?: {
    personalizedByLeadId?: Record<string, CampaignRecipientPersonalization>;
    reportContextByLeadId?: Record<string, Record<string, unknown>>;
  }
): CampaignAppendResult {
  const normalizedCampaignId = cleanText(campaignId);
  const leadIds = normalizeLeadIds(rawLeadIds).slice(0, 1000);

  if (!normalizedCampaignId) {
    throw new Error("Campaign id is required");
  }

  if (leadIds.length === 0) {
    throw new Error("Select at least one lead to add");
  }

  const campaign = getCampaignRow(normalizedCampaignId);
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (cleanText(campaign.status) === "running") {
    throw new Error("Pause sending before adding more leads to this campaign");
  }

  const sequence = parseSequenceJson(campaign.sequence_json);
  if (!sequence.subject || !sequence.body) {
    throw new Error("Campaign draft is missing subject or body content");
  }

  if (sequence.smtpAccountId) {
    ensureActiveSmtpAccount(sequence.smtpAccountId);
  }

  const recipients = findRecipientLeads(leadIds).filter((row) => cleanText(row.email));
  if (recipients.length === 0) {
    throw new Error("No selected leads have a valid email address");
  }

  const existingLeadIds = findExistingLeadIdsForCampaign(
    normalizedCampaignId,
    recipients.map((recipient) => recipient.id)
  );
  const duplicateLeadIds = recipients
    .map((recipient) => recipient.id)
    .filter((leadId) => existingLeadIds.has(leadId));
  const appendableRecipients = recipients.filter((recipient) => !existingLeadIds.has(recipient.id));

  if (appendableRecipients.length === 0) {
    return {
      campaignId: normalizedCampaignId,
      queuedCount: 0,
      matchedLeadIds: recipients.map((recipient) => recipient.id),
      duplicateLeadIds,
    };
  }

  const db = getDb();
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    queueRecipients({
      campaignId: normalizedCampaignId,
      recipients: appendableRecipients,
      sequence,
      now,
      personalizedByLeadId: options?.personalizedByLeadId,
      reportContextByLeadId: options?.reportContextByLeadId,
    });

    db.prepare("UPDATE campaigns SET status = ?, updated_at = ? WHERE id = ?").run(
      campaignStatusForPendingQueue(cleanText(campaign.scheduled_at) || sequence.scheduledAt),
      now,
      normalizedCampaignId
    );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    campaignId: normalizedCampaignId,
    queuedCount: appendableRecipients.length,
    matchedLeadIds: recipients.map((recipient) => recipient.id),
    duplicateLeadIds,
  };
}
