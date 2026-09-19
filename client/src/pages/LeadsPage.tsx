import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  API_BASE_URL,
  appendLeadsToOutreachCampaign,
  createOutreachCampaign,
  fetchLeads,
  fetchOutreachCampaigns,
  fetchSeoAudits,
  runAdvancedWebsiteAudit,
  runGmbAudit,
  generateAuditAiReport,
  type Lead,
  type OutreachCampaign,
  type SeoAudit,
} from "../lib/api";
import { useToast } from "../components/Toast";
import { ConfirmModal } from "../components/ConfirmModal";
import { SourceBadge } from "../lib/sourceBranding";
import { RatingStars } from "../components/ui/RatingStars";
import { ScoreBadge } from "../components/ui/ScoreBadge";
import { Badge } from "../components/ui/Badge";
import { StatusBadge } from "../components/ui/StatusBadge";
import { generateAuditPdf } from "../components/PdfAuditReport";
import { QuickPitchModal } from "../components/QuickPitchModal";

type FilterState = {
  query: string;
  city: string;
  niche: string;
  status: string;
  source: string;
  hasWebsite: string;
  hasEmail: string;
  gmbClaimed: string;
  gmbRatingMin: string;
  gmbRatingMax: string;
  gmbReviewCountMin: string;
  gmbReviewCountMax: string;
  createdFrom: string;
  createdTo: string;
};

type InlineAuditKind = "gmb" | "website";
type InlineAuditStatus = "idle" | "running" | "completed" | "failed";
type AuditDownloadFormat = "pdf" | "excel";

type InlineAuditResult = {
  status: InlineAuditStatus;
  score: number | null;
  verdict: string;
  message: string;
  updatedAt: string;
};

type LeadInlineAuditState = Partial<Record<InlineAuditKind, InlineAuditResult>>;

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

const statusBadge: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-slate-100 text-slate-700" },
  contacted: { label: "Contacted", className: "bg-blue-100 text-blue-700" },
  audit_sent: { label: "Audit Sent", className: "bg-purple-100 text-purple-700" },
  proposal_sent: { label: "Proposal Sent", className: "bg-indigo-100 text-indigo-700" },
  negotiating: { label: "Negotiating", className: "bg-amber-100 text-amber-700" },
  closed_won: { label: "Won", className: "bg-emerald-100 text-emerald-700" },
  closed_lost: { label: "Lost", className: "bg-red-100 text-red-700" },
  retained_client: { label: "Client", className: "bg-[#5e6ad2]/10 text-[#5e6ad2]" },
};

const sourceOptions = [
  { value: "gmb_scraper", label: "GMB Scraper" },
  { value: "yellowpages", label: "Yellow Pages" },
  { value: "state_directory", label: "State Directory" },
  { value: "yelp_scraper", label: "Yelp Scraper" },
  { value: "bbb_scraper", label: "BBB Scraper" },
  { value: "website_enrichment", label: "Website Enrichment" },
  { value: "chamber_directory", label: "Chamber Directory" },
  { value: "license_registry", label: "License Registry" },
  { value: "ads_google", label: "Google Ads" },
  { value: "ads_meta", label: "Meta Ads" },
  { value: "ads_bing", label: "Bing Ads" },
  { value: "manual", label: "Manual" },
  { value: "csv", label: "CSV Import" },
];

const pageSizeOptions = [25, 50, 100, 500];

const DIRECT_CAMPAIGN_VALUE = "__direct_campaign__";

function toBooleanFilter(value: string): boolean | undefined {
  if (value === "") return undefined;
  return value === "true";
}

