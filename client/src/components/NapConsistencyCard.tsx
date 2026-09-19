import React from "react";

export interface DirectoryCitationItem {
  directory: string;
  icon: string;
  status: "verified_match" | "mismatch_detected" | "missing_listing" | "not_checked";
  name: string;
  address: string;
  phone: string;
  issues: string[];
}

export interface NapAuditReport {
  businessName: string;
  standardAddress: string;
  standardPhone: string;
  consistencyScore: number | null;
  totalDirectoriesChecked: number;
  matchingCount: number;
  mismatchCount: number;
  missingCount: number;
  directories: DirectoryCitationItem[];
  riskSummary: string;
  recommendedAction: string;
  generatedAt: string;
}

interface NapConsistencyCardProps {
  data: NapAuditReport;
}

export function NapConsistencyCard({ data }: NapConsistencyCardProps) {
  const getStatusBadge = (status: DirectoryCitationItem["status"]) => {
    switch (status) {
      case "verified_match":
        return { label: "Verified Match", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
      case "mismatch_detected":
        return { label: "Data Mismatch", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
      case "missing_listing":
        return { label: "Missing Listing", cls: "bg-rose-500/20 text-rose-300 border-rose-500/30" };
      case "not_checked":
        return { label: "Not checked", cls: "bg-slate-800 text-slate-300 border-slate-700" };
    }
  };

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 uppercase tracking-wider mb-1.5 border border-indigo-500/30">
            🏢 Directory & Citation Consistency (NAP)
          </div>
          <h3 className="text-xl font-bold text-white">
            Name, Address & Phone Synchronization
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Directory evidence status; unchecked sources are clearly labelled
          </p>
        </div>

        {/* Big Score Dial Badge */}
        <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Consistency</span>
            <span className="text-xs text-slate-500">{data.matchingCount}/{data.totalDirectoriesChecked} verified</span>
          </div>
          <div className="text-2xl font-black text-white tabular-nums px-2.5 py-1 rounded-lg bg-indigo-600/30 border border-indigo-500/40">
            {data.consistencyScore == null ? "Not checked" : `${data.consistencyScore}%`}
          </div>
        </div>
      </div>

      {/* Overview Risk Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex items-start gap-3 text-xs">
        <span className="text-xl shrink-0">ℹ️</span>
        <div>
          <strong className="text-white font-semibold block mb-0.5">Citation Authority Analysis:</strong>
          <p className="text-slate-300 leading-relaxed">{data.riskSummary}</p>
        </div>
      </div>

      {/* Directory Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.directories.map((dir, idx) => {
          const badge = getStatusBadge(dir.status);
          return (
            <div
              key={idx}
              className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{dir.icon}</span>
                  <span className="font-bold text-slate-200 text-xs">{dir.directory}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>

              <div className="space-y-1 text-[11px] text-slate-400 pl-6">
                <p className="truncate"><span className="text-slate-500">Name:</span> {dir.name || "Not checked"}</p>
                <p className="truncate"><span className="text-slate-500">Address:</span> {dir.address || "Not checked"}</p>
                <p><span className="text-slate-500">Phone:</span> {dir.phone || "Not checked"}</p>
              </div>

              {dir.issues.length > 0 && (
                <div className="pl-6 pt-1 text-[10px] text-rose-300">
                  ⚠️ {dir.issues[0]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
