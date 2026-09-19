import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  fetchLeads,
  fetchSeoAudits,
  runAdvancedWebsiteAudit,
  generateAuditAiReport,
  type Lead,
  type SeoAudit,
  type WebsiteAuditResult,
  type WebsiteAuditCategory,
  type WebsiteAuditModule,
  type WebsiteAuditEvidenceHighlight,
  type WebsiteAuditTopPage,
  type AuditFinding,
  type SpecialistAuditType,
} from "../lib/api";
import { generateAuditPdf } from "../components/PdfAuditReport";
import { AiAuditPage } from "../components/AiAuditPage";
import { ScoreGauge } from "../components/ScoreGauge";
import { useToast } from "../components/Toast";
import { QuickPitchModal } from "../components/QuickPitchModal";

/* ── AI Specialist Audits configurations ── */
const AI_SPECIALIST_CONFIGS: { type: SpecialistAuditType; label: string; description: string; section: string; isCompetitor?: boolean }[] = [
  {
    type: "content",
    label: "Content Quality",
    description: "AI analysis of content depth, topical relevance, keyword density, and copywriting authority.",
    section: "Website Quality",
  },
  {
    type: "design",
    label: "Design & UX",
    description: "AI review of visual hierarchy, mobile responsiveness, CTAs, layout clutter, and design trust.",
    section: "Website Quality",
  },
  {
    type: "accessibility",
    label: "Accessibility Compliance",
    description: "AI audit of WCAG 2.1 AA compliance (alt tags, headings, ARIA attributes, contrast).",
    section: "Accessibility",
  },
  {
    type: "reputation",
    label: "Reputation & EEAT",
    description: "AI audit of testimonials, social proof widgets, trust badges, and security policies.",
    section: "Trust & Conversion",
  },
  {
    type: "customer-conversion",
    label: "Buyer Funnel & CTR",
    description: "AI review of conversion trigger points, forms friction, and buyer path optimization.",
    section: "Trust & Conversion",
  },
  {
    type: "competitor-organic",
    label: "Competitor Organic Analysis",
    description: "AI comparison of your site vs organic competitors on topical depth and domain strength.",
    section: "Competitor",
    isCompetitor: true,
  },
];

/* ── Helper styles ── */
function scoreColorClass(score: number | null): string {
  if (score == null) return "text-slate-400";
  if (score >= 78) return "text-emerald-500";
  if (score >= 56) return "text-amber-500";
  return "text-rose-500";
}

function scoreBgClass(score: number | null): string {
  if (score == null) return "bg-slate-100";
  if (score >= 78) return "bg-emerald-500";
  if (score >= 56) return "bg-amber-500";
  return "bg-rose-500";
}

function scoreRingColor(score: number | null): string {
  if (score == null) return "#94a3b8";
  if (score >= 78) return "#10b981";
  if (score >= 56) return "#f59e0b";
  return "#ef4444";
}

function verdictBadgeClass(verdict: string): string {
  const v = verdict.toLowerCase();
  if (v === "strong") return "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20";
  if (v.includes("needs")) return "bg-amber-500/10 text-amber-600 border border-amber-500/20";
  return "bg-rose-500/10 text-rose-600 border border-rose-500/20";
}

