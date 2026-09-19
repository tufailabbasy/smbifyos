import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  cleanImportJobs,
  deleteImportJob,
  fetchImportJobs,
  importLeadsCsv,
  pauseImportJob,
  restartImportJob,
  resumeImportJob,
  stopImportJob,
  triggerBingAdsIntelImport,
  triggerBbbImport,
  triggerGmbImport,
  triggerGoogleAdsIntelImport,
  triggerMetaAdsIntelImport,
  triggerStateImport,
  triggerWebsiteEnrichment,
  triggerYellowPagesImport,
  triggerYelpImport,
  type ScraperJob,
  addSelectedScrapedLeadsToDashboard,
  fetchJobScrapedLeads,
  setJobScrapedLeadSelection,
  setAllJobScrapedLeadSelection,
  runSelectedStagedLeadAudits,
  runStagedLeadAudit,
  type StagedScrapedLead,
} from "../lib/api";
import { getSourceBrand } from "../lib/sourceBranding";
import { StatusBadge } from "../components/ui/StatusBadge";
import { QuickPitchModal } from "../components/QuickPitchModal";

const sourceLabelMap: Record<string, string> = {
  yellowpages: "Yellow Pages",
  state_directory: "State Directory",
  gmb_scraper: "Google Maps",
  yelp_scraper: "Yelp.com",
  bbb_scraper: "BBB.org",
  website_enrichment: "Website Enrichment",
  chamber_directory: "Chamber Directory",
  license_registry: "License Registry",
  ads_google: "Google Ads Intel",
  ads_meta: "Meta Ads Intel",
  ads_bing: "Microsoft/Bing Ads Intel",
};

const SOURCES = [
  { key: "gmb_scraper", label: "Google Maps", icon: "", type: "High intent", desc: "Map listings and local claim status" },
  { key: "state_directory", label: "State Directory", icon: "", type: "Registry", desc: "Official state business registries" },
  { key: "ads_google", label: "Google Ads Intel", icon: "", type: "Paid Ads", desc: "Identify active Google search advertisers" },
  { key: "ads_meta", label: "Meta Ads Intel", icon: "", type: "Social Ads", desc: "Identify active Facebook & Instagram ads" },
  { key: "ads_bing", label: "Bing Ads Intel", icon: "", type: "Search Ads", desc: "Identify active Bing advertisers" },
  { key: "website_enrichment", label: "Website Enrichment", icon: "", type: "Enrichment", desc: "Enrich leads with social links and emails" },
  { key: "csv_manual", label: "CSV Import", icon: "", type: "Manual", desc: "Import lead sheets from your device" },
];

const taskTypeMap: Record<string, { label: string; badgeClass: string }> = {
  yellowpages: { label: "Lead Scraping", badgeClass: "bg-amber-100 text-amber-800" },
  state_directory: { label: "Lead Scraping", badgeClass: "bg-amber-100 text-amber-800" },
  gmb_scraper: { label: "Lead Scraping", badgeClass: "bg-amber-100 text-amber-800" },
  yelp_scraper: { label: "Lead Scraping", badgeClass: "bg-amber-100 text-amber-800" },
  bbb_scraper: { label: "Lead Scraping", badgeClass: "bg-amber-100 text-amber-800" },
  chamber_directory: { label: "Lead Scraping", badgeClass: "bg-amber-100 text-amber-800" },
  license_registry: { label: "Lead Scraping", badgeClass: "bg-amber-100 text-amber-800" },
  website_enrichment: { label: "Enrichment", badgeClass: "bg-violet-100 text-violet-800" },
  ads_google: { label: "Ads Intel", badgeClass: "bg-lime-100 text-lime-800" },
  ads_meta: { label: "Ads Intel", badgeClass: "bg-blue-100 text-blue-800" },
  ads_bing: { label: "Ads Intel", badgeClass: "bg-sky-100 text-sky-800" },
};

const sourceThemeMap: Record<string, { panel: string; badge: string; button: string; accent: string; description: string }> = {
  yellowpages: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-amber-600 to-amber-700 text-white",
    button: "bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 shadow-sm hover:shadow-amber-200",
    accent: "amber",
    description: "Classic directory prospecting with business names, phones, and websites.",
  },
  gmb_scraper: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white",
    button: "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-sm hover:shadow-emerald-200",
    accent: "emerald",
    description: "High-intent map leads with claim-status insight and stronger local buying signals.",
  },
  state_directory: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-sky-600 to-sky-700 text-white",
    button: "bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 shadow-sm hover:shadow-sky-200",
    accent: "sky",
    description: "Wider state-level coverage when you need registry-style business discovery.",
  },
  yelp_scraper: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-rose-600 to-rose-700 text-white",
    button: "bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 shadow-sm hover:shadow-rose-200",
    accent: "rose",
    description: "Useful for review-heavy local niches where Yelp visibility still matters.",
  },
  bbb_scraper: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-cyan-600 to-cyan-700 text-white",
    button: "bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 shadow-sm hover:shadow-cyan-200",
    accent: "cyan",
    description: "Trust-first source for businesses where accreditation and reputation help outreach.",
  },
  website_enrichment: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-violet-600 to-violet-700 text-white",
    button: "bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 shadow-sm hover:shadow-violet-200",
    accent: "violet",
    description: "Re-scan staged leads to enrich websites, emails, contact pages, social links, and SEO clues.",
  },
  ads_google: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-lime-600 to-lime-700 text-white",
    button: "bg-gradient-to-r from-lime-600 to-lime-700 hover:from-lime-700 hover:to-lime-800 shadow-sm hover:shadow-lime-200",
    accent: "lime",
    description: "Premium advertiser candidates discovered from Google ad-intelligence signals.",
  },
  ads_meta: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-blue-600 to-blue-700 text-white",
    button: "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-sm hover:shadow-blue-200",
    accent: "blue",
    description: "Meta/Facebook ad-intelligence candidates for businesses already paying for local attention.",
  },
  ads_bing: {
    panel: "glass-card-subtle",
    badge: "bg-gradient-to-r from-slate-600 to-slate-700 text-white",
    button: "bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 shadow-sm hover:shadow-slate-200",
    accent: "slate",
    description: "Microsoft/Bing paid-intent discovery for extra advertiser coverage beyond Google and Meta.",
  },
};



function statusBadge(status: string): string {
  if (status === "running") return "bg-sky-100 text-sky-700";
  if (status === "queued") return "bg-amber-100 text-amber-700";
  if (status === "paused") return "bg-violet-100 text-violet-700";
  if (status === "complete") return "bg-emerald-100 text-emerald-700";
  if (status === "cancelled") return "bg-slate-200 text-slate-700";
  return "bg-red-100 text-red-700";
}

