import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RatingStars } from "../components/ui/RatingStars";
import { QuickPitchModal } from "../components/QuickPitchModal";
import {
  API_BASE_URL,
  addLeadNote,
  convertLeadToClient,
  fetchLead,
  fetchSmtpAccounts,
  fetchSeoAudits,
  runAdvancedWebsiteAudit,
  runGmbAudit,
  sendDirectOutreachEmail,
  updateLead,
  type Lead,
  type SeoAudit,
  type SmtpAccount,
} from "../lib/api";

type LeadDetailResponse = Lead & {
  notes_log: Array<{ id: string; note: string; createdAt: string }>;
  activity_log: Array<{ id: string; type: string; message: string; createdAt: string }>;
};

const statusOptions = [
  "new",
  "contacted",
  "audit_sent",
  "proposal_sent",
  "negotiating",
  "closed_won",
  "closed_lost",
  "retained_client",
];

type AuditEmailDraft = {
  subject: string;
  body: string;
};

function formatAuditTypeLabel(auditType: string): string {
  if (auditType === "gmb") return "GMB";
  if (auditType === "website" || auditType === "eeat") return "Website";
  return "Website";
}

function collectRecommendations(audit: SeoAudit): string[] {
  const result = audit.result as unknown as Record<string, unknown>;
  const raw = result?.recommendations;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 4);
}

function collectIssueHeadlines(audit: SeoAudit): string[] {
  const result = audit.result as unknown as Record<string, unknown>;
  const raw = result?.issues;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }

      if (entry && typeof entry === "object") {
        const issue = entry as Record<string, unknown>;
        return String(issue.title || issue.detail || "").trim();
      }

      return "";
    })
    .filter(Boolean)
    .slice(0, 4);
}

function buildAuditEmailDraft(businessName: string, audit: SeoAudit): AuditEmailDraft {
  const scoreValue = audit.score == null ? "N/A" : String(audit.score);
  const subject = `${formatAuditTypeLabel(audit.audit_type)} Audit Report - ${businessName}`;
  const recommendations = collectRecommendations(audit);
  const issues = collectIssueHeadlines(audit);

  const lines = [
    `Hi ${businessName} Team,`,
    "",
    `Your ${formatAuditTypeLabel(audit.audit_type)} audit report is ready.`,
    `Score: ${scoreValue}`,
    `Verdict: ${audit.verdict || "N/A"}`,
    "",
    "Summary:",
    audit.summary || "Audit completed successfully.",
    "",
    "Top issues identified:",
    ...(issues.length > 0 ? issues.map((item) => `- ${item}`) : ["- No major issues flagged."]),
    "",
    "Recommended action plan:",
    ...(recommendations.length > 0
      ? recommendations.map((item) => `- ${item}`)
      : ["- Detailed recommendations are available in the attached audit report."]),
    "",
    "Best regards,",
    "SMBify Growth Team",
  ];

  return {
    subject,
    body: lines.join("\n"),
  };
}

