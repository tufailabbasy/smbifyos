import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchDashboardSummary, type DashboardSummary } from "../lib/api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { IconAlertTriangle, IconArrowRight, IconCheckCircle, IconClock, IconGlobe, IconMail, IconPlay, IconRefresh, IconSearch, IconShield, IconUsers } from "../components/ui/Icons";

const emptySummary: DashboardSummary = {
  totalLeads: 0, totalCampaigns: 0, activeCampaigns: 0, totalClients: 0, activeBusinesses: 0,
  auditsThisMonth: 0, tasksDueToday: 0, leadsThisWeek: 0, leadsTrendPercent: 0, auditsThisWeek: 0,
  leadsBySource: [], leadsByStatus: [], leadsGrowthTrend: [], attentionCategories: [], needsAttention: [], activityFeed: [],
  earningsByCurrency: [], recentFinanceEntries: [], period: { range: "month", startDate: "", endDate: "", label: "", month: "", year: "" },
};

const chartColors = ["#5e6ad2", "#14b8a6", "#f59e0b", "#0ea5e9", "#8b5cf6", "#f43f5e"];

function relativeTime(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Recently";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MetricCard({ label, value, supporting, icon, tone = "indigo", loading = false }: { label: string; value: number; supporting: React.ReactNode; icon: React.ReactNode; tone?: "indigo" | "emerald" | "amber" | "violet"; loading?: boolean }) {
  const tones = { indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100", emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100", amber: "bg-amber-50 text-amber-600 ring-amber-100", violet: "bg-violet-50 text-violet-600 ring-violet-100" };
  return <Card className="group relative overflow-hidden p-5 hover:-translate-y-0.5 hover:shadow-[0_12px_35px_rgba(15,23,42,.08)]">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent opacity-0 transition group-hover:opacity-100" />
    <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[.11em] text-slate-500">{label}</p>{loading ? <div className="mt-3 h-9 w-24 animate-pulse rounded-lg bg-slate-100" /> : <p className="mt-2 text-[30px] font-bold tracking-[-.04em] text-slate-950 tabular-nums">{value.toLocaleString()}</p>}</div><div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>{icon}</div></div>
    <div className="mt-3 min-h-[20px] text-xs text-slate-500">{supporting}</div>
  </Card>;
}

