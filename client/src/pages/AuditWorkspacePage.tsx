import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { generateAuditPdf } from "../components/PdfAuditReport";
import { AiAuditPage } from "../components/AiAuditPage";
import { GeoGridHeatmap, generateEstimatedGeoGrid } from "../components/GeoGridHeatmap";
import { RatingStars } from "../components/ui/RatingStars";
import { QuickPitchModal } from "../components/QuickPitchModal";
import {
  API_BASE_URL,
  fetchLeads,
  fetchSeoAudits,
  fetchSeoBusinesses,
  generateAuditAiReport,
  runGmbAudit,
  runAdvancedGmbAudit,
  type Lead,
  type SeoAudit,
  type SeoBusiness,
} from "../lib/api";

type LocalAuditTab = "profile" | "ai-local";
type LocalAiType = "local-seo" | "competitor-mappack";

type GmbFormState = {
  lead_id: string;
  business_id: string;
  business_name: string;
  city: string;
  state: string;
  website: string;
  gmb_url: string;
  gmb_claimed: string;
  gmb_rating: string;
  gmb_review_count: string;
  gmb_profile_incomplete: string;
  citations_found: string;
  phone: string;
  email: string;
};

const emptyGmbForm: GmbFormState = {
  lead_id: "",
  business_id: "",
  business_name: "",
  city: "",
  state: "",
  website: "",
  gmb_url: "",
  gmb_claimed: "",
  gmb_rating: "",
  gmb_review_count: "",
  gmb_profile_incomplete: "",
  citations_found: "",
  phone: "",
  email: "",
};

const AI_LOCAL_CONFIGS = [
  {
    type: "local-seo" as const,
    label: "Local Presence & NAP",
    description: "AI analysis of NAP consistency, local keywords, geo-targeting, service area pages, local schema, and map signals.",
    section: "Local Presence",
  },
  {
    type: "competitor-mappack" as const,
    label: "Competitor Map Pack",
    description: "Compare map pack rankings, GMB optimization, review velocity, and local citation coverage vs a competitor.",
    section: "Competitor Analysis",
    isCompetitor: true,
  },
];

