export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
        <svg className="h-8 w-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-sm text-[13px] text-slate-500">
        This feature is currently under development and will be available soon.
      </p>
      <span className="mt-4 inline-block rounded border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-500">
        Coming Soon
      </span>
    </div>
  );
}
