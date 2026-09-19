import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import {
  fetchOutreachCampaign,
  updateOutreachCampaign,
  sendOutreachCampaign,
  type OutreachCampaign,
  type CampaignRecipient,
} from "../lib/api";

function formatDateTime(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "-";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

const statusStyles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  queued: "bg-sky-100 text-sky-700",
  scheduled: "bg-violet-100 text-violet-700",
  sending: "bg-amber-100 text-amber-700",
  running: "bg-orange-100 text-orange-700",
  complete: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
};

export function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* ── Editable fields ── */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [targetNiche, setTargetNiche] = useState("");
  const [targetCity, setTargetCity] = useState("");

  /* ── Email mode & checklist ── */
  const [emailMode, setEmailMode] = useState<"custom" | "ai">("custom");
  const [attachGmbAudit, setAttachGmbAudit] = useState(false);
  const [attachWebsiteAudit, setAttachWebsiteAudit] = useState(false);

  async function loadCampaign() {
    if (!campaignId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchOutreachCampaign(campaignId);
      setCampaign(data.campaign);
      setRecipients(data.recipients);
      setName(data.campaign.name);
      setDescription(data.campaign.description || "");
      setSubject(data.campaign.subject || "");
      setBody(data.campaign.body || "");
      setTargetNiche(data.campaign.target_niche || "");
      setTargetCity(data.campaign.target_city || "");
      setEmailMode(data.campaign.email_mode === "ai" ? "ai" : "custom");
      setAttachGmbAudit(data.campaign.attach_gmb_audit || false);
      setAttachWebsiteAudit(data.campaign.attach_website_audit || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaign();
  }, [campaignId]);

  async function saveSettings() {
    if (!campaignId) return;
    setSaving(true);
    setError("");
    try {
      await updateOutreachCampaign(campaignId, {
        name: name.trim(),
        description: description.trim(),
        subject: subject.trim(),
        body: body.trim(),
        targetNiche: targetNiche.trim(),
        targetCity: targetCity.trim(),
        emailMode,
        attachGmbAudit,
        attachWebsiteAudit,
      });
      showToast("success", "Campaign settings saved");
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!campaignId) return;
    setSaving(true);
    setError("");
    try {
      const result = await sendOutreachCampaign(campaignId, { delayMs: 250 });
      showToast("success", `Sent ${result.sentCount || 0}, failed ${result.failedCount || 0}`);
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="page-enter gradient-mesh-bg -m-4 min-h-screen p-5 sm:p-7">
        <div className="glass-card rounded-2xl p-6">
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded" style={{ background: "var(--bg-tertiary)", width: i < 2 ? "60%" : "40%" }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!campaign) {
    return (
      <section className="page-enter gradient-mesh-bg -m-4 min-h-screen p-5 sm:p-7">
        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>Campaign not found.</p>
          <button type="button" onClick={() => navigate("/outreach/campaigns")} className="mt-3 text-[13px] font-medium text-[#5e6ad2] hover:underline">
            ← Back to Campaigns
          </button>
        </div>
      </section>
    );
  }

  const sBadge = statusStyles[campaign.status.toLowerCase()] || "bg-slate-100 text-slate-600";
  const pendingRecipients = recipients.filter((r) => r.status === "pending");
  const sentRecipients = recipients.filter((r) => r.status === "sent");
  const failedRecipients = recipients.filter((r) => r.status === "bounced");

  return (
    <section className="page-enter gradient-mesh-bg -m-4 min-h-screen space-y-5 overflow-x-hidden p-5 sm:p-7" style={{ fontSize: "15px" }}>
      {/* Header */}
      <header className="glass-card glow-accent flex items-center justify-between rounded-2xl p-6">
        <div>
          <button type="button" onClick={() => navigate("/outreach/campaigns")} className="mb-2 text-[12px] font-medium text-[#5e6ad2] hover:underline">
            ← All Campaigns
          </button>
          <h2 className="bg-gradient-to-r from-[#5e6ad2] via-[#7b85dc] to-[#a855f7] bg-clip-text text-2xl font-bold text-transparent">
            {campaign.name}
          </h2>
          {campaign.description && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>{campaign.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-block rounded-full px-3 py-1 text-[12px] font-semibold ${sBadge}`}>
            {campaign.status}
          </span>
          <span className="glass-badge rounded-full px-4 py-2 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="glass-card-subtle rounded-xl border-l-4 border-red-400 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* Stats pills */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5" style={{ backgroundColor: "var(--bg-card)" }}>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-700">
            Total: {recipients.length}
          </div>
          <div className="rounded-full bg-sky-100 px-3 py-1.5 text-[12px] font-semibold text-sky-700">
            Pending: {pendingRecipients.length}
          </div>
          <div className="rounded-full bg-emerald-100 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
            Sent: {sentRecipients.length}
          </div>
          <div className="rounded-full bg-rose-100 px-3 py-1.5 text-[12px] font-semibold text-rose-700">
            Failed: {failedRecipients.length}
          </div>
        </div>
      </div>

      {/* ═══ Campaign Settings ═══ */}
      <div className="glass-card glow-sm rounded-2xl p-6">
        <h3 className="mb-4 text-lg font-bold" style={{ color: "var(--text-primary)" }}>Campaign Settings</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Campaign Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="glass-input w-full rounded-lg px-3 py-2 text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="glass-input w-full rounded-lg px-3 py-2 text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Target Niche</label>
            <input value={targetNiche} onChange={(e) => setTargetNiche(e.target.value)} placeholder="e.g. Plumber" className="glass-input w-full rounded-lg px-3 py-2 text-[13px]" />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Target City</label>
            <input value={targetCity} onChange={(e) => setTargetCity(e.target.value)} placeholder="e.g. Dallas" className="glass-input w-full rounded-lg px-3 py-2 text-[13px]" />
          </div>
        </div>
      </div>

      {/* ═══ Email Attachments Checklist ═══ */}
      <div className="glass-card glow-sm rounded-2xl p-6">
        <h3 className="mb-1 text-lg font-bold" style={{ color: "var(--text-primary)" }}>Email Attachments</h3>
        <p className="mb-4 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          Choose what to include with each outreach email.
        </p>
        <div className="flex flex-wrap gap-3">
          {/* Plain email — always ON, just a visual indicator */}
          <div className="flex items-center gap-2 rounded-lg border border-[#5e6ad2]/30 bg-[#5e6ad2]/5 px-4 py-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-[#5e6ad2] text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Email Only</p>
              <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Plain outreach email</p>
            </div>
          </div>

          {/* GMB Audit */}
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition ${attachGmbAudit ? "border-emerald-400/50 bg-emerald-50" : "border-slate-200"}`}>
            <input
              type="checkbox"
              checked={attachGmbAudit}
              onChange={(e) => setAttachGmbAudit(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 accent-emerald-600"
            />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>+ GMB Audit</p>
              <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Include Google Business audit report</p>
            </div>
          </label>

          {/* Website Audit */}
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 transition ${attachWebsiteAudit ? "border-violet-400/50 bg-violet-50" : "border-slate-200"}`}>
            <input
              type="checkbox"
              checked={attachWebsiteAudit}
              onChange={(e) => setAttachWebsiteAudit(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-violet-600 accent-violet-600"
            />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>+ Website Audit</p>
              <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Include website SEO audit report</p>
            </div>
          </label>
        </div>
      </div>

      {/* ═══ Email Body Mode ═══ */}
      <div className="glass-card glow-sm rounded-2xl p-6">
        <h3 className="mb-1 text-lg font-bold" style={{ color: "var(--text-primary)" }}>Email Content</h3>
        <p className="mb-4 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          Use one shared email for everyone, or let AI generate a unique email per lead with its own audit report.
        </p>

        {/* Mode toggle */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEmailMode("custom")}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition ${
              emailMode === "custom"
                ? "bg-[#5e6ad2] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Custom Email
          </button>
          <button
            type="button"
            onClick={() => setEmailMode("ai")}
            className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition ${
              emailMode === "ai"
                ? "bg-gradient-to-r from-[#5e6ad2] to-[#a855f7] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            AI Generated
          </button>
        </div>

        {emailMode === "custom" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              Same subject and body are sent to every recipient, with variables like {"{{business_name}}"} replaced per lead.
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Email Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Boost your local SEO rankings"
                className="glass-input w-full rounded-lg px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Email Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder={"Write your outreach email body here...\n\nUse {{business_name}}, {{city}}, {{state}}, {{website}} for personalization."}
                className="glass-input w-full rounded-lg px-3 py-2 text-[13px]"
              />
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Variables: {"{{business_name}}"}, {"{{city}}"}, {"{{state}}"}, {"{{website}}"}, {"{{email}}"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#5e6ad2]/20 bg-gradient-to-br from-[#5e6ad2]/5 to-[#a855f7]/5 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5e6ad2] to-[#a855f7] text-lg text-white">
                
              </div>
              <div>
                <p className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
                  AI-Generated Emails
                </p>
                <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  AI writes a unique, personalized email for each lead based on their business name, city, niche,
                  and available audit data. Every recipient gets a different email and can receive a matching PDF audit report.
                </p>
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Subject Line (optional — AI will generate if empty)</label>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Leave empty for AI-generated subjects per lead"
                      className="glass-input w-full rounded-lg px-3 py-2 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Custom Instructions (optional)</label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={4}
                      placeholder={"Optional instructions for the AI, e.g.:\n• Tone: friendly and professional\n• Mention a free audit offer\n• Keep it under 150 words"}
                      className="glass-input w-full rounded-lg px-3 py-2 text-[13px]"
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
                  
                  <span>AI mode requires AI provider configured in Settings. Each lead will get a unique email at send time.</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Save / Send ═══ */}
      <div className="glass-card glow-sm rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving || !name.trim()}
            className="btn-gradient-primary rounded-lg px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {pendingRecipients.length > 0 && (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={saving}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              Send ({pendingRecipients.length} pending)
            </button>
          )}
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {emailMode === "ai"
              ? "AI will generate unique email per lead at send time, with audit PDFs attached when enabled"
              : "Same email to all recipients with variable substitution"}
          </span>
        </div>
      </div>

      {/* ═══ Recipients Table ═══ */}
      {recipients.length > 0 && (
        <div className="glass-card glow-sm overflow-x-auto rounded-2xl">
          <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-primary)" }}>
            <h3 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>Recipients</h3>
          </div>
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-slate-100/80">
                <th className="px-4 py-3 text-left text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Business</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Email</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>City</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Status</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Sent At</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => {
                const rStatus =
                  r.status === "sent" ? "bg-emerald-100 text-emerald-700" :
                  r.status === "pending" ? "bg-sky-100 text-sky-700" :
                  r.status === "bounced" ? "bg-rose-100 text-rose-700" :
                  "bg-slate-100 text-slate-600";
                return (
                  <tr key={r.email_id} style={{ borderTop: "1px solid var(--border-primary)" }}>
                    <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>{r.business_name || "-"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{r.email || "-"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{r.city || "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${rStatus}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px]" style={{ color: "var(--text-tertiary)" }}>{formatDateTime(r.sent_at || "")}</td>
                    <td className="px-4 py-3 text-[12px] text-rose-600">{r.error_message || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