export function AuditWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [businesses, setBusinesses] = useState<SeoBusiness[]>([]);
  const [audits, setAudits] = useState<SeoAudit[]>([]);
  const [gmbForm, setGmbForm] = useState<GmbFormState>(emptyGmbForm);
  const [latestAudit, setLatestAudit] = useState<SeoAudit | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDetailedView, setIsDetailedView] = useState(false); // Default to simple AI view!
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [serviceType, setServiceType] = useState("Plumbing");
  const [pitchModalLead, setPitchModalLead] = useState<any>(null);
  const [showPitchModal, setShowPitchModal] = useState(false);

  const activeTab = searchParams.get("tab") === "ai-local" ? "ai-local" : "profile";

  const rawType = searchParams.get("type");
  const selectedAiType = useMemo<LocalAiType>(() => {
    if (!rawType) return "local-seo";
    if (rawType === "competitor" || rawType === "competitor-mappack") return "competitor-mappack";
    return "local-seo";
  }, [rawType]);

  const handleTabChange = (tab: LocalAuditTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      if (tab === "profile") {
        next.delete("type");
      } else {
        next.set("type", selectedAiType);
      }
      return next;
    });
  };

  const handleAiTypeChange = (type: LocalAiType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("type", type);
      return next;
    });
  };

  async function loadWorkspace(): Promise<void> {
    setError("");
    try {
      const [leadData, businessData, auditData] = await Promise.all([
        fetchLeads({ page: 1, pageSize: 200 }),
        fetchSeoBusinesses(),
        fetchSeoAudits({ limit: 30 }),
      ]);

      setLeads(leadData.items);
      setBusinesses(businessData.items);
      setAudits(auditData.items);

      const gmbAudits = auditData.items.filter((a) => a.audit_type === "gmb" || a.audit_type === "gmb_advanced");
      if (gmbAudits.length > 0) {
        setLatestAudit((current) => current || gmbAudits[0] || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit workspace");
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  const filteredAudits = useMemo(
    () => audits.filter((audit) => audit.audit_type === "gmb" || audit.audit_type === "gmb_advanced"),
    [audits]
  );

  const currentAudit = useMemo(() => {
    if (latestAudit && (latestAudit.audit_type === "gmb" || latestAudit.audit_type === "gmb_advanced")) {
      return latestAudit;
    }
    return filteredAudits[0] || null;
  }, [filteredAudits, latestAudit]);

  const currentAuditLensCards = currentAudit?.ai_insights
    ? [
        ["Technical View", currentAudit.ai_insights.technicalView],
        ["Content View", currentAudit.ai_insights.contentView],
        ["Trust View", currentAudit.ai_insights.trustView],
        ["UX View", currentAudit.ai_insights.uxView],
        ["Visibility View", currentAudit.ai_insights.visibilityView],
        ["Conversion View", currentAudit.ai_insights.conversionView],
        ["Owner View", currentAudit.ai_insights.ownerView],
        ["Customer View", currentAudit.ai_insights.customerView],
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    : [];

  const parsedAiInsights = useMemo(() => {
    if (currentAudit?.ai_insights) {
      return currentAudit.ai_insights;
    }

    if (!currentAudit || !currentAudit.result) {
      return null;
    }

    const result = currentAudit.result as any;

    if (result.is_advanced) {
      const issues = (result.gmb_audit?.issues || []).map((iss: string) => iss);
      const suggestions = (result.gmb_audit?.suggestions || []).map((sug: string) => sug);
      return {
        headline: `Deep GMB Optimization Catalog for ${currentAudit.target_name}`,
        executiveSummary: result.gmb_audit?.summary || "Advanced AI optimization catalog generated.",
        priorityActions: issues.slice(0, 3),
        quickWins: suggestions.slice(0, 3),
        nextStepCta: "Use the download buttons above to download the XLSX Catalog and DOCX Master Report.",
      };
    }

    const issues = result.issues || [];
    const highIssues = issues.filter((i: any) => i.severity === "high").map((i: any) => i.title);
    const lowIssues = issues.filter((i: any) => i.severity !== "high").map((i: any) => i.title);
    const hasIssues = issues.length > 0;

    return {
      headline: `GBP Audit Summary for ${currentAudit.target_name}`,
      executiveSummary: result.summary || currentAudit.score == null ? "No measured profile score is available. Review the evidence status for each check." : `The Google Business Profile audit completed with a measured score of ${currentAudit.score}/100 and verdict "${currentAudit.verdict}".`,
      priorityActions: hasIssues ? highIssues.slice(0, 3) : ["No high-priority issue was verified from the available evidence."],
      quickWins: result.wins && result.wins.length > 0 ? result.wins.slice(0, 3) : (hasIssues ? lowIssues.slice(0, 3) : ["No additional verified win was returned by the audit."]),
      nextStepCta: "Review the detailed specifications below or enhance this report with AI insights.",
    };
  }, [currentAudit]);

  const geoGridData = useMemo(() => {
    if (!currentAudit) return null;
    const sig = (currentAudit.result as any)?.signals;
    return generateEstimatedGeoGrid(
      currentAudit.target_name,
      serviceType || "Local Service",
      gmbForm.city || "Local Market",
      sig?.rating,
      sig?.reviewCount
    );
  }, [currentAudit, serviceType, gmbForm.city]);


  function mapLeadToGmbForm(lead: Lead): GmbFormState {
    return {
      lead_id: lead.id,
      business_id: "",
      business_name: lead.business_name,
      city: lead.city,
      state: lead.state,
      website: lead.website,
      gmb_url: lead.gmb_url,
      gmb_claimed: String(lead.gmb_claimed),
      gmb_rating: lead.gmb_rating === null ? "" : String(lead.gmb_rating),
      gmb_review_count: lead.gmb_review_count === null ? "" : String(lead.gmb_review_count),
      gmb_profile_incomplete: String(lead.gmb_profile_incomplete),
      citations_found: String(lead.citations_found),
      phone: lead.phone,
      email: lead.email,
    };
  }

  function applyLeadToGmb(leadId: string): void {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    setGmbForm(mapLeadToGmbForm(lead));
    if (lead.niche) {
      setServiceType(lead.niche);
    }
  }

  function applyBusinessToGmb(businessId: string): void {
    const business = businesses.find((item) => item.id === businessId);
    if (!business) return;

    const lead = leads.find((item) => item.id === business.lead_id);
    setGmbForm({
      lead_id: lead?.id || business.lead_id,
      business_id: business.id,
      business_name: business.name,
      city: business.city,
      state: business.state,
      website: business.website,
      gmb_url: business.gmb_url,
      gmb_claimed: lead ? String(lead.gmb_claimed) : "",
      gmb_rating: lead?.gmb_rating === null || lead?.gmb_rating === undefined ? "" : String(lead.gmb_rating),
      gmb_review_count:
        lead?.gmb_review_count === null || lead?.gmb_review_count === undefined ? "" : String(lead.gmb_review_count),
      gmb_profile_incomplete: lead ? String(lead.gmb_profile_incomplete) : "",
      citations_found: lead ? String(lead.citations_found) : "",
      phone: lead?.phone || "",
      email: lead?.email || "",
    });
    if (lead?.niche) {
      setServiceType(lead.niche);
    }
  }

  useEffect(() => {
    const leadId = searchParams.get("leadId");
    if (!leadId || leads.length === 0) {
      return;
    }
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) {
      return;
    }
    setGmbForm(mapLeadToGmbForm(lead));
    if (lead.niche) {
      setServiceType(lead.niche);
    }
    if (searchParams.get("advanced") === "true") {
      setIsAdvanced(true);
    }
  }, [leads, searchParams]);

  async function submitGmbAudit(): Promise<void> {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      let created: SeoAudit;
      if (isAdvanced) {
        created = await runAdvancedGmbAudit({
          ...gmbForm,
          service_type: serviceType,
        });
      } else {
        created = await runGmbAudit({
          ...gmbForm,
          gmb_claimed: gmbForm.gmb_claimed === "" ? undefined : gmbForm.gmb_claimed === "true",
          gmb_rating: gmbForm.gmb_rating === "" ? null : Number(gmbForm.gmb_rating),
          gmb_review_count: gmbForm.gmb_review_count === "" ? null : Number(gmbForm.gmb_review_count),
          gmb_profile_incomplete:
            gmbForm.gmb_profile_incomplete === "" ? undefined : gmbForm.gmb_profile_incomplete === "true",
          citations_found:
            gmbForm.citations_found === "" ? undefined : gmbForm.citations_found === "true",
        });

        // Auto-trigger GMB AI insights generation on audit run for absolute 1-click simplicity!
        try {
          const aiReport = await generateAuditAiReport(created.id);
          created = {
            ...created,
            ai_insights: aiReport.aiInsights,
          };
        } catch (err) {
          console.error("Failed to auto-generate GMB AI insights", err);
        }
      }

      setLatestAudit(created);
      setAudits((current) => [created, ...current]);
      setMessage(`Saved GMB audit for ${created.target_name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run GMB audit");
    } finally {
      setBusy(false);
    }
  }

  async function createAiReportForLatest(): Promise<void> {
    if (!currentAudit) {
      return;
    }

    setAiBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await generateAuditAiReport(currentAudit.id);
      const nextAudit = {
        ...currentAudit,
        ai_insights: result.aiInsights,
      };

      setLatestAudit(nextAudit);
      setAudits((current) =>
        current.map((audit) => (audit.id === currentAudit.id ? { ...audit, ai_insights: result.aiInsights } : audit))
      );
      setMessage(`AI report generated for ${currentAudit.target_name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI report");
    } finally {
      setAiBusy(false);
    }
  }

  const scoreColor = (score: number | null | undefined): string => {
    if (score == null) return "text-slate-400";
    if (score >= 78) return "text-emerald-500";
    if (score >= 56) return "text-amber-500";
    return "text-rose-500";
  };

  const scoreBgClass = (score: number | null | undefined): string => {
    if (score == null) return "bg-slate-100";
    if (score >= 78) return "bg-emerald-500";
    if (score >= 56) return "bg-amber-500";
    return "bg-rose-500";
  };

  const scoreRingColor = (score: number | null | undefined): string => {
    if (score == null) return "#94a3b8";
    if (score >= 78) return "#10b981";
    if (score >= 56) return "#f59e0b";
    return "#ef4444";
  };

  const verdictBadge = (verdict: string | undefined) => {
    if (!verdict) return "bg-slate-100 text-slate-600 border border-slate-200/50";
    const v = verdict.toLowerCase();
    if (v === "strong") return "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20";
    if (v.includes("needs")) return "bg-amber-500/10 text-amber-600 border border-amber-500/20";
    return "bg-rose-500/10 text-rose-600 border border-rose-500/20";
  };

  return (
    <section className="page-enter space-y-6 pb-12 animate-fade-in text-slate-800">
      {/* ── Premium Header Card ── */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-md">
        <div className="absolute right-0 top-0 -mr-6 -mt-6 h-36 w-36 rounded-full bg-emerald-500/10 blur-2xl" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">Local Maps Engine</p>
            <h2 className="text-2xl font-extrabold tracking-tight mt-0.5">GMB & Local Audit (Master)</h2>
            <p className="text-[12px] text-slate-400 mt-1">Audit Google Business Profiles and local map signals in 1-Click with AI narration.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-1 w-fit">
            <button
              type="button"
              onClick={() => handleTabChange("profile")}
              className={[
                "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                activeTab === "profile"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              GMB Checklist
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("ai-local")}
              className={[
                "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                activeTab === "ai-local"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              AI Local Presence
            </button>
          </div>
        </div>
      </header>

      {/* ───── Status Messages ───── */}
      {error && (
        <div className="flex gap-2 rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-[12px] text-rose-700">
          <span className="font-bold text-rose-500">✕</span> {error}
        </div>
      )}
      {message && (
        <div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-[12px] text-emerald-700">
          <span className="font-bold text-emerald-500">✓</span> {message}
        </div>
      )}

      {activeTab === "profile" ? (
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          {/* Left Column: Form & History */}
          <div className="space-y-6 lg:col-span-1">
            {/* Run Audit Form Card */}
            <article className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/10 to-white p-5 shadow-md space-y-4">
              <div>
                <span className="bg-emerald-500/10 text-emerald-600 font-bold uppercase tracking-wider text-[9px] px-2 py-0.5 rounded-full">One-Click</span>
                <h3 className="text-sm font-bold text-slate-900 mt-2">Start GMB Audit</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Select a business or enter a name to generate a local checklist score.</p>
              </div>

              <div className="space-y-3">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Select Business / Client
                  <select
                    value={gmbForm.business_id}
                    onChange={(e) => applyBusinessToGmb(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm"
                  >
                    <option value="">No prefill connected</option>
                    {businesses.map((b) => <option key={b.id} value={b.id}>{b.name} &middot; {b.client_name}</option>)}
                  </select>
                </label>

                {/* Single core name field for non-tech users */}
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Business Name
                  <input
                    type="text"
                    value={gmbForm.business_name}
                    onChange={(e) => setGmbForm((c) => ({ ...c, business_name: e.target.value }))}
                    placeholder="Enter business name"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm"
                  />
                </label>

                {/* Collapsible Overrides closed by default */}
                <div className="border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 focus:outline-none"
                  >
                    {showAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3 animate-fade-in max-h-[300px] overflow-y-auto">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Linked Lead
                        <select
                          value={gmbForm.lead_id}
                          onChange={(e) => applyLeadToGmb(e.target.value)}
                          className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
                        >
                          <option value="">None</option>
                          {leads.map((l) => <option key={l.id} value={l.id}>{l.business_name}</option>)}
                        </select>
                      </label>

                      {([
                        ["city", "City"],
                        ["state", "State"],
                        ["website", "Website URL"],
                        ["gmb_url", "Maps URL"],
                        ["phone", "Phone"],
                        ["email", "Email"],
                        ["gmb_rating", "Rating"],
                        ["gmb_review_count", "Review Count"],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {label}
                          <input
                            type="text"
                            value={gmbForm[key as keyof GmbFormState]}
                            onChange={(e) => setGmbForm((c) => ({ ...c, [key]: e.target.value }))}
                            className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
                          />
                        </label>
                      ))}

                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Claimed status
                        <select
                          value={gmbForm.gmb_claimed}
                          onChange={(e) => setGmbForm((c) => ({ ...c, gmb_claimed: e.target.value }))}
                          className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px]"
                        >
                          <option value="">Unknown</option>
                          <option value="true">Claimed</option>
                          <option value="false">Unclaimed</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-slate-100 pt-3 pb-1">
                  <input
                    type="checkbox"
                    id="gmb-advanced-toggle"
                    checked={isAdvanced}
                    onChange={(e) => setIsAdvanced(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="gmb-advanced-toggle" className="text-[11px] font-bold text-slate-700 select-none">
                    Deep AI GMB Optimizer Catalog
                  </label>
                </div>

                {isAdvanced && (
                  <div className="space-y-3 p-3 bg-emerald-50/20 rounded-xl border border-emerald-100/50 animate-fade-in">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Business Niche / Service Type
                      <input
                        type="text"
                        value={serviceType}
                        onChange={(e) => setServiceType(e.target.value)}
                        placeholder="e.g. Plumbing, HVAC, Dentist"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-semibold text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all shadow-sm"
                      />
                    </label>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void submitGmbAudit()}
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 py-3 text-xs font-extrabold text-white shadow-md shadow-emerald-600/10 hover:shadow-lg hover:shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
                >
                  {busy ? "Running AI Optimizer..." : (isAdvanced ? "Run AI GMB Optimizer" : "Evaluate GMB in 1-Click")}
                </button>
              </div>
            </article>

            {/* Recent Table */}
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recent GMB Reports</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Click to view pre-calculated checks.</p>
              </div>

              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredAudits.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">No audits found.</p>
                ) : (
                  filteredAudits.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLatestAudit(item)}
                      className={[
                        "w-full text-left rounded-xl p-3 border text-[11px] transition-all flex items-center justify-between gap-3",
                        item.id === currentAudit?.id
                          ? "border-emerald-200 bg-emerald-50/30 font-bold"
                          : "border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate">{item.target_name}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-[11px] font-extrabold ${scoreColor(item.score)}`}>{item.score ?? "--"}</span>
                    </button>
                  ))
                )}
              </div>
            </article>
          </div>

          {/* Right Column: Visual Report Area */}
          <div className="lg:col-span-2 space-y-6">
            {currentAudit ? (
              <div className="space-y-6">
                {/* Hero Score Card */}
                <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white shadow-lg border border-slate-800">
                  <div className="absolute right-0 top-0 -mr-20 -mt-20 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
                  
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${verdictBadge(currentAudit.verdict)}`}>
                          {currentAudit.verdict}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold uppercase tracking-wider">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Google Maps &amp; Directory Signal Scan
                        </span>
                      </div>
                      <h3 className="text-2xl font-black tracking-tight">{currentAudit.target_name}</h3>
                      <p className="text-[12px] text-slate-300 leading-relaxed max-w-xl">{currentAudit.summary || currentAudit.verdict}</p>

                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const matchedLead = leads.find(
                              (l) => l.id === gmbForm.lead_id || (l.business_name && currentAudit.target_name && l.business_name.toLowerCase() === currentAudit.target_name.toLowerCase())
                            );
                            setPitchModalLead({
                              id: matchedLead?.id,
                              business_name: currentAudit.target_name || gmbForm.business_name,
                              website: matchedLead?.website || gmbForm.website,
                              phone: matchedLead?.phone || gmbForm.phone,
                              email: matchedLead?.email || gmbForm.email,
                              city: matchedLead?.city || gmbForm.city,
                              state: matchedLead?.state || gmbForm.state,
                              gmb_rating: matchedLead?.gmb_rating ?? (Number(gmbForm.gmb_rating) || undefined),
                              gmb_review_count: matchedLead?.gmb_review_count ?? (Number(gmbForm.gmb_review_count) || undefined),
                              gmb_claimed: matchedLead?.gmb_claimed ?? (gmbForm.gmb_claimed === "true" ? true : gmbForm.gmb_claimed === "false" ? false : undefined),
                              last_gmb_audit_score: currentAudit.score,
                            });
                            setShowPitchModal(true);
                          }}
                          className="rounded-lg bg-[#5e6ad2] hover:bg-[#4e5abc] px-3.5 py-1.5 text-[11px] font-bold text-white transition-all flex items-center gap-1.5 shadow-sm"
                          title="Generate and send personalized pitch email using these GMB audit findings"
                        >
                          <span>✉</span>
                          <span>Draft Outreach Pitch</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void generateAuditPdf(currentAudit)}
                          className="rounded-lg bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold hover:bg-white/15 transition-all flex items-center gap-1.5 border border-white/5"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          Download PDF
                        </button>
                        {currentAudit.audit_type === "gmb_advanced" && (
                          <>
                            <a
                              href={`${API_BASE_URL}/api/seo/audits/gmb/download/${currentAudit.id}?fileType=xlsx`}
                              className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[11px] font-bold hover:bg-emerald-700 transition-all flex items-center gap-1.5 text-white"
                            >
                              Download XLSX Catalog
                            </a>
                            <a
                              href={`${API_BASE_URL}/api/seo/audits/gmb/download/${currentAudit.id}?fileType=docx`}
                              className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-[11px] font-bold hover:bg-blue-700 transition-all flex items-center gap-1.5 text-white"
                            >
                              Download DOCX Report
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Radial Score Gauge */}
                    <div className="flex flex-col items-center shrink-0">
                      <div className="relative h-28 w-28 flex items-center justify-center">
                        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
                          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                          <circle
                            cx="60" cy="60" r="50" fill="none"
                            stroke={scoreRingColor(currentAudit.score)}
                            strokeWidth="8" strokeLinecap="round"
                            strokeDasharray={`${((currentAudit.score ?? 0) / 100) * 314} 314`}
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <div className="text-center z-10">
                          <span className="text-3xl font-black tracking-tight tabular-nums">{currentAudit.score ?? "--"}</span>
                          <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider">Score</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>

                {/* View Mode Toggle: Simple AI-Powered vs Detailed Specs */}
                <div className="flex border border-slate-200/80 bg-slate-50 rounded-xl p-1 w-full justify-between items-center shadow-inner">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsDetailedView(false)}
                      className={[
                        "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                        !isDetailedView
                          ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                          : "text-slate-500 hover:text-slate-900",
                      ].join(" ")}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Simple View (AI Explanatory)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDetailedView(true)}
                      className={[
                        "flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                        isDetailedView
                          ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                          : "text-slate-500 hover:text-slate-900",
                      ].join(" ")}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                      Detailed Specifications
                    </button>
                  </div>
                </div>

                {/* ── SIMPLE AI VIEW ── */}
                {!isDetailedView ? (
                  <div className="space-y-6">
                    {/* AI Specialist Assistant Mascot Box */}
                    <article className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/10 to-teal-50/5 p-5 space-y-4 shadow-sm relative">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </span>
                        <div>
                          <h4 className="text-[13px] font-extrabold text-emerald-950 uppercase tracking-wide">AI Local SEO Assistant</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">Simple English analysis of your local map pack opportunities.</p>
                        </div>
                      </div>

                      {parsedAiInsights ? (
                        <div className="space-y-4 text-slate-700 leading-relaxed text-[12px]">
                          <div className="bg-white/80 rounded-xl p-4 border border-emerald-50/55 shadow-inner">
                            <p className="font-extrabold text-emerald-900 text-[13px]">{parsedAiInsights.headline}</p>
                            <p className="mt-2 text-slate-600 leading-relaxed">{parsedAiInsights.executiveSummary}</p>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="bg-rose-50/30 rounded-xl p-4 border border-rose-100/50 space-y-2">
                              <p className="font-bold text-rose-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Priority GMB Tasks (Fix First)
                              </p>
                              {parsedAiInsights.priorityActions && parsedAiInsights.priorityActions.length > 0 ? (
                                <ul className="space-y-2 text-[11.5px] text-slate-600">
                                  {parsedAiInsights.priorityActions.map((a: string, i: number) => (
                                    <li key={i} className="flex gap-2 items-start leading-relaxed">
                                      <span className="text-rose-400 font-bold shrink-0 mt-0.5">•</span>
                                      <span>{a}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-slate-400">Your profile is fully optimized!</p>}
                            </div>

                            <div className="bg-emerald-50/30 rounded-xl p-4 border border-emerald-100/50 space-y-2">
                              <p className="font-bold text-emerald-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg>
                                Local Optimization Wins
                              </p>
                              {parsedAiInsights.quickWins && parsedAiInsights.quickWins.length > 0 ? (
                                <ul className="space-y-2 text-[11.5px] text-slate-600">
                                  {parsedAiInsights.quickWins.map((w: string, i: number) => (
                                    <li key={i} className="flex gap-2 items-start leading-relaxed">
                                      <span className="text-emerald-500 font-bold shrink-0 mt-0.5">✓</span>
                                      <span>{w}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-slate-400">No wins detected yet.</p>}
                            </div>
                          </div>

                          <div className="bg-emerald-50/30 rounded-xl p-3.5 border border-emerald-100/50 text-[11px]">
                            <p className="font-bold text-emerald-900 uppercase tracking-wider text-[9px]">Maps Strategy Action Step</p>
                            <p className="mt-1 text-emerald-950 font-medium leading-relaxed">{parsedAiInsights.nextStepCta}</p>
                          </div>

                          {!currentAudit.ai_insights && (
                            <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 mt-2">
                              <span className="text-[10px] text-slate-400">Want deeper AI analysis? Enhance this report with AI narrative.</span>
                              <button
                                type="button"
                                onClick={() => void createAiReportForLatest()}
                                disabled={aiBusy}
                                className="rounded bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                              >
                                {aiBusy ? "Enhancing..." : "Enhance with AI"}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-4 text-center space-y-2.5 animate-fade-in">
                          <p className="text-[11px] text-slate-400">No AI insights generated for this report.</p>
                          <button
                            type="button"
                            onClick={() => void submitGmbAudit()}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow"
                          >
                            Generate GMB AI Report
                          </button>
                        </div>
                      )}
                    </article>

                    {/* Wins List */}
                    {currentAudit.result.wins && currentAudit.result.wins.length > 0 && (
                      <article className="rounded-2xl border border-emerald-100 bg-emerald-50/10 p-5 space-y-3">
                        <h4 className="text-[12px] font-bold text-emerald-950 uppercase tracking-wider">What is working well</h4>
                        <div className="space-y-2">
                          {currentAudit.result.wins.map((w: string, i: number) => (
                            <div key={i} className="flex gap-2.5 items-start bg-white border border-emerald-100/50 rounded-xl p-3 text-[11.5px] leading-relaxed text-emerald-800">
                              <span className="text-emerald-500 font-bold shrink-0">✓</span>
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      </article>
                    )}
                  </div>
                ) : (
                  /* ── DETAILED SPECIFICATIONS VIEW ── */
                  <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
                    {/* Key Issues */}
                    <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </span>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Key Issues Flagged</h4>
                      </div>

                      {!currentAudit.result.issues || currentAudit.result.issues.length === 0 ? (
                        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 p-3.5">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <p className="text-[12px] text-emerald-800">No critical issues flagged.</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {currentAudit.result.issues.map((issue: any, i: number) => {
                            const isHigh = issue.severity === "high";
                            const severityColor = isHigh ? "text-rose-600 bg-rose-50 border-rose-100" : "text-amber-600 bg-amber-50 border-amber-100";
                            return (
                              <div key={i} className={`rounded-xl border p-3.5 space-y-1 ${severityColor}`}>
                                <p className="font-bold text-[12px]">{issue.title}</p>
                                <p className="text-[11px] opacity-90 leading-relaxed">{issue.detail}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>

                    {/* Recommendations */}
                    <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        </span>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Priority Steps</h4>
                      </div>

                      {!currentAudit.result.recommendations || currentAudit.result.recommendations.length === 0 ? (
                        <p className="text-[12px] text-slate-400">No recommendations.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {currentAudit.result.recommendations.map((rec: string, i: number) => (
                            <div key={i} className="flex gap-3 rounded-xl border border-sky-100 bg-sky-50/30 p-3 items-start">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-200/50 text-[10px] font-bold text-sky-800 mt-0.5">{i + 1}</span>
                              <p className="text-[11px] leading-relaxed text-slate-700">{rec}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>

                    {/* Directory Signals & NAP Consistency Card */}
                    <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 md:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-sm">
                            
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Directory Signals &amp; NAP Consistency</h4>
                            <p className="text-[11px] text-slate-400">Audited across Google Maps, local directories, and website metadata.</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          Verified from Web Scan
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                          <span className="text-[10px] font-bold uppercase text-slate-400">GMB Claim Status</span>
                          <p className="mt-1 text-xs font-bold text-slate-800">
                            {(currentAudit.result as any)?.signals?.claimed ? "Claimed Profile" : "Unclaimed Profile"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Rating &amp; Reviews</span>
                          <div className="mt-1">
                            <RatingStars rating={(currentAudit.result as any)?.signals?.rating} reviews={(currentAudit.result as any)?.signals?.reviewCount} size="xs" />
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Website Linked</span>
                          <p className="mt-1 text-xs font-bold text-slate-800">
                            {(currentAudit.result as any)?.signals?.hasWebsite ? "Website Connected" : "Missing Website"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Citations Found</span>
                          <p className="mt-1 text-xs font-bold text-slate-800">
                            {(currentAudit.result as any)?.signals?.citationsFound ? "Verified Citations" : "Low Citations"}
                          </p>
                        </div>
                      </div>
                    </article>

                    {/* Geo-Grid Heatmap Visualizer */}
                    {geoGridData && (
                      <div className="md:col-span-2 pt-2">
                        <GeoGridHeatmap data={geoGridData} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <article className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center flex flex-col items-center justify-center space-y-2">
                <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <h4 className="text-xs font-bold text-slate-700">No GBP Report Selected</h4>
                <p className="text-[11px] text-slate-400 font-medium">Select a business on the left or type a name to run an audit.</p>
              </article>
            )}
          </div>
        </div>
      ) : (
        /* ───── AI LOCAL & MAPS TABS ───── */
        <div className="space-y-6">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            {AI_LOCAL_CONFIGS.map((cfg) => (
              <button
                key={cfg.type}
                type="button"
                onClick={() => handleAiTypeChange(cfg.type)}
                className={[
                  "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                  selectedAiType === cfg.type
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")}
              >
                {cfg.label}
              </button>
            ))}
          </div>

          {(() => {
            const activeCfg = AI_LOCAL_CONFIGS.find(cfg => cfg.type === selectedAiType) || AI_LOCAL_CONFIGS[0];
            return (
              <AiAuditPage
                key={activeCfg.type}
                config={{
                  auditType: activeCfg.type,
                  title: activeCfg.label,
                  subtitle: activeCfg.description,
                  sectionLabel: activeCfg.section,
                  isCompetitor: activeCfg.isCompetitor,
                }}
              />
            );
          })()}
        </div>
      )}

      {pitchModalLead && (
        <QuickPitchModal
          lead={pitchModalLead}
          isOpen={showPitchModal}
          onClose={() => setShowPitchModal(false)}
        />
      )}
    </section>
  );
}