export function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<LeadDetailResponse | null>(null);
  const [auditReports, setAuditReports] = useState<SeoAudit[]>([]);
  const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccount[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditBusy, setAuditBusy] = useState<"gmb" | "website" | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailTargetAudit, setEmailTargetAudit] = useState<SeoAudit | null>(null);
  const [showQuickPitchModal, setShowQuickPitchModal] = useState(false);
  const [emailForm, setEmailForm] = useState({
    smtpAccountId: "",
    to: "",
    subject: "",
    body: "",
  });
  const [auditStatus, setAuditStatus] = useState("");
  const [auditError, setAuditError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadSmtpAccountOptions(): Promise<void> {
    try {
      const result = await fetchSmtpAccounts();
      setSmtpAccounts(result.items);
      setEmailForm((current) => ({
        ...current,
        smtpAccountId:
          current.smtpAccountId ||
          result.items.find((item) => item.is_active)?.id ||
          result.items[0]?.id ||
          "",
      }));
    } catch {
      setSmtpAccounts([]);
    }
  }

  async function loadLead(): Promise<void> {
    if (!leadId) return;
    setError("");
    setAuditError("");
    setAuditLoading(true);

    try {
      const [leadResult, auditsResult] = await Promise.allSettled([
        fetchLead(leadId),
        fetchSeoAudits({ leadId, limit: 30 }),
      ]);

      if (leadResult.status === "rejected") {
        throw leadResult.reason;
      }

      setData(leadResult.value as LeadDetailResponse);

      if (auditsResult.status === "fulfilled") {
        setAuditReports(auditsResult.value.items);
      } else {
        setAuditReports([]);
        setAuditError(auditsResult.reason instanceof Error ? auditsResult.reason.message : "Failed to load audits");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lead");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    void loadLead();
  }, [leadId]);

  useEffect(() => {
    void loadSmtpAccountOptions();
  }, []);

  async function saveLead(): Promise<void> {
    if (!leadId || !data) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await updateLead(leadId, data as unknown as Record<string, unknown>);
      setMessage("Lead updated successfully.");
      await loadLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lead");
    } finally {
      setSaving(false);
    }
  }

  async function saveNote(): Promise<void> {
    if (!leadId || !noteInput.trim()) return;
    setSaving(true);
    try {
      await addLeadNote(leadId, noteInput.trim());
      setNoteInput("");
      await loadLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  }

  async function runQuickAction(action: string, status?: string): Promise<void> {
    if (!leadId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, status, message: `Action fired from lead detail: ${action}` }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      setMessage(`Action executed: ${action}`);
      await loadLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to execute ${action}`);
    }
  }

  async function downloadProposal(): Promise<void> {
    if (!leadId || !data) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/leads/${leadId}/proposal/download`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("smbify_token")}`
        }
      });
      if (!res.ok) throw new Error("Proposal download failed.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Proposal_${data.business_name.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMessage("Word Proposal generated and downloaded successfully.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertToClient(): Promise<void> {
    if (!leadId || !data) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await convertLeadToClient(leadId);
      setMessage(res.message || "Lead converted to SEO client!");
      navigate(`/seo/clients/${res.clientId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert lead to SEO client");
    } finally {
      setSaving(false);
    }
  }

  async function runLeadAudit(auditType: "gmb" | "website"): Promise<void> {
    if (!leadId || !data) return;

    setAuditBusy(auditType);
    setError("");
    setMessage("");
    setAuditStatus(`Running ${formatAuditTypeLabel(auditType)} audit in background...`);

    try {
      if (auditType === "gmb") {
        const audit = await runGmbAudit({
          lead_id: leadId,
          business_name: data.business_name,
          city: data.city || undefined,
          state: data.state || undefined,
          website: data.website || undefined,
          gmb_url: data.gmb_url || undefined,
          gmb_claimed: Boolean(data.gmb_claimed),
          gmb_rating: data.gmb_rating,
          gmb_review_count: data.gmb_review_count,
          gmb_profile_incomplete: Boolean(data.gmb_profile_incomplete),
          citations_found: Boolean(data.citations_found),
          phone: data.phone || undefined,
          email: data.email || undefined,
        });

        const scoreText = audit.score == null ? "N/A" : String(audit.score);
        setAuditStatus(`GMB audit completed. Score: ${scoreText}`);
      } else {
        const website = String(data.website || "").trim();
        if (!website) {
          throw new Error("Website URL is required. Please add and save a website URL before running the audit.");
        }

        const result = await runAdvancedWebsiteAudit({
          lead_id: leadId,
          business_name: data.business_name,
          city: data.city || undefined,
          state: data.state || undefined,
          website,
          maxPages: 10,
        });

        const scoreText = result.audit.score == null ? "N/A" : String(result.audit.score);
        setAuditStatus(`Website audit completed. Score: ${scoreText}`);
      }

      setMessage("Audit report successfully saved to lead profile.");
      await loadLead();
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Failed to run audit";
      setError(messageText);
      setAuditStatus(`${formatAuditTypeLabel(auditType)} audit failed: ${messageText}`);
    } finally {
      setAuditBusy(null);
    }
  }

  function openAuditEmailModal(audit: SeoAudit): void {
    if (!data) return;

    const draft = buildAuditEmailDraft(data.business_name, audit);
    setEmailTargetAudit(audit);
    setEmailForm((current) => ({
      smtpAccountId:
        current.smtpAccountId ||
        smtpAccounts.find((item) => item.is_active)?.id ||
        smtpAccounts[0]?.id ||
        "",
      to: data.email || "",
      subject: draft.subject,
      body: draft.body,
    }));
    setEmailModalOpen(true);
  }

  function closeAuditEmailModal(): void {
    if (emailSending) {
      return;
    }

    setEmailModalOpen(false);
    setEmailTargetAudit(null);
  }

  async function sendAuditEmailFromModal(): Promise<void> {
    if (!leadId || !emailTargetAudit) {
      return;
    }

    const to = emailForm.to.trim();
    const subject = emailForm.subject.trim();
    const body = emailForm.body.trim();

    if (!emailForm.smtpAccountId) {
      setError("Please select an active SMTP sender account.");
      return;
    }

    if (!to || !subject || !body) {
      setError("Recipient email, subject, and message body are required.");
      return;
    }

    setEmailSending(true);
    setError("");
    setMessage("");

    try {
      await sendDirectOutreachEmail({
        smtpAccountId: emailForm.smtpAccountId,
        to,
        subject,
        body,
        leadId,
        auditId: emailTargetAudit.id,
      });

      setMessage(`Report email queued for ${to}.`);
      setEmailModalOpen(false);
      setEmailTargetAudit(null);
      await loadLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send report email");
    } finally {
      setEmailSending(false);
    }
  }

  if (!data) {
    return (
      <section className="page-enter">
        <Link to="/leads" className="text-[13px] text-slate-600 underline">
          Back to leads
        </Link>
        <p className="mt-4 text-slate-600">Loading lead details...</p>
      </section>
    );
  }

  return (
    <section className="page-enter space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/leads" className="text-[13px] text-slate-600 underline">
            Back to leads
          </Link>
          <h2 className="text-2xl font-semibold text-slate-900">{data.business_name}</h2>
          <p className="text-[13px] text-slate-600">Lead detail, notes, and activity thread.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleConvertToClient()}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
            title="Convert this lead into a retained SEO client project"
          >
            Convert to Client
          </button>
          <button
            type="button"
            onClick={() => void downloadProposal()}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            Export Proposal
          </button>
          <button
            type="button"
            onClick={() => setShowQuickPitchModal(true)}
            className="rounded-lg bg-[#5e6ad2] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#4e5abc] flex items-center gap-1.5 shadow-sm transition"
            title="Draft and send a 1-click personalized pitch email via SMTP"
          >
            <span>Draft Outreach Pitch</span>
            <span>✉</span>
          </button>
          <button type="button" onClick={async () => { const response = await fetch(`/api/share/pitch/${leadId}`); const payload = await response.json(); if (response.ok) window.open(payload.url, "_blank", "noopener,noreferrer"); }} className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-[13px] font-medium text-[#5e6ad2] hover:bg-indigo-50 flex items-center gap-1.5">Pitch Portal</button>
          <button
            type="button"
            onClick={() => void saveLead()}
            disabled={saving}
            className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4e5abc] disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </header>

      {message && <p className="rounded-lg bg-emerald-50 p-3 text-[13px] text-emerald-700">{message}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <article className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">Lead Information</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={data.business_name || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, business_name: event.target.value } : prev))}
              placeholder="Business name"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.niche || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, niche: event.target.value } : prev))}
              placeholder="Niche"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.phone || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, phone: event.target.value } : prev))}
              placeholder="Phone"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.email || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, email: event.target.value } : prev))}
              placeholder="Email"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.website || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, website: event.target.value } : prev))}
              placeholder="Website"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <select
              value={data.status || "new"}
              onChange={(event) => setData((prev) => (prev ? { ...prev, status: event.target.value } : prev))}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <input
              value={data.city || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, city: event.target.value } : prev))}
              placeholder="City"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.state || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, state: event.target.value } : prev))}
              placeholder="State"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.zip || ""}
              onChange={(event) => setData((prev) => (prev ? { ...prev, zip: event.target.value } : prev))}
              placeholder="ZIP"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.gmb_rating ?? ""}
              onChange={(event) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        gmb_rating:
                          event.target.value === "" ? null : Number(event.target.value),
                      }
                    : prev
                )
              }
              placeholder="GMB Rating"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <input
              value={data.gmb_review_count ?? ""}
              onChange={(event) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        gmb_review_count:
                          event.target.value === "" ? null : Number(event.target.value),
                      }
                    : prev
                )
              }
              placeholder="Review count"
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(data.has_website)}
                onChange={(event) =>
                  setData((prev) => (prev ? { ...prev, has_website: event.target.checked } : prev))
                }
              />
              Has Website
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(data.gmb_claimed)}
                onChange={(event) =>
                  setData((prev) => (prev ? { ...prev, gmb_claimed: event.target.checked } : prev))
                }
              />
              GMB Claimed
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(data.gmb_profile_incomplete)}
                onChange={(event) =>
                  setData((prev) =>
                    prev ? { ...prev, gmb_profile_incomplete: event.target.checked } : prev
                  )
                }
              />
              Profile Incomplete
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(data.citations_found)}
                onChange={(event) =>
                  setData((prev) => (prev ? { ...prev, citations_found: event.target.checked } : prev))
                }
              />
              Citations Found
            </label>
          </div>

          <textarea
            value={data.address || ""}
            onChange={(event) => setData((prev) => (prev ? { ...prev, address: event.target.value } : prev))}
            placeholder="Address"
            rows={2}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
          />

          <textarea
            value={data.notes || ""}
            onChange={(event) => setData((prev) => (prev ? { ...prev, notes: event.target.value } : prev))}
            placeholder="Internal notes"
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runLeadAudit("gmb")}
              disabled={auditBusy !== null}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold"
            >
              {auditBusy === "gmb" ? "Running GMB..." : "Run GMB Audit"}
            </button>
            <Link
              to={`/audit-tools/gmb?leadId=${encodeURIComponent(data.id)}&advanced=true`}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-800 flex items-center gap-1.5 hover:bg-emerald-100/70"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Deep AI GMB Optimizer
            </Link>
            <button
              type="button"
              onClick={() => void runLeadAudit("website")}
              disabled={auditBusy !== null}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold"
            >
              {auditBusy === "website" ? "Running Website..." : "Run Website Audit"}
            </button>
            <Link
              to="/outreach/campaigns"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold"
            >
              Add to Campaign
            </Link>
            <button
              type="button"
              onClick={() => void runQuickAction("send_email", "contacted")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold"
            >
              Send Email
            </button>
          </div>

          {auditStatus && <p className="text-[12px] text-slate-500">{auditStatus}</p>}

          <div className="border-t border-slate-100 pt-5 mt-5">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
              Sales Prep Battle Card
            </h3>
            <SalesPrepCard leadId={leadId!} />
          </div>
        </article>

        <aside className="space-y-4">
          {/* Lead Score Card */}
          {(() => {
            const score = data.lead_score ?? 0;
            const temp = score >= 70 ? "Hot" : score >= 40 ? "Warm" : "Cold";
            const tempColors =
              temp === "Hot"
                ? { text: "text-red-700", border: "border-red-200", bg: "bg-red-50", icon: "", badge: "border-red-300" }
                : temp === "Warm"
                  ? { text: "text-amber-700", border: "border-amber-200", bg: "bg-amber-50", icon: "", badge: "border-amber-300" }
                  : { text: "text-slate-500", border: "border-slate-200", bg: "bg-slate-50", icon: "", badge: "border-slate-300" };

            const contactPoints = (data.email ? 20 : 0) + (data.phone ? 10 : 0);

            let websitePoints = 0;
            let websiteReason = "";
            const hasWebsite = Boolean(data.website && String(data.website).trim() !== "") || data.has_website === true;
            if (!hasWebsite) {
              websitePoints = 35;
              websiteReason = "No website found (High redesign potential)";
            } else if (data.last_website_audit_score !== null && data.last_website_audit_score !== undefined) {
              const s = data.last_website_audit_score;
              if (s < 60) {
                websitePoints = 25;
                websiteReason = `Website needs urgent optimization (Score: ${s})`;
              } else if (s < 80) {
                websitePoints = 15;
                websiteReason = `Website has optimization potential (Score: ${s})`;
              } else {
                websitePoints = 0;
                websiteReason = `Website is already well optimized (Score: ${s})`;
              }
            } else {
              websitePoints = 15;
              websiteReason = "Website exists but not yet audited";
            }

            let gmbPoints = 0;
            let gmbReason = "";
            if (data.last_gmb_audit_score !== null && data.last_gmb_audit_score !== undefined) {
              const s = data.last_gmb_audit_score;
              if (s < 60) {
                gmbPoints = 25;
                gmbReason = `GBP needs urgent optimization (Score: ${s})`;
              } else if (s <= 82) {
                gmbPoints = 15;
                gmbReason = `GBP has optimization potential (Score: ${s})`;
              } else {
                gmbPoints = 0;
                gmbReason = `GBP is well optimized (Score: ${s})`;
              }
            } else {
              const reasons: string[] = [];
              const hasGmb = Boolean(data.gmb_url && String(data.gmb_url).trim() !== "");
              if (!data.gmb_claimed && hasGmb) {
                gmbPoints += 15;
                reasons.push("GMB unclaimed");
              }
              if (data.gmb_rating !== null && data.gmb_rating !== undefined && data.gmb_rating > 0) {
                if (data.gmb_rating < 4.2) {
                  gmbPoints += 10;
                  reasons.push(`Low rating (${data.gmb_rating})`);
                } else if (data.gmb_rating < 4.5) {
                  gmbPoints += 5;
                  reasons.push(`Moderate rating (${data.gmb_rating})`);
                }
              }
              if (data.gmb_review_count !== null && data.gmb_review_count !== undefined && data.gmb_review_count < 20) {
                gmbPoints += 5;
                reasons.push(`Low reviews (${data.gmb_review_count})`);
              }
              if (data.gmb_profile_incomplete) {
                gmbPoints += 5;
                reasons.push("Profile incomplete");
              }
              if (!data.citations_found) {
                gmbPoints += 5;
                reasons.push("Weak citations");
              }
              gmbPoints = Math.min(35, gmbPoints);
              gmbReason = reasons.length > 0 ? `GBP heuristics: ${reasons.join(", ")}` : "No GBP deficiency found";
            }

            return (
              <article className="rounded-lg border border-slate-200 bg-white p-5 space-y-4" style={{ backgroundColor: "var(--bg-card)" }}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3" style={{ borderColor: "var(--border-primary)" }}>
                  <h3 className="font-semibold text-slate-900">Outreach Priority Score</h3>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${tempColors.badge} ${tempColors.bg} ${tempColors.text}`}>
                    <span>{tempColors.icon}</span>
                    <span>{temp} Lead</span>
                  </span>
                </div>

                <div className="flex items-center gap-4 py-1">
                  <div className="relative flex h-16 w-16 items-center justify-center">
                    <svg className="h-full w-full -rotate-90">
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className="stroke-slate-100 fill-none"
                        strokeWidth="5"
                      />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className={
                          temp === "Hot"
                            ? "stroke-red-500 fill-none"
                            : temp === "Warm"
                              ? "stroke-amber-500 fill-none"
                              : "stroke-slate-400 fill-none"
                        }
                        strokeWidth="5"
                        strokeDasharray={2 * Math.PI * 28}
                        strokeDashoffset={2 * Math.PI * 28 * (1 - score / 100)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-sm font-bold text-slate-800">{score}</span>
                  </div>

                  <div className="flex-1 space-y-0.5">
                    <p className="text-[14px] font-semibold text-slate-800">
                      {temp === "Hot"
                        ? "Excellent Outreach Opportunity"
                        : temp === "Warm"
                          ? "Good Outreach Opportunity"
                          : "Low Priority Candidate"}
                    </p>
                    <p className="text-[11.5px] text-slate-500">
                      Overall priority score is {score}/100.
                    </p>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-[12px]" style={{ backgroundColor: "var(--bg-slate-50)" }}>
                  <p className="font-semibold text-slate-700">Point Breakdown</p>
                  
                  <div className="space-y-1.5 divide-y divide-slate-100" style={{ borderColor: "var(--border-primary)" }}>
                    <div className="flex items-start justify-between pt-0.5">
                      <div className="space-y-0.5">
                        <span className="font-medium text-slate-800">Contactability</span>
                        <p className="text-[11px] text-slate-500">
                          {[
                            data.email && "Email (+20)",
                            data.phone && "Phone (+10)",
                            !data.email && !data.phone && "No contact info found (0)"
                          ].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <span className="font-semibold text-slate-700">+{contactPoints} / 30</span>
                    </div>

                    <div className="flex items-start justify-between pt-1.5">
                      <div className="space-y-0.5">
                        <span className="font-medium text-slate-800">Website Opportunity</span>
                        <p className="text-[11px] text-slate-500">{websiteReason}</p>
                      </div>
                      <span className="font-semibold text-slate-700">+{websitePoints} / 35</span>
                    </div>

                    <div className="flex items-start justify-between pt-1.5">
                      <div className="space-y-0.5">
                        <span className="font-medium text-slate-800">GBP Opportunity</span>
                        <p className="text-[11px] text-slate-500">{gmbReason}</p>
                      </div>
                      <span className="font-semibold text-slate-700">+{gmbPoints} / 35</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 space-y-1" style={{ backgroundColor: "var(--bg-indigo-50)" }}>
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-indigo-900">
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#5e6ad2]" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14h-2v-6h2zm0-8h-2V7h2z"/>
                    </svg>
                    <span>Outreach Advice</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-indigo-950">
                    {(() => {
                      if (!data.email && !data.phone) {
                        return "No contact info available. Try finding a contact email on social profiles before launching outreach.";
                      }
                      if (!data.gmb_claimed && data.gmb_url) {
                        return "Pitch GMB Claiming Services. This business profile is unclaimed. Claiming it for them builds quick trust before introducing higher-ticket website packages.";
                      }
                      if (!hasWebsite) {
                        return "Pitch Web Design. The business lacks a website. Present a modern web design template tailored to their niche to win the client.";
                      }
                      if (data.last_website_audit_score !== null && data.last_website_audit_score !== undefined && data.last_website_audit_score < 60) {
                        return "Pitch SEO & Speed. Their site scored below 60. Share exact audit findings such as slow loading speeds or SEO issues to demonstrate value.";
                      }
                      if (data.gmb_rating !== null && data.gmb_rating < 4.2) {
                        return "Pitch Reputation Management. Average rating is under 4.2. Present reviews generation workflow to boost trust and improve ranking.";
                      }
                      if (data.gmb_review_count !== null && data.gmb_review_count < 20) {
                        return "Pitch Review Generation. Lead has under 20 reviews. Recommend a compliant customer feedback process that asks for honest reviews and tracks response rates.";
                      }
                      if (score >= 70) {
                        return "Highly recommended target! Good contact details coupled with optimization deficiencies provides solid outreach leverage.";
                      }
                      return "Low priority target. The business is already highly optimized. Check for other local targets in this niche.";
                    })()}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowQuickPitchModal(true)}
                    className="mt-2.5 w-full rounded-lg bg-[#5e6ad2] hover:bg-[#4e5abc] py-2 text-xs font-bold text-white transition shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>Draft & Send Outreach Pitch</span>
                    <span>→</span>
                  </button>
                </div>
              </article>
            );
          })()}

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Add Note</h3>
            <textarea
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              rows={3}
              placeholder="Write note..."
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            />
            <button
              type="button"
              disabled={saving || !noteInput.trim()}
              onClick={() => void saveNote()}
              className="mt-2 rounded-lg bg-[#5e6ad2] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#4e5abc] disabled:opacity-50"
            >
              Save Note
            </button>

            <div className="mt-3 space-y-2 text-[13px]">
              {data.notes_log?.map((note) => (
                <div key={note.id} className="rounded-lg bg-slate-50 p-2">
                  <p className="text-slate-800">{note.note}</p>
                  <p className="text-[12px] text-slate-500">{new Date(note.createdAt).toLocaleString()}</p>
                </div>
              ))}
              {!data.notes_log?.length && <p className="text-slate-500">No notes yet.</p>}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Audit Reports</h3>
              <button
                type="button"
                onClick={() => void loadLead()}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700"
              >
                Refresh
              </button>
            </div>

            {auditError && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[12px] text-red-700">{auditError}</p>}

            <div className="mt-3 space-y-2 text-[13px]">
              {auditLoading ? (
                <p className="text-slate-500">Loading reports...</p>
              ) : auditReports.length === 0 ? (
                <p className="text-slate-500">No audit reports yet.</p>
              ) : (
                auditReports.map((audit) => {
                  const scoreText = audit.score == null ? "N/A" : String(audit.score);
                  const targetAuditPath =
                    audit.audit_type === "gmb"
                      ? `/audit-tools/gmb?tab=gmb&leadId=${encodeURIComponent(data.id)}`
                      : `/audit-tools/website?leadId=${encodeURIComponent(data.id)}`;
                  return (
                    <div key={audit.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-800">
                          {formatAuditTypeLabel(audit.audit_type)} Audit &middot; Score {scoreText}
                        </p>
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {audit.verdict || "completed"}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-slate-500">{new Date(audit.created_at).toLocaleString()}</p>
                      <p className="mt-1 text-[12px] text-slate-600">{audit.summary || "Detailed findings available in audit workspace."}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Link
                          to={targetAuditPath}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Open Report
                        </Link>
                        <button
                          type="button"
                          onClick={() => openAuditEmailModal(audit)}
                          className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800"
                        >
                          Email Report
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-900">Activity Log</h3>
            <div className="mt-2 space-y-2 text-[13px]">
              {data.activity_log?.map((activity) => (
                <div key={activity.id} className="rounded-lg bg-slate-50 p-2">
                  <p className="font-medium text-slate-800">{activity.message}</p>
                  <p className="text-[12px] text-slate-500">{new Date(activity.createdAt).toLocaleString()}</p>
                </div>
              ))}
              {!data.activity_log?.length && <p className="text-slate-500">No activity yet.</p>}
            </div>
          </article>
        </aside>
      </div>

      {emailModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5" style={{ backgroundColor: "var(--bg-card)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Send Audit Report</h3>
                <p className="mt-1 text-[13px] text-slate-600">Lead page se direct SMTP send. Subject/body edit karke bhej sakte hain.</p>
              </div>
              {emailTargetAudit && (
                <span className="rounded bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">
                  {formatAuditTypeLabel(emailTargetAudit.audit_type)}
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[13px] text-slate-700 sm:col-span-2">
                <span className="font-medium">SMTP Account</span>
                <select
                  value={emailForm.smtpAccountId}
                  onChange={(event) => setEmailForm((current) => ({ ...current, smtpAccountId: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                >
                  <option value="">Select SMTP account</option>
                  {smtpAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} {account.is_active ? "(active)" : "(inactive)"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-[13px] text-slate-700 sm:col-span-2">
                <span className="font-medium">To</span>
                <input
                  type="email"
                  value={emailForm.to}
                  onChange={(event) => setEmailForm((current) => ({ ...current, to: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                  placeholder="client@email.com"
                />
              </label>

              <label className="space-y-1 text-[13px] text-slate-700 sm:col-span-2">
                <span className="font-medium">Subject</span>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(event) => setEmailForm((current) => ({ ...current, subject: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </label>

              <label className="space-y-1 text-[13px] text-slate-700 sm:col-span-2">
                <span className="font-medium">Body</span>
                <textarea
                  value={emailForm.body}
                  onChange={(event) => setEmailForm((current) => ({ ...current, body: event.target.value }))}
                  rows={10}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                />
              </label>
            </div>

            {smtpAccounts.length === 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Koi SMTP account configured nahi hai. Settings me SMTP add karein phir yahan se direct send karein.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAuditEmailModal}
                disabled={emailSending}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void sendAuditEmailFromModal()}
                disabled={emailSending}
                className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4e5abc] disabled:opacity-50"
              >
                {emailSending ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Quick Pitch Modal */}
      <QuickPitchModal
        lead={data}
        isOpen={showQuickPitchModal}
        onClose={() => setShowQuickPitchModal(false)}
        onSent={() => void loadLead()}
      />
    </section>
  );
}

function SalesPrepCard({ leadId }: { leadId: string }) {
  const [loading, setLoading] = useState(true);
  const [prepData, setPrepData] = useState<any>(null);

  useEffect(() => {
    async function loadPrep() {
      try {
        const res = await fetch(`/api/leads/${leadId}/sales-prep`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("smbify_token")}`
          }
        });
        if (res.ok) {
          const json = await res.json();
          setPrepData(json);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadPrep();
  }, [leadId]);

  if (loading) {
    return <p className="text-xs text-slate-500">Loading sales battle cards...</p>;
  }
  if (!prepData) return null;

  return (
    <div className="space-y-4">
      {/* Competitor Stats */}
      <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500">Local Competitors</span>
          <p className="text-sm font-bold text-slate-800">{prepData.competitorsCount} in city</p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-500">Avg GMB Rating</span>
          <div className="mt-0.5">
            <RatingStars rating={prepData.avgRating} size="xs" />
          </div>
        </div>
      </div>

      {/* Pricing Packages */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-600 uppercase">Recommended Packages</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {prepData.packages.map((pkg: any, idx: number) => (
            <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-white">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-xs text-slate-850">{pkg.name}</span>
                <span className="text-[11px] font-bold text-[#5e6ad2]">{pkg.price}</span>
              </div>
              <ul className="text-[10.5px] text-slate-500 list-disc list-inside space-y-0.5">
                {pkg.features.map((f: string, fidx: number) => (
                  <li key={fidx}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Objection Handling */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-600 uppercase font-semibold">Objection Handling Cards</h4>
        <div className="space-y-2.5">
          {prepData.objections.map((obj: any, idx: number) => (
            <div key={idx} className="p-3 rounded-lg bg-[#5e6ad2]/5 border border-[#5e6ad2]/10 space-y-1">
              <p className="text-xs font-bold text-[#5e6ad2]">Objection: "{obj.objection}"</p>
              <p className="text-[11px] leading-relaxed text-slate-650 font-medium">{obj.response}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
