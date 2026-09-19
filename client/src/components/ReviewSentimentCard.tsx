import React from "react";

export interface ReviewSentimentTheme {
  topic: string;
  sentiment: "positive" | "negative" | "neutral";
  mentionsCount: number;
  sampleQuote: string;
}

export interface ReviewSentimentReport {
  businessName: string;
  totalReviewsAnalyzed: number;
  averageRating: number | null;
  sentimentScore: number | null;
  positivePercentage: number;
  neutralPercentage: number;
  negativePercentage: number;
  topPraiseThemes: ReviewSentimentTheme[];
  criticalConcerns: ReviewSentimentTheme[];
  executiveTakeaway: string;
  recommendedReviewStrategy: string;
  generatedAt: string;
}

interface ReviewSentimentCardProps {
  data: ReviewSentimentReport;
}

export function ReviewSentimentCard({ data }: ReviewSentimentCardProps) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 md:p-8 backdrop-blur-md shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 uppercase tracking-wider mb-1.5 border border-indigo-500/30">
            AI Customer Review Sentiment
          </div>
          <h3 className="text-xl font-bold text-white">
            What Customers Are Saying About {data.businessName}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {data.totalReviewsAnalyzed > 0 ? `Sentiment calculated from ${data.totalReviewsAnalyzed} supplied review texts` : "Review text has not been supplied; sentiment is not calculated"}
          </p>
        </div>

        {/* Sentiment Score Badge */}
        <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Sentiment Index</span>
            <span className="text-xs text-emerald-400 font-semibold">{data.positivePercentage}% Positive</span>
          </div>
          <div className="text-2xl font-black text-white tabular-nums px-2.5 py-1 rounded-lg bg-emerald-600/30 border border-emerald-500/40">
            {data.sentimentScore == null ? "N/A" : `${data.sentimentScore}%`}
          </div>
        </div>
      </div>

      {/* Sentiment Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-semibold">
          <span className="text-emerald-400">{data.positivePercentage}% Positive Praise</span>
          <span className="text-amber-400">{data.neutralPercentage}% Neutral</span>
          <span className="text-rose-400">{data.negativePercentage}% Customer Concerns</span>
        </div>
        <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500" style={{ width: `${data.positivePercentage}%` }} />
          <div className="h-full bg-amber-500" style={{ width: `${data.neutralPercentage}%` }} />
          <div className="h-full bg-rose-500" style={{ width: `${data.negativePercentage}%` }} />
        </div>
      </div>

      {/* Executive Takeaway */}
      <div className="rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-4 text-xs space-y-1">
        <strong className="text-indigo-300 font-semibold uppercase tracking-wider text-[10px] block">Customer Feedback Analysis</strong>
        <p className="text-slate-200 leading-relaxed">{data.executiveTakeaway}</p>
      </div>

      {/* Themes Breakdown (Praise vs Concerns) */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Positive Praise Themes */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <span>💚</span> Top Customer Praise Themes
          </h4>
          <div className="space-y-2.5">
            {data.topPraiseThemes.map((theme, i) => (
              <div key={i} className="rounded-xl border border-emerald-950/40 bg-emerald-950/10 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">{theme.topic}</span>
                  <span className="text-[10px] text-emerald-400 font-semibold">{theme.mentionsCount} mentions</span>
                </div>
                <p className="text-[11px] text-slate-400 italic leading-relaxed">{theme.sampleQuote}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Critical Concerns & Risk Factors */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
            <span>🚩</span> Customer Friction Points &amp; Risks
          </h4>
          <div className="space-y-2.5">
            {data.criticalConcerns.map((theme, i) => (
              <div key={i} className="rounded-xl border border-rose-950/40 bg-rose-950/10 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">{theme.topic}</span>
                  <span className="text-[10px] text-rose-400 font-semibold">{theme.mentionsCount} mentions</span>
                </div>
                <p className="text-[11px] text-slate-400 italic leading-relaxed">{theme.sampleQuote}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-300 space-y-1">
            <strong className="text-indigo-400 font-semibold block text-[11px]">Recommended Strategy:</strong>
            <p className="text-[11px] text-slate-400 leading-relaxed">{data.recommendedReviewStrategy}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
