import React from "react";
import { RatingStars } from "./ui/RatingStars";

export interface CompetitorMetricRow {
  name: string;
  isClient: boolean;
  rating: number | null;
  reviewCount: number | null;
  claimed: boolean | null;
  websiteSpeedMs: number | null;
  schemaDetected: boolean | null;
  localPackPresence: string;
  organicScore: number | null;
}

export interface CompetitorBenchmarkReport {
  targetBusiness: string;
  niche: string;
  city: string;
  summary: string;
  metrics: CompetitorMetricRow[];
  keyDifferences: string[];
  winningStrategy: string;
  generatedAt: string;
}

interface CompetitorBenchmarkTableProps {
  data: CompetitorBenchmarkReport;
}

export function CompetitorBenchmarkTable({ data }: CompetitorBenchmarkTableProps) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 uppercase tracking-wider mb-1.5 border border-indigo-500/30">
            ⚔️ Local Competitive Benchmark
          </div>
          <h3 className="text-xl font-bold text-white">
            {data.targetBusiness} vs. Top Market Competitors
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Head-to-head performance analysis in {data.city} for "{data.niche}"
          </p>
        </div>
      </div>

      {/* Side-by-side Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3.5">Business Name</th>
              <th className="px-4 py-3.5">Google Rating</th>
              <th className="px-4 py-3.5">Reviews</th>
              <th className="px-4 py-3.5">GMB Claimed</th>
              <th className="px-4 py-3.5">Page Speed</th>
              <th className="px-4 py-3.5">Schema Data</th>
              <th className="px-4 py-3.5">Local 3-Pack Presence</th>
              <th className="px-4 py-3.5 text-right">SEO Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {data.metrics.map((row, idx) => (
              <tr
                key={idx}
                className={
                  row.isClient
                    ? "bg-indigo-950/30 font-semibold text-white border-l-4 border-l-[#5e6ad2]"
                    : "hover:bg-slate-900/50 transition-colors"
                }
              >
                <td className="px-4 py-3.5 flex items-center gap-2">
                  <span>{row.name}</span>
                  {row.isClient && (
                    <span className="rounded-full bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 text-[9px] font-black uppercase text-indigo-300">
                      Your Business
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {row.rating == null ? "Not checked" : <RatingStars rating={row.rating} size="xs" />}
                </td>
                <td className="px-4 py-3.5 tabular-nums">{row.reviewCount ?? "Not checked"}</td>
                <td className="px-4 py-3.5">
                  {row.claimed == null ? <span className="text-slate-500">Not checked</span> : row.claimed ? (
                    <span className="text-emerald-400 font-bold">✓ Verified</span>
                  ) : (
                    <span className="text-rose-400 font-bold">✗ Unclaimed</span>
                  )}
                </td>
                <td className="px-4 py-3.5 tabular-nums">
                  {row.websiteSpeedMs == null ? "Not checked" : <span className={row.websiteSpeedMs < 800 ? "text-emerald-400" : "text-amber-400"}>{row.websiteSpeedMs}ms</span>}
                </td>
                <td className="px-4 py-3.5">
                  {row.schemaDetected == null ? <span className="text-slate-500">Not checked</span> : row.schemaDetected ? (
                    <span className="text-emerald-400">✓ Present</span>
                  ) : (
                    <span className="text-rose-400">✗ Missing</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      row.localPackPresence.includes("Top 3")
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {row.localPackPresence}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right font-black tabular-nums">
                  {row.organicScore == null ? "Not checked" : <span className={row.organicScore >= 80 ? "text-emerald-400" : row.organicScore >= 60 ? "text-amber-400" : "text-rose-400"}>{row.organicScore}/100</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actionable Winning Strategy */}
      <div className="rounded-xl border border-indigo-900/40 bg-gradient-to-r from-indigo-950/40 to-slate-900/40 p-5 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
          🚀 Strategic Path to Beat Local Competitors
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed">{data.winningStrategy}</p>
        <div className="grid gap-2 pt-2 border-t border-indigo-900/30 text-xs">
          {data.keyDifferences.map((diff, i) => (
            <div key={i} className="flex items-start gap-2 text-slate-300">
              <span className="text-indigo-400 font-bold shrink-0">▪</span>
              <span>{diff}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
