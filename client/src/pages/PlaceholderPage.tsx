type Props = {
  title: string;
};

export function PlaceholderPage({ title }: Props) {
  return (
    <section className="page-enter rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-[12px] uppercase tracking-[0.08em] text-slate-500">Module Pending</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-800">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-[13px] text-slate-600">
        This module shell is ready in SMBify OS navigation and will be implemented after Lead Management completion.
      </p>
    </section>
  );
}