function toNumberFilter(value: string): number | undefined {
  if (value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeAuditScore(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveAuditState(
  lead: Lead,
  kind: InlineAuditKind,
  inlineState: InlineAuditResult | undefined
): { status: InlineAuditStatus; score: number | null; message: string } {
  const persistedScore = normalizeAuditScore(
    kind === "gmb" ? lead.last_gmb_audit_score : lead.last_website_audit_score
  );

  if (inlineState?.status === "running") {
    return {
      status: "running",
      score: null,
      message: inlineState.message,
    };
  }

  if (inlineState?.status === "failed") {
    return {
      status: "failed",
      score: null,
      message: inlineState.message,
    };
  }

  if (inlineState?.status === "completed") {
    return {
      status: "completed",
      score: normalizeAuditScore(inlineState.score) ?? persistedScore,
      message: inlineState.message,
    };
  }

  if (persistedScore !== null) {
    return {
      status: "completed",
      score: persistedScore,
      message: "Latest saved audit score",
    };
  }

  return {
    status: "idle",
    score: null,
    message: "Audit not run yet",
  };
}

function auditRingBackground(kind: InlineAuditKind, status: InlineAuditStatus, score: number | null): string {
  if (status === "running") {
    return "conic-gradient(from -90deg, #f59e0b 0 35%, #fbbf24 35% 70%, #fde68a 70% 100%)";
  }

  if (status === "failed") {
    return "conic-gradient(from -90deg, #ef4444 0 100%, #ef4444 100% 100%)";
  }

  if (status !== "completed" || score === null) {
    return "conic-gradient(from -90deg, #cbd5e1 0 100%, #cbd5e1 100% 100%)";
  }

  const safeScore = Math.max(0, Math.min(100, score));

  if (kind === "gmb") {
    const p1 = (safeScore * 0.25).toFixed(2);
    const p2 = (safeScore * 0.5).toFixed(2);
    const p3 = (safeScore * 0.75).toFixed(2);
    const p4 = safeScore.toFixed(2);
    return `conic-gradient(from -90deg, #4285F4 0 ${p1}%, #34A853 ${p1}% ${p2}%, #FBBC05 ${p2}% ${p3}%, #EA4335 ${p3}% ${p4}%, #e2e8f0 ${p4}% 100%)`;
  }

  const split = (safeScore * 0.58).toFixed(2);
  const end = safeScore.toFixed(2);
  return `conic-gradient(from -90deg, #06b6d4 0 ${split}%, #3b82f6 ${split}% ${end}%, #e2e8f0 ${end}% 100%)`;
}

function auditScoreText(status: InlineAuditStatus, score: number | null): string {
  if (status === "running") return "...";
  if (status === "failed") return "ERR";
  if (score === null) return "Not Audited";
  return `${score}/100`;
}

function renderLeadScoreBadge(score: number) {
  const num = Number(score) || 0;
  const variant = num >= 70 ? "danger" : num >= 40 ? "warning" : "neutral";
  const label = num >= 70 ? "High Intent" : num >= 40 ? "Moderate" : "Low";

  return (
    <Badge variant={variant} size="sm">
      {label} · {num}
    </Badge>
  );
}

function AuditScoreBadge(props: {
  kind: InlineAuditKind;
  status: InlineAuditStatus;
  score: number | null;
  message: string;
}): JSX.Element {
  const { kind, status, score, message } = props;
  const label = kind === "gmb" ? "GMB" : "Website";

  return (
    <div className="inline-flex items-center" title={`${label}: ${message}`}>
      <div
        className="relative flex h-12 w-12 items-center justify-center rounded p-[2.5px]"
        style={{ background: auditRingBackground(kind, status, score) }}
      >
        <div
          className={[
            "flex h-full w-full items-center justify-center rounded bg-white px-0.5 text-[9px] font-bold leading-none",
            status === "failed"
              ? "text-rose-700"
              : status === "running"
                ? "text-amber-700"
                : kind === "gmb"
                  ? "text-slate-700"
                  : "text-sky-700",
          ].join(" ")}
        >
          {auditScoreText(status, score)}
        </div>
      </div>
    </div>
  );
}

function downloadCsv(rows: Lead[]): void {
  const headers = [
    "Business Name",
    "City",
    "State",
    "Niche",
    "Phone",
    "Email",
    "Website",
    "Status",
    "Source",
  ];

  const bodyRows = rows.map((lead) => [
    lead.business_name,
    lead.city,
    lead.state,
    lead.niche,
    lead.phone,
    lead.email,
    lead.website,
    lead.status,
    lead.source,
  ]);

  const csv = [headers, ...bodyRows]
    .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "lead";
}

function downloadBadgeIcon(): JSX.Element {
  return (
    <span className="pointer-events-none absolute -right-1 -bottom-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-white bg-white text-current">
      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M4 20h16" />
      </svg>
    </span>
  );
}

function auditDownloadKey(leadId: string, kind: InlineAuditKind): string {
  return `${leadId}:${kind}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeExportText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractAuditList(audit: SeoAudit, key: "issues" | "recommendations" | "wins", maxItems = 8): string[] {
  const result = (audit.result || {}) as Record<string, unknown>;
  const raw = result[key];
  if (!Array.isArray(raw)) {
    return [];
  }

  const rows: string[] = [];
  for (const item of raw) {
    if (rows.length >= maxItems) {
      break;
    }

    if (typeof item === "string") {
      const text = normalizeExportText(item);
      if (text) {
        rows.push(text);
      }
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Record<string, unknown>;
    const title = normalizeExportText(row.title || row.label || row.name);
    const detail = normalizeExportText(row.detail || row.summary || row.description);
    const value = [title, detail].filter(Boolean).join(": ");
    if (value) {
      rows.push(value);
    }
  }

  return rows;
}

function extractAuditIssues(audit: SeoAudit, maxItems = 10): Array<{
  severity: "high" | "medium" | "low";
  text: string;
}> {
  const result = (audit.result || {}) as Record<string, unknown>;
  const raw = result.issues;
  if (!Array.isArray(raw)) {
    return [];
  }

  const output: Array<{ severity: "high" | "medium" | "low"; text: string }> = [];
  for (const item of raw) {
    if (output.length >= maxItems) {
      break;
    }

    if (typeof item === "string") {
      const text = normalizeExportText(item);
      if (text) {
        output.push({ severity: "low", text });
      }
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const row = item as Record<string, unknown>;
    const title = normalizeExportText(row.title || row.label || row.name);
    const detail = normalizeExportText(row.detail || row.summary || row.description);
    const text = [title, detail].filter(Boolean).join(": ");
    if (!text) {
      continue;
    }

    const severityRaw = normalizeExportText(row.severity).toLowerCase();
    const severity: "high" | "medium" | "low" =
      severityRaw === "high" || severityRaw === "medium" || severityRaw === "low"
        ? severityRaw
        : "low";

    output.push({ severity, text });
  }

  return output;
}

function buildAuditExportFields(lead: Lead, audit: SeoAudit): Array<{ label: string; value: string }> {
  const issues = extractAuditList(audit, "issues");
  const recommendations = extractAuditList(audit, "recommendations");
  const wins = extractAuditList(audit, "wins");

  return [
    { label: "Business Name", value: normalizeExportText(lead.business_name) || "--" },
    { label: "Lead ID", value: normalizeExportText(lead.id) || "--" },
    { label: "Audit ID", value: normalizeExportText(audit.id) || "--" },
    { label: "Audit Type", value: normalizeExportText(audit.audit_type).toUpperCase() || "--" },
    { label: "Score", value: typeof audit.score === "number" ? String(audit.score) : "--" },
    { label: "Verdict", value: normalizeExportText(audit.verdict) || "--" },
    { label: "Status", value: normalizeExportText(audit.status) || "--" },
    { label: "Summary", value: normalizeExportText(audit.summary) || "--" },
    { label: "Issues", value: issues.length > 0 ? issues.join(" | ") : "None" },
    { label: "Recommendations", value: recommendations.length > 0 ? recommendations.join(" | ") : "None" },
    { label: "Wins", value: wins.length > 0 ? wins.join(" | ") : "None" },
    { label: "City", value: normalizeExportText(lead.city) || "--" },
    { label: "State", value: normalizeExportText(lead.state) || "--" },
    { label: "Niche", value: normalizeExportText(lead.niche) || "--" },
    { label: "Website", value: normalizeExportText(lead.website) || "--" },
    { label: "GMB URL", value: normalizeExportText(lead.gmb_url) || "--" },
    { label: "Created At", value: normalizeExportText(audit.created_at) || "--" },
  ];
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportAuditExcel(lead: Lead, audit: SeoAudit, baseFileName: string): Promise<void> {
  const XLSX = await import("xlsx");
  const fields = buildAuditExportFields(lead, audit);
  const rows: string[][] = [["Field", "Value"], ...fields.map((field) => [field.label, field.value])];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 120 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Audit Report");

  const workbookData = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([workbookData as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerBlobDownload(blob, `${baseFileName}.xlsx`);
}



function activeFilterCount(f: FilterState): number {
  return [
    f.query,
    f.city,
    f.niche,
    f.status,
    f.source,
    f.hasWebsite,
    f.hasEmail,
    f.gmbClaimed,
    f.gmbRatingMin,
    f.gmbRatingMax,
    f.gmbReviewCountMin,
    f.gmbReviewCountMax,
    f.createdFrom,
    f.createdTo,
  ].filter(Boolean)
    .length;
}

export function LeadsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [filters, setFilters] = useState<FilterState>({
    query: "",
    city: "",
    niche: "",
    status: "",
    source: "",
    hasWebsite: "",
    hasEmail: "",
    gmbClaimed: "",
    gmbRatingMin: "",
    gmbRatingMax: "",
    gmbReviewCountMin: "",
    gmbReviewCountMax: "",
    createdFrom: "",
    createdTo: "",
  });
  const [rows, setRows] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(DIRECT_CAMPAIGN_VALUE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inlineAudits, setInlineAudits] = useState<Record<string, LeadInlineAuditState>>({});
  const [downloadingReports, setDownloadingReports] = useState<Record<string, boolean>>({});
  const [openDownloadMenuKey, setOpenDownloadMenuKey] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pitchTargetLead, setPitchTargetLead] = useState<Lead | null>(null);
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);

  async function loadLeads(overrides?: {
    page?: number;
    pageSize?: number;
    filters?: FilterState;
  }): Promise<void> {
    setLoading(true);
    setError("");

    const activeFilters = overrides?.filters || filters;
    const activePage = overrides?.page || page;
    const activePageSize = overrides?.pageSize || pageSize;

    try {
      const data = await fetchLeads({
        query: activeFilters.query || undefined,
        city: activeFilters.city || undefined,
        niche: activeFilters.niche || undefined,
        status: activeFilters.status || undefined,
        source: activeFilters.source || undefined,
        hasWebsite: toBooleanFilter(activeFilters.hasWebsite),
        hasEmail: toBooleanFilter(activeFilters.hasEmail),
        gmbClaimed: toBooleanFilter(activeFilters.gmbClaimed),
        gmbRatingMin: toNumberFilter(activeFilters.gmbRatingMin),
        gmbRatingMax: toNumberFilter(activeFilters.gmbRatingMax),
        gmbReviewCountMin: toNumberFilter(activeFilters.gmbReviewCountMin),
        gmbReviewCountMax: toNumberFilter(activeFilters.gmbReviewCountMax),
        createdFrom: activeFilters.createdFrom || undefined,
        createdTo: activeFilters.createdTo || undefined,
        page: activePage,
        pageSize: activePageSize,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.pageSize);
      setSelected({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  async function loadCampaigns(): Promise<void> {
    try {
      const data = await fetchOutreachCampaigns();
      setCampaigns(data.items);
      setSelectedCampaignId((current) => {
        if (current === DIRECT_CAMPAIGN_VALUE) {
          return DIRECT_CAMPAIGN_VALUE;
        }

        if (current && data.items.some((campaign) => campaign.id === current)) {
          return current;
        }

        return data.items[0]?.id || DIRECT_CAMPAIGN_VALUE;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    }
  }

  useEffect(() => {
    void loadLeads();
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (!openDownloadMenuKey) {
      return;
    }

    const closeMenu = () => setOpenDownloadMenuKey(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [openDownloadMenuKey]);

  async function addSelectedToCampaign(): Promise<void> {
    if (selectedRows.length === 0) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (selectedCampaignId === DIRECT_CAMPAIGN_VALUE) {
        const firstLead = selectedRows[0];
        const suggestedName = [
          firstLead?.city || filters.city || "Local",
          firstLead?.niche || filters.niche || "Outreach",
          new Date().toISOString().slice(0, 10),
        ]
          .filter(Boolean)
          .join(" ");

        const campaignName = window.prompt("Enter campaign name", suggestedName)?.trim();
        if (!campaignName) {
          setLoading(false);
          return;
        }

        const created = await createOutreachCampaign({
          name: campaignName,
          subject: "Quick idea for {{business_name}}",
          body: [
            "Hi {{business_name}},",
            "",
            "I found a few local growth opportunities around {{city}} and wanted to share a short plan.",
            "",
            "If you want, I can send a quick 3-step recommendation specific to your business.",
            "",
            "Best regards,",
            "SMBify OS Team",
          ].join("\n"),
          leadIds: selectedRows.map((lead) => lead.id),
          targetCity: filters.city || firstLead?.city || undefined,
          targetNiche: filters.niche || firstLead?.niche || undefined,
        });

        showToast("success", `Campaign created with ${created.queuedCount} recipients`);
      } else {
        const campaign = campaigns.find((c) => c.id === selectedCampaignId);
        const result = await appendLeadsToOutreachCampaign(selectedCampaignId, {
          leadIds: selectedRows.map((lead) => lead.id),
        });
        showToast("success", `Added ${result.appendedCount} leads to ${campaign?.name || "campaign"}`);
      }

      setCampaignModalOpen(false);
      await loadCampaigns();
      navigate("/outreach/campaigns");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add leads to campaign");
    } finally {
      setLoading(false);
    }
  }

  const selectedRows = useMemo(
    () => rows.filter((row) => selected[row.id]),
    [rows, selected]
  );

  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);

  async function handleBulkStatusChange(newStatus: string): Promise<void> {
    if (selectedRows.length === 0 || !newStatus) return;
    setBulkStatusUpdating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/leads/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedRows.map((l) => l.id),
          status: newStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update lead status");
      }
      showToast("success", `Updated ${selectedRows.length} leads to "${newStatus.replace(/_/g, " ")}"`);
      setSelected({});
      await loadLeads();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to update lead status");
    } finally {
      setBulkStatusUpdating(false);
    }
  }

  async function bulkDelete(): Promise<void> {
    if (selectedRows.length === 0) return;

    const count = selectedRows.length;
    const response = await fetch(`${API_BASE_URL}/api/leads/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedRows.map((lead) => lead.id) }),
    });

    if (!response.ok) {
      const text = await response.text();
      setError(text || "Bulk delete failed");
      return;
    }

    showToast("success", `${count} leads deleted`);
    await loadLeads();
  }

  const [bulkAuditRunning, setBulkAuditRunning] = useState(false);

  async function bulkAudit(kind: InlineAuditKind): Promise<void> {
    if (selectedRows.length === 0 || bulkAuditRunning) return;
    const label = kind === "gmb" ? "GMB" : "Website";
    setBulkAuditRunning(true);
    let successCount = 0;
    let failCount = 0;

    for (const lead of selectedRows) {
      try {
        setInlineAuditState(lead.id, kind, {
          status: "running",
          score: null,
          verdict: "",
          message: `${label} audit running...`,
          updatedAt: new Date().toISOString(),
        });

        let savedAudit: SeoAudit;

        if (kind === "gmb") {
          savedAudit = await runGmbAudit({
            lead_id: lead.id,
            business_name: lead.business_name,
            city: lead.city || undefined,
            state: lead.state || undefined,
            website: lead.website || undefined,
            gmb_url: lead.gmb_url || undefined,
            gmb_claimed: lead.gmb_claimed,
            gmb_rating: lead.gmb_rating,
            gmb_review_count: lead.gmb_review_count,
            gmb_profile_incomplete: lead.gmb_profile_incomplete,
            citations_found: lead.citations_found,
            phone: lead.phone || undefined,
            email: lead.email || undefined,
          });
        } else {
          const website = String(lead.website || "").trim();
          if (!website) {
            throw new Error("Website missing");
          }
          const response = await runAdvancedWebsiteAudit({
            lead_id: lead.id,
            business_name: lead.business_name,
            city: lead.city || undefined,
            state: lead.state || undefined,
            website,
            maxPages: 10,
          });
          savedAudit = response.audit;
        }

        // Auto-trigger AI report generation so user gets comprehensive assessment in ONE CLICK!
        try {
          const aiReport = await generateAuditAiReport(savedAudit.id);
          savedAudit = {
            ...savedAudit,
            ai_insights: aiReport.aiInsights,
          };
        } catch (err) {
          console.error("Failed to auto-generate AI insights", err);
        }

        setInlineAuditState(lead.id, kind, {
          status: "completed",
          score: savedAudit.score,
          verdict: savedAudit.verdict,
          message: `${label} audit completed${savedAudit.score == null ? "" : ` (Score ${savedAudit.score})`}.`,
          updatedAt: new Date().toISOString(),
        });
        successCount++;
      } catch {
        setInlineAuditState(lead.id, kind, {
          status: "failed",
          score: null,
          verdict: "",
          message: `${label} audit failed`,
          updatedAt: new Date().toISOString(),
        });
        failCount++;
      }
    }

    setBulkAuditRunning(false);
    const parts = [`${label} bulk audit: ${successCount} passed`];
    if (failCount > 0) parts.push(`${failCount} failed`);
    showToast(failCount > 0 ? "error" : "success", parts.join(", "));
    await loadLeads();
  }

  function clearFilters() {
    const resetFilters: FilterState = {
      query: "",
      city: "",
      niche: "",
      status: "",
      source: "",
      hasWebsite: "",
      hasEmail: "",
      gmbClaimed: "",
      gmbRatingMin: "",
      gmbRatingMax: "",
      gmbReviewCountMin: "",
      gmbReviewCountMax: "",
      createdFrom: "",
      createdTo: "",
    };

    setFilters(resetFilters);
    void loadLeads({ filters: resetFilters, page: 1 });
  }

  function setInlineAuditState(leadId: string, kind: InlineAuditKind, state: InlineAuditResult): void {
    setInlineAudits((current) => ({
      ...current,
      [leadId]: {
        ...current[leadId],
        [kind]: state,
      },
    }));
  }

  function setReportDownloading(leadId: string, kind: InlineAuditKind, isDownloading: boolean): void {
    const key = auditDownloadKey(leadId, kind);
    setDownloadingReports((current) => ({
      ...current,
      [key]: isDownloading,
    }));
  }

  async function downloadAuditReport(
    lead: Lead,
    kind: InlineAuditKind,
    format: AuditDownloadFormat
  ): Promise<void> {
    const key = auditDownloadKey(lead.id, kind);
    if (downloadingReports[key]) {
      return;
    }

    const label = kind === "gmb" ? "GMB" : "Website";
    setOpenDownloadMenuKey(null);
    setReportDownloading(lead.id, kind, true);

    try {
      const response = await fetchSeoAudits({
        leadId: lead.id,
        auditType: kind,
        limit: 5,
      });

      const latestAudit = [...response.items]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

      if (!latestAudit) {
        throw new Error(`${label} report nahi mila. Pehle ${label} audit run karein.`);
      }

      const baseFileName = `${slugify(lead.business_name || lead.website || "lead")}-${kind}-audit-report`;

      if (format === "excel") {
        await exportAuditExcel(lead, latestAudit, baseFileName);
      } else {
        await generateAuditPdf(latestAudit);
      }

      const formatLabel = format === "excel" ? "Excel" : format.toUpperCase();
      showToast("success", `${label} ${formatLabel} report downloaded for ${lead.business_name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to download ${label} report`;
      showToast("error", message);
    } finally {
      setReportDownloading(lead.id, kind, false);
    }
  }

  async function runInlineAudit(lead: Lead, kind: InlineAuditKind): Promise<void> {
    const label = kind === "gmb" ? "GMB" : "Website";

    const progressMessages = kind === "gmb"
      ? [
          "Initializing GBP Diagnostics...",
          "Extracting maps metadata...",
          "Analyzing claim ownership status...",
          "Benchmarking review count & ratings...",
          "Retrieving AI strategy recommendations...",
          "Finalizing GMB report..."
        ]
      : [
          "Crawling homepage & metadata...",
          "Checking tags & structure...",
          "Analyzing page load speed...",
          "Evaluating mobile optimization...",
          "Generating AI auditing insights...",
          "Finalizing Website report..."
        ];

    let step = 0;
    setInlineAuditState(lead.id, kind, {
      status: "running",
      score: null,
      verdict: "",
      message: progressMessages[0],
      updatedAt: new Date().toISOString(),
    });

    const progressTimer = setInterval(() => {
      step = (step + 1) % progressMessages.length;
      setInlineAuditState(lead.id, kind, {
        status: "running",
        score: null,
        verdict: "",
        message: progressMessages[step],
        updatedAt: new Date().toISOString(),
      });
    }, 500);

    try {
      let savedAudit: SeoAudit;

      if (kind === "gmb") {
        savedAudit = await runGmbAudit({
          lead_id: lead.id,
          business_name: lead.business_name,
          city: lead.city || undefined,
          state: lead.state || undefined,
          website: lead.website || undefined,
          gmb_url: lead.gmb_url || undefined,
          gmb_claimed: lead.gmb_claimed,
          gmb_rating: lead.gmb_rating,
          gmb_review_count: lead.gmb_review_count,
          gmb_profile_incomplete: lead.gmb_profile_incomplete,
          citations_found: lead.citations_found,
          phone: lead.phone || undefined,
          email: lead.email || undefined,
        });
      } else {
        const website = String(lead.website || "").trim();
        if (!website) {
          throw new Error("Website missing hai. Pehle lead website save karein.");
        }

        const response = await runAdvancedWebsiteAudit({
          lead_id: lead.id,
          business_name: lead.business_name,
          city: lead.city || undefined,
          state: lead.state || undefined,
          website,
          maxPages: 10,
        });
        savedAudit = response.audit;
      }

      // Auto-trigger AI report generation so user gets comprehensive assessment in ONE CLICK!
      try {
        const aiReport = await generateAuditAiReport(savedAudit.id);
        savedAudit = {
          ...savedAudit,
          ai_insights: aiReport.aiInsights,
        };
      } catch (err) {
        console.error("Failed to auto-generate AI insights", err);
      }

      clearInterval(progressTimer);

      setInlineAuditState(lead.id, kind, {
        status: "completed",
        score: savedAudit.score,
        verdict: savedAudit.verdict,
        message: `${label} audit completed${savedAudit.score == null ? "" : ` (Score ${savedAudit.score})`}.`,
        updatedAt: new Date().toISOString(),
      });

      await loadLeads();

      showToast(
        "success",
        `${label} audit completed for ${lead.business_name}${savedAudit.score == null ? "" : ` · Score ${savedAudit.score}`}`
      );
    } catch (err) {
      clearInterval(progressTimer);
      const message = err instanceof Error ? err.message : `Failed to run ${label} audit`;

      setInlineAuditState(lead.id, kind, {
        status: "failed",
        score: null,
        verdict: "",
        message,
        updatedAt: new Date().toISOString(),
      });

      showToast("error", message);
    }
  }

  const filterCount = activeFilterCount(filters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);

  function buildExportParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.query) params.set("query", filters.query);
    if (filters.city) params.set("city", filters.city);
    if (filters.niche) params.set("niche", filters.niche);
    if (filters.status) params.set("status", filters.status);
    if (filters.source) params.set("source", filters.source);
    if (filters.hasWebsite) params.set("hasWebsite", filters.hasWebsite);
    if (filters.hasEmail) params.set("hasEmail", filters.hasEmail);
    if (filters.gmbClaimed) params.set("gmbClaimed", filters.gmbClaimed);
    if (filters.gmbRatingMin) params.set("gmbRatingMin", filters.gmbRatingMin);
    if (filters.gmbRatingMax) params.set("gmbRatingMax", filters.gmbRatingMax);
    if (filters.gmbReviewCountMin) params.set("gmbReviewCountMin", filters.gmbReviewCountMin);
    if (filters.gmbReviewCountMax) params.set("gmbReviewCountMax", filters.gmbReviewCountMax);
    if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
    if (filters.createdTo) params.set("createdTo", filters.createdTo);
    return params;
  }

  return (
    <section className="page-enter space-y-4">
      {/* Header */}
      <header className="rounded-lg border border-slate-200 bg-white p-4" style={{ backgroundColor: "var(--bg-card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Lead Workspace</h2>
            <p className="text-[13px] text-slate-500">
              {total} leads{filterCount > 0 ? " (filtered)" : ""} &middot; {selectedRows.length} selected
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px] font-medium text-slate-600">
              <select
                value={pageSize}
                onChange={(e) => {
                  const nextPageSize = Number(e.target.value) || 25;
                  void loadLeads({ page: 1, pageSize: nextPageSize });
                }}
                className="rounded border-0 bg-transparent pr-1 text-[12px] font-medium text-slate-700 focus:ring-0"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              / page
            </label>
            <Link
              to="/lead-engine"
              className="rounded-lg bg-[#5e6ad2] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#4e5abc]"
            >
              Lead Engine
            </Link>
            <button
              type="button"
              onClick={() => void loadLeads()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                const params = buildExportParams();
                const qs = params.toString();
                const a = document.createElement("a");
                a.href = `${API_BASE_URL}/api/leads/export-csv${qs ? `?${qs}` : ""}`;
                a.download = "leads_export.csv";
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const exportFilters = { ...filters };
                  const data = await fetchLeads({ ...exportFilters, page: 1, pageSize: 10000 });
                  const items = data.items || [];
                  if (!items.length) { showToast("error", "No leads to export"); return; }
                  const XLSX = await import("xlsx");
                  const rows = [
                    ["Business Name","Phone","Email","Website","Address","City","State","Zip","Niche","GMB URL","GMB Claimed","GMB Rating","GMB Reviews","Has Website","Source","Status","Website Score","GMB Score","Created At"],
                    ...items.map((r) => [r.business_name, r.phone, r.email, r.website, r.address, r.city, r.state, r.zip, r.niche, r.gmb_url, r.gmb_claimed ? "Yes" : "No", r.gmb_rating, r.gmb_review_count, r.has_website ? "Yes" : "No", r.source, r.status, r.last_website_audit_score, r.last_gmb_audit_score, r.created_at]),
                  ];
                  const sheet = XLSX.utils.aoa_to_sheet(rows);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, sheet, "Leads");
                  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
                  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "leads_export.xlsx";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(a.href);
                  showToast("success", `Exported ${items.length} leads to XLSX`);
                } catch (err) {
                  showToast("error", err instanceof Error ? err.message : "Export failed");
                }
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              XLS
            </button>
          </div>
        </div>
      </header>

      {/* Compact Filter Bar */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" style={{ backgroundColor: "var(--bg-card)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filters.query}
            onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") void loadLeads({ page: 1 }); }}
            placeholder="Search..."
            className="w-32 rounded border border-slate-200 px-2 py-1 text-[12px]"
          />
          <input
            type="text"
            value={filters.city}
            onChange={(e) => setFilters((p) => ({ ...p, city: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") void loadLeads({ page: 1 }); }}
            placeholder="City"
            className="w-24 rounded border border-slate-200 px-2 py-1 text-[12px]"
          />
          <input
            type="text"
            value={filters.niche}
            onChange={(e) => setFilters((p) => ({ ...p, niche: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") void loadLeads({ page: 1 }); }}
            placeholder="Niche"
            className="w-24 rounded border border-slate-200 px-2 py-1 text-[12px]"
          />
          <select
            value={filters.status}
            onChange={(e) => { setFilters((p) => ({ ...p, status: e.target.value })); }}
            className="rounded border border-slate-200 px-2 py-1 text-[12px]"
          >
            <option value="">Status</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{statusBadge[s]?.label ?? s}</option>
            ))}
          </select>
          <select
            value={filters.source}
            onChange={(e) => { setFilters((p) => ({ ...p, source: e.target.value })); }}
            className="rounded border border-slate-200 px-2 py-1 text-[12px]"
          >
            <option value="">Source</option>
            {sourceOptions.map((source) => (
              <option key={source.value} value={source.value}>{source.label}</option>
            ))}
          </select>
          <select
            value={filters.hasWebsite}
            onChange={(e) => { setFilters((p) => ({ ...p, hasWebsite: e.target.value })); }}
            className="rounded border border-slate-200 px-2 py-1 text-[12px]"
          >
            <option value="">Website</option>
            <option value="true">Has Website</option>
            <option value="false">No Website</option>
          </select>
          <select
            value={filters.hasEmail}
            onChange={(e) => { setFilters((p) => ({ ...p, hasEmail: e.target.value })); }}
            className="rounded border border-slate-200 px-2 py-1 text-[12px]"
          >
            <option value="">Email</option>
            <option value="true">Has Email</option>
            <option value="false">No Email</option>
          </select>
          <select
            value={filters.gmbClaimed}
            onChange={(e) => { setFilters((p) => ({ ...p, gmbClaimed: e.target.value })); }}
            className="rounded border border-slate-200 px-2 py-1 text-[12px]"
          >
            <option value="">GMB</option>
            <option value="true">Claimed</option>
            <option value="false">Unclaimed</option>
          </select>

          {/* Expandable: rating/reviews/dates */}
          <button
            type="button"
            onClick={() => setFiltersOpen((prev) => !prev)}
            className={[
              "rounded border px-2 py-1 text-[11px] font-medium transition-colors",
              filtersOpen ? "border-[#5e6ad2] bg-[#5e6ad2]/10 text-[#5e6ad2]" : "border-slate-200 text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            More
          </button>

          <button
            type="button"
            onClick={() => void loadLeads({ page: 1 })}
            className="rounded bg-[#5e6ad2] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#4e5abc]"
          >
            Apply
          </button>
          {filterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>

        {/* Extended filters row */}
        {filtersOpen && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2" style={{ borderColor: "var(--border-primary)" }}>
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              Rating
              <input type="number" min={0} max={5} step={0.1} value={filters.gmbRatingMin} onChange={(e) => setFilters((p) => ({ ...p, gmbRatingMin: e.target.value }))} placeholder="0" className="w-14 rounded border border-slate-200 px-1.5 py-1 text-[12px]" />
              –
              <input type="number" min={0} max={5} step={0.1} value={filters.gmbRatingMax} onChange={(e) => setFilters((p) => ({ ...p, gmbRatingMax: e.target.value }))} placeholder="5" className="w-14 rounded border border-slate-200 px-1.5 py-1 text-[12px]" />
            </label>
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              Reviews
              <input type="number" min={0} step={1} value={filters.gmbReviewCountMin} onChange={(e) => setFilters((p) => ({ ...p, gmbReviewCountMin: e.target.value }))} placeholder="0" className="w-16 rounded border border-slate-200 px-1.5 py-1 text-[12px]" />
              –
              <input type="number" min={0} step={1} value={filters.gmbReviewCountMax} onChange={(e) => setFilters((p) => ({ ...p, gmbReviewCountMax: e.target.value }))} placeholder="10000" className="w-16 rounded border border-slate-200 px-1.5 py-1 text-[12px]" />
            </label>
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              From
              <input type="date" value={filters.createdFrom} onChange={(e) => setFilters((p) => ({ ...p, createdFrom: e.target.value }))} className="rounded border border-slate-200 px-1.5 py-1 text-[12px]" />
            </label>
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              To
              <input type="date" value={filters.createdTo} onChange={(e) => setFilters((p) => ({ ...p, createdTo: e.target.value }))} className="rounded border border-slate-200 px-1.5 py-1 text-[12px]" />
            </label>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar — only visible when items are selected */}
      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/30 bg-[#5e6ad2]/5 p-3 text-[13px]">
          <span className="font-semibold text-[#5e6ad2]">{selectedRows.length} selected</span>

          {/* Bulk Status Dropdown */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500">Status:</span>
            <select
              defaultValue=""
              disabled={bulkStatusUpdating}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  void handleBulkStatusChange(val);
                  e.target.value = "";
                }
              }}
              className="cursor-pointer border-0 bg-transparent text-[12px] font-semibold text-slate-700 focus:ring-0"
            >
              <option value="" disabled>Change status to...</option>
              {statusOptions.map((st) => (
                <option key={st} value={st}>
                  {statusBadge[st]?.label || st.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setCampaignModalOpen(true)}
            className="rounded-lg bg-[#5e6ad2] px-3 py-1.5 font-medium text-white hover:bg-[#4e5abc]"
          >
            Add to Campaign
          </button>
          <button
            type="button"
            onClick={() => void bulkAudit("gmb")}
            disabled={bulkAuditRunning}
            className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {bulkAuditRunning ? "Running..." : "Bulk GMB Audit"}
          </button>
          <button
            type="button"
            onClick={() => void bulkAudit("website")}
            disabled={bulkAuditRunning}
            className="rounded-lg border border-sky-400 bg-sky-50 px-3 py-1.5 font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
          >
            {bulkAuditRunning ? "Running..." : "Bulk Website Audit"}
          </button>
          <button
            type="button"
            onClick={() => downloadCsv(selectedRows)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      )}

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-[13px]">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[12px] font-medium uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedRows.length === rows.length}
                  onChange={(e) => {
                    setSelected(e.target.checked ? Object.fromEntries(rows.map((r) => [r.id, true])) : {});
                  }}
                />
              </th>
              <th className="px-3 py-3">Business Name</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Website</th>
              <th className="px-3 py-3">GMB Link</th>
              <th className="px-3 py-3">City / Niche</th>
              <th className="px-3 py-3">Lead Score</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-3"><span className="inline-block h-4 w-4 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-40 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-20 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-28 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-28 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-20 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-28 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-12 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-5 w-16 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-4 w-20 animate-pulse rounded bg-slate-200" /></td>
                  <td className="px-3 py-3"><span className="inline-block h-8 w-28 animate-pulse rounded bg-slate-200" /></td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-12 text-center">
                  <p className="text-[13px] text-slate-500 mb-3">No leads found.</p>
                  <Link to="/lead-engine" className="inline-block rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#4e5abc]">
                    Import Leads &rarr;
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((lead) => {
                const badge = statusBadge[lead.status] || { label: lead.status, className: "bg-slate-100 text-slate-600" };
                const isSelected = Boolean(selected[lead.id]);
                const gmbAudit = inlineAudits[lead.id]?.gmb;
                const websiteAudit = inlineAudits[lead.id]?.website;
                const gmbAuditState = resolveAuditState(lead, "gmb", gmbAudit);
                const websiteAuditState = resolveAuditState(lead, "website", websiteAudit);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    className={[
                      "cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50",
                      isSelected ? "bg-[#5e6ad2]/5/60" : "",
                    ].join(" ")}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          setSelected((prev) => ({ ...prev, [lead.id]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      <div className="flex flex-col justify-center">
                        <span
                          className="font-bold text-slate-900 text-xs block truncate max-w-[220px]"
                          title={lead.business_name}
                        >
                          {lead.business_name}
                        </span>
                        {lead.gmb_rating != null && lead.gmb_rating > 0 ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <RatingStars rating={lead.gmb_rating} reviews={lead.gmb_review_count} size="xs" />
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 mt-0.5 block">No rating</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-600">
                      {lead.phone || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-600 max-w-[160px] truncate">
                      {lead.email ? <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} className="text-[#5e6ad2] hover:underline">{lead.email}</a> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-600 max-w-[160px] truncate">
                      {lead.website ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#5e6ad2] hover:underline">{lead.website.replace(/^https?:\/\//, "")}</a> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-slate-600">
                      {lead.gmb_url ? <a href={lead.gmb_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#5e6ad2] hover:underline" title={lead.gmb_url}>GMB ↗</a> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {[lead.city, lead.niche].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {renderLeadScoreBadge(lead.lead_score ?? 0)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      {lead.source ? <SourceBadge source={lead.source} /> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1 items-end">
                        <div className="flex items-center gap-2">
                          {/* GMB score pill — click to trigger audit */}
                          <button
                            type="button"
                            onClick={() => void runInlineAudit(lead, "gmb")}
                            disabled={gmbAudit?.status === "running"}
                            title={`GMB: ${gmbAuditState.message} — click to ${gmbAuditState.status === "idle" ? "run" : "re-run"} audit`}
                            className={[
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors",
                              gmbAuditState.status === "running"
                                ? "border-amber-300 bg-amber-50 text-amber-700 animate-pulse"
                                : gmbAuditState.status === "failed"
                                  ? "border-red-300 bg-red-50 text-red-700"
                                  : gmbAuditState.score !== null
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
                            ].join(" ")}
                          >
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 21s7-4.4 7-11a7 7 0 1 0-14 0c0 6.6 7 11 7 11z" />
                              <circle cx="12" cy="10" r="2" fill="currentColor" stroke="none" />
                            </svg>
                            {auditScoreText(gmbAuditState.status, gmbAuditState.score)}
                          </button>

                          {/* Website score pill — click to trigger audit */}
                          <button
                            type="button"
                            onClick={() => void runInlineAudit(lead, "website")}
                            disabled={websiteAudit?.status === "running"}
                            title={`Website: ${websiteAuditState.message} — click to ${websiteAuditState.status === "idle" ? "run" : "re-run"} audit`}
                            className={[
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors",
                              websiteAuditState.status === "running"
                                ? "border-amber-300 bg-amber-50 text-amber-700 animate-pulse"
                                : websiteAuditState.status === "failed"
                                  ? "border-red-300 bg-red-50 text-red-700"
                                  : websiteAuditState.score !== null
                                    ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
                            ].join(" ")}
                          >
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="9" />
                              <path d="M3 12h18" />
                              <path d="M12 3a15 15 0 0 1 0 18" />
                              <path d="M12 3a15 15 0 0 0 0 18" />
                            </svg>
                            {auditScoreText(websiteAuditState.status, websiteAuditState.score)}
                          </button>

                          {/* Quick Pitch button */}
                          <button
                            type="button"
                            onClick={() => {
                              setPitchTargetLead(lead);
                              setShowPitchModal(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-[#5e6ad2]/40 bg-[#5e6ad2]/10 px-2.5 py-1 text-[11px] font-bold text-[#5e6ad2] hover:bg-[#5e6ad2] hover:text-white transition-colors"
                            title="1-Click personalized audit pitch email"
                          >
                            <span>✉</span>
                            <span>Pitch</span>
                          </button>

                          {/* Actions dropdown — Open + Downloads */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenDownloadMenuKey((current) =>
                                  current === `actions:${lead.id}` ? null : `actions:${lead.id}`
                                );
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                              style={{ backgroundColor: "var(--bg-card)" }}
                            >
                              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
                              </svg>
                            </button>
                            {openDownloadMenuKey === `actions:${lead.id}` && (
                              <div
                                className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border bg-white p-1.5"
                                style={{
                                  backgroundColor: "var(--bg-card)",
                                  borderColor: "var(--border-primary)",
                                  boxShadow: "0 8px 30px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.06) inset",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPitchTargetLead(lead);
                                    setShowPitchModal(true);
                                    setOpenDownloadMenuKey(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-bold text-[#5e6ad2] hover:bg-[#5e6ad2]/10"
                                >
                                  <span>✉</span>
                                  Draft Pitch Email
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/leads/${lead.id}`);
                                    setOpenDownloadMenuKey(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                  Open Lead
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/audit-tools/website?leadId=${encodeURIComponent(lead.id)}`);
                                    setOpenDownloadMenuKey(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                  Full Audit Page
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/audit-tools/gmb?leadId=${encodeURIComponent(lead.id)}`);
                                    setOpenDownloadMenuKey(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                  GMB Checklist
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/audit-tools/gmb?leadId=${encodeURIComponent(lead.id)}&advanced=true`);
                                    setOpenDownloadMenuKey(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                  Deep AI GMB Optimizer
                                </button>
                                <div className="my-1" style={{ borderTop: "1px solid var(--border-primary)" }} />
                                <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>GMB Report</p>
                                {(["pdf", "excel"] as const).map((fmt) => (
                                  <button
                                    key={`gmb-${fmt}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void downloadAuditReport(lead, "gmb", fmt);
                                    }}
                                    disabled={gmbAuditState.score === null}
                                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                                  >
                                    {fmt.toUpperCase()}
                                  </button>
                                ))}
                                <div className="my-1" style={{ borderTop: "1px solid var(--border-primary)" }} />
                                <p className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>Website Report</p>
                                {(["pdf", "excel"] as const).map((fmt) => (
                                  <button
                                    key={`web-${fmt}`}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void downloadAuditReport(lead, "website", fmt);
                                    }}
                                    disabled={websiteAuditState.score === null}
                                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                                  >
                                    {fmt.toUpperCase()}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Live progress logs */}
                        {gmbAuditState.status === "running" && (
                          <div className="flex items-center gap-1.5 animate-pulse text-[10px] text-amber-600 font-bold bg-amber-50 rounded px-1.5 py-0.5 border border-amber-200/50 mt-0.5 max-w-[145px] truncate" title={gmbAuditState.message}>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                            <span className="truncate">{gmbAuditState.message}</span>
                          </div>
                        )}
                        {websiteAuditState.status === "running" && (
                          <div className="flex items-center gap-1.5 animate-pulse text-[10px] text-amber-600 font-bold bg-amber-50 rounded px-1.5 py-0.5 border border-amber-200/50 mt-0.5 max-w-[145px] truncate" title={websiteAuditState.message}>
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                            <span className="truncate">{websiteAuditState.message}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-600">
        <p>
          Showing {showingFrom}-{showingTo} of {total}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => void loadLeads({ page: page - 1 })}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-slate-500">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => void loadLeads({ page: page + 1 })}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Campaign Dropdown Modal */}
      {campaignModalOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5" style={{ backgroundColor: "var(--bg-card)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Add to Campaign</h3>
            <p className="mt-1 text-[13px] text-slate-500">{selectedRows.length} leads selected</p>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
            >
              <option value={DIRECT_CAMPAIGN_VALUE}>Create New Campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCampaignModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void addSelectedToCampaign()}
                disabled={loading}
                className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#4e5abc] disabled:opacity-50"
              >
                {loading ? "Adding..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete Leads"
        message={`Are you sure you want to delete ${selectedRows.length} lead${selectedRows.length !== 1 ? "s" : ""}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void bulkDelete();
        }}
      />

      {/* 1-Click Quick Pitch Modal */}
      <QuickPitchModal
        lead={pitchTargetLead}
        isOpen={showPitchModal}
        onClose={() => setShowPitchModal(false)}
        onSent={() => void loadLeads()}
      />
    </section>
  );
}
