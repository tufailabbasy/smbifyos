import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "../components/Toast";
import { getAuthHeaders, apiFetch } from "../lib/api";

/* ── Types ── */
interface EmailCampaign {
  id: string;
  name: string;
  description?: string;
  niche?: string;
  city?: string;
  status: string;
  daily_limit?: number;
  delay_seconds?: number;
  sequence_id?: string;
  sender_id?: string;
  sender_from_name?: string;
  sender_from_email?: string;
  created_at?: string;
  sent?: number;
  opens?: number;
  clicks?: number;
  bounced?: number;
}

interface SmtpSender {
  id: string;
  from_name: string;
  from_email: string;
  is_active: number;
}

interface TrackingRow {
  id: string;
  recipient_email: string;
  business_name?: string;
  subject?: string;
  status?: string;
  sent_at?: string;
  opened_at?: string;
  open_count: number;
  click_count: number;
}

interface LeadCount {
  total: number;
  available: number;
}

import { StatusBadge } from "../components/ui/StatusBadge";

/* ── Constants ── */
const NICHES = [
  "Plumbing",
  "HVAC",
  "Roofing",
  "Cleaning",
  "Air Duct",
  "Biohazard",
  "Siding",
  "Dumpster",
  "Dentist",
  "Marketing Agency",
];

const AUTH_HEADER = () => ({
  "Content-Type": "application/json",
  ...getAuthHeaders(),
});

function StatusPill({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

function fmtDate(s?: string) {
  if (!s) return "-";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "-" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(s?: string) {
  if (!s) return "-";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pct(num = 0, den = 0) {
  if (!den) return "0.0";
  return ((num / den) * 100).toFixed(1);
}

/* ── Inline SVG icons ── */
function IconSend() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
function IconEye() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function IconTrash() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}
function IconClose() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}
function IconChevronLeft() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

/* ── Modal Backdrop ── */
function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg">{children}</div>
    </div>
  );
}

/* ── Create Campaign Modal ── */
interface CreateModalProps {
  onClose: () => void;
  onCreated: (c: EmailCampaign) => void;
}

