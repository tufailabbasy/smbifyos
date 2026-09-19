import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ScoreGauge } from "../components/ScoreGauge";
import { GeoGridHeatmap, type GeoGridResult } from "../components/GeoGridHeatmap";
import { CompetitorBenchmarkTable, type CompetitorBenchmarkReport } from "../components/CompetitorBenchmarkTable";
import { NapConsistencyCard, type NapAuditReport } from "../components/NapConsistencyCard";
import { ReviewSentimentCard, type ReviewSentimentReport } from "../components/ReviewSentimentCard";

interface LeadData {
  id: string;
  business_name: string;
  niche: string;
  city: string;
  state: string;
  gmb_rating: number | null;
  gmb_review_count: number | null;
  gmb_claimed: number;
  has_website: number;
  website: string | null;
}

interface IssueItem {
  title: string;
  description: string;
  whyItMatters: string;
  recommendedFix: string;
  severity: "critical" | "high" | "medium";
}

interface ExecutiveSummaryData {
  headline: string;
  grade: string;
  gradeLabel: string;
  gradeColor: string;
  overallHealth: string;
  biggestProblem: string;
  businessImpact: string;
  recommendedAction: string;
}

interface HistoryComparisonData {
  initialScore: number;
  initialDate: string;
  currentScore: number;
  currentDate: string;
  scoreDelta: number;
  trend: "improved" | "declined" | "neutral";
  totalAudits: number;
}

interface AgencyBrandingData {
  agencyName: string;
  agencyEmail: string;
  agencyPhone: string;
  agencyLogoUrl: string;
  defaultCity: string;
}

interface PitchApiResponse {
  lead: LeadData;
  audit: {
    score: number | null;
    verdict: string;
    summary: string;
    grade?: string;
    gradeLabel?: string;
    gradeColor?: string;
    createdAt?: string;
  } | null;
  executiveSummary: ExecutiveSummaryData;
  letterGrade: { grade: string; label: string; color: string };
  top3Issues: IssueItem[];
  recommendations: IssueItem[];
  historyComparison: HistoryComparisonData | null;
  agencyBranding: AgencyBrandingData;
  geoGrid?: GeoGridResult;
  competitorBenchmark?: CompetitorBenchmarkReport;
  napReport?: NapAuditReport;
  reviewSentiment?: ReviewSentimentReport;
}

