import React from 'react';

export function ScoreBadge({
  score,
  label,
  type,
}: {
  score?: number | null;
  label?: string;
  type?: 'website' | 'gmb' | 'eeat';
}) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return (
      <span
        className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400 select-none"
        title="No audit performed yet. Run audit to generate score."
      >
        Not Audited
      </span>
    );
  }

  const num = Number(score);
  let color = 'bg-rose-50 text-rose-700 border-rose-200/80';
  let tier = 'Critical';

  if (num >= 80) {
    color = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
    tier = 'Strong';
  } else if (num >= 60) {
    color = 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
    tier = 'Good';
  } else if (num >= 45) {
    color = 'bg-amber-50 text-amber-800 border-amber-200/80';
    tier = 'Needs Work';
  }

  return (
    <span
      className={['inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums', color].join(' ')}
      title={(label || (type === 'gmb' ? 'Google Business Profile' : 'Website SEO')) + ' Score: ' + num + '/100 (' + tier + ')'}
    >
      <span className="font-bold">{num}</span>
      <span className="text-[10px] opacity-70">/100</span>
    </span>
  );
}