const quickActions = [
  { title: "Find local leads", description: "Import or collect qualified businesses", to: "/lead-engine", icon: <IconSearch size={18} />, tone: "bg-indigo-50 text-indigo-600" },
  { title: "Run website audit", description: "Scan technical, content and conversion signals", to: "/audit-tools/website", icon: <IconGlobe size={18} />, tone: "bg-sky-50 text-sky-600" },
  { title: "Check local presence", description: "Review GBP and local search evidence", to: "/audit-tools/gmb", icon: <IconShield size={18} />, tone: "bg-emerald-50 text-emerald-600" },
  { title: "Build a campaign", description: "Turn verified findings into outreach", to: "/email/campaigns", icon: <IconMail size={18} />, tone: "bg-violet-50 text-violet-600" },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError("");
    try { setSummary(await fetchDashboardSummary()); setLastUpdated(new Date()); }
    catch (err) { if (!silent) setError(err instanceof Error ? err.message : "Dashboard metrics could not be loaded."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    void loadData();
    intervalRef.current = setInterval(() => void loadData(true), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  const growth = summary.leadsGrowthTrend || [];
  const pipeline = (summary.leadsByStatus || []).filter((item) => item.value > 0);
  const sources = (summary.leadsBySource || []).filter((item) => item.value > 0);
  const attention = summary.attentionCategories || [];
  const activities = summary.activityFeed || [];

  return <section className="page-enter space-y-6">
    <PageHeader title="Overview" description="Your lead, audit, outreach and client work in one place." actions={<div className="flex items-center gap-2">
      {lastUpdated && <span className="hidden text-[11px] text-slate-400 lg:inline">Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
      <Button onClick={() => void loadData(true)} loading={refreshing} variant="outline" size="sm" icon={<IconRefresh size={14} />}>Refresh</Button>
      <Button onClick={() => navigate("/lead-engine")} size="sm" icon={<IconSearch size={14} />}>Find leads</Button>
    </div>} />

    {error && <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><IconAlertTriangle size={18} className="shrink-0" /><span>{error}</span><button type="button" onClick={() => void loadData()} className="ml-auto text-xs font-semibold underline underline-offset-2">Try again</button></div>}

    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-5 py-6 text-white shadow-[0_18px_45px_rgba(15,23,42,.18)] sm:px-7">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-indigo-500/25 blur-3xl" /><div className="absolute bottom-0 right-1/3 h-28 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl"><div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.12)]" /><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Growth command center</span></div><h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Move from local prospect to evidence-backed pitch.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Collect businesses, verify SEO gaps, and prepare relevant outreach from one connected workflow.</p></div>
        <div className="flex shrink-0 flex-wrap gap-2"><Link to="/audit-tools/hub" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/15"><IconShield size={15} />Open audit hub</Link><Link to="/email/campaigns" className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-950 shadow hover:bg-slate-100"><IconMail size={15} />Create outreach</Link></div>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Saved leads" value={summary.totalLeads} loading={loading} icon={<IconSearch size={19} />} supporting={<span><strong className="font-semibold text-slate-700">{summary.leadsThisWeek || 0}</strong> added this week</span>} />
      <MetricCard label="Campaigns" value={summary.totalCampaigns} loading={loading} icon={<IconMail size={19} />} tone="emerald" supporting={<span><strong className="font-semibold text-slate-700">{summary.activeCampaigns}</strong> currently active</span>} />
      <MetricCard label="Audits this month" value={summary.auditsThisMonth} loading={loading} icon={<IconShield size={19} />} tone="amber" supporting={<span><strong className="font-semibold text-slate-700">{summary.auditsThisWeek || 0}</strong> completed this week</span>} />
      <MetricCard label="Active clients" value={summary.totalClients} loading={loading} icon={<IconUsers size={19} />} tone="violet" supporting={<span><strong className="font-semibold text-slate-700">{summary.tasksDueToday}</strong> tasks due today</span>} />
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.8fr)]">
      <Card><CardHeader title="Lead growth" subtitle="Prospects added over the reported period" action={<Link to="/leads" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">View leads</Link>} /><CardBody>
        {loading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : growth.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><AreaChart data={growth} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}><defs><linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5e6ad2" stopOpacity={.28}/><stop offset="1" stopColor="#5e6ad2" stopOpacity={0}/></linearGradient></defs><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} /><Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 12px 30px rgba(15,23,42,.1)", fontSize: 12 }} /><Area type="monotone" dataKey="count" name="Leads" stroke="#5e6ad2" strokeWidth={2.5} fill="url(#growthFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyState className="min-h-64 border-0 bg-slate-50/70 p-8" icon={<IconSearch size={20} />} title="No lead trend yet" description="Add your first prospects to start tracking lead growth over time." actionLabel="Find leads" onAction={() => navigate("/lead-engine")} />}
      </CardBody></Card>

      <Card><CardHeader title="Pipeline" subtitle="Leads by current stage" /><CardBody>
        {loading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : pipeline.length ? <><div className="h-44"><ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}><PieChart><Pie data={pipeline} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={3}>{pipeline.map((item, index) => <Cell key={item.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }} /></PieChart></ResponsiveContainer></div><div className="space-y-2">{pipeline.map((item, index) => <div key={item.name} className="flex items-center justify-between text-xs"><span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="truncate">{item.name}</span></span><strong className="font-semibold text-slate-900 tabular-nums">{item.value.toLocaleString()}</strong></div>)}</div></> : <EmptyState className="min-h-64 border-0 bg-slate-50/70 p-8" icon={<IconPlay size={20} />} title="Pipeline is empty" description="Lead stages will appear here as your team qualifies and contacts prospects." />}
      </CardBody></Card>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader title="Needs attention" subtitle="Verified items that need a decision" action={attention.length ? <Badge variant="warning" size="sm">{attention.length} groups</Badge> : undefined} /><CardBody className="p-0">
        {loading ? <div className="space-y-3 p-5">{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div> : attention.length ? <div className="divide-y divide-slate-100">{attention.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.actionLink)} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50"><div className={`mt-0.5 flex h-8 min-w-8 items-center justify-center rounded-lg text-xs font-bold ${item.urgency === "critical" ? "bg-rose-50 text-rose-700" : item.urgency === "warning" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}`}>{item.count}</div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-900">{item.title}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{item.description}</p></div><IconArrowRight size={15} className="mt-2 shrink-0 text-slate-400" /></button>)}</div> : <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><IconCheckCircle size={21} /></div><p className="mt-3 text-sm font-semibold text-slate-900">You are caught up</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">No verified alerts or overdue work needs attention right now.</p></div>}
      </CardBody></Card>

      <Card><CardHeader title="Recent activity" subtitle="Latest changes across your workspace" /><CardBody className="p-0">
        {loading ? <div className="space-y-3 p-5">{[1,2,3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div> : activities.length ? <div className="divide-y divide-slate-100">{activities.slice(0, 6).map((item) => <Link key={item.id} to={item.link} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{item.type === "audit" ? <IconShield size={15} /> : item.type === "lead" ? <IconSearch size={15} /> : item.type === "campaign" ? <IconMail size={15} /> : <IconPlay size={15} />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-900">{item.title}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{item.description}</p></div><span className="shrink-0 text-[10px] text-slate-400">{relativeTime(item.timestamp)}</span></Link>)}</div> : <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><IconClock size={21} /></div><p className="mt-3 text-sm font-semibold text-slate-900">No activity yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Your latest lead, audit and campaign updates will appear here.</p></div>}
      </CardBody></Card>
    </div>

    <div><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Start a workflow</h2><p className="mt-0.5 text-xs text-slate-500">Jump directly into your most common tasks.</p></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickActions.map((action) => <Link key={action.to} to={action.to} className="group flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_10px_30px_rgba(15,23,42,.08)]"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.tone}`}>{action.icon}</div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-900">{action.title}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{action.description}</p></div><IconArrowRight size={15} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" /></Link>)}</div></div>

    {sources.length > 0 && <Card><CardHeader title="Acquisition sources" subtitle="Where saved prospects came from" /><CardBody><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sources.map((source, index) => <div key={source.name} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-600">{source.name}</span><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /></div><p className="mt-2 text-xl font-bold text-slate-900 tabular-nums">{source.value.toLocaleString()}</p></div>)}</div></CardBody></Card>}
  </section>;
}