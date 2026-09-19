import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ScoreGauge } from "../components/ScoreGauge";
import { GeoGridHeatmap, type GeoGridResult } from "../components/GeoGridHeatmap";
import { CompetitorBenchmarkTable, type CompetitorBenchmarkReport } from "../components/CompetitorBenchmarkTable";
import { NapConsistencyCard, type NapAuditReport } from "../components/NapConsistencyCard";
import { ReviewSentimentCard, type ReviewSentimentReport } from "../components/ReviewSentimentCard";

interface ClientData {
  id: string;
  name: string;
  primary_contact: string;
  contact_email: string;
  contact_phone: string;
  lifecycle_stage: string;
  monthly_budget_total: number | null;
}

interface SeoTask {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  due_date: string | null;
  completed_at: string | null;
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

interface ClientPortalApiResponse {
  client: ClientData;
  businesses: any[];
  latestAudit: {
    score: number | null;
    verdict: string;
    grade: string;
    gradeLabel: string;
    gradeColor: string;
    createdAt: string;
  };
  historyComparison: HistoryComparisonData | null;
  tasks: SeoTask[];
  geoGrid?: GeoGridResult;
  competitorBenchmark?: CompetitorBenchmarkReport;
  napReport?: NapAuditReport;
  reviewSentiment?: ReviewSentimentReport;
  agencyBranding: AgencyBrandingData;
}

export function ClientPortalPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ClientPortalApiResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "geogrid" | "competitors" | "citations" | "sentiment" | "deliverables">("overview");

