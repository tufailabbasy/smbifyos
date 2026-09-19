import React from "react";

interface ScoreGaugeProps {
  score: number | null;
  grade?: string;
  gradeLabel?: string;
  size?: "sm" | "md" | "lg";
  showDelta?: boolean;
  scoreDelta?: number;
  subtitle?: string;
}

export function calculateGrade(score: number | null): {
  grade: string;
  label: string;
  color: string;
  gradientStart: string;
  gradientEnd: string;
  bgLight: string;
  borderLight: string;
} {
  if (score === null || score === undefined) {
    return {
      grade: "--",
      label: "Unscored",
      color: "#94a3b8",
      gradientStart: "#94a3b8",
      gradientEnd: "#64748b",
      bgLight: "bg-slate-50",
      borderLight: "border-slate-200",
    };
  }

  if (score >= 90) {
    return {
      grade: "A+",
      label: "Exceptional",
      color: "#10b981",
      gradientStart: "#34d399",
      gradientEnd: "#059669",
      bgLight: "bg-emerald-50 text-emerald-800",
      borderLight: "border-emerald-200",
    };
  }

  if (score >= 80) {
    return {
      grade: "A",
      label: "Healthy",
      color: "#22c55e",
      gradientStart: "#4ade80",
      gradientEnd: "#16a34a",
      bgLight: "bg-emerald-50 text-emerald-800",
      borderLight: "border-emerald-200",
    };
  }

  if (score >= 70) {
    return {
      grade: "B",
      label: "Moderate Gaps",
      color: "#06b6d4",
      gradientStart: "#38bdf8",
      gradientEnd: "#0284c7",
      bgLight: "bg-cyan-50 text-cyan-800",
      borderLight: "border-cyan-200",
    };
  }

  if (score >= 55) {
    return {
      grade: "C",
      label: "Needs Optimization",
      color: "#f59e0b",
      gradientStart: "#fbbf24",
      gradientEnd: "#d97706",
      bgLight: "bg-amber-50 text-amber-800",
      borderLight: "border-amber-200",
    };
  }

  if (score >= 40) {
    return {
      grade: "D",
      label: "Significant Risk",
      color: "#f97316",
      gradientStart: "#fb923c",
      gradientEnd: "#ea580c",
      bgLight: "bg-orange-50 text-orange-800",
      borderLight: "border-orange-200",
    };
  }

  return {
    grade: "F",
    label: "Critical Attention",
    color: "#ef4444",
    gradientStart: "#f87171",
    gradientEnd: "#dc2626",
    bgLight: "bg-rose-50 text-rose-800",
    borderLight: "border-rose-200",
  };
}

export function ScoreGauge({
  score,
  grade: customGrade,
  gradeLabel: customLabel,
  size = "md",
  showDelta = false,
  scoreDelta = 0,
  subtitle,
}: ScoreGaugeProps) {
  const meta = calculateGrade(score);
  const grade = customGrade || meta.grade;
  const label = customLabel || meta.label;
  const safeScore = score != null ? Math.max(0, Math.min(100, Math.round(score))) : 0;

  const dim = size === "lg" ? 140 : size === "sm" ? 72 : 104;
  const strokeWidth = size === "lg" ? 10 : size === "sm" ? 6 : 8;
  const radius = (dim - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeScore / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      {/* Radial Gauge */}
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: dim, height: dim }}>
        <svg className="h-full w-full -rotate-90 transform" viewBox={`0 0 ${dim} ${dim}`}>
          {/* Background track */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Active progress */}
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke={meta.color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className="font-black leading-none tracking-tight"
            style={{
              fontSize: size === "lg" ? "2.25rem" : size === "sm" ? "1.1rem" : "1.6rem",
              color: meta.color,
            }}
          >
            {grade}
          </span>
          <span
            className="font-bold text-slate-400 leading-none mt-0.5"
            style={{ fontSize: size === "lg" ? "0.75rem" : size === "sm" ? "0.55rem" : "0.65rem" }}
          >
            {score != null ? `${safeScore}/100` : "--"}
          </span>
        </div>
      </div>

      {/* Label and Info */}
      <div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px] border ${meta.bgLight} ${meta.borderLight}`}
          >
            {label}
          </span>
          {showDelta && scoreDelta !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                scoreDelta > 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-rose-100 text-rose-700"
              }`}
            >
              {scoreDelta > 0 ? "↑ +" : "↓ "}
              {scoreDelta} pts
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {subtitle || "Overall Search & Authority Health Rating"}
        </p>
      </div>
    </div>
  );
}