export function ClientPitchPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PitchApiResponse | null>(null);
  const [showFullChecklist, setShowFullChecklist] = useState(false);

  // ROI Calculator states
  const [jobValue, setJobValue] = useState(350);
  const [closeRate, setCloseRate] = useState(30);
  const [estimatedExtraCalls, setEstimatedExtraCalls] = useState(25);

  // Callback form states
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formPreferredTime, setFormPreferredTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    async function loadPitch() {
      try {
        const res = await fetch(`/public-api/pitch/${leadId}${window.location.search}`);
        if (!res.ok) {
          throw new Error("Unable to load the proposal page. Please check the URL.");
        }
        const json = await res.json();
        setData(json);

        // Adjust default estimated calls based on review count
        const reviews = json.lead?.gmb_review_count || 10;
        setEstimatedExtraCalls(Math.max(15, Math.min(60, Math.round(reviews * 0.4))));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (leadId) {
      loadPitch();
    }
  }, [leadId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/public-api/pitch/${leadId}/accept${window.location.search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          phone: formPhone,
          message: formMessage,
          preferredTime: formPreferredTime,
        }),
      });
      if (res.ok) {
        setSubmitSuccess(true);
      } else {
        alert("Failed to submit request. Please try again.");
      }
    } catch {
      alert("Error submitting request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-10 w-10 animate-spin text-[#5e6ad2]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-semibold uppercase tracking-wider">Generating Interactive Executive Audit...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400 p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-950 bg-red-950/10 p-8">
          
          <h1 className="mt-4 text-xl font-bold text-red-500">Proposal Not Found</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "This proposal link has expired or is invalid."}</p>
        </div>
      </div>
    );
  }

  const {
    lead,
    audit,
    executiveSummary,
    letterGrade,
    top3Issues,
    recommendations,
    historyComparison,
    agencyBranding,
    geoGrid,
    competitorBenchmark,
    napReport,
    reviewSentiment,
  } = data;
  const projectExtraRevenue = Math.round(estimatedExtraCalls * (closeRate / 100) * jobValue);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 selection:bg-[#5e6ad2] selection:text-white">
      {/* Agency White-Label Branding Header */}
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {agencyBranding.agencyLogoUrl ? (
              <img src={agencyBranding.agencyLogoUrl} alt={agencyBranding.agencyName} className="h-7 w-auto object-contain" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5e6ad2] text-xs font-black text-white">
                {agencyBranding.agencyName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="text-xs font-bold text-slate-300 tracking-wide">{agencyBranding.agencyName}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {agencyBranding.agencyPhone && <span>{agencyBranding.agencyPhone}</span>}
            <span className="hidden sm:inline">{agencyBranding.agencyEmail}</span>
          </div>
        </div>
      </header>

      {/* Hero Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#5e6ad2]/15 via-slate-900/40 to-slate-950 py-12 px-6 border-b border-slate-900">
        <div className="absolute top-[-20%] left-[30%] w-[500px] h-[500px] rounded-full bg-[#5e6ad2]/10 blur-[140px] pointer-events-none" />
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#5e6ad2]/20 text-[#a5b4fc] uppercase tracking-wider mb-3.5 border border-[#5e6ad2]/30">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Verified Local Growth & Authority Audit
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
              {lead.business_name}
            </h1>
            <p className="text-slate-300 mt-2 text-base md:text-lg">
              Local Authority & Lead Generation Analysis for <span className="text-white font-semibold">{lead.city}, {lead.state}</span>
            </p>
          </div>

          {/* Letter Grade & Score Gauge Hero */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md shadow-xl">
            <ScoreGauge
              score={audit?.score ?? 65}
              grade={letterGrade?.grade}
              gradeLabel={letterGrade?.label}
              size="md"
              showDelta={Boolean(historyComparison)}
              scoreDelta={historyComparison?.scoreDelta}
              subtitle="Digital Authority Health Score"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Column (2 cols) */}
        <div className="lg:col-span-2 space-y-8">
          {/* 1. AI Executive Summary (Phase 1, Item 1) */}
          <article className="rounded-2xl border border-indigo-900/50 bg-gradient-to-br from-indigo-950/40 via-slate-900/50 to-slate-900/30 p-6 md:p-8 backdrop-blur-md shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-900/40 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 font-bold">
                  ⚡
                </span>
                <div>
                  <h2 className="text-base md:text-lg font-bold text-white">Executive Summary</h2>
                  <p className="text-xs text-indigo-300/80">Plain-English digital health overview for business leadership</p>
                </div>
              </div>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                Grade: {letterGrade?.grade}
              </span>
            </div>

            <div className="space-y-3.5 text-sm md:text-[14px] leading-relaxed">
              <p className="text-slate-200">
                <strong className="text-white font-semibold">Overall Situation: </strong>
                {executiveSummary.overallHealth}
              </p>
              <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3.5 text-rose-200 flex items-start gap-3">
                
                <div>
                  <strong className="text-rose-100 font-semibold block text-xs uppercase tracking-wider">Primary Growth Bottleneck</strong>
                  <span className="text-xs text-rose-200/90 leading-relaxed mt-0.5 block">{executiveSummary.biggestProblem}</span>
                </div>
              </div>
              <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-3.5 text-amber-200 flex items-start gap-3">
                
                <div>
                  <strong className="text-amber-100 font-semibold block text-xs uppercase tracking-wider">Estimated Business Impact</strong>
                  <span className="text-xs text-amber-200/90 leading-relaxed mt-0.5 block">{executiveSummary.businessImpact}</span>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3.5 text-emerald-200 flex items-start gap-3">
                
                <div>
                  <strong className="text-emerald-100 font-semibold block text-xs uppercase tracking-wider">Recommended Next Step</strong>
                  <span className="text-xs text-emerald-200/90 leading-relaxed mt-0.5 block">{executiveSummary.recommendedAction}</span>
                </div>
              </div>
            </div>
          </article>

          {/* 2. Before / After Progress Comparison (Phase 1, Item 4) */}
          {historyComparison && (
            <article className="rounded-2xl border border-slate-800 bg-slate-900/30 p-6 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Authority Score Progress Over Time
                </h3>
                <span className="text-xs text-slate-400">
                  {historyComparison.totalAudits} audits conducted
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
                  <p className="text-xs text-slate-400">Baseline Audit ({new Date(historyComparison.initialDate).toLocaleDateString()})</p>
                  <p className="mt-1 text-2xl font-black text-slate-300">{historyComparison.initialScore}/100</p>
                </div>
                <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 text-center">
                  <p className="text-xs text-emerald-300">Latest Audit ({new Date(historyComparison.currentDate).toLocaleDateString()})</p>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <span className="text-2xl font-black text-white">{historyComparison.currentScore}/100</span>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 rounded-md px-1.5 py-0.5">
                      +{historyComparison.scoreDelta} pts
                    </span>
                  </div>
                </div>
              </div>
            </article>
          )}

          {/* 3. Top 3 Priority Issues Hero Layout (Phase 1, Item 3) */}
          <article className="rounded-2xl border border-slate-900 bg-slate-900/30 p-6 md:p-8 backdrop-blur-md space-y-6">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Priority Action Plan</span>
              <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
                Top 3 High-Impact Fixes Needed
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Resolving these 3 highest-impact items will produce the fastest ranking turnaround and lead surge.
              </p>
            </div>

            <div className="space-y-4">
              {top3Issues.map((issue, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-5 space-y-3 hover:border-indigo-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 font-extrabold text-xs">
                        #{index + 1}
                      </span>
                      <h3 className="font-bold text-white text-base">{issue.title}</h3>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                        issue.severity === "critical"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : issue.severity === "high"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                      }`}
                    >
                      {issue.severity} Impact
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed pl-10">{issue.description}</p>

                  <div className="ml-10 grid gap-2 pt-2 border-t border-slate-900 text-xs">
                    <div className="flex gap-2">
                      <span className="font-semibold text-slate-300 shrink-0">Why this matters:</span>
                      <span className="text-slate-400">{issue.whyItMatters}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-semibold text-emerald-400 shrink-0">Recommended Fix:</span>
                      <span className="text-slate-300">{issue.recommendedFix}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Collapsible Secondary Checklist */}
            {recommendations.length > 3 && (
              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowFullChecklist((prev) => !prev)}
                  className="w-full py-2 text-center text-xs font-semibold text-[#8693ff] hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                >
                  {showFullChecklist ? "▲ Hide Secondary Findings" : `▼ View ${recommendations.length - 3} Additional Technical Findings`}
                </button>

                {showFullChecklist && (
                  <div className="mt-4 space-y-3">
                    {recommendations.slice(3).map((rec, i) => (
                      <div key={i} className="flex gap-3 p-3.5 rounded-xl border border-slate-900 bg-slate-950/40 text-xs">
                        
                        <div>
                          <p className="font-semibold text-slate-200">{rec.title}</p>
                          <p className="text-slate-400 mt-0.5">{rec.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>

          {/* 4. Visual Transformation (Before vs After GMB Mockup) */}
          <article className="rounded-2xl border border-slate-900 bg-slate-900/20 p-6 md:p-8 backdrop-blur-md">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              Visual Transformation (Current vs. Optimized)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Current Listing */}
              <div className="p-5 rounded-xl border border-red-950 bg-red-950/10 relative opacity-85">
                <span className="absolute top-3 right-3 text-xs font-bold bg-red-500/15 text-red-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Current
                </span>
                <h3 className="font-bold text-slate-300">{lead.business_name}</h3>
                <p className="text-xs text-slate-500 mt-1">{lead.city}, {lead.state}</p>
                <div className="mt-4 space-y-2.5 text-sm text-slate-400">
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Primary Niche</span>
                    <span className="text-white font-medium">{lead.niche}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Secondary Categories</span>
                    <span className="text-red-400 font-medium italic">None configured</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Profile Claimed</span>
                    <span className={lead.gmb_claimed ? "text-emerald-400" : "text-red-400 font-bold"}>
                      {lead.gmb_claimed ? "Claimed" : "Unclaimed!"}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Website Linked</span>
                    <span className={lead.website ? "text-emerald-400" : "text-red-400 font-bold"}>
                      {lead.website ? "Yes" : "No Website"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Optimized Listing */}
              <div className="p-5 rounded-xl border border-emerald-950 bg-emerald-950/10 relative">
                <span className="absolute top-3 right-3 text-xs font-bold bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Optimized
                </span>
                <h3 className="font-bold text-white">{lead.business_name}</h3>
                <p className="text-xs text-slate-400 mt-1">{lead.city}, {lead.state}</p>
                <div className="mt-4 space-y-2.5 text-sm text-slate-300">
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Primary Niche</span>
                    <span className="text-white font-medium">{lead.niche}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Secondary Categories</span>
                    <span className="text-emerald-400 font-bold">5 Verified Categories</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>Google Map Rank</span>
                    <span className="text-emerald-400 font-bold">#1 - #3 Map Pack</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-900 pb-1">
                    <span>GMB Products Showcase</span>
                    <span className="text-emerald-400 font-bold">Enabled</span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* Phase 2, Item 5: Geo-Grid Local Rank Tracker (LocalFalcon Style) */}
          {geoGrid && <GeoGridHeatmap data={geoGrid} />}

          {/* Phase 2, Item 6: Competitor Benchmarking */}
          {competitorBenchmark && <CompetitorBenchmarkTable data={competitorBenchmark} />}

          {/* Phase 2, Item 7: NAP Citation Consistency Checking */}
          {napReport && <NapConsistencyCard data={napReport} />}

          {/* Phase 2, Item 8: Review Sentiment Analysis */}
          {reviewSentiment && <ReviewSentimentCard data={reviewSentiment} />}

          {/* 5. Interactive ROI Impact Calculator */}
          <article className="rounded-2xl border border-slate-900 bg-gradient-to-r from-slate-900/50 via-slate-900/30 to-[#5e6ad2]/10 p-6 md:p-8 backdrop-blur-md space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Revenue Scenario Calculator
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Explore a user-entered scenario. This is not a forecast and is not derived from ranking data.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-xs mb-1.5 font-semibold">
                    <span className="text-slate-300">Average Job / Transaction Value</span>
                    <span className="text-[#a5b4fc]">${jobValue}</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="25"
                    value={jobValue}
                    onChange={(e) => setJobValue(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#5e6ad2]"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>$50</span>
                    <span>$2,000</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5 font-semibold">
                    <span className="text-slate-300">Lead-to-Customer Close Rate</span>
                    <span className="text-[#a5b4fc]">{closeRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="90"
                    step="5"
                    value={closeRate}
                    onChange={(e) => setCloseRate(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#5e6ad2]"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>5%</span>
                    <span>90%</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1.5 font-semibold">
                    <span className="text-slate-300">Assumed Extra Monthly Calls</span>
                    <span className="text-[#a5b4fc]">{estimatedExtraCalls} calls</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="150"
                    step="5"
                    value={estimatedExtraCalls}
                    onChange={(e) => setEstimatedExtraCalls(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#5e6ad2]"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>5 calls</span>
                    <span>150 calls</span>
                  </div>
                </div>
              </div>

              {/* Big Result Box */}
              <div className="p-6 rounded-2xl border border-[#5e6ad2]/30 bg-[#5e6ad2]/10 text-center space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Scenario Revenue
                </span>
                <div className="text-4xl md:text-5xl font-black text-white tracking-tight">
                  +${projectExtraRevenue.toLocaleString()}
                </div>
                <p className="text-xs text-indigo-200/80 leading-relaxed pt-2">
                  User-entered scenario: {estimatedExtraCalls} additional calls, {closeRate}% close rate, and ${jobValue} average transaction size. Actual results may differ.
                </p>
              </div>
            </div>
          </article>
        </div>

        {/* Sidebar: Callback Request Consultation Form */}
        <div>
          <div className="rounded-2xl border border-[#5e6ad2]/30 bg-slate-900/60 p-6 sticky top-20 backdrop-blur-md space-y-5 shadow-2xl">
            <div>
              <h3 className="text-lg font-bold text-white">Let's Fix Your Rankings</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Schedule a 10-minute strategy call with {agencyBranding.agencyName} to review your full audit and execute your optimization roadmap.
              </p>
            </div>

            {submitSuccess ? (
              <div className="p-5 rounded-xl border border-emerald-950 bg-emerald-950/20 text-center space-y-2">
                
                <h4 className="font-bold text-white">Consultation Requested!</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Thank you, {formName || "there"}! Our team will contact you at your requested time to initiate your listing optimization.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Miller"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:border-[#5e6ad2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Direct Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. (555) 123-4567"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:border-[#5e6ad2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Preferred Time for 10-min Call</label>
                  <input
                    type="text"
                    placeholder="e.g. Tomorrow Morning / 2:00 PM"
                    value={formPreferredTime}
                    onChange={(e) => setFormPreferredTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:border-[#5e6ad2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Specific Goals or Questions</label>
                  <textarea
                    rows={3}
                    placeholder="Tell us what specific services you want to rank higher for..."
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-950 text-white focus:outline-none focus:border-[#5e6ad2] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl text-xs font-bold bg-gradient-to-r from-[#5e6ad2] to-[#818cf8] hover:from-[#4e5abc] hover:to-[#6366f1] text-white shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? "Booking Consultation..." : "Claim Strategy Call & Optimization"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