  useEffect(() => {
    async function loadPortal() {
      try {
        const res = await fetch(`/public-api/portal/${clientId}${window.location.search}`);
        if (!res.ok) {
          throw new Error("Unable to load client portal. Please verify the portal link.");
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (clientId) {
      loadPortal();
    }
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-10 w-10 animate-spin text-[#5e6ad2]" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-semibold uppercase tracking-wider">Loading Live Client Portal...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400 p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-950 bg-red-950/10 p-8">
          
          <h1 className="mt-4 text-xl font-bold text-red-500">Portal Not Found</h1>
          <p className="mt-2 text-sm text-slate-500">{error || "This client portal link is unavailable."}</p>
        </div>
      </div>
    );
  }

  const { client, businesses, latestAudit, historyComparison, tasks, geoGrid, competitorBenchmark, napReport, reviewSentiment, agencyBranding } = data;

  const completedTasks = tasks.filter((t) => t.status === "done");
  const inProgressTasks = tasks.filter((t) => t.status !== "done");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 selection:bg-[#5e6ad2] selection:text-white">
      {/* Agency White-Label Header */}
      <header className="border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {agencyBranding.agencyLogoUrl ? (
              <img src={agencyBranding.agencyLogoUrl} alt={agencyBranding.agencyName} className="h-7 w-auto object-contain" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5e6ad2] text-xs font-black text-white">
                {agencyBranding.agencyName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="text-xs font-bold text-slate-300 tracking-wide">{agencyBranding.agencyName} • Client Hub</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {agencyBranding.agencyPhone && <span>{agencyBranding.agencyPhone}</span>}
            <span className="hidden sm:inline">{agencyBranding.agencyEmail}</span>
          </div>
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-b from-indigo-950/40 via-slate-900/40 to-slate-950 py-12 px-6 border-b border-slate-900">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 uppercase tracking-wider mb-3.5 border border-indigo-500/30">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Active Retained Client Portal
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">
              {client.name}
            </h1>
            <p className="text-slate-300 mt-2 text-base md:text-lg">
              Live Monthly Retainer Performance &amp; Deliverables Dashboard
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md shadow-xl">
            <ScoreGauge
              score={latestAudit.score}
              grade={latestAudit.grade}
              gradeLabel={latestAudit.gradeLabel}
              size="md"
              showDelta={Boolean(historyComparison)}
              scoreDelta={historyComparison?.scoreDelta}
              subtitle="Current SEO Retainer Health"
            />
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="max-w-6xl mx-auto px-6 mt-6">
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          {[
            { id: "overview", label: "Overview & Progress" },
            { id: "geogrid", label: "Local Geo-Grid" },
            { id: "competitors", label: "Competitors" },
            { id: "citations", label: "Directory Citations" },
            { id: "sentiment", label: "Customer Sentiment" },
            { id: "deliverables", label: `Deliverables (${completedTasks.length}/${tasks.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-[#5e6ad2] text-white shadow-lg shadow-indigo-500/20"
                  : "bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-6xl mx-auto px-6 mt-8 space-y-8">
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Historical Month-over-Month Progress Card */}
            {historyComparison ? (
              <article className="rounded-2xl border border-indigo-900/50 bg-gradient-to-br from-indigo-950/40 via-slate-900/40 to-slate-950 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-indigo-900/40 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Month-over-Month Progress</span>
                    <h3 className="text-lg font-bold text-white mt-0.5">Continuous SEO Improvement</h3>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
                    +{historyComparison.scoreDelta} Points Overall
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
                    <p className="text-xs text-slate-400">Initial Baseline</p>
                    <p className="mt-1 text-3xl font-black text-slate-400">{historyComparison.initialScore}/100</p>
                    <p className="text-[10px] text-slate-500 mt-1">{new Date(historyComparison.initialDate).toLocaleDateString()}</p>
                  </div>

                  <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/30 p-4 text-center">
                    <p className="text-xs text-indigo-300">Audits Run</p>
                    <p className="mt-1 text-3xl font-black text-indigo-300">{historyComparison.totalAudits}</p>
                    <p className="text-[10px] text-indigo-400/80 mt-1">Scheduled Monthly Passes</p>
                  </div>

                  <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-4 text-center">
                    <p className="text-xs text-emerald-300">Current Health</p>
                    <p className="mt-1 text-3xl font-black text-emerald-400">{historyComparison.currentScore}/100</p>
                    <p className="text-[10px] text-emerald-400/80 mt-1">{new Date(historyComparison.currentDate).toLocaleDateString()}</p>
                  </div>
                </div>
              </article>
            ) : (
              <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md text-center space-y-2">
                <p className="text-sm font-bold text-white">Monthly Retainer Audit Active</p>
                <p className="text-xs text-slate-400">
                  Your recurring monthly SEO audit is scheduled. Next automated scan will benchmark your ranking improvements.
                </p>
              </article>
            )}

            {/* Quick GeoGrid and Competitor Teasers */}
            {geoGrid && <GeoGridHeatmap data={geoGrid} />}
          </div>
        )}

        {activeTab === "geogrid" && geoGrid && (
          <GeoGridHeatmap data={geoGrid} />
        )}

        {activeTab === "competitors" && competitorBenchmark && (
          <CompetitorBenchmarkTable data={competitorBenchmark} />
        )}

        {activeTab === "citations" && napReport && (
          <NapConsistencyCard data={napReport} />
        )}

        {activeTab === "sentiment" && reviewSentiment && (
          <ReviewSentimentCard data={reviewSentiment} />
        )}

        {activeTab === "deliverables" && (
          <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Agency Work Log</span>
                <h3 className="text-xl font-bold text-white mt-0.5">Completed Deliverables &amp; Sprint Tasks</h3>
              </div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 rounded-full px-3 py-1 border border-emerald-500/30">
                {completedTasks.length} Completed
              </span>
            </div>

            <div className="space-y-3">
              {tasks.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No tasks scheduled for this cycle yet.</p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${task.status === "done" ? "bg-emerald-400" : "bg-amber-400"}`} />
                        <h4 className="text-sm font-bold text-white">{task.title}</h4>
                      </div>
                      {task.description && (
                        <p className="text-xs text-slate-400 pl-4 leading-relaxed">{task.description}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                        task.status === "done"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                      }`}
                    >
                      {task.status === "done" ? "Completed ✓" : "In Progress"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
