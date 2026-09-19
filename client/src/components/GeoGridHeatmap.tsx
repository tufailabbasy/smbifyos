import React, { useState } from "react";

export interface GeoGridPoint {
  id: string;
  row: number;
  col: number;
  lat: number;
  lng: number;
  distanceMiles: number;
  rank: number; // 1 to 20, or 21 (20+ / Not Ranked)
  topCompetitor?: string;
  addressLabel?: string;
}

export interface GeoGridResult {
  businessName: string;
  keyword: string;
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  gridSize: 3 | 5 | 7;
  points: GeoGridPoint[];
  averageRankPosition: number;
  shareOfLocalVoice: number;
  topRankedPoints: number;
  midRankedPoints: number;
  lowRankedPoints: number;
  unrankedPoints: number;
  competitors: Array<{ name: string; sharePercent: number; avgRank: number }>;
  generatedAt: string;
  dataSource?: "live_serp" | "not_checked" | "estimated";
  statusMessage?: string;
}

export function generateEstimatedGeoGrid(
  businessName: string,
  keyword: string,
  _city = "Local Market",
  _rating: number | null = null,
  _reviewCount: number | null = null
): GeoGridResult {
  return {
    businessName,
    keyword: keyword || "Local Service",
    centerLat: 0,
    centerLng: 0,
    radiusMiles: 5,
    gridSize: 3,
    points: [],
    averageRankPosition: 0,
    shareOfLocalVoice: 0,
    topRankedPoints: 0,
    midRankedPoints: 0,
    lowRankedPoints: 0,
    unrankedPoints: 0,
    competitors: [],
    generatedAt: new Date().toISOString(),
    dataSource: "not_checked",
    statusMessage: "Connect and implement a supported live local SERP provider to measure rankings at real coordinates. Reviews and distance are not used to invent ranks.",
  };
}

interface GeoGridHeatmapProps {
  data: GeoGridResult;
  onRefresh?: () => void;
}