function progressValue(job: ScraperJob): number {
  if (job.status === "complete" || job.status === "cancelled" || job.status === "error") {
    return 100;
  }

  const pct = Number(job.progress_percent || 0);
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatJobTimeframe(job: ScraperJob): string {
  const startSource = job.started_at || job.created_at;
  if (!startSource) {
    return "-";
  }

  const startedAt = new Date(startSource).getTime();
  if (!Number.isFinite(startedAt)) {
    return "-";
  }

  const endedAt = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
  if (!Number.isFinite(endedAt) || endedAt < startedAt) {
    return "-";
  }

  return formatDuration(endedAt - startedAt);
}

function getJobDisplayLabel(job: Pick<ScraperJob, "id" | "job_label"> | null | undefined): string {
  if (!job) {
    return "-";
  }

  const label = String(job.job_label || "").trim();
  if (label) {
    return label;
  }

  return `job-${job.id.slice(0, 8)}`;
}



export function ImportLeadsPage() {
  const navigate = useNavigate();

  const [selectedSource, setSelectedSource] = useState<string>("gmb_scraper");
  const [showScraperAdvanced, setShowScraperAdvanced] = useState<boolean>(false);

  const [ypBusinessType, setYpBusinessType] = useState("");
  const [ypLocation, setYpLocation] = useState("");
  const [ypMaxItems, setYpMaxItems] = useState(20);

  const [googleKeyword, setGoogleKeyword] = useState("");
  const [googleLocation, setGoogleLocation] = useState("");
  const [googleListings, setGoogleListings] = useState(40);

  const [stateCode, setStateCode] = useState("");
  const [stateBusinessType, setStateBusinessType] = useState("");
  const [stateLimit, setStateLimit] = useState(250);

  const [yelpBusinessType, setYelpBusinessType] = useState("");
  const [yelpLocation, setYelpLocation] = useState("");
  const [yelpMaxItems, setYelpMaxItems] = useState(20);

  const [bbbBusinessType, setBbbBusinessType] = useState("");
  const [bbbLocation, setBbbLocation] = useState("");
  const [bbbMaxItems, setBbbMaxItems] = useState(20);

  const [enrichmentSelectedOnly, setEnrichmentSelectedOnly] = useState(true);
  const [enrichmentPendingOnly, setEnrichmentPendingOnly] = useState(true);
  const [enrichmentLimit, setEnrichmentLimit] = useState(50);

  const [googleAdsBusinessType, setGoogleAdsBusinessType] = useState("");
  const [googleAdsLocation, setGoogleAdsLocation] = useState("");
  const [googleAdsMaxItems, setGoogleAdsMaxItems] = useState(20);

  const [metaAdsBusinessType, setMetaAdsBusinessType] = useState("");
  const [metaAdsLocation, setMetaAdsLocation] = useState("");
  const [metaAdsMaxItems, setMetaAdsMaxItems] = useState(20);

  const [bingAdsBusinessType, setBingAdsBusinessType] = useState("");
  const [bingAdsLocation, setBingAdsLocation] = useState("");
  const [bingAdsMaxItems, setBingAdsMaxItems] = useState(20);

  const [jobs, setJobs] = useState<ScraperJob[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [activeAction, setActiveAction] = useState<string>("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [enrichmentJobId, setEnrichmentJobId] = useState("");

  const [selectedJobId, setSelectedJobId] = useState("");
  const [stagedLeads, setStagedLeads] = useState<StagedScrapedLead[]>([]);
  const [stagedLoading, setStagedLoading] = useState(false);
  const [stagedQuery, setStagedQuery] = useState("");
  const [stagedCityFilter, setStagedCityFilter] = useState("");
  const [stagedNicheFilter, setStagedNicheFilter] = useState("");
  const [stagedGmbClaimFilter, setStagedGmbClaimFilter] = useState<"" | "claimed" | "unclaimed" | "unknown">("");
  const [stagedWebsiteFilter, setStagedWebsiteFilter] = useState<"" | "has_website" | "missing_website">("");
  const [stagedPage, setStagedPage] = useState(1);
  const [stagedTotal, setStagedTotal] = useState(0);
  const [stagedPendingCount, setStagedPendingCount] = useState(0);
  const [stagedSelectedPending, setStagedSelectedPending] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [auditingLeadId, setAuditingLeadId] = useState<string | null>(null);
  const [pitchModalLead, setPitchModalLead] = useState<any>(null);
  const [showPitchModal, setShowPitchModal] = useState(false);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId]);
  const selectedJobIsActive = useMemo(() => {
    return Boolean(
      selectedJob && (selectedJob.status === "running" || selectedJob.status === "queued" || selectedJob.status === "paused")
    );
  }, [selectedJob]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (stagedQuery) count++;
    if (stagedCityFilter) count++;
    if (stagedNicheFilter) count++;
    if (stagedGmbClaimFilter) count++;
    if (stagedWebsiteFilter) count++;
    return count;
  }, [stagedQuery, stagedCityFilter, stagedNicheFilter, stagedGmbClaimFilter, stagedWebsiteFilter]);

  async function loadStagedLeads(jobId: string, pageValue = stagedPage): Promise<void> {
    if (!jobId) {
      setStagedLeads([]);
      setStagedTotal(0);
      setStagedPendingCount(0);
      setStagedSelectedPending(0);
      return;
    }

    setStagedLoading(true);
    try {
      const data = await fetchJobScrapedLeads(jobId, {
        page: pageValue,
        pageSize: 10,
        query: stagedQuery || undefined,
        pendingOnly: true,
        city: stagedCityFilter || undefined,
        niche: stagedNicheFilter || undefined,
        gmbClaimStatus: stagedGmbClaimFilter || undefined,
        contactFilter: stagedWebsiteFilter || undefined,
      });

      setStagedLeads(data.items);
      setStagedTotal(data.total);
      setStagedPendingCount(data.pending);
      setStagedSelectedPending(data.selectedPending);
      setStagedPage(data.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scraped leads");
    } finally {
      setStagedLoading(false);
    }
  }

  useEffect(() => {
    if (selectedJobId) {
      void loadStagedLeads(selectedJobId, stagedPage);
    }
  }, [selectedJobId, stagedPage, stagedQuery, stagedCityFilter, stagedNicheFilter, stagedGmbClaimFilter, stagedWebsiteFilter]);

  useEffect(() => {
    if (!selectedJobId || !selectedJobIsActive) return;
    const timer = setInterval(() => {
      void loadStagedLeads(selectedJobId, stagedPage);
    }, 2500);
    return () => clearInterval(timer);
  }, [selectedJobId, selectedJobIsActive, stagedPage, stagedQuery, stagedCityFilter, stagedNicheFilter, stagedGmbClaimFilter, stagedWebsiteFilter]);

  useEffect(() => {
    if (selectedJobId) {
      setEnrichmentJobId(selectedJobId);
    }
  }, [selectedJobId]);

  async function toggleLeadSelection(leadId: string, selected: boolean): Promise<void> {
    if (!selectedJobId) return;
    setError("");
    try {
      await setJobScrapedLeadSelection(selectedJobId, leadId, selected);
      await loadStagedLeads(selectedJobId, stagedPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lead selection");
    }
  }

  async function setAllSelection(selected: boolean): Promise<void> {
    if (!selectedJobId) return;
    setError("");
    try {
      await setAllJobScrapedLeadSelection(selectedJobId, selected);
      await loadStagedLeads(selectedJobId, stagedPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update selections");
    }
  }

  async function addSelectedToDashboard(): Promise<void> {
    if (!selectedJobId) return;
    setActiveAction("add-selected");
    setError("");
    try {
      const result = await addSelectedScrapedLeadsToDashboard(selectedJobId);
      setMessage(`Successfully imported ${result.inserted} leads to directory.`);
      await Promise.all([loadJobs(), loadStagedLeads(selectedJobId, 1)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add selected leads");
    } finally {
      setActiveAction("");
    }
  }

  async function runBatchAudit(auditType: "website" | "gmb" | "all" = "all"): Promise<void> {
    if (!selectedJobId) return;
    setActiveAction(`batch-audit-${auditType}`);
    setError("");
    setMessage("");
    try {
      const result = await runSelectedStagedLeadAudits(selectedJobId, {
        auditType,
        selectedOnly: true,
      });
      setMessage(`Batch audit completed for ${result.processed} leads.`);
      await loadStagedLeads(selectedJobId, stagedPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run batch audit");
    } finally {
      setActiveAction("");
    }
  }

  async function handleSingleAudit(jobId: string, leadId: string, auditType: "website" | "gmb" | "all" = "all"): Promise<void> {
    setAuditingLeadId(leadId);
    setError("");
    setMessage("");
    try {
      const res = await runStagedLeadAudit(jobId, leadId, auditType);
      setStagedLeads((prev) => prev.map((l) => (l.id === leadId ? res.lead : l)));
      setMessage(`Audit completed for ${res.lead.business_name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run audit on lead");
    } finally {
      setAuditingLeadId(null);
    }
  }

  function handleOpenPitch(lead: StagedScrapedLead) {
    setPitchModalLead({
      id: lead.id,
      business_name: lead.business_name,
      website: lead.website,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      state: lead.state,
      gmb_rating: lead.gmb_rating,
      gmb_review_count: lead.gmb_review_count,
      gmb_claimed: lead.gmb_claim_status === "claimed" ? true : lead.gmb_claim_status === "unclaimed" ? false : undefined,
      last_website_audit_score: lead.website_audit?.score,
      last_gmb_audit_score: lead.gmb_audit?.score,
    });
    setShowPitchModal(true);
  }

  async function loadJobs(): Promise<void> {
    try {
      const data = await fetchImportJobs();
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    }
  }

  useEffect(() => {
    void loadJobs();
    const timer = setInterval(() => {
      void loadJobs();
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  const runningCount = useMemo(
    () => jobs.filter((job) => job.status === "running" || job.status === "queued").length,
    [jobs]
  );

  const hasBlockingScraperJob = useMemo(
    () => jobs.some((job) => job.status === "running" || job.status === "paused"),
    [jobs]
  );

  const queuedCount = useMemo(
    () => jobs.filter((job) => job.status === "queued").length,
    [jobs]
  );

  const startButtonsLocked = Boolean(activeAction);

  const totalImported = useMemo(
    () => jobs.reduce((sum, job) => sum + Number(job.imported_count || 0), 0),
    [jobs]
  );

  async function startAction(
    actionKey: string,
    executor: () => Promise<{ message: string; jobId: string; jobLabel?: string | null }>
  ) {
    setActiveAction(actionKey);
    setError("");
    setMessage("");

    try {
      const result = await executor();
      setMessage(`${result.message} | Job: ${result.jobLabel || result.jobId}`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scraper job");
    } finally {
      setActiveAction("");
    }
  }

  async function submitCsv(): Promise<void> {
    if (!csvFile) {
      setError("Please choose a CSV file first.");
      return;
    }

    setActiveAction("csv");
    setError("");
    setMessage("");
    try {
      const result = await importLeadsCsv(csvFile);
      setMessage(`CSV import complete. Inserted: ${result.inserted}, Updated: ${result.updated}`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setActiveAction("");
    }
  }

  async function stopJob(jobId: string): Promise<void> {
    setError("");
    try {
      await stopImportJob(jobId);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop job");
    }
  }

  async function pauseJob(jobId: string): Promise<void> {
    setError("");
    try {
      await pauseImportJob(jobId);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pause job");
    }
  }

  async function resumeJob(jobId: string): Promise<void> {
    setError("");
    try {
      await resumeImportJob(jobId);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume job");
    }
  }

  async function restartJob(jobId: string): Promise<void> {
    setError("");
    try {
      const result = await restartImportJob(jobId);
      setMessage(`Started again from previous job settings. New job: ${result.jobLabel || result.jobId}`);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start again");
    }
  }

  async function cleanFinishedJobs(): Promise<void> {
    setActiveAction("clean-jobs");
    setError("");

    try {
      const result = await cleanImportJobs("finished");
      setMessage(`Cleaned ${result.deleted} finished jobs from history.`);
      await loadJobs();
      if (selectedJobId) {
        const stillExists = jobs.some((job) => job.id === selectedJobId);
        if (!stillExists) {
          setSelectedJobId("");
          setStagedLeads([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clean jobs");
    } finally {
      setActiveAction("");
    }
  }

  async function removeFinishedJob(jobId: string): Promise<void> {
    setError("");

    try {
      await deleteImportJob(jobId);
      await loadJobs();
      if (selectedJobId === jobId) {
        setSelectedJobId("");
        setStagedLeads([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete job");
    }
  }

  return (
    <section className="page-enter gradient-mesh-bg -m-4 min-h-screen space-y-5 overflow-x-hidden p-4 sm:p-6">
      <header className="glass-card glow-accent rounded-2xl p-6">
        <div className="gradient-header -m-6 mb-0 rounded-t-2xl px-6 pb-4 pt-6">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5e6ad2]">Lead Engine</p>
          <h2 className="mt-1 bg-gradient-to-r from-[#5e6ad2] via-[#7b85dc] to-[#a855f7] bg-clip-text text-2xl font-bold text-transparent">Multi-Source Scraper Control Center</h2>
          <p className="mt-2 max-w-3xl text-[13px] text-slate-500">
            Run scrapers one-by-one. Scraped leads are automatically imported to the main Leads Workspace upon completion.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="glass-stat glow-sm rounded-xl p-3 transition-all duration-200 hover:scale-[1.02]">
            <p className="text-[12px] uppercase tracking-[0.08em] text-slate-500">Running / Queued</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{runningCount}{queuedCount > 0 ? <span className="ml-1 text-base font-normal text-amber-500">+{queuedCount} queued</span> : null}</p>
          </div>
          <div className="glass-stat glow-sm rounded-xl p-3 transition-all duration-200 hover:scale-[1.02]">
            <p className="text-[12px] uppercase tracking-[0.08em] text-slate-500">Rows Added To Dashboard</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{totalImported}</p>
          </div>
          <div className="glass-stat glow-sm rounded-xl p-3 transition-all duration-200 hover:scale-[1.02]">
            <p className="text-[12px] uppercase tracking-[0.08em] text-slate-500">Active Sources</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">5</p>
          </div>
        </div>
      </header>

      {message && <p className="glass-card-subtle rounded-xl border-l-4 border-emerald-400 p-3 text-[13px] text-emerald-700">{message}</p>}
      {error && <p className="glass-card-subtle rounded-xl border-l-4 border-red-400 p-3 text-[13px] text-red-700">{error}</p>}
      {hasBlockingScraperJob && (
        <p className="glass-card-subtle rounded-xl border-l-4 border-amber-400 p-3 text-[13px] text-amber-800">
          A scraper is currently running.{queuedCount > 0 ? ` ${queuedCount} job${queuedCount > 1 ? "s" : ""} queued — they will auto-start when the current job finishes.` : " New jobs will be queued and auto-start when this job finishes."}
        </p>
      )}

      <section className="space-y-3">
        <div className="glass-card glow-sm flex flex-wrap items-start justify-between gap-3 rounded-2xl p-4">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5e6ad2]">Launchpad</p>
            <h3 className="mt-1 bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-lg font-semibold text-transparent">Choose a source and start collecting leads</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className={`glass-badge rounded-full px-3 py-1 text-[12px] font-semibold ${hasBlockingScraperJob ? "text-amber-700" : "text-emerald-700"}`}>
              {hasBlockingScraperJob ? "Scraper already active" : "Ready for new scrape"}
            </span>
            <span className="text-[12px] text-slate-500">Imported {totalImported}</span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Top: Source Selector Gallery */}
          <div className="glass-card glow-sm p-4 rounded-2xl space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Lead Source</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {SOURCES.map((src) => {
                const isSelected = selectedSource === src.key;
                return (
                  <button
                    key={src.key}
                    type="button"
                    onClick={() => {
                      setSelectedSource(src.key);
                      setShowScraperAdvanced(false);
                    }}
                    className={[
                      "w-full text-left rounded-xl p-3 border transition-all flex flex-col justify-between gap-2.5 active:scale-[0.99] h-20",
                      isSelected
                        ? "border-[#5e6ad2] bg-[#5e6ad2]/5 font-bold shadow-sm ring-1 ring-[#5e6ad2]"
                        : "border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-5 w-5 shrink-0 overflow-hidden rounded">
                        {getSourceBrand(src.key).icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11.5px] text-slate-800 font-bold truncate">{src.label}</p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-bold text-slate-500 uppercase tracking-wider self-start">
                      {src.type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom: Active Sourcing Config Card */}
          <div className="w-full">
            {(() => {
              const src = SOURCES.find((s) => s.key === selectedSource) || SOURCES[0];
              const theme = sourceThemeMap[selectedSource as keyof typeof sourceThemeMap] || {
                panel: "glass-card",
                badge: "bg-indigo-600 text-white",
                button: "bg-indigo-600 hover:bg-indigo-700",
                accent: "indigo",
              };

              return (
                <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md space-y-5 min-h-[350px] flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-8 w-8 shrink-0 overflow-hidden rounded">
                          {getSourceBrand(src.key).icon}
                        </span>
                        <div>
                          <h4 className="text-[14px] font-bold text-slate-900">{src.label}</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">{src.desc}</p>
                        </div>
                      </div>
                      <span className={["rounded-full px-3 py-0.5 text-[10px] font-bold uppercase shadow-sm text-white", theme.badge || "bg-indigo-600"].join(" ")}>
                        {src.type}
                      </span>
                    </div>

                    {/* Google Maps Form */}
                    {selectedSource === "gmb_scraper" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Search Query / Keyword
                            <input
                              value={googleKeyword}
                              onChange={(e) => setGoogleKeyword(e.target.value)}
                              placeholder="plumber, dentist, roofer"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location (City, State)
                            <input
                              value={googleLocation}
                              onChange={(e) => setGoogleLocation(e.target.value)}
                              placeholder="Miami, FL"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Listings per Query
                                <input
                                  type="number"
                                  min={1}
                                  value={googleListings}
                                  onChange={(e) => setGoogleListings(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("google", () => triggerGmbImport({ keyword: googleKeyword, location: googleLocation, listingsPerQuery: googleListings }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch Google Maps Scraper
                        </button>
                      </div>
                    )}

                    {/* Yellow Pages Form */}
                    {selectedSource === "yellowpages" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Business Type
                            <input
                              value={ypBusinessType}
                              onChange={(e) => setYpBusinessType(e.target.value)}
                              placeholder="plumber, doctor"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location (City, State)
                            <input
                              value={ypLocation}
                              onChange={(e) => setYpLocation(e.target.value)}
                              placeholder="Miami, FL"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Listings to Scrape
                                <input
                                  type="number"
                                  min={1}
                                  value={ypMaxItems}
                                  onChange={(e) => setYpMaxItems(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("yellowpages", () => triggerYellowPagesImport({ businessType: ypBusinessType, location: ypLocation, maxItems: ypMaxItems }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch Yellow Pages Scraper
                        </button>
                      </div>
                    )}

                    {/* Yelp Form */}
                    {selectedSource === "yelp_scraper" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Business Type
                            <input
                              value={yelpBusinessType}
                              onChange={(e) => setYelpBusinessType(e.target.value)}
                              placeholder="restaurant, dental"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location (City, State)
                            <input
                              value={yelpLocation}
                              onChange={(e) => setYelpLocation(e.target.value)}
                              placeholder="Miami, FL"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Listings to Scrape
                                <input
                                  type="number"
                                  min={1}
                                  value={yelpMaxItems}
                                  onChange={(e) => setYelpMaxItems(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("yelp", () => triggerYelpImport({ businessType: yelpBusinessType, location: yelpLocation, maxItems: yelpMaxItems }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch Yelp Scraper
                        </button>
                      </div>
                    )}

                    {/* BBB Form */}
                    {selectedSource === "bbb_scraper" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Business Type
                            <input
                              value={bbbBusinessType}
                              onChange={(e) => setBbbBusinessType(e.target.value)}
                              placeholder="roofing, contractor"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location (City, State)
                            <input
                              value={bbbLocation}
                              onChange={(e) => setBbbLocation(e.target.value)}
                              placeholder="Miami, FL"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Listings to Scrape
                                <input
                                  type="number"
                                  min={1}
                                  value={bbbMaxItems}
                                  onChange={(e) => setBbbMaxItems(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("bbb", () => triggerBbbImport({ businessType: bbbBusinessType, location: bbbLocation, maxItems: bbbMaxItems }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch BBB Scraper
                        </button>
                      </div>
                    )}

                    {/* State Registry Form */}
                    {selectedSource === "state_directory" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            State Code / Slug
                            <input
                              value={stateCode}
                              onChange={(e) => setStateCode(e.target.value)}
                              placeholder="FL, NY, CA"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Business Niche / Type
                            <input
                              value={stateBusinessType}
                              onChange={(e) => setStateBusinessType(e.target.value)}
                              placeholder="plumbing, roofing"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Listings to Import
                                <input
                                  type="number"
                                  min={1}
                                  max={5000}
                                  value={stateLimit}
                                  onChange={(e) => setStateLimit(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("state", () => triggerStateImport({ state: stateCode, businessType: stateBusinessType, limit: stateLimit }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch State Registry Import
                        </button>
                      </div>
                    )}

                    {/* Google Ads Intel Form */}
                    {selectedSource === "ads_google" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Business Type
                            <input
                              value={googleAdsBusinessType}
                              onChange={(e) => setGoogleAdsBusinessType(e.target.value)}
                              placeholder="roofing, dental"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location (City, State)
                            <input
                              value={googleAdsLocation}
                              onChange={(e) => setGoogleAdsLocation(e.target.value)}
                              placeholder="Miami, FL"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Advertisers to Scrape
                                <input
                                  type="number"
                                  min={1}
                                  value={googleAdsMaxItems}
                                  onChange={(e) => setGoogleAdsMaxItems(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("ads-google", () => triggerGoogleAdsIntelImport({ businessType: googleAdsBusinessType, location: googleAdsLocation, maxItems: googleAdsMaxItems }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch Google Ads Intel Scraper
                        </button>
                      </div>
                    )}

                    {/* Meta Ads Intel Form */}
                    {selectedSource === "ads_meta" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Business Type
                            <input
                              value={metaAdsBusinessType}
                              onChange={(e) => setMetaAdsBusinessType(e.target.value)}
                              placeholder="roofing, dental"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location (City, State)
                            <input
                              value={metaAdsLocation}
                              onChange={(e) => setMetaAdsLocation(e.target.value)}
                              placeholder="Miami, FL"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Advertisers to Scrape
                                <input
                                  type="number"
                                  min={1}
                                  value={metaAdsMaxItems}
                                  onChange={(e) => setMetaAdsMaxItems(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("ads-meta", () => triggerMetaAdsIntelImport({ businessType: metaAdsBusinessType, location: metaAdsLocation, maxItems: metaAdsMaxItems }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch Meta Ads Intel Scraper
                        </button>
                      </div>
                    )}

                    {/* Bing Ads Intel Form */}
                    {selectedSource === "ads_bing" && (
                      <div className="space-y-3.5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Business Type
                            <input
                              value={bingAdsBusinessType}
                              onChange={(e) => setBingAdsBusinessType(e.target.value)}
                              placeholder="roofing, dental"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Location (City, State)
                            <input
                              value={bingAdsLocation}
                              onChange={(e) => setBingAdsLocation(e.target.value)}
                              placeholder="Miami, FL"
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-slate-700 placeholder-slate-400 focus:border-[#5e6ad2] focus:outline-none"
                            />
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Advertisers to Scrape
                                <input
                                  type="number"
                                  min={1}
                                  value={bingAdsMaxItems}
                                  onChange={(e) => setBingAdsMaxItems(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked}
                          onClick={() => void startAction("ads-bing", () => triggerBingAdsIntelImport({ businessType: bingAdsBusinessType, location: bingAdsLocation, maxItems: bingAdsMaxItems }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Launch Bing Ads Intel Scraper
                        </button>
                      </div>
                    )}

                    {/* Website Enrichment Form */}
                    {selectedSource === "website_enrichment" && (
                      <div className="space-y-3.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Select Scrape Job to Enrich
                            <select
                              value={enrichmentJobId}
                              onChange={(e) => setEnrichmentJobId(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-semibold text-[#1e293b] focus:border-[#5e6ad2] focus:outline-none"
                            >
                              <option value="">-- Choose a Scrape Job --</option>
                              {jobs.map((job) => (
                                <option key={job.id} value={job.id}>
                                  {getJobDisplayLabel(job)} | {sourceLabelMap[job.source] || job.source} | Found: {job.total_found}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowScraperAdvanced(!showScraperAdvanced)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                          >
                            {showScraperAdvanced ? "Hide Advanced Options ▲" : "Show Advanced Options ▼"}
                          </button>
                          {showScraperAdvanced && (
                            <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-3 animate-fade-in">
                              <div className="flex gap-4">
                                <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
                                  <input type="checkbox" checked={enrichmentSelectedOnly} onChange={(e) => setEnrichmentSelectedOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 focus:ring-indigo-500" />
                                  Selected Leads Only
                                </label>
                                <label className="inline-flex items-center gap-1.5 text-[12px] text-slate-600">
                                  <input type="checkbox" checked={enrichmentPendingOnly} onChange={(e) => setEnrichmentPendingOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 focus:ring-indigo-500" />
                                  Pending Leads Only
                                </label>
                              </div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Max Leads Limit
                                <input
                                  type="number"
                                  min={1}
                                  value={enrichmentLimit}
                                  onChange={(e) => setEnrichmentLimit(Number(e.target.value || 1))}
                                  className="mt-1 w-full max-w-[120px] rounded-lg border border-slate-200 px-2 py-1.5 text-[11px]"
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={startButtonsLocked || !enrichmentJobId}
                          onClick={() => void startAction("website-enrichment", () => triggerWebsiteEnrichment({ sourceJobId: enrichmentJobId, selectedOnly: enrichmentSelectedOnly, pendingOnly: enrichmentPendingOnly, limit: enrichmentLimit }))}
                          className={["w-full rounded-xl py-3 text-xs font-bold text-white shadow transition-all duration-200 active:scale-[0.98] disabled:opacity-50", theme.button].join(" ")}
                        >
                          Enrich Selected Job Websites
                        </button>
                      </div>
                    )}

                    {/* CSV Import Form */}
                    {selectedSource === "csv_manual" && (
                      <div className="space-y-3.5">
                        <div className="border-2 border-dashed border-slate-200 hover:border-slate-300 bg-slate-50/50 rounded-2xl p-6 text-center transition-all relative flex flex-col items-center justify-center min-h-[160px]">
                          <svg className="h-8 w-8 text-slate-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                          </svg>
                          <p className="text-[12px] font-bold text-slate-700">Drag and drop your spreadsheet here</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Supports standard .csv file format up to 20MB</p>
                          <input
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                        </div>
                        {csvFile && (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between gap-3 animate-fade-in">
                            <div className="min-w-0">
                              <p className="text-[11.5px] font-bold text-emerald-800 truncate">{csvFile.name}</p>
                              <p className="text-[9.5px] text-emerald-600 mt-0.5">{(csvFile.size / 1024).toFixed(1)} KB &middot; CSV Sheet Ready</p>
                            </div>
                            <button type="button" onClick={() => setCsvFile(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xs">✕</button>
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={activeAction === "csv" || !csvFile}
                          onClick={() => void submitCsv()}
                          className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 py-3 text-xs font-bold text-white shadow hover:from-amber-700 hover:to-amber-800 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                        >
                          Import Leads from File
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })()}
          </div>
        </div>
      </section>

      <section className="glass-card glow-sm overflow-hidden rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text font-semibold text-transparent">Live Scraper Jobs</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void cleanFinishedJobs()}
              disabled={activeAction === "clean-jobs"}
              className="glass-badge rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:shadow-md disabled:opacity-50"
            >
              Clean Finished Jobs
            </button>
            <button
              type="button"
              onClick={() => void loadJobs()}
              className="glass-badge rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 hover:shadow-md"
            >
              Refresh
            </button>
          </div>
        </div>



        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gradient-to-r from-slate-50 to-slate-100/80 text-left text-slate-700">
              <tr>
                <th className="whitespace-nowrap px-3 py-2">Job</th>
                <th className="whitespace-nowrap px-3 py-2">Source</th>
                <th className="whitespace-nowrap px-3 py-2">Status</th>
                <th className="whitespace-nowrap px-3 py-2">Progress</th>
                <th className="whitespace-nowrap px-3 py-2 text-center">Found</th>
                <th className="whitespace-nowrap px-3 py-2 text-center">Imported</th>
                <th className="whitespace-nowrap px-3 py-2">Timing</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const progress = progressValue(job);

                return (
                  <tr key={job.id} className="border-t border-slate-100 align-middle">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{getJobDisplayLabel(job)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{sourceLabelMap[job.source] || job.source}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${taskTypeMap[job.source]?.badgeClass || "bg-slate-100 text-slate-600"}`}>
                          {taskTypeMap[job.source]?.label || "Task"}
                        </span>
                        <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-1.5 rounded-full bg-gradient-to-r from-[#5e6ad2] to-[#a855f7] transition-all duration-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-[11px] font-medium text-slate-600">{progress}%</span>
                      </div>
                      <p className="mt-0.5 text-[12px] font-medium text-slate-700">{job.progress_message || "-"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center font-semibold text-orange-600">{job.total_found}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-center">{job.imported_count}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-500">
                      <span title={`Queued: ${formatTimestamp(job.created_at)}\nStarted: ${formatTimestamp(job.started_at)}\nCompleted: ${formatTimestamp(job.completed_at)}`}>
                        {formatJobTimeframe(job)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {(job.status === "running" || job.status === "queued") && (
                          <>
                            <button
                              type="button"
                              onClick={() => void pauseJob(job.id)}
                              className="rounded bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Pause
                            </button>
                            <button
                              type="button"
                              onClick={() => void stopJob(job.id)}
                              className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Stop
                            </button>
                          </>
                        )}
                        {job.status === "paused" && (
                          <>
                            <button
                              type="button"
                              onClick={() => void resumeJob(job.id)}
                              className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Resume
                            </button>
                            <button
                              type="button"
                              onClick={() => void stopJob(job.id)}
                              className="rounded bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Stop
                            </button>
                          </>
                        )}
                        {(job.status === "complete" || job.status === "error" || job.status === "cancelled") && (
                          <>
                            <button
                              type="button"
                              onClick={() => void restartJob(job.id)}
                              className="rounded bg-[#5e6ad2] px-2 py-1 text-[11px] font-medium text-white"
                            >
                              Restart
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeFinishedJob(job.id)}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
                            >
                              Remove
                            </button>
                          </>
                        )}
                        {Number(job.total_found || 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedJobId(job.id);
                              setStagedPage(1);
                            }}
                            className="rounded border border-[#5e6ad2] bg-white px-2 py-1 text-[11px] font-semibold text-[#5e6ad2] hover:bg-[#5e6ad2]/5 transition"
                          >
                            View Leads
                          </button>
                        )}
                      </div>
                      {job.error_message && (
                        <p className="mt-1 max-w-[200px] truncate text-right text-[11px] text-red-600" title={job.error_message}>{job.error_message}</p>
                      )}
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No jobs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedJobId && (
        <section className="glass-card glow-sm overflow-hidden rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                Review Scraped Leads
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Job: <strong className="font-mono text-slate-700">{selectedJob ? getJobDisplayLabel(selectedJob) : selectedJobId}</strong>
                {selectedJob && ` · ${sourceLabelMap[selectedJob.source] || selectedJob.source}`}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={[
                  "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all flex items-center gap-1.5 bg-white hover:bg-slate-50",
                  showFilters || activeFiltersCount > 0
                    ? "border-[#5e6ad2] text-[#5e6ad2] bg-[#5e6ad2]/5 font-bold"
                    : "border-slate-200 text-slate-600",
                ].join(" ")}
              >
                <span>{showFilters ? "Hide Filters" : "Show Filters"}</span>
                {activeFiltersCount > 0 && (
                  <span className="ml-1 rounded-full bg-[#5e6ad2] text-white px-2 py-0.5 text-[10px]">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => void loadStagedLeads(selectedJobId, stagedPage)}
                disabled={stagedLoading}
                className="glass-badge rounded-lg px-3 py-1.5 text-[12px] font-semibold transition hover:shadow-sm"
              >
                Refresh Leads
              </button>
            </div>
          </div>

          {/* Quick Status Filter Bar - Always Visible */}
          <div className="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50/80 rounded-xl border border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Filter By:</span>
            
            <button
              type="button"
              onClick={() => {
                setStagedGmbClaimFilter("");
                setStagedWebsiteFilter("");
                setStagedPage(1);
              }}
              className={[
                "px-3 py-1.2 rounded-lg text-[12px] font-semibold transition border shadow-2xs",
                !stagedGmbClaimFilter && !stagedWebsiteFilter
                  ? "bg-[#5e6ad2] text-white border-[#5e6ad2]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100/70",
              ].join(" ")}
            >
              All Leads
            </button>

            <button
              type="button"
              onClick={() => {
                setStagedGmbClaimFilter(stagedGmbClaimFilter === "unclaimed" ? "" : "unclaimed");
                setStagedPage(1);
              }}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.2 rounded-lg text-[12px] font-semibold transition border shadow-2xs",
                stagedGmbClaimFilter === "unclaimed"
                  ? "bg-amber-500 text-white border-amber-500 ring-2 ring-amber-200"
                  : "bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100",
              ].join(" ")}
            >
              <span>Unclaimed GMB</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStagedGmbClaimFilter(stagedGmbClaimFilter === "claimed" ? "" : "claimed");
                setStagedPage(1);
              }}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.2 rounded-lg text-[12px] font-semibold transition border shadow-2xs",
                stagedGmbClaimFilter === "claimed"
                  ? "bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-200"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100",
              ].join(" ")}
            >
              <span>Claimed GMB</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStagedWebsiteFilter(stagedWebsiteFilter === "has_website" ? "" : "has_website");
                setStagedPage(1);
              }}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.2 rounded-lg text-[12px] font-semibold transition border shadow-2xs",
                stagedWebsiteFilter === "has_website"
                  ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200"
                  : "bg-blue-50 text-blue-800 border-blue-200/80 hover:bg-blue-100",
              ].join(" ")}
            >
              <span>Has Website</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStagedWebsiteFilter(stagedWebsiteFilter === "missing_website" ? "" : "missing_website");
                setStagedPage(1);
              }}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.2 rounded-lg text-[12px] font-semibold transition border shadow-2xs",
                stagedWebsiteFilter === "missing_website"
                  ? "bg-rose-600 text-white border-rose-600 ring-2 ring-rose-200"
                  : "bg-rose-50 text-rose-800 border-rose-200/80 hover:bg-rose-100",
              ].join(" ")}
            >
              <span>No Website</span>
            </button>

            {(stagedGmbClaimFilter || stagedWebsiteFilter || stagedCityFilter || stagedNicheFilter || stagedQuery) && (
              <button
                type="button"
                onClick={() => {
                  setStagedGmbClaimFilter("");
                  setStagedWebsiteFilter("");
                  setStagedCityFilter("");
                  setStagedNicheFilter("");
                  setStagedQuery("");
                  setStagedPage(1);
                }}
                className="text-[11.5px] font-semibold text-rose-600 hover:text-rose-700 hover:underline ml-auto flex items-center gap-1"
              >
                <span>✕</span>
                <span>Reset All Filters</span>
              </button>
            )}
          </div>

          {/* Simple Filters Drawer */}
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 animate-fadeIn">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider space-y-1">
                <span>Search Keyword</span>
                <input
                  value={stagedQuery}
                  onChange={(e) => { setStagedQuery(e.target.value); setStagedPage(1); }}
                  placeholder="Company, website..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-normal outline-none focus:border-slate-300"
                />
              </label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider space-y-1">
                <span>City</span>
                <input
                  value={stagedCityFilter}
                  onChange={(e) => { setStagedCityFilter(e.target.value); setStagedPage(1); }}
                  placeholder="e.g. Miami"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-normal outline-none focus:border-slate-300"
                />
              </label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider space-y-1">
                <span>Niche</span>
                <input
                  value={stagedNicheFilter}
                  onChange={(e) => { setStagedNicheFilter(e.target.value); setStagedPage(1); }}
                  placeholder="e.g. Plumber"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-normal outline-none focus:border-slate-300"
                />
              </label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider space-y-1">
                <span>GMB Status</span>
                <select
                  value={stagedGmbClaimFilter}
                  onChange={(e) => { setStagedGmbClaimFilter(e.target.value as any); setStagedPage(1); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-normal outline-none focus:border-slate-300 h-[34px]"
                >
                  <option value="">All Statuses</option>
                  <option value="claimed">Claimed</option>
                  <option value="unclaimed">Unclaimed</option>
                  <option value="unknown">No Maps / Unknown</option>
                </select>
              </label>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider space-y-1">
                <span>Website</span>
                <select
                  value={stagedWebsiteFilter}
                  onChange={(e) => { setStagedWebsiteFilter(e.target.value as any); setStagedPage(1); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-normal outline-none focus:border-slate-300 h-[34px]"
                >
                  <option value="">All Leads</option>
                  <option value="has_website">Has Website</option>
                  <option value="missing_website">No Website</option>
                </select>
              </label>
            </div>
          )}

          {/* Simple Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 rounded-xl p-3 border border-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-slate-600">
                Found: <strong className="text-slate-800">{stagedTotal}</strong> · Selected: <strong className="text-slate-800">{stagedSelectedPending}</strong>
              </span>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => void setAllSelection(true)}
                className="text-[11.5px] font-semibold text-[#5e6ad2] hover:underline"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => void setAllSelection(false)}
                className="text-[11.5px] font-semibold text-slate-500 hover:underline"
              >
                Clear Selection
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
                <span className="text-[11px] font-bold text-slate-400 px-1.5">Batch Audit:</span>
                <button
                  type="button"
                  disabled={stagedSelectedPending === 0 || Boolean(activeAction)}
                  onClick={() => void runBatchAudit("website")}
                  className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
                  title="Audit website health & performance for selected leads"
                >
                  {activeAction === "batch-audit-website" ? "Auditing..." : "Website"}
                </button>
                <button
                  type="button"
                  disabled={stagedSelectedPending === 0 || Boolean(activeAction)}
                  onClick={() => void runBatchAudit("gmb")}
                  className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition disabled:opacity-50"
                  title="Audit Google Maps & citations for selected leads"
                >
                  {activeAction === "batch-audit-gmb" ? "Auditing..." : "GMB"}
                </button>
                <button
                  type="button"
                  disabled={stagedSelectedPending === 0 || Boolean(activeAction)}
                  onClick={() => void runBatchAudit("all")}
                  className="rounded px-2 py-1 text-[11.5px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition disabled:opacity-50"
                  title="Run complete tri-audit (Website + GMB + Local) on selected leads"
                >
                  {activeAction === "batch-audit-all" ? "Auditing All..." : "Tri-Audit"}
                </button>
              </div>

              <button
                type="button"
                disabled={stagedSelectedPending === 0 || Boolean(activeAction)}
                onClick={() => void addSelectedToDashboard()}
                className="rounded-lg bg-[#5e6ad2] hover:bg-[#4e5abc] px-4 py-2 text-[12.5px] font-bold text-white transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activeAction === "add-selected" ? "Importing..." : "Add to Leads Directory"}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-[13px] text-slate-600">
              <thead className="bg-slate-50 text-left text-slate-700 font-bold border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={stagedLeads.length > 0 && stagedLeads.every(l => l.is_selected)}
                      onChange={(e) => void setAllSelection(e.target.checked)}
                      className="rounded text-[#5e6ad2] focus:ring-[#5e6ad2]"
                    />
                  </th>
                  <th className="px-3 py-2.5">Business Details</th>
                  <th className="px-3 py-2.5">Contact Info</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5">Audit Health</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stagedLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                      Loading scraped leads...
                    </td>
                  </tr>
                ) : stagedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                      No pending leads match this query.
                    </td>
                  </tr>
                ) : (
                  stagedLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => void toggleLeadSelection(lead.id, !lead.is_selected)}
                      className={[
                        "border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer select-none transition-colors align-top",
                        lead.is_selected ? "bg-[#5e6ad2]/5" : "",
                      ].join(" ")}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={lead.is_selected}
                          onChange={(e) => void toggleLeadSelection(lead.id, e.target.checked)}
                          className="rounded text-[#5e6ad2] focus:ring-[#5e6ad2]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-800 leading-snug">{lead.business_name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {lead.niche && (
                            <span className="inline-block bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 text-[10px] font-medium">
                              {lead.niche}
                            </span>
                          )}
                          
                          {/* Website Presence Badge */}
                          {lead.website ? (
                            <a
                              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-[10px] font-medium transition border border-blue-100/50"
                              title={lead.website}
                            >
                              <span>Website</span>
                              <span className="text-[9px]">↗</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 bg-rose-50 text-rose-600 rounded px-1.5 py-0.5 text-[10px] font-medium border border-rose-100/50">
                              <span>No Website</span>
                            </span>
                          )}

                          {/* GMB Claim Status Badge */}
                          {lead.gmb_url ? (
                            <a
                              href={lead.gmb_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={[
                                "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition border",
                                lead.gmb_claim_status === "claimed"
                                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-100/50"
                                  : lead.gmb_claim_status === "unclaimed"
                                  ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-100/50"
                                  : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/50",
                              ].join(" ")}
                              title={lead.gmb_url}
                            >
                              <span>{lead.gmb_claim_status === "claimed" ? "Claimed" : lead.gmb_claim_status === "unclaimed" ? "Unclaimed" : "Google Maps"}</span>
                              <span className="text-[9px]">↗</span>
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 bg-slate-50 text-slate-400 rounded px-1.5 py-0.5 text-[10px] font-medium border border-slate-200/20">
                              <span>No Maps</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 space-y-1 text-[12px]">
                        {lead.email && (
                          <div className="flex items-center gap-1.5" title={lead.email}>
                            
                            <span className="truncate max-w-[200px] text-slate-700 font-medium">{lead.email}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1.5">
                            
                            <span className="text-slate-700">{lead.phone}</span>
                          </div>
                        )}
                        {lead.website && (
                          <div className="flex items-center gap-1.5" title={lead.website}>
                            
                            <a
                              href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#5e6ad2] hover:underline truncate max-w-[200px]"
                            >
                              {lead.website.replace(/^https?:\/\/(www\.)?/, "")}
                            </a>
                          </div>
                        )}
                        {!lead.email && !lead.phone && !lead.website && (
                          <span className="text-slate-400 text-[11px] italic">No contact info</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-slate-700 font-medium leading-tight">
                          {lead.city}{lead.state ? `, ${lead.state}` : ""}
                        </p>
                        {lead.address && (
                          <p className="text-[11px] text-slate-400 mt-0.5 max-w-[220px] truncate" title={lead.address}>
                            {lead.address}
                          </p>
                        )}
                      </td>
                      {/* Audit Health */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1 text-[11px]">
                          {/* Website Audit Status */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase w-7 shrink-0">Web:</span>
                            {lead.website_audit?.score !== undefined && lead.website_audit?.score !== null ? (
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold text-[10px] border ${
                                  lead.website_audit.score >= 70
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : lead.website_audit.score >= 45
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                                }`}
                              >
                                {lead.website_audit.score}/100
                              </span>
                            ) : lead.website ? (
                              <button
                                type="button"
                                disabled={auditingLeadId === lead.id}
                                onClick={() => void handleSingleAudit(selectedJobId, lead.id, "website")}
                                className="text-[10px] text-[#5e6ad2] hover:underline font-semibold"
                              >
                                {auditingLeadId === lead.id ? "Auditing..." : "Audit Site"}
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[10px]">No site</span>
                            )}
                          </div>

                          {/* GMB Status / Audit */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase w-7 shrink-0">GMB:</span>
                            {lead.gmb_claim_status === "unclaimed" ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded font-bold text-[10px] bg-amber-500/10 text-amber-700 border border-amber-300">
                                ⚠️ Unclaimed
                              </span>
                            ) : lead.gmb_audit?.score !== undefined && lead.gmb_audit?.score !== null ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                                {lead.gmb_audit.score}/100
                              </span>
                            ) : lead.gmb_url ? (
                              <button
                                type="button"
                                disabled={auditingLeadId === lead.id}
                                onClick={() => void handleSingleAudit(selectedJobId, lead.id, "gmb")}
                                className="text-[10px] text-[#5e6ad2] hover:underline font-semibold"
                              >
                                {auditingLeadId === lead.id ? "Auditing..." : "Audit GMB"}
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[10px]">No Maps</span>
                            )}
                          </div>

                          {/* Readiness badge */}
                          {lead.audit_readiness && lead.audit_readiness !== "pending" && (
                            <div className="pt-0.5">
                              <span
                                className={`inline-block px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded ${
                                  lead.audit_readiness === "ready"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : lead.audit_readiness === "review"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {lead.audit_readiness === "ready" ? "✓ High Opportunity" : lead.audit_readiness}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPitch(lead)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#5e6ad2] hover:bg-[#4e5abc] px-2.5 py-1 text-[11px] font-bold text-white shadow-xs transition active:scale-95"
                            title="Draft and send outreach pitch email"
                          >
                            <span>✉</span>
                            <span>Pitch</span>
                          </button>

                          <button
                            type="button"
                            disabled={auditingLeadId === lead.id}
                            onClick={() => void handleSingleAudit(selectedJobId, lead.id, "all")}
                            className="text-[10.5px] text-slate-500 hover:text-slate-800 font-medium hover:underline flex items-center gap-1 disabled:opacity-50"
                          >
                            {auditingLeadId === lead.id ? (
                              <>
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
                                <span>Auditing...</span>
                              </>
                            ) : (
                              <span>Run Audit ⚡</span>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Simple Pagination */}
          {stagedTotal > 10 && (
            <div className="flex items-center justify-between text-[12px] pt-2">
              <p className="text-slate-500">
                Showing page {stagedPage} of {Math.ceil(stagedTotal / 10)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={stagedPage <= 1 || stagedLoading}
                  onClick={() => setStagedPage((prev) => Math.max(1, prev - 1))}
                  className="glass-badge rounded-lg px-3 py-1 font-semibold transition hover:shadow-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={stagedPage >= Math.ceil(stagedTotal / 10) || stagedLoading}
                  onClick={() => setStagedPage((prev) => Math.min(Math.ceil(stagedTotal / 10), prev + 1))}
                  className="glass-badge rounded-lg px-3 py-1 font-semibold transition hover:shadow-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
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