function normalizeWebsite(value: string): string {
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

function toWebsiteResult(audit: SeoAudit | null): WebsiteAuditResult | null {
  if (!audit || audit.audit_type !== "website") return null;
  return audit.result as WebsiteAuditResult;
}

function sortByNewest(items: SeoAudit[]): SeoAudit[] {
  return [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

type FindingCategory = "error" | "warning" | "improvement" | "passed";

function classifyFinding(issue: AuditFinding): FindingCategory {
  if (issue.severity === "high") return "error";
  if (issue.severity === "medium") return "warning";
  return "improvement";
}

function classifyModule(mod: WebsiteAuditModule): FindingCategory {
  if (mod.status === "fail") return "error";
  if (mod.status === "warning") return "warning";
  return "passed";
}

const FINDING_TABS: { key: FindingCategory; label: string; icon: JSX.Element; emptyLabel: string; color: string; bgColor: string; borderColor: string }[] = [
  {
    key: "error",
    label: "Errors / Risks",
    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    emptyLabel: "No critical errors found.",
    color: "text-rose-600",
    bgColor: "bg-rose-50/50",
    borderColor: "border-rose-100",
  },
  {
    key: "warning",
    label: "Warnings",
    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
    emptyLabel: "No warnings detected.",
    color: "text-amber-600",
    bgColor: "bg-amber-50/50",
    borderColor: "border-amber-100",
  },
  {
    key: "improvement",
    label: "Improvements",
    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    emptyLabel: "No improvements suggested.",
    color: "text-sky-600",
    bgColor: "bg-sky-50/50",
    borderColor: "border-sky-100",
  },
  {
    key: "passed",
    label: "Passed Checks",
    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    emptyLabel: "No passed checks to display.",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50/50",
    borderColor: "border-emerald-100",
  },
];

const STEPS = [
  { key: "overview", label: "Crawl Overview", icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
  { key: "findings", label: "Audit Findings", icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
  { key: "recommendations", label: "Fixes & Wins", icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
  { key: "pages", label: "Crawled Pages", icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg> },
];

const AUDIT_PHASES = [
  { label: "DNS & Server Connection", detail: "Resolving DNS and establishing safe connection...", minSec: 0 },
  { label: "Link Discovery", detail: "Crawling internal links and indexing document urls...", minSec: 3 },
  { label: "Header & HTML Tag Analysis", detail: "Analyzing tags, meta descriptions, and canon headers...", minSec: 7 },
  { label: "Content Quality Review", detail: "Measuring readability, layout copy, and thin content...", minSec: 12 },
  { label: "E-E-A-T Signal Inspection", detail: "Checking for about/policy pages and customer social proof...", minSec: 17 },
  { label: "Local Signals Scan", detail: "Checking NAP citation completeness and schema geometry...", minSec: 22 },
  { label: "Sitemap Verification", detail: "Parsing robots.txt and sitemaps...", minSec: 28 },
  { label: "Conversion Optimization Check", detail: "Evaluating CTAs, email forms, and click targets...", minSec: 34 },
  { label: "Weighted Scoring Calculation", detail: "Assigning weights and calculating scores...", minSec: 40 },
  { label: "Assembling Final PDF Report", detail: "Wrapping results into executive roadmap...", minSec: 46 },
];

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "audit";
}

function downloadExcel(audit: SeoAudit, result: WebsiteAuditResult): void {
  const wb = XLSX.utils.book_new();

  const overview = [
    ["Website Audit Report"],
    ["Target", audit.target_name],
    ["Score", audit.score ?? "N/A"],
    ["Verdict", audit.verdict],
    ["Summary", result.summary],
    ["Date", audit.created_at ? new Date(audit.created_at).toLocaleString() : ""],
    [],
    ["Metrics"],
    ["Pages Crawled", result.metrics.pagesCrawled ?? 1],
    ["Word Count", result.metrics.wordCount],
    ["HTTPS", result.metrics.usesHttps ? "Yes" : "No"],
    ["Has Schema", result.metrics.hasSchema ? "Yes" : "No"],
    ["Images Without Alt", result.metrics.imagesWithoutAlt],
    ["Internal Links", result.metrics.internalLinks],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), "Overview");

  const issueRows = result.issues.map(i => [
    i.severity === "high" ? "Error" : i.severity === "medium" ? "Warning" : "Improvement",
    i.severity.toUpperCase(),
    i.title,
    i.detail,
  ]);
  const issueSheet = XLSX.utils.aoa_to_sheet([["Type", "Severity", "Title", "Detail"], ...issueRows]);
  XLSX.utils.book_append_sheet(wb, issueSheet, "Issues");

  const recRows = result.recommendations.map((r, i) => [i + 1, r]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["#", "Recommendation"], ...recRows]), "Recommendations");

  const winRows = result.wins.map((w, i) => [i + 1, w]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["#", "What Is Working"], ...winRows]), "Wins");

  const modules: WebsiteAuditModule[] = (result as any).modules ?? [];
  if (modules.length > 0) {
    const modRows = modules.map(m => [m.status.toUpperCase(), m.label, m.detail]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Status", "Module", "Detail"], ...modRows]), "Modules");
  }

  const topPages: WebsiteAuditTopPage[] = (result as any).topPages ?? [];
  if (topPages.length > 0) {
    const pgRows = topPages.map(p => [p.url, p.pageRole, p.depth, p.statusCode ?? "failed", p.issueWeight, p.summary]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["URL", "Role", "Depth", "Status", "Issue Weight", "Summary"], ...pgRows]), "Top Pages");
  }

  XLSX.writeFile(wb, `${slug(audit.target_name)}-website-audit.xlsx`);
}

export function UnifiedWebsiteAuditorPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [audits, setAudits] = useState<SeoAudit[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [latestAuditId, setLatestAuditId] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [activeFindingTab, setActiveFindingTab] = useState<FindingCategory>("error");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDetailedView, setIsDetailedView] = useState(false); // Default to simple AI view!
  const [pitchModalLead, setPitchModalLead] = useState<any>(null);
  const [showPitchModal, setShowPitchModal] = useState(false);
  const [liveProgress, setLiveProgress] = useState<{
    phase: string;
    detail: string;
    percent: number;
    pagesCrawled: number;
    issuesFound: number;
  }>({
    phase: "Initiating Deep Crawl",
    detail: "Connecting to server and resolving target host...",
    percent: 10,
    pagesCrawled: 0,
    issuesFound: 0,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeTab = searchParams.get("tab") === "ai-specialist" ? "ai-specialist" : "technical";

  const rawType = searchParams.get("type");
  const selectedAiType = useMemo<SpecialistAuditType>(() => {
    if (!rawType) return "content";
    if (rawType === "trust" || rawType === "reputation") return "reputation";
    if (rawType === "competitor" || rawType === "competitor-organic") return "competitor-organic";
    if (rawType === "accessibility") return "accessibility";
    if (rawType === "design") return "design";
    return "content";
  }, [rawType]);

  const handleTabChange = (tab: "technical" | "ai-specialist") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      if (tab === "technical") {
        next.delete("type");
      } else {
        next.set("type", selectedAiType);
      }
      return next;
    });
  };

  const handleAiTypeChange = (type: SpecialistAuditType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("type", type);
      return next;
    });
  };

  useEffect(() => {
    if (busy) {
      setElapsedSec(0);
      timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);

      // Connect to real-time WebSocket for live crawler milestones
      let ws: WebSocket | null = null;
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        ws = new WebSocket(`${protocol}//${host}/ws/site-audit?token=${encodeURIComponent(localStorage.getItem("smbify_lead_auth_token") || "")}`);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "site-audit.job" && data.payload?.progress) {
              const p = data.payload.progress;
              setLiveProgress({
                phase: data.payload.status === "crawling" ? "Crawling Site & Inspecting DOM" : "Analyzing Results",
                detail: p.current_url ? `Crawling: ${p.current_url}` : "Analyzing DOM metrics...",
                percent: Math.min(95, Math.max(15, p.percent || 0)),
                pagesCrawled: p.crawled || 0,
                issuesFound: p.issues_found || 0,
              });
            }
          } catch {}
        };
      } catch {}

      return () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (ws) ws.close();
      };
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [busy]);

  const currentPhaseIdx = useMemo(() => {
    let idx = 0;
    for (let i = AUDIT_PHASES.length - 1; i >= 0; i--) {
      if (elapsedSec >= AUDIT_PHASES[i].minSec) { idx = i; break; }
    }
    return idx;
  }, [elapsedSec]);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );

  const currentAudit = useMemo(() => {
    if (!audits.length) return null;
    if (latestAuditId) {
      const exact = audits.find((item) => item.id === latestAuditId);
      if (exact) return exact;
    }
    return audits[0] || null;
  }, [audits, latestAuditId]);

  const currentResult = useMemo(() => toWebsiteResult(currentAudit), [currentAudit]);

  const categories: WebsiteAuditCategory[] = useMemo(() => (currentResult as any)?.categories ?? [], [currentResult]);
  const modules: WebsiteAuditModule[] = useMemo(() => (currentResult as any)?.modules ?? [], [currentResult]);
  const evidence: WebsiteAuditEvidenceHighlight[] = useMemo(() => (currentResult as any)?.evidenceHighlights ?? [], [currentResult]);
  const roadmap: string[] = useMemo(() => (currentResult as any)?.priorityRoadmap ?? [], [currentResult]);
  const topPages: WebsiteAuditTopPage[] = useMemo(() => (currentResult as any)?.topPages ?? [], [currentResult]);

  const parsedAiInsights = useMemo(() => {
    if (currentAudit?.ai_insights) {
      return currentAudit.ai_insights;
    }

    if (!currentAudit || !currentResult) {
      return null;
    }

    const highIssues = currentResult.issues.filter((i) => i.severity === "high").map((i) => i.title);
    const lowIssues = currentResult.issues.filter((i) => i.severity !== "high").map((i) => i.title);
    const hasIssues = currentResult.issues.length > 0;

    return {
      headline: `Audit Summary for ${currentAudit.target_name}`,
      executiveSummary: currentResult.summary || `The website crawled successfully and scored ${currentAudit.score}/100, indicating a rating of "${currentAudit.verdict}".`,
      priorityActions: hasIssues ? highIssues.slice(0, 3) : ["Keep monitoring technical SEO parameters."],
      quickWins: hasIssues ? lowIssues.slice(0, 3) : ["All checked technical parameters are in line."],
      nextStepCta: "Review the detailed technical checklist below or download the PDF report to start optimizations.",
    };
  }, [currentAudit, currentResult]);

  const classifiedIssues = useMemo(() => {
    if (!currentResult) return { error: [] as AuditFinding[], warning: [] as AuditFinding[], improvement: [] as AuditFinding[], passed: [] as { title: string; detail: string }[] };
    const errors = currentResult.issues.filter(i => classifyFinding(i) === "error");
    const warnings = currentResult.issues.filter(i => classifyFinding(i) === "warning");
    const improvements = currentResult.issues.filter(i => classifyFinding(i) === "improvement");
    const passedModules = modules.filter(m => classifyModule(m) === "passed").map(m => ({ title: m.label, detail: m.detail }));
    const passedWins = currentResult.wins.map(w => ({ title: "Passed", detail: w }));
    return { error: errors, warning: warnings, improvement: improvements, passed: [...passedModules, ...passedWins] };
  }, [currentResult, modules]);

  const findingCounts = useMemo(() => ({
    error: classifiedIssues.error.length,
    warning: classifiedIssues.warning.length,
    improvement: classifiedIssues.improvement.length,
    passed: classifiedIssues.passed.length,
  }), [classifiedIssues]);

  function applyLead(leadId: string): void {
    setSelectedLeadId(leadId);
    const lead = leads.find((item) => item.id === leadId);
    if (lead?.website?.trim()) setWebsite(lead.website.trim());
  }

  async function loadPage(initialLeadId?: string): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const [leadData, auditData] = await Promise.all([
        fetchLeads({ page: 1, pageSize: 250 }),
        fetchSeoAudits({ auditType: "website", limit: 50 }),
      ]);
      const websiteAudits = sortByNewest(auditData.items.filter((item) => item.audit_type === "website"));
      setLeads(leadData.items);
      setAudits(websiteAudits);
      if (websiteAudits.length > 0) setLatestAuditId(websiteAudits[0].id);
      const leadIdFromQuery = initialLeadId || "";
      if (leadIdFromQuery) {
        const lead = leadData.items.find((item) => item.id === leadIdFromQuery);
        if (lead) {
          setSelectedLeadId(lead.id);
          if (lead.website?.trim()) setWebsite(lead.website.trim());
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load website auditor");
    } finally {
      setLoading(false);
    }
  }

  const initialLeadId = searchParams.get("leadId") || "";

  useEffect(() => {
    void loadPage(initialLeadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLeadId]);

  async function runSimpleAudit(): Promise<void> {
    const normalizedWebsite = normalizeWebsite(website);
    if (!normalizedWebsite) {
      setError("Valid website URL required");
      setMessage("");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setLiveProgress({
      phase: "Starting Crawl & DNS Handshake",
      detail: `Connecting to ${normalizedWebsite}...`,
      percent: 15,
      pagesCrawled: 0,
      issuesFound: 0,
    });

    try {
      setLiveProgress((prev) => ({
        ...prev,
        phase: "Deep Crawling DOM & Subpages",
        detail: "Crawling HTML, inspecting meta tags, headings, schema, and performance...",
        percent: 45,
      }));

      const response = await runAdvancedWebsiteAudit({
        lead_id: selectedLead?.id || undefined,
        business_name: selectedLead?.business_name || undefined,
        city: selectedLead?.city || undefined,
        state: selectedLead?.state || undefined,
        website: normalizedWebsite,
        maxPages: 12,
      });
      let savedAudit = response.audit;

      setLiveProgress({
        phase: "Generating Multi-Lens AI Analysis",
        detail: "Synthesizing executive summary, quick wins, and conversion roadmap...",
        percent: 85,
        pagesCrawled: response.crawlPages?.length || 1,
        issuesFound: toWebsiteResult(savedAudit)?.issues?.length || 0,
      });

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

      setLiveProgress((prev) => ({ ...prev, percent: 100, phase: "Audit Ready" }));
      setAudits((current) => sortByNewest([savedAudit, ...current.filter((item) => item.id !== savedAudit.id)]));
      setLatestAuditId(savedAudit.id);
      setWebsite(normalizedWebsite);
      setMessage(`Audit complete: ${savedAudit.target_name}`);
      setActiveStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run website audit");
    } finally {
      setBusy(false);
    }
  }

  async function createAiReportForLatest(): Promise<void> {
    if (!currentAudit) return;
    setAiBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await generateAuditAiReport(currentAudit.id);
      const updatedAudit = {
        ...currentAudit,
        ai_insights: response.aiInsights,
      };
      setAudits((current) =>
        current.map((item) => (item.id === currentAudit.id ? updatedAudit : item))
      );
      setMessage(`AI report generated for ${currentAudit.target_name}.`);
      showToast("success", "AI report generated successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate AI report");
      showToast("error", err instanceof Error ? err.message : "Failed to generate AI report");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <section className="page-enter space-y-6 pb-12 animate-fade-in text-slate-800">
      {/* ── Premium Header ── */}
      <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-md">
        <div className="absolute right-0 top-0 -mr-6 -mt-6 h-36 w-36 rounded-full bg-indigo-500/10 blur-2xl" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-400">SEO Analyzer Engine</p>
            <h2 className="text-2xl font-extrabold tracking-tight mt-0.5">Website Audit (Master)</h2>
            <p className="text-[12px] text-slate-400 mt-1">One-click real-time website checks explained in plain language by AI.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-1 w-fit">
            <button
              type="button"
              onClick={() => handleTabChange("technical")}
              className={[
                "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                activeTab === "technical"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              Technical Crawl
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("ai-specialist")}
              className={[
                "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                activeTab === "ai-specialist"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/5",
              ].join(" ")}
            >
              AI Specialist Audits
            </button>
          </div>
        </div>
      </header>

      {/* ───── TECHNICAL TABS ───── */}
      {activeTab === "technical" ? (
        <div className="grid gap-6 lg:grid-cols-3 items-start">
          {/* Left Column: Easy Form & History */}
          <div className="space-y-6 lg:col-span-1">
            {/* Super Simplified One-Click Card */}
            <article className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/10 to-white p-5 shadow-md space-y-4">
              <div>
                <span className="bg-indigo-500/10 text-indigo-600 font-bold uppercase tracking-wider text-[9px] px-2 py-0.5 rounded-full">One-Click</span>
                <h3 className="text-sm font-bold text-slate-900 mt-2">Start Site Audit</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Enter URL below to analyze search performance, tags, and get AI explanations.</p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                  </span>
                  <input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !busy) void runSimpleAudit(); }}
                    placeholder="Enter website URL (e.g. business.com)"
                    className="w-full rounded-xl border border-indigo-150 bg-white pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
                  />
                </div>

                {/* Collapsible Advanced Section */}
                <div className="border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 focus:outline-none"
                  >
                    {showAdvanced ? "Hide Advanced Settings ▲" : "Show Advanced Settings ▼"}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3 animate-fade-in">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Link Lead context
                        <select
                          value={selectedLeadId}
                          onChange={(e) => applyLead(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700 font-semibold"
                        >
                          <option value="">None linked</option>
                          {leads.map((l) => <option key={l.id} value={l.id}>{l.business_name}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void runSimpleAudit()}
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 py-3 text-xs font-extrabold text-white shadow-md shadow-indigo-600/10 hover:shadow-lg hover:shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <>
                      <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                      Crawling & Writing AI Report...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Analyze Site in 1-Click
                    </>
                  )}
                </button>
              </div>

              {message && !busy && (
                <div className="flex gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-[11px] text-emerald-700">
                  <span className="font-bold">✓</span> {message}
                </div>
              )}
              {error && !busy && (
                <div className="flex gap-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-[11px] text-rose-700">
                  <span className="font-bold">✕</span> {error}
                </div>
              )}
            </article>

            {/* Live Progress */}
            {busy && (
              <article className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/50 via-white to-slate-50 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-indigo-600 animate-ping" />
                    Live Crawl Engine
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100/60 rounded-md px-2 py-0.5 tabular-nums">
                      {liveProgress.percent}%
                    </span>
                    <span className="text-[11px] font-bold text-slate-600 bg-white shadow-xs border border-slate-200 rounded-md px-2 py-0.5 tabular-nums">
                      {formatElapsed(elapsedSec)}
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500 ease-out"
                    style={{ width: `${liveProgress.percent}%` }}
                  />
                </div>
                <div className="rounded-xl bg-white border border-indigo-100 p-3.5 flex gap-3 items-center shadow-xs">
                  <svg className="h-5 w-5 shrink-0 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-slate-900 truncate">{liveProgress.phase}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{liveProgress.detail}</p>
                  </div>
                </div>
              </article>
            )}

            {/* Audit History List */}
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recent Runs</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Click to view pre-calculated results.</p>
              </div>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {audits.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">No audits found.</p>
                ) : (
                  audits.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setLatestAuditId(item.id); setActiveStep(0); }}
                      className={[
                        "w-full text-left rounded-xl p-3 border text-[11px] transition-all flex items-center justify-between gap-3",
                        item.id === latestAuditId
                          ? "border-indigo-200 bg-indigo-50/30 font-bold"
                          : "border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate">{item.target_name}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`text-[11px] font-extrabold ${scoreColorClass(item.score)}`}>{item.score ?? "--"}</span>
                    </button>
                  ))
                )}
              </div>
            </article>
          </div>

          {/* Right Column: Visual Report Area */}
          <div className="lg:col-span-2 space-y-6">
            {currentAudit && currentResult ? (
              <div className="space-y-6">
                {/* Visual Score Gauge & Report Header */}
                <article className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl border border-slate-800">
                  <div className="absolute right-0 top-0 -mr-20 -mt-20 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${verdictBadgeClass(currentAudit.verdict)}`}>
                          {currentAudit.verdict}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-semibold uppercase tracking-wider">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          Live DOM Crawl &amp; Scan
                        </span>
                      </div>
                      <h3 className="text-2xl font-black tracking-tight">{currentAudit.target_name}</h3>
                      <p className="text-[12px] text-slate-300 leading-relaxed max-w-xl">
                        {currentResult.summary || "Full DOM crawl and performance audit successfully completed."}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPitchModalLead({
                              business_name: currentAudit.target_name || website,
                              website: website,
                              last_website_audit_score: currentAudit.score,
                            });
                            setShowPitchModal(true);
                          }}
                          className="rounded-lg bg-[#5e6ad2] hover:bg-[#4e5abc] px-3.5 py-1.5 text-[11px] font-bold text-white transition-all flex items-center gap-1.5 shadow-sm"
                          title="Generate and send personalized pitch email using these audit findings"
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
                        <button
                          type="button"
                          onClick={() => downloadExcel(currentAudit, currentResult)}
                          className="rounded-lg bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold hover:bg-white/10 transition-all flex items-center gap-1.5 border border-white/5"
                        >
                          Export Excel
                        </button>
                      </div>
                    </div>

                    {/* Radial Score Gauge with Letter Grade */}
                    <div className="shrink-0 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80">
                      <ScoreGauge
                        score={currentAudit.score}
                        size="md"
                        subtitle="Website Performance & SEO Grade"
                      />
                    </div>
                  </div>
                </article>

                {/* AI Executive Summary Card (Phase 1, Item 1) */}
                <article className="rounded-2xl border border-indigo-900/40 bg-gradient-to-br from-indigo-950/30 via-slate-900/40 to-slate-950 p-6 backdrop-blur-md shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-indigo-900/30 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-xs">
                        
                      </span>
                      <h4 className="text-sm font-bold text-white">Executive Summary</h4>
                    </div>
                    <span className="text-[11px] text-indigo-300 font-medium">Leadership Insights</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 text-xs leading-relaxed">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-1">
                      <strong className="text-slate-200 font-semibold block uppercase tracking-wider text-[10px] text-indigo-400">Overall Assessment</strong>
                      <p className="text-slate-300">
                        {parsedAiInsights?.executiveSummary || currentResult.summary || "Website exhibits baseline indexing with specific high-leverage technical and conversion opportunities."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-rose-900/30 bg-rose-950/15 p-3.5 space-y-1">
                      <strong className="text-rose-200 font-semibold block uppercase tracking-wider text-[10px] text-rose-400">Primary SEO Bottleneck</strong>
                      <p className="text-rose-100">
                        {currentResult.issues.length > 0 
                          ? `${currentResult.issues[0].title}: ${currentResult.issues[0].detail || "Unresolved technical blocker"}`
                          : "No critical blockers found; maintain crawl frequency and schema depth."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-amber-900/30 bg-amber-950/15 p-3.5 space-y-1">
                      <strong className="text-amber-200 font-semibold block uppercase tracking-wider text-[10px] text-amber-400">Estimated Organic Impact</strong>
                      <p className="text-amber-100">
                        Fixing high-severity issues is estimated to improve crawl efficiency and prevent keyword ranking drops across mobile search results.
                      </p>
                    </div>

                    <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/15 p-3.5 space-y-1">
                      <strong className="text-emerald-200 font-semibold block uppercase tracking-wider text-[10px] text-emerald-400">Recommended Next Step</strong>
                      <p className="text-emerald-100">
                        {parsedAiInsights?.priorityActions?.[0] || (currentResult.issues[0]?.recommendation ?? "Optimize on-page meta tags, schema markup, and page assets.")}
                      </p>
                    </div>
                  </div>
                </article>

                {/* Top 3 Priority Issues Hero Section (Phase 1, Item 3) */}
                {currentResult.issues.length > 0 && (
                  <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">Immediate Action Plan</span>
                        <h4 className="text-base font-bold text-slate-800">Top 3 Priority Issues</h4>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">
                        {currentResult.issues.length} total findings
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {currentResult.issues.slice(0, 3).map((issue, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2 flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-black text-[10px]">
                                #{idx + 1}
                              </span>
                              <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                issue.severity === "high" || (issue as any).severity === "critical"
                                  ? "bg-rose-100 text-rose-700"
                                  : issue.severity === "medium"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-indigo-100 text-indigo-700"
                              }`}>
                                {issue.severity}
                              </span>
                            </div>
                            <h5 className="font-bold text-slate-900 text-xs">{issue.title}</h5>
                            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">{issue.detail}</p>
                          </div>

                          {issue.recommendation && (
                            <div className="pt-2 border-t border-slate-200/60 text-[10px]">
                              <span className="font-bold text-emerald-700">Fix: </span>
                              <span className="text-slate-600">{issue.recommendation}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                )}

                {/* ── Quick Metrics Snapshot Bar ── */}
                {currentResult?.metrics && (() => {
                  const m = currentResult.metrics;
                  type MetricItem = { label: string; value: string | number | boolean | null | undefined; status: "pass" | "warn" | "fail" | "info" };
                  const items: MetricItem[] = [
                    { label: "HTTPS", value: m.usesHttps ? "Secure" : "Not Secure", status: m.usesHttps !== false ? "pass" : "fail" },
                    { label: "robots.txt", value: m.hasRobotsTxt !== undefined ? (m.hasRobotsTxt ? "Found" : "Missing") : "—", status: m.hasRobotsTxt !== false ? "pass" : "warn" },
                    { label: "Sitemap", value: m.hasSitemapXml !== undefined ? (m.hasSitemapXml ? "Found" : "Missing") : "—", status: m.hasSitemapXml !== false ? "pass" : "warn" },
                    { label: "Noindex", value: m.noindexDetected ? "Blocked" : "Indexable", status: m.noindexDetected ? "fail" : "pass" },
                    { label: "Speed", value: m.responseTimeMs != null ? `${m.responseTimeMs}ms` : "—", status: (m.responseTimeMs ?? 0) < 800 ? "pass" : (m.responseTimeMs ?? 0) < 2000 ? "warn" : "fail" },
                    { label: "Open Graph", value: m.hasOpenGraph !== undefined ? (m.openGraphComplete ? "Complete" : m.hasOpenGraph ? "Partial" : "Missing") : "—", status: m.openGraphComplete ? "pass" : m.hasOpenGraph ? "warn" : "warn" },
                    { label: "HTTP/2", value: m.usesHttp2 !== undefined ? (m.usesHttp2 ? "Enabled" : "HTTP/1.1") : "—", status: m.usesHttp2 ? "pass" : "warn" },
                    { label: "Alt Coverage", value: m.altTextCoveragePercent != null ? `${m.altTextCoveragePercent}%` : "—", status: (m.altTextCoveragePercent ?? 100) >= 90 ? "pass" : (m.altTextCoveragePercent ?? 100) >= 60 ? "warn" : "fail" },
                    { label: "Word Count", value: m.wordCount != null ? `~${m.wordCount}` : "—", status: (m.wordCount ?? 0) >= 300 ? "pass" : (m.wordCount ?? 0) >= 150 ? "warn" : "fail" },
                    { label: "H1 Tags", value: m.h1Count != null ? m.h1Count : "—", status: m.h1Count === 1 ? "pass" : (m.h1Count ?? 0) > 1 ? "warn" : "fail" },
                    { label: "H2 Tags", value: (m as any).h2Count != null ? (m as any).h2Count : "—", status: ((m as any).h2Count ?? 0) > 0 ? "pass" : "warn" },
                    { label: "Schema", value: m.hasSchema ? (m.localBusinessSchemaDetected ? "LocalBiz" : "Found") : "Missing", status: m.hasSchema ? (m.schemaValid !== false ? "pass" : "fail") : "fail" },
                  ];
                  const statusColor = (s: string) =>
                    s === "pass" ? "text-emerald-600 bg-emerald-50 border-emerald-100" :
                    s === "warn" ? "text-amber-600 bg-amber-50 border-amber-100" :
                    s === "fail" ? "text-rose-600 bg-rose-50 border-rose-100" :
                    "text-slate-500 bg-slate-50 border-slate-100";
                  const statusDot = (s: string) =>
                    s === "pass" ? "bg-emerald-400" : s === "warn" ? "bg-amber-400" : s === "fail" ? "bg-rose-400" : "bg-slate-300";
                  return (
                    <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-3">Quick Metrics Snapshot</h4>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {items.map((item) => (
                          <div key={item.label} className={`rounded-xl border px-3 py-2.5 flex flex-col gap-1 ${statusColor(item.status)}`}>
                            <div className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(item.status)}`} />
                              <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{item.label}</span>
                            </div>
                            <span className="text-[12px] font-extrabold tabular-nums leading-none">{String(item.value ?? "—")}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })()}

                {/* ── Security & Schema Panel ── */}
                {currentResult?.metrics && (() => {
                  const m = currentResult.metrics;
                  const secHeaders: { label: string; present: boolean | undefined }[] = [
                    { label: "HSTS", present: m.hstsHeaderPresent },
                    { label: "CSP", present: m.cspHeaderPresent },
                    { label: "X-Frame-Options", present: m.xFrameHeaderPresent },
                    { label: "X-Content-Type", present: m.xContentTypeHeaderPresent },
                  ];
                  const hasSecData = secHeaders.some(h => h.present !== undefined);
                  const hasSchemaData = m.hasSchema !== undefined;
                  if (!hasSecData && !hasSchemaData) return null;
                  const passCount = secHeaders.filter(h => h.present === true).length;
                  const secScore = Math.round((passCount / secHeaders.length) * 100);
                  return (
                    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-4">Security &amp; Schema</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Security Headers */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-bold text-slate-700">Security Headers</p>
                            <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${secScore === 100 ? "bg-emerald-100 text-emerald-700" : secScore >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                              {passCount}/{secHeaders.length} passing
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${secScore === 100 ? "bg-emerald-500" : secScore >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${secScore}%` }} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {secHeaders.map(h => (
                              <div key={h.label} className={`rounded-lg border px-3 py-2 flex items-center gap-2 text-[11px] font-semibold ${h.present === true ? "border-emerald-100 bg-emerald-50/30 text-emerald-700" : h.present === false ? "border-rose-100 bg-rose-50/30 text-rose-700" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
                                <span className={`h-2 w-2 rounded-full shrink-0 ${h.present === true ? "bg-emerald-400" : h.present === false ? "bg-rose-400" : "bg-slate-200"}`} />
                                {h.label}
                                <span className="ml-auto text-[9px]">{h.present === true ? "✓" : h.present === false ? "✗" : "?"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Schema */}
                        <div className="space-y-3">
                          <p className="text-[12px] font-bold text-slate-700">Structured Data (Schema)</p>
                          <div className="space-y-2">
                            <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 text-[11px] font-semibold ${m.hasSchema ? "border-emerald-100 bg-emerald-50/30 text-emerald-700" : "border-rose-100 bg-rose-50/30 text-rose-700"}`}>
                              <span className={`h-2 w-2 rounded-full ${m.hasSchema ? "bg-emerald-400" : "bg-rose-400"}`} />
                              Schema markup: {m.hasSchema ? "Detected" : "Not found"}
                            </div>
                            {m.hasSchema && (
                              <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 text-[11px] font-semibold ${m.localBusinessSchemaDetected ? "border-indigo-100 bg-indigo-50/30 text-indigo-700" : "border-slate-100 bg-slate-50 text-slate-500"}`}>
                                <span className={`h-2 w-2 rounded-full ${m.localBusinessSchemaDetected ? "bg-indigo-400" : "bg-slate-300"}`} />
                                LocalBusiness: {m.localBusinessSchemaDetected ? "Found" : "Not detected"}
                              </div>
                            )}
                            {m.localBusinessSchemaDetected && m.localBusinessSchemaCompleteness != null && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] text-slate-500">Schema completeness</p>
                                  <span className={`text-[11px] font-bold ${(m.localBusinessSchemaCompleteness ?? 0) >= 100 ? "text-emerald-600" : "text-amber-600"}`}>{m.localBusinessSchemaCompleteness}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${(m.localBusinessSchemaCompleteness ?? 0) >= 100 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${m.localBusinessSchemaCompleteness}%` }} />
                                </div>
                              </div>
                            )}
                            {m.schemaValid === false && m.schemaErrors && m.schemaErrors.length > 0 && (
                              <div className="rounded-lg border border-rose-100 bg-rose-50/30 px-3 py-2 text-[10px] text-rose-700">
                                {m.schemaErrors.slice(0, 2).map((e, i) => <p key={i}>Issue: {e}</p>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })()}

                {/* View Mode Toggle: Simple AI-Powered vs Detailed Technical */}
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
                      Detailed Technical Specs
                    </button>
                  </div>
                </div>

                {/* ── SIMPLE AI VIEW ── */}
                {!isDetailedView ? (
                  <div className="space-y-6">
                    {/* AI Assistant Mascot Explanation Box */}
                    <article className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/20 to-sky-50/10 p-5 space-y-4 shadow-sm relative">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/10">
                          {/* Cute AI assistant face/chat icon */}
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </span>
                        <div>
                          <h4 className="text-[13px] font-extrabold text-indigo-950 tracking-wide uppercase">AI SEO Specialist Assistant</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">Plain-language breakdown of what your scores actually mean.</p>
                        </div>
                      </div>

                      {parsedAiInsights ? (
                        <div className="space-y-4 text-slate-700 leading-relaxed text-[12px]">
                          <div className="bg-white/80 rounded-xl p-4 border border-indigo-50/50 shadow-inner">
                            <p className="font-extrabold text-indigo-900 text-[13px]">{parsedAiInsights.headline}</p>
                            <p className="mt-2 text-slate-600 leading-relaxed">{parsedAiInsights.executiveSummary}</p>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="bg-rose-50/30 rounded-xl p-4 border border-rose-100/50 space-y-2">
                              <p className="font-bold text-rose-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Priority Checklist (Fix First)
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
                              ) : <p className="text-slate-400">Everything looks solid!</p>}
                            </div>

                            <div className="bg-emerald-50/30 rounded-xl p-4 border border-emerald-100/50 space-y-2">
                              <p className="font-bold text-emerald-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg>
                                Quick Wins (Easy Fixes)
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
                              ) : <p className="text-slate-400">No easy fixes identified.</p>}
                            </div>
                          </div>

                          <div className="bg-indigo-50/30 rounded-xl p-3.5 border border-indigo-100/50 text-[11px]">
                            <p className="font-bold text-indigo-900 uppercase tracking-wider text-[9px]">Suggested Next Step</p>
                            <p className="mt-1 text-indigo-950 font-medium leading-relaxed">{parsedAiInsights.nextStepCta}</p>
                          </div>

                          {!currentAudit.ai_insights && (
                            <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 mt-2">
                              <span className="text-[10px] text-slate-400">Want deeper AI analysis? Enhance this report with AI narrative.</span>
                              <button
                                type="button"
                                onClick={() => void createAiReportForLatest()}
                                disabled={aiBusy}
                                className="rounded bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                              >
                                {aiBusy ? "Enhancing..." : "Enhance with AI"}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </article>

                    {/* Standard wins list */}
                    {currentResult.wins.length > 0 && (
                      <article className="rounded-2xl border border-emerald-100 bg-emerald-50/10 p-5 space-y-3">
                        <h4 className="text-[12px] font-bold text-emerald-950 uppercase tracking-wider">What is working well</h4>
                        <div className="space-y-2">
                          {currentResult.wins.slice(0, 3).map((w, i) => (
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
                  /* ── DETAILED TECHNICAL VIEW ── */
                  <div className="space-y-6 animate-fade-in">
                    {/* Step Switcher inside Tech View */}
                    <div className="flex gap-1.5 border border-slate-200/80 bg-slate-50/80 rounded-xl p-1 w-full sm:w-fit shadow-inner">
                      {STEPS.map((step, i) => {
                        if (step.key === "pages" && topPages.length === 0) return null;
                        return (
                          <button
                            key={step.key}
                            type="button"
                            onClick={() => setActiveStep(i)}
                            className={[
                              "flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[11px] font-bold transition-all duration-200",
                              activeStep === i
                                ? "bg-white text-indigo-600 shadow-sm border border-slate-200/50"
                                : "text-slate-500 hover:text-slate-700",
                            ].join(" ")}
                          >
                            {step.icon}
                            <span>{step.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Step 0: Overview */}
                    {activeStep === 0 && (
                      <div className="space-y-6 animate-fade-in">
                        {/* Category Scores */}
                        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                          {categories.map((cat) => (
                            <div key={cat.key} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between space-y-3 hover:shadow-md transition-all">
                              <div>
                                <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{cat.label}</p>
                                <p className="text-[11px] leading-relaxed text-slate-500 mt-1 truncate">{cat.summary}</p>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-end justify-between">
                                  <span className={`text-base font-extrabold tabular-nums ${scoreColorClass(cat.score)}`}>{cat.score}</span>
                                </div>
                                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${scoreBgClass(cat.score)}`} style={{ width: `${cat.score}%` }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Evidence highlights */}
                        {evidence.length > 0 && (
                          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                            {evidence.map((e) => (
                              <div key={e.label} className="rounded-xl bg-slate-50 border border-slate-200/40 p-4">
                                <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{e.label}</p>
                                <p className="mt-1 text-xl font-black text-slate-900 tabular-nums">{e.value}</p>
                                <p className="mt-0.5 text-[10px] text-slate-400 leading-snug">{e.detail}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Modules checklists */}
                        {modules.length > 0 && (
                          <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Crawl Checklist Modules</h4>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                              {modules.map((mod) => {
                                const isPass = mod.status === "pass";
                                const isWarning = mod.status === "warning";
                                return (
                                  <div key={mod.label} className={[
                                    "rounded-xl border p-3 flex gap-2.5 items-start",
                                    isPass ? "bg-emerald-50/20 border-emerald-100" : isWarning ? "bg-amber-50/20 border-amber-100" : "bg-rose-50/20 border-rose-100"
                                  ].join(" ")}>
                                    <span className={["h-2 w-2 rounded-full mt-1.5 shrink-0", isPass ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-rose-500"].join(" ")} />
                                    <div className="min-w-0">
                                      <p className="text-[12px] font-bold text-slate-800">{mod.label}</p>
                                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{mod.detail}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </article>
                        )}
                      </div>
                    )}

                    {/* Step 1: Findings */}
                    {activeStep === 1 && (
                      <div className="space-y-4 animate-fade-in">
                        <div className="flex gap-1.5 flex-wrap">
                          {FINDING_TABS.map((tab) => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setActiveFindingTab(tab.key)}
                              className={[
                                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold border transition-all duration-200",
                                activeFindingTab === tab.key ? `${tab.bgColor} ${tab.borderColor} ${tab.color} shadow-sm` : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                              ].join(" ")}
                            >
                              {tab.icon}
                              {tab.label}
                              <span className="ml-1 rounded-full px-1.5 bg-slate-100 text-[9px] font-bold text-slate-600">{findingCounts[tab.key]}</span>
                            </button>
                          ))}
                        </div>
                        <article className="rounded-2xl border border-slate-200 bg-white p-5">
                          {activeFindingTab === "passed" ? (
                            classifiedIssues.passed.length === 0 ? (
                              <p className="text-[12px] text-slate-400 py-6 text-center">No passed checks.</p>
                            ) : (
                              <div className="grid gap-2">
                                {classifiedIssues.passed.map((item, i) => (
                                  <div key={i} className="flex gap-3 rounded-xl border border-emerald-100 bg-emerald-50/20 p-3">
                                    <svg className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" /></svg>
                                    <p className="text-[11px] leading-relaxed text-emerald-800">{item.detail}</p>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            (() => {
                              const items = classifiedIssues[activeFindingTab];
                              const tabConfig = FINDING_TABS.find(t => t.key === activeFindingTab)!;
                              if (items.length === 0) return <p className="text-[12px] text-slate-400 py-6 text-center">{tabConfig.emptyLabel}</p>;
                              return (
                                <div className="grid gap-2">
                                  {items.map((issue, i) => (
                                    <div key={i} className={`rounded-xl border p-3.5 flex gap-3 ${tabConfig.bgColor} ${tabConfig.borderColor} items-start`}>
                                      <span className={tabConfig.color}>{tabConfig.icon}</span>
                                      <div>
                                        <p className="text-[12px] font-bold text-slate-800">{issue.title}</p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{issue.detail}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()
                          )}
                        </article>
                      </div>
                    )}

                    {/* Step 2: Recommendations */}
                    {activeStep === 2 && (
                      <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
                        <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Priority Roadmap Fixes</h4>
                          <div className="space-y-2">
                            {currentResult.recommendations.map((rec, i) => (
                              <div key={i} className="flex gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3 items-start">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-[10px]">{i + 1}</span>
                                <p className="text-[11px] text-slate-700 leading-relaxed">{rec}</p>
                              </div>
                            ))}
                          </div>
                        </article>
                        <article className="rounded-2xl border border-emerald-100 bg-emerald-50/10 p-5 space-y-4">
                          <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">Passed Milestones</h4>
                          <div className="space-y-2">
                            {currentResult.wins.map((w, i) => (
                              <div key={i} className="flex gap-2.5 items-start bg-white border border-emerald-100/50 p-3 rounded-xl text-[11px] leading-relaxed text-emerald-800">
                                <span className="text-emerald-500 font-bold">✓</span>
                                <p>{w}</p>
                              </div>
                            ))}
                          </div>
                        </article>
                      </div>
                    )}

                    {/* Step 3: Crawled pages */}
                    {activeStep === 3 && (
                      <article className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 animate-fade-in">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Crawled Pages Details</h4>
                        <div className="space-y-2">
                          {topPages.map((p, i) => (
                            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="text-[12px] font-bold text-slate-800 truncate break-all">{p.url}</span>
                                <span className="bg-slate-200 text-slate-600 text-[8px] font-bold uppercase rounded px-1.5">{p.pageRole}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 leading-relaxed border-l border-indigo-600/20 pl-2">{p.summary}</p>
                            </div>
                          ))}
                        </div>
                      </article>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <article className="rounded-2xl border border-dashed border-slate-350 bg-white p-12 text-center flex flex-col items-center justify-center space-y-2">
                <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <h4 className="text-xs font-bold text-slate-700">No Report Selected</h4>
                <p className="text-[11px] text-slate-400">Trigger a crawl check or select an audit from history.</p>
              </article>
            )}
          </div>
        </div>
      ) : (
        /* ───── AI SPECIALIST TABS ───── */
        <div className="space-y-6">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            {AI_SPECIALIST_CONFIGS.map((cfg) => (
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
            const activeCfg = AI_SPECIALIST_CONFIGS.find(cfg => cfg.type === selectedAiType) || AI_SPECIALIST_CONFIGS[0];
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