export function GeoGridHeatmap({ data, onRefresh }: GeoGridHeatmapProps) {
  if (data.dataSource === "not_checked" || data.points.length === 0) {
    return <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-slate-300"><h3 className="text-lg font-bold text-white">Local rank grid not checked</h3><p className="mt-2 text-sm text-slate-400">{data.statusMessage || "Connect a live local SERP provider to measure rankings at real coordinates."}</p></article>;
  }
  const [selectedPoint, setSelectedPoint] = useState<GeoGridPoint | null>(null);

  const getRankBadge = (rank: number) => {
    if (rank <= 3) {
      return {
        bg: "bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/30",
        label: `#${rank}`,
        desc: "Top 3 (Local Pack Dominance)",
      };
    }
    if (rank <= 10) {
      return {
        bg: "bg-amber-500 hover:bg-amber-400 text-white shadow-amber-500/30",
        label: `#${rank}`,
        desc: "Rank 4-10 (First Page Competitor)",
      };
    }
    if (rank <= 20) {
      return {
        bg: "bg-orange-500 hover:bg-orange-400 text-white shadow-orange-500/30",
        label: `#${rank}`,
        desc: "Rank 11-20 (Low Visibility)",
      };
    }
    return {
      bg: "bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/30",
      label: "20+",
      desc: "Not Ranked in Top 20",
    };
  };

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 uppercase tracking-wider border border-indigo-500/30">
              📍 Geo-Grid Heatmap (LocalFalcon Style)
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 uppercase tracking-wider border border-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live provider data
            </div>          </div>
          <h3 className="text-xl font-bold text-white">
            Google Maps Rank Distribution for <span className="text-indigo-400">"{data.keyword}"</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {data.gridSize}x{data.gridSize} Grid ({data.points.length} scan points) within a {data.radiusMiles}-mile radius of {data.businessName}
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="self-start sm:self-auto rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition flex items-center gap-1.5"
          >
            🔄 Re-scan Grid
          </button>
        )}
      </div>

      {/* High-Level Score Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Rank (ARP)</span>
          <div className="mt-1 text-2xl font-black text-white tabular-nums">#{data.averageRankPosition}</div>
          <span className="text-[10px] text-slate-500">Average Position</span>
        </div>

        <div className="rounded-xl border border-indigo-900/50 bg-indigo-950/30 p-3.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Share of Voice (SoLV)</span>
          <div className="mt-1 text-2xl font-black text-indigo-300 tabular-nums">{data.shareOfLocalVoice}%</div>
          <span className="text-[10px] text-indigo-400/80">In Top 3 Pack</span>
        </div>

        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-3.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Top 3 Nodes</span>
          <div className="mt-1 text-2xl font-black text-emerald-400 tabular-nums">
            {data.topRankedPoints} <span className="text-xs font-normal text-emerald-500">/ {data.points.length}</span>
          </div>
          <span className="text-[10px] text-emerald-500/80">Winning Locations</span>
        </div>

        <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-3.5 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-300">Unranked Nodes</span>
          <div className="mt-1 text-2xl font-black text-rose-400 tabular-nums">
            {data.unrankedPoints} <span className="text-xs font-normal text-rose-500">/ {data.points.length}</span>
          </div>
          <span className="text-[10px] text-rose-500/80">Rank 20+ Gaps</span>
        </div>
      </div>

      {/* Grid Canvas and Node Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* The Visual Grid Matrix */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-6 flex flex-col items-center justify-center relative overflow-hidden">
          {/* Subtle Grid Map Background Graphic */}
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]" />
          
          <div
            className="grid gap-3 sm:gap-4 relative z-10"
            style={{
              gridTemplateColumns: `repeat(${data.gridSize}, minmax(0, 1fr))`,
            }}
          >
            {data.points.map((pt) => {
              const meta = getRankBadge(pt.rank);
              const isSelected = selectedPoint?.id === pt.id;
              const isCenter = pt.row === Math.floor(data.gridSize / 2) && pt.col === Math.floor(data.gridSize / 2);

              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setSelectedPoint(pt)}
                  className={`relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl font-black text-xs sm:text-sm shadow-md transition-all transform hover:scale-110 cursor-pointer ${meta.bg} ${
                    isSelected ? "ring-4 ring-white scale-110 z-20" : ""
                  }`}
                  title={`Rank: ${pt.rank <= 20 ? `#${pt.rank}` : "20+"} | Distance: ${pt.distanceMiles}mi`}
                >
                  {meta.label}
                  {isCenter && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[8px] text-white border border-white font-black" title="Business Center">
                      📍
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[11px] font-semibold text-slate-300">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500" />
              <span>Rank 1–3</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-500" />
              <span>Rank 4–10</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-orange-500" />
              <span>Rank 11–20</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-500" />
              <span>20+ (No Pack)</span>
            </div>
          </div>
        </div>

        {/* Selected Node Details or Competitor Share Box */}
        <div className="space-y-4">
          {selectedPoint ? (
            <div className="rounded-xl border border-indigo-900/50 bg-slate-950/80 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Node Inspector</span>
                <button
                  type="button"
                  onClick={() => setSelectedPoint(null)}
                  className="text-xs text-slate-500 hover:text-white"
                >
                  ✕ Close
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl font-black text-base ${getRankBadge(selectedPoint.rank).bg}`}>
                  {selectedPoint.rank <= 20 ? `#${selectedPoint.rank}` : "20+"}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">
                    {selectedPoint.rank <= 3 ? "Dominant Local Pack" : selectedPoint.rank <= 10 ? "Page 1 Competitor" : "Visibility Gap"}
                  </h4>
                  <p className="text-xs text-slate-400">{selectedPoint.addressLabel}</p>
                </div>
              </div>

              <div className="text-xs space-y-2 pt-2 border-t border-slate-900">
                <div className="flex justify-between">
                  <span className="text-slate-400">Coordinates:</span>
                  <span className="font-mono text-slate-300">{selectedPoint.lat}, {selectedPoint.lng}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Distance from Shop:</span>
                  <span className="text-slate-200 font-semibold">{selectedPoint.distanceMiles} miles</span>
                </div>
                {selectedPoint.topCompetitor && (
                  <div className="pt-1">
                    <span className="text-rose-300 block text-[11px] font-semibold">#1 Ranking Competitor at this coordinate:</span>
                    <span className="text-slate-200 font-bold">{selectedPoint.topCompetitor}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Local Competitors Dominating Grid</h4>
              <div className="space-y-2.5">
                {data.competitors.map((comp, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-200">{comp.name}</p>
                      <p className="text-[10px] text-slate-400">Avg Rank: #{comp.avgRank}</p>
                    </div>
                    <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                      {comp.sharePercent}% Share
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 pt-1">
                💡 Click any pin on the grid to inspect the ranking position and distance at that specific coordinate.
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