function CreateCampaignModal({ onClose, onCreated }: CreateModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [niche, setNiche] = useState(NICHES[0]);
  const [city, setCity] = useState("");
  const [senderId, setSenderId] = useState("auto");
  const [senders, setSenders] = useState<SmtpSender[]>([]);
  const [dailyLimit, setDailyLimit] = useState(200);
  const [delaySeconds, setDelaySeconds] = useState(60);
  const [scheduleFollowups, setScheduleFollowups] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/email/senders", { headers: AUTH_HEADER() })
      .then(res => res.json())
      .then(data => setSenders(data.items || []))
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!name.trim()) { showToast("warning", "Campaign name is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: AUTH_HEADER(),
        body: JSON.stringify({
          name: name.trim(),
          niche,
          city: city.trim(),
          daily_limit: dailyLimit,
          delay_seconds: delaySeconds,
          sender_id: senderId === "auto" ? null : senderId,
          schedule_followups: scheduleFollowups,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const created: EmailCampaign = await res.json();
      showToast("success", `Campaign "${name}" created!`);
      onCreated(created);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">New Email Campaign</h2>
            <p className="text-[12px] text-slate-400">Configure your campaign settings</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition">
            <IconClose />
          </button>
        </div>
        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Campaign Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Plumbers LA — June Outreach"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>
          {/* Sender Account */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Sending Account (SMTP)</label>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            >
              <option value="auto">Auto (Rotate through active SMTP senders)</option>
              {senders.filter(s => s.is_active === 1).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              Leave on Auto to distribute sends evenly across all connected accounts.
            </p>
          </div>
          {/* Niche */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Niche</label>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            >
              {NICHES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          {/* City */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">City / Market</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Los Angeles, CA"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>
          {/* Daily Limit + Delay */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Daily Limit</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-700 mb-1">Delay (seconds)</label>
              <input
                type="number"
                min={10}
                max={3600}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
          </div>
          {/* Follow-up checkbox */}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-indigo-200 hover:bg-indigo-50/40">
            <input
              type="checkbox"
              checked={scheduleFollowups}
              onChange={(e) => setScheduleFollowups(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <p className="text-[12px] font-semibold text-slate-700">Schedule follow-up emails</p>
              <p className="text-[11px] text-slate-400">Auto-send follow-ups on Day 3 and Day 8 for non-responders</p>
            </div>
          </label>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={submitting}
            className="btn-gradient-primary inline-flex items-center gap-2 rounded-lg px-5 py-2 text-[12px] font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {submitting ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Creating...
              </>
            ) : (
              "Create Campaign"
            )}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

/* ── Send Campaign Modal ── */
interface SendModalProps {
  campaign: EmailCampaign;
  onClose: () => void;
  onSent: () => void;
}

function SendCampaignModal({ campaign, onClose, onSent }: SendModalProps) {
  const { showToast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [senderId, setSenderId] = useState(campaign.sender_id || "auto");
  const [senders, setSenders] = useState<SmtpSender[]>([]);
  const [leadCount, setLeadCount] = useState<LeadCount | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    fetch("/api/email/senders", { headers: AUTH_HEADER() })
      .then(res => res.json())
      .then(data => setSenders(data.items || []))
      .catch(() => {});
  }, []);

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch(`/api/email/campaigns/${campaign.id}/verify`, {
        method: "POST",
        headers: AUTH_HEADER(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      showToast("success", "Email cleaning started in the background! Available leads count will auto-update.");
      
      // Poll lead count every 2 seconds for 20 seconds
      let ticks = 0;
      const interval = setInterval(async () => {
        ticks++;
        if (ticks > 15) clearInterval(interval);
        
        try {
          const params = new URLSearchParams({ status: "new" });
          if (campaign.niche) params.set("niche", campaign.niche);
          if (campaign.city) params.set("city", campaign.city);
          const r = await fetch(`/api/leads?${params.toString()}&page=1&limit=1`, { headers: AUTH_HEADER() });
          if (r.ok) {
            const json = await r.json() as { total?: number };
            setLeadCount({ total: json.total ?? 0, available: json.total ?? 0 });
          }
        } catch { /* silent */ }
      }, 2000);

    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to verify leads");
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => {
    void (async () => {
      setLoadingLeads(true);
      try {
        const params = new URLSearchParams({ status: "new" });
        if (campaign.niche) params.set("niche", campaign.niche);
        if (campaign.city) params.set("city", campaign.city);
        const res = await fetch(`/api/leads?${params.toString()}&page=1&limit=1`, { headers: AUTH_HEADER() });
        if (res.ok) {
          const json = await res.json() as { total?: number; items?: unknown[] };
          setLeadCount({ total: json.total ?? 0, available: json.total ?? 0 });
        }
      } catch {
        /* silent */
      } finally {
        setLoadingLeads(false);
      }
    })();
  }, [campaign.niche, campaign.city]);

  async function handleSend() {
    if (!subject.trim()) { showToast("warning", "Subject line is required"); return; }
    if (!body.trim()) { showToast("warning", "Email body is required"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/email/campaigns/${campaign.id}/send`, {
        method: "POST",
        headers: AUTH_HEADER(),
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          sender_id: senderId === "auto" ? null : senderId,
          leads: [],           // server will fetch from DB based on niche/city/status
          schedule_followups: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      showToast("success", `Campaign "${campaign.name}" queued for sending!`);
      onSent();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-w-xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-sky-50 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">Send Campaign</h2>
            <p className="text-[12px] text-slate-500 font-medium">{campaign.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition">
            <IconClose />
          </button>
        </div>
        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Lead source info */}
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-slate-700">Lead Source</p>
              <p className="text-[11px] text-slate-400">
                {campaign.niche && <span className="font-medium text-indigo-600">{campaign.niche}</span>}
                {campaign.niche && campaign.city && " · "}
                {campaign.city && <span className="font-medium text-slate-600">{campaign.city}</span>}
                {!campaign.niche && !campaign.city && "All leads (no filter)"}
                {" — Status: "}
                <span className="font-semibold text-emerald-600">new</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              {loadingLeads ? (
                <span className="text-[13px] text-slate-400 animate-pulse">Loading...</span>
              ) : (
                <>
                  <p className="text-xl font-bold text-slate-900 tabular-nums">{leadCount?.available ?? 0}</p>
                  <p className="text-[10px] text-slate-400">leads available</p>
                </>
              )}
            </div>
          </div>

          {leadCount && leadCount.available > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 text-emerald-600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
                <p className="text-[11px] font-medium text-slate-600">
                  Verify email addresses before sending to prevent bounceback suspension.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={verifying}
                className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-60 flex items-center gap-1 shadow-sm"
              >
                {verifying ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Cleaning...
                  </>
                ) : (
                  <>
                    Clean List
                  </>
                )}
              </button>
            </div>
          )}
          {/* Sending Account */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Sending Account</label>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            >
              <option value="auto">Auto (Rotate through active SMTP senders)</option>
              {senders.filter(s => s.is_active === 1).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Subject Line *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Quick question about your plumbing business"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
          </div>
          {/* Body */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-700 mb-1">Email Body *</label>
            <textarea
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hey {{business_name}} team,&#10;&#10;I was checking out your Google listing and noticed a few quick wins...&#10;&#10;Would love to chat if you have 5 minutes!&#10;&#10;Regards,&#10;Tufi&#10;SMBify Team"
              className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Available vars: <code className="rounded bg-slate-100 px-1 text-[10px]">{"{{business_name}}"}</code>{" "}
              <code className="rounded bg-slate-100 px-1 text-[10px]">{"{{city}}"}</code>{" "}
              <code className="rounded bg-slate-100 px-1 text-[10px]">{"{{niche}}"}</code>
            </p>
          </div>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
          <p className="text-[11px] text-slate-400">
            Will send to <strong className="text-slate-700">{leadCount?.available ?? 0}</strong> leads
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={submitting}
              className="btn-gradient-success inline-flex items-center gap-2 rounded-lg px-5 py-2 text-[12px] font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Sending...
                </>
              ) : (
                <>
                  <IconSend />
                  Send Campaign
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

/* ── Campaign Detail Drawer ── */
interface DetailDrawerProps {
  campaign: EmailCampaign;
  onClose: () => void;
}

function CampaignDetailDrawer({ campaign, onClose }: DetailDrawerProps) {
  const { showToast } = useToast();
  const [tracking, setTracking] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/email/campaigns/${campaign.id}`, { headers: AUTH_HEADER() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { campaign?: EmailCampaign; tracking?: TrackingRow[] };
        setTracking(json.tracking ?? []);
      } catch (err) {
        showToast("error", err instanceof Error ? err.message : "Failed to load campaign details");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition"
            >
              <IconChevronLeft />
            </button>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900 line-clamp-1">{campaign.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusPill status={campaign.status} />
                {campaign.niche && (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                    {campaign.niche}
                  </span>
                )}
                {campaign.city && (
                  <span className="text-[11px] text-slate-400">{campaign.city}</span>
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
            <IconClose />
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50">
          {[
            { label: "Sent", value: campaign.sent ?? 0, color: "text-slate-800" },
            { label: "Opens", value: `${campaign.opens ?? 0} (${pct(campaign.opens, campaign.sent)}%)`, color: "text-emerald-600" },
            { label: "Clicks", value: `${campaign.clicks ?? 0} (${pct(campaign.clicks, campaign.sent)}%)`, color: "text-sky-600" },
            { label: "Bounced", value: campaign.bounced ?? 0, color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center py-3">
              <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tracking table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <svg className="h-8 w-8 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : tracking.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mx-auto mb-2"><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></div>
              <p className="text-[14px] font-semibold text-slate-500">No emails sent yet</p>
              <p className="text-[12px] text-slate-400">Send the campaign to see per-email tracking here</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-white border-b border-slate-100">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 pl-5 pr-3 text-left">Recipient</th>
                  <th className="px-3 py-3 text-left">Subject</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-center">Opens</th>
                  <th className="px-3 py-3 text-center">Clicks</th>
                  <th className="py-3 pl-3 pr-5 text-right">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tracking.map((row) => (
                  <tr key={row.id} className="group hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 pl-5 pr-3">
                      <p className="text-[12px] font-semibold text-slate-800 line-clamp-1">{row.business_name || row.recipient_email}</p>
                      {row.business_name && (
                        <p className="text-[11px] text-slate-400 truncate">{row.recipient_email}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-[140px]">
                      <p className="truncate text-[11px] text-slate-500">{row.subject ?? "-"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={row.status ?? "sent"} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.open_count > 0 ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Opens: {row.open_count}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {row.click_count > 0 ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                          Clicks: {row.click_count}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right text-[11px] text-slate-400 whitespace-nowrap">
                      {fmtTime(row.sent_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Campaign Card ── */
interface CampaignCardProps {
  campaign: EmailCampaign;
  onSend: (c: EmailCampaign) => void;
  onView: (c: EmailCampaign) => void;
  onDelete: (c: EmailCampaign) => void;
}

function CampaignCard({ campaign: c, onSend, onView, onDelete }: CampaignCardProps) {
  const sentVal = c.sent ?? 0;
  return (
    <article className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
              {c.name}
            </h3>
            <StatusPill status={c.status} />
            {c.niche && (
              <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-600 uppercase tracking-wide">
                {c.niche}
              </span>
            )}
            {c.sender_from_email ? (
              <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {c.sender_from_name || c.sender_from_email}
              </span>
            ) : (
              <span className="rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                Auto-Rotate
              </span>
            )}
          </div>
          {c.city && (
            <p className="mt-0.5 text-[11px] text-slate-400">{c.city}</p>
          )}
        </div>
        {/* Action buttons */}
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            title="Send Campaign"
            onClick={() => onSend(c)}
            disabled={c.status === "sending" || c.status === "running"}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <IconSend />
            <span className="hidden sm:inline">Send</span>
          </button>
          <button
            type="button"
            title="View Details"
            onClick={() => onView(c)}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100"
          >
            <IconEye />
            <span className="hidden sm:inline">View</span>
          </button>
          <button
            type="button"
            title="Delete Campaign"
            onClick={() => onDelete(c)}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 transition hover:bg-red-100"
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-4 gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
        <div className="text-center">
          <p className="text-[16px] font-bold tabular-nums text-slate-800">{sentVal.toLocaleString()}</p>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Sent</p>
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold tabular-nums text-emerald-600">
            {(c.opens ?? 0).toLocaleString()}
            <span className="ml-1 text-[10px] font-medium text-emerald-500">({pct(c.opens, sentVal)}%)</span>
          </p>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Opens</p>
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold tabular-nums text-sky-600">
            {(c.clicks ?? 0).toLocaleString()}
            <span className="ml-1 text-[10px] font-medium text-sky-500">({pct(c.clicks, sentVal)}%)</span>
          </p>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Clicks</p>
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold tabular-nums text-red-500">{(c.bounced ?? 0).toLocaleString()}</p>
          <p className="text-[10px] font-semibold uppercase text-slate-400">Bounced</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-slate-400">
          Created {fmtDate(c.created_at)}
          {c.daily_limit && (
            <span className="ml-2 text-slate-300">·</span>
          )}
          {c.daily_limit && (
            <span className="ml-2">
              <span className="font-medium text-slate-500">{c.daily_limit}</span>
              <span className="text-slate-400"> emails/day</span>
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

/* ── Delete Confirm Modal ── */
function DeleteConfirmModal({
  campaign,
  onClose,
  onConfirm,
  deleting,
}: {
  campaign: EmailCampaign;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">Delete Campaign</h3>
              <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-slate-700">"{campaign.name}"</span>?
                This action cannot be undone and all tracking data will be lost.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                Deleting...
              </>
            ) : (
              "Delete Campaign"
            )}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

/* ── Empty State ── */
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 px-8 text-center shadow-sm">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 text-4xl shadow-lg">
          
        </div>
        <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow-md">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
      </div>
      <h3 className="text-[18px] font-bold text-slate-800">No Campaigns Yet</h3>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-400">
        Create your first email campaign to start reaching out to leads in your niche. Set up targeting by city and business type.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="btn-gradient-primary mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[13px] font-bold text-white shadow-md"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Create First Campaign
      </button>
    </div>
  );
}

/* ── Main Page ── */
export function EmailCampaignsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterNiche, setFilterNiche] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [sendTarget, setSendTarget] = useState<EmailCampaign | null>(null);
  const [viewTarget, setViewTarget] = useState<EmailCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/campaigns", { headers: AUTH_HEADER() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { items?: EmailCampaign[] };
      setCampaigns(json.items ?? []);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  // Handle ?view=id from dashboard
  useEffect(() => {
    const viewId = searchParams.get("view");
    if (viewId && campaigns.length > 0) {
      const found = campaigns.find((c) => c.id === viewId);
      if (found) setViewTarget(found);
    }
  }, [searchParams, campaigns]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/email/campaigns/${deleteTarget.id}`, {
        method: "DELETE",
        headers: AUTH_HEADER(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("success", `Campaign "${deleteTarget.name}" deleted`);
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete campaign");
    } finally {
      setDeleting(false);
    }
  }

  // Filtered campaigns
  const filtered = campaigns.filter((c) => {
    if (filterNiche && c.niche !== filterNiche) return false;
    if (filterStatus && c.status?.toLowerCase() !== filterStatus.toLowerCase()) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !(c.city ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const STATUS_OPTIONS = ["draft", "sending", "complete", "paused", "failed", "queued", "running"];

  return (
    <section className="page-enter space-y-6">
      {/* ── Header ── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Email Campaigns</h2>
          <p className="mt-0.5 text-[13px] text-slate-400">
            {loading ? "Loading..." : `${campaigns.length} campaign${campaigns.length !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/email/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-gradient-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold text-white shadow-sm"
          >
            + New Campaign
          </button>
        </div>
      </header>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-[12px] text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
          />
        </div>
        {/* Niche filter */}
        <select
          value={filterNiche}
          onChange={(e) => setFilterNiche(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
        >
          <option value="">All Niches</option>
          {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
        {(filterNiche || filterStatus || searchQuery) && (
          <button
            type="button"
            onClick={() => { setFilterNiche(""); setFilterStatus(""); setSearchQuery(""); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Campaign Cards ── */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex justify-between">
                <div className="h-5 w-48 rounded bg-slate-100" />
                <div className="h-5 w-24 rounded bg-slate-100" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[1,2,3,4].map((j) => <div key={j} className="h-10 rounded bg-slate-100" />)}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        campaigns.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mx-auto mb-3"><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
            <p className="text-[14px] font-semibold text-slate-500">No campaigns match your filters</p>
            <button
              type="button"
              onClick={() => { setFilterNiche(""); setFilterStatus(""); setSearchQuery(""); }}
              className="mt-3 text-[12px] font-semibold text-indigo-600 hover:underline"
            >
              Clear all filters
            </button>
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {filtered.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onSend={setSendTarget}
              onView={setViewTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <CreateCampaignModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setCampaigns((prev) => [created, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
      {sendTarget && (
        <SendCampaignModal
          campaign={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={() => {
            setSendTarget(null);
            void loadCampaigns();
          }}
        />
      )}
      {viewTarget && (
        <CampaignDetailDrawer
          campaign={viewTarget}
          onClose={() => setViewTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          campaign={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
          deleting={deleting}
        />
      )}
    </section>
  );
}
