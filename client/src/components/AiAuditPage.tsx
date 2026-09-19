import { useState } from "react";
import {
  runSpecialistAudit,
  updateSpecialistAudit,
  type SpecialistAuditType,
  type SpecialistAuditResult,
  type SpecialistAuditFinding,
} from "../lib/api";

function scoreTone(score: number): string {
  if (score >= 78) return "text-emerald-600";
  if (score >= 56) return "text-amber-600";
  return "text-rose-600";
}

function scoreBg(score: number): string {
  if (score >= 78) return "bg-emerald-50 border-emerald-200";
  if (score >= 56) return "bg-amber-50 border-amber-200";
  return "bg-rose-50 border-rose-200";
}

function verdictTone(verdict: string): string {
  const v = verdict.toLowerCase();
  if (v === "strong") return "bg-emerald-100 text-emerald-700";
  if (v.includes("needs")) return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function severityTone(severity: "high" | "medium" | "low"): string {
  if (severity === "high") return "border-rose-200 bg-rose-50 text-rose-900";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}

function normalizeUrl(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return "";
  }
}

export interface AiAuditPageConfig {
  auditType: SpecialistAuditType;
  title: string;
  subtitle: string;
  sectionLabel: string;
  isCompetitor?: boolean;
}

export function AiAuditPage({ config }: { config: AiAuditPageConfig }) {
  const [website, setWebsite] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [result, setResult] = useState<SpecialistAuditResult | null>(null);
  const [history, setHistory] = useState<SpecialistAuditResult[]>([]);

  const inputClass =
    "w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 outline-none transition focus:border-[#5e6ad2]";

  async function handleRun() {
    const normalized = normalizeUrl(website);
    if (!normalized) {
      setError("Please enter a valid website URL.");
      return;
    }
    if (config.isCompetitor && !normalizeUrl(competitorUrl)) {
      setError("Please enter a valid competitor URL.");
      return;
    }
    setBusy(true);
    setError("");
    setSaveMsg("");
    try {
      const data = await runSpecialistAudit({
        website: normalized,
        auditType: config.auditType,
        businessName: businessName || undefined,
        competitorUrl: config.isCompetitor ? normalizeUrl(competitorUrl) : undefined,
      });
      setResult(data);
      setHistory((prev) => [data, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    setSaveMsg("");
    setError("");
    try {
      await updateSpecialistAudit(result.id, {
        score: result.overallScore,
        verdict: result.verdict,
        overallScore: result.overallScore,
        headline: result.headline,
        executiveSummary: result.executiveSummary,
        findings: result.findings,
        wins: result.wins,
        recommendations: result.recommendations,
        priorityActions: result.priorityActions,
      });
      setSaveMsg("Audit report saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  /* ── Mutation helpers ── */
  function patchResult(patch: Partial<SpecialistAuditResult>) {
    setResult((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveMsg("");
  }

  function updateFinding(index: number, patch: Partial<SpecialistAuditFinding>) {
    if (!result) return;
    const next = [...result.findings];
    next[index] = { ...next[index], ...patch };
    patchResult({ findings: next });
  }

  function removeFinding(index: number) {
    if (!result) return;
    patchResult({ findings: result.findings.filter((_, i) => i !== index) });
  }

  function addFinding() {
    if (!result) return;
    patchResult({
      findings: [...result.findings, { title: "New finding", severity: "medium", detail: "" }],
    });
  }

  function updateListItem(field: "wins" | "recommendations" | "priorityActions", index: number, value: string) {
    if (!result) return;
    const next = [...result[field]];
    next[index] = value;
    patchResult({ [field]: next });
  }

  function removeListItem(field: "wins" | "recommendations" | "priorityActions", index: number) {
    if (!result) return;
    patchResult({ [field]: result[field].filter((_: string, i: number) => i !== index) });
  }

  function addListItem(field: "wins" | "recommendations" | "priorityActions") {
    if (!result) return;
    patchResult({ [field]: [...result[field], ""] });
  }

  return (
    <section className="page-enter space-y-5">
      {/* Header */}
      <header className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5e6ad2]">
          {config.sectionLabel}
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">{config.title}</h2>
        <p className="mt-1 text-[13px] text-slate-500">{config.subtitle}</p>
      </header>

      {/* Form */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div
          className={`grid gap-4 ${config.isCompetitor ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"}`}
        >
          <label className="text-[13px] text-slate-600">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Website URL
            </span>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className={inputClass}
            />
          </label>

          <label className="text-[13px] text-slate-600">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              Business Name (optional)
            </span>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Acme Plumbing"
              className={inputClass}
            />
          </label>

          {config.isCompetitor && (
            <label className="text-[13px] text-slate-600">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                Competitor URL
              </span>
              <input
                type="url"
                value={competitorUrl}
                onChange={(e) => setCompetitorUrl(e.target.value)}
                placeholder="https://competitor.com"
                className={inputClass}
              />
            </label>
          )}

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleRun}
              disabled={busy}
              className="w-full rounded-lg bg-[#5e6ad2] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#4e5abc] disabled:opacity-50"
            >
              {busy ? "Running Audit…" : "Run Audit"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </p>
        )}
        {saveMsg && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
            {saveMsg}
          </p>
        )}
      </div>

      {/* Loading */}
      {busy && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#5e6ad2]" />
          <p className="mt-3 text-[13px] text-slate-500">
            AI is analyzing the website… this may take 15-30 seconds.
          </p>
        </div>
      )}

      {/* ── Editable Result ── */}
      {result && !busy && (
        <div className="space-y-4">
          {/* Save bar */}
          <div className="flex items-center justify-between rounded-lg border border-[#5e6ad2]/20 bg-[#5e6ad2]/5 px-5 py-3">
            <p className="text-[13px] font-medium text-[#5e6ad2]">
              All fields below are editable. Modify findings, fix issues, then save your manual report.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#5e6ad2] px-5 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#4e5abc] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Report"}
            </button>
          </div>

          {/* Score hero — editable */}
          <div className={`rounded-lg border p-6 ${scoreBg(result.overallScore)}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 space-y-3">
                <input
                  type="text"
                  value={result.headline}
                  onChange={(e) => patchResult({ headline: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-[18px] font-bold text-slate-900 outline-none focus:border-[#5e6ad2]"
                />
                <textarea
                  value={result.executiveSummary}
                  onChange={(e) => patchResult({ executiveSummary: e.target.value })}
                  rows={2}
                  className="w-full resize-y rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-[13px] text-slate-600 outline-none focus:border-[#5e6ad2]"
                />
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="text-slate-500">AI: {result.model}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">{new Date(result.generatedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={result.overallScore}
                  onChange={(e) =>
                    patchResult({ overallScore: Math.max(0, Math.min(100, Number(e.target.value))) })
                  }
                  className={`w-20 rounded-md border border-slate-200 bg-white/80 px-2 py-1 text-center text-[32px] font-black outline-none focus:border-[#5e6ad2] ${scoreTone(result.overallScore)}`}
                />
                <select
                  value={result.verdict}
                  onChange={(e) => patchResult({ verdict: e.target.value })}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold outline-none ${verdictTone(result.verdict)}`}
                >
                  <option value="Strong">Strong</option>
                  <option value="Needs Work">Needs Work</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>

          {/* Findings — editable */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-slate-900">Findings</h3>
              <button
                type="button"
                onClick={addFinding}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-[#5e6ad2]/30 hover:text-[#5e6ad2]"
              >
                + Add Finding
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {result.findings.map((finding, i) => (
                <div key={i} className={`rounded-lg border p-4 ${severityTone(finding.severity)}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={finding.title}
                        onChange={(e) => updateFinding(i, { title: e.target.value })}
                        className="w-full rounded-md border border-slate-200 bg-white/80 px-3 py-1.5 text-[13px] font-medium outline-none focus:border-[#5e6ad2]"
                      />
                      <textarea
                        value={finding.detail}
                        onChange={(e) => updateFinding(i, { detail: e.target.value })}
                        rows={2}
                        className="w-full resize-y rounded-md border border-slate-200 bg-white/80 px-3 py-1.5 text-[12px] outline-none focus:border-[#5e6ad2]"
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <select
                        value={finding.severity}
                        onChange={(e) =>
                          updateFinding(i, { severity: e.target.value as "high" | "medium" | "low" })
                        }
                        className="rounded-full bg-white/60 px-2 py-1 text-[10px] font-semibold uppercase outline-none"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeFinding(i)}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-rose-600 hover:bg-rose-100"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {result.findings.length === 0 && (
                <p className="text-[13px] text-slate-400">No findings. Click "+ Add Finding" to add one.</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Wins — editable */}
            <EditableList
              label="What's Working"
              items={result.wins}
              color="emerald"
              icon="✓"
              onUpdate={(i, v) => updateListItem("wins", i, v)}
              onRemove={(i) => removeListItem("wins", i)}
              onAdd={() => addListItem("wins")}
            />

            {/* Recommendations — editable */}
            <EditableList
              label="Recommendations"
              items={result.recommendations}
              color="brand"
              icon="→"
              onUpdate={(i, v) => updateListItem("recommendations", i, v)}
              onRemove={(i) => removeListItem("recommendations", i)}
              onAdd={() => addListItem("recommendations")}
            />
          </div>

          {/* Priority Actions — editable */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-slate-900">Priority Action Plan</h3>
              <button
                type="button"
                onClick={() => addListItem("priorityActions")}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-[#5e6ad2]/30 hover:text-[#5e6ad2]"
              >
                + Add Action
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {result.priorityActions.map((action, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5e6ad2] text-[10px] font-bold text-white">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={action}
                    onChange={(e) => updateListItem("priorityActions", i, e.target.value)}
                    className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#5e6ad2]"
                  />
                  <button
                    type="button"
                    onClick={() => removeListItem("priorityActions", i)}
                    className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {result.priorityActions.length === 0 && (
                <p className="text-[13px] text-slate-400">No actions yet.</p>
              )}
            </div>
          </div>

          {/* Bottom save */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#5e6ad2] px-6 py-2.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-[#4e5abc] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Report"}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="text-[14px] font-semibold text-slate-900">Previous Audits (this session)</h3>
          <div className="mt-3 space-y-2">
            {history.slice(1).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setResult(item)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-[#5e6ad2]/30"
              >
                <div>
                  <p className="text-[13px] font-medium text-slate-900">
                    {item.businessName || item.website}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(item.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[18px] font-bold ${scoreTone(item.overallScore)}`}>
                    {item.overallScore}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${verdictTone(item.verdict)}`}
                  >
                    {item.verdict}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Editable string list sub-component ── */
function EditableList({
  label,
  items,
  color,
  icon,
  onUpdate,
  onRemove,
  onAdd,
}: {
  label: string;
  items: string[];
  color: "emerald" | "brand";
  icon: string;
  onUpdate: (i: number, v: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
}) {
  const headingColor = color === "emerald" ? "text-emerald-700" : "text-[#5e6ad2]";
  const iconColor = color === "emerald" ? "text-emerald-500" : "text-[#5e6ad2]";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h3 className={`text-[14px] font-semibold ${headingColor}`}>{label}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-[#5e6ad2]/30 hover:text-[#5e6ad2]"
        >
          + Add
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-1.5 ${iconColor}`}>{icon}</span>
            <input
              type="text"
              value={item}
              onChange={(e) => onUpdate(i, e.target.value)}
              className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] text-slate-700 outline-none focus:border-[#5e6ad2]"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50"
            >
              ✕
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-[13px] text-slate-400">None yet. Click "+ Add" to add one.</p>
        )}
      </div>
    </div>
  );
}
