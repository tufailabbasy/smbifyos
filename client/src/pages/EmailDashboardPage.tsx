import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { apiFetch } from "../lib/api";

interface EmailStats {
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalSuppressed: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

interface EmailCampaign {
  id: string;
  name: string;
  status: string;
  sent: number;
  opens: number;
  clicks: number;
  bounced: number;
  niche?: string;
  created_at?: string;
}

interface SenderAccount {
  id: string;
  from_email: string;
  sent_today: number;
  is_active: boolean;
  daily_limit?: number;
}

interface RecentActivity {
  id: string;
  business_name?: string;
  recipient_email: string;
  subject: string;
  sent_at: string;
  open_count: number;
  click_count: number;
  status?: string;
}

interface DashboardData {
  stats: EmailStats;
  campaigns: EmailCampaign[];
  recentActivity: RecentActivity[];
  senders: SenderAccount[];
}

const emptyStats: EmailStats = {
  totalSent: 0,
  totalOpened: 0,
  totalClicked: 0,
  totalBounced: 0,
  totalSuppressed: 0,
  openRate: 0,
  clickRate: 0,
  bounceRate: 0,
};

/* ── Status Pill ── */
const STATUS_PILL: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border border-slate-200",
  sending: "bg-amber-100 text-amber-700 border border-amber-200",
  complete: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  paused: "bg-orange-100 text-orange-700 border border-orange-200",
  failed: "bg-red-100 text-red-700 border border-red-200",
  queued: "bg-sky-100 text-sky-700 border border-sky-200",
};

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_PILL[status?.toLowerCase()] ?? "bg-slate-100 text-slate-600 border border-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {status || "unknown"}
    </span>
  );
}

/* ── Skeleton ── */
function SkeletonLine({ w = "w-24", h = "h-4" }: { w?: string; h?: string }) {
  return (
    <span
      className={`inline-block ${h} ${w} animate-pulse rounded bg-slate-200`}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonLine w="w-8" h="h-8" />
        <SkeletonLine w="w-16" h="h-3" />
      </div>
      <SkeletonLine w="w-20" h="h-8" />
      <SkeletonLine w="w-32" h="h-3" />
    </div>
  );
}

/* ── Stat Card ── */
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description: string;
  accent: string;      // e.g. "indigo"
  loading: boolean;
  trend?: number;       // optional %, positive = up
}

const ACCENT_MAP: Record<string, { bg: string; text: string; iconBg: string; border: string; shadow: string }> = {
  indigo:  { bg: "bg-indigo-50",  text: "text-indigo-600",  iconBg: "bg-indigo-100",  border: "border-indigo-200",  shadow: "shadow-indigo-100" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", iconBg: "bg-emerald-100", border: "border-emerald-200", shadow: "shadow-emerald-100" },
  sky:     { bg: "bg-sky-50",     text: "text-sky-600",     iconBg: "bg-sky-100",     border: "border-sky-200",     shadow: "shadow-sky-100" },
  red:     { bg: "bg-red-50",     text: "text-red-600",     iconBg: "bg-red-100",     border: "border-red-200",     shadow: "shadow-red-100" },
  orange:  { bg: "bg-orange-50",  text: "text-orange-600",  iconBg: "bg-orange-100",  border: "border-orange-200",  shadow: "shadow-orange-100" },
  purple:  { bg: "bg-purple-50",  text: "text-purple-600",  iconBg: "bg-purple-100",  border: "border-purple-200",  shadow: "shadow-purple-100" },
};

function StatCard({ icon, label, value, description, accent, loading, trend }: StatCardProps) {
  const a = ACCENT_MAP[accent] ?? ACCENT_MAP.indigo;
  return (
    <article
      className={`group relative overflow-hidden rounded-xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${a.border} ${a.shadow}`}
    >
      {/* Decorative circle */}
      <div className={`absolute -right-5 -top-5 h-20 w-20 rounded-full ${a.bg} opacity-60`} />
      <div className="relative z-10 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.iconBg} ${a.text}`}>
          {icon}
        </div>
        {trend !== undefined && !loading && (
          <span className={`text-[11px] font-semibold ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="relative z-10 mt-3">
        {loading ? (
          <SkeletonLine w="w-24" h="h-8" />
        ) : (
          <p className={`text-3xl font-bold tabular-nums ${a.text}`}>{value}</p>
        )}
        <p className="mt-0.5 text-[12px] font-semibold text-slate-700">{label}</p>
        <p className="mt-1 text-[11px] text-slate-400 leading-tight">{description}</p>
      </div>
    </article>
  );
}

/* ── Main Page ── */
export function EmailDashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [data, setData] = useState<DashboardData>({
    stats: emptyStats,
    campaigns: [],
    recentActivity: [],
    senders: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadDashboard(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch("/api/email/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DashboardData = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      if (!silent) {
        showToast("error", err instanceof Error ? err.message : "Failed to load email dashboard");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    intervalRef.current = setInterval(() => void loadDashboard(true), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { stats, campaigns, recentActivity, senders } = data;

  const statCards: StatCardProps[] = [
    {
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <polyline points="22,7 12,13 2,7"/>
        </svg>
      ),
      label: "Total Sent",
      value: stats.totalSent.toLocaleString(),
      description: "Emails dispatched across all campaigns",
      accent: "indigo",
      loading,
    },
    {
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      ),
      label: "Open Rate",
      value: `${Number(stats.openRate).toFixed(1)}%`,
      description: `${stats.totalOpened.toLocaleString()} unique opens recorded`,
      accent: "emerald",
      loading,
    },
    {
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 15l5 5"/>
          <path d="M4 4l4 4"/>
          <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
          <circle cx="12" cy="12" r="5"/>
        </svg>
      ),
      label: "Click Rate",
      value: `${Number(stats.clickRate).toFixed(1)}%`,
      description: `${stats.totalClicked.toLocaleString()} link clicks tracked`,
      accent: "sky",
      loading,
    },
    {
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      label: "Bounce Rate",
      value: `${Number(stats.bounceRate).toFixed(1)}%`,
      description: `${stats.totalBounced.toLocaleString()} bounced deliveries`,
      accent: "red",
      loading,
    },
    {
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
      ),
      label: "Suppressed",
      value: stats.totalSuppressed.toLocaleString(),
      description: "Addresses on suppression list",
      accent: "orange",
      loading,
    },
    {
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M20 21a8 8 0 1 0-16 0"/>
        </svg>
      ),
      label: "Active Senders",
      value: senders.filter((s) => s.is_active).length,
      description: "Sender accounts ready to send",
      accent: "purple",
      loading,
    },
  ];

  function fmtTime(s: string) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? "-" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <section className="page-enter space-y-6">
      {/* ── Header ── */}
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Email Marketing &amp; Outreach</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Track campaigns, opens, clicks, delivery metrics, and active sender mailbox capacity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastRefresh && (
              <span className="text-[11px] text-slate-400">
                Updated {lastRefresh.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate("/email/campaigns")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5e6ad2] px-4 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-[#4f5abf] transition"
            >
              + New Campaign
            </button>
          </div>
        </div>
      </header>

      {/* ── Stat Cards Grid ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      {/* ── Sender Account Health ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-slate-800">Sender Account Health</h3>
          <button
            type="button"
            onClick={() => navigate("/email/senders")}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Manage Senders &rarr;
          </button>
        </div>
        {loading ? (
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 animate-pulse rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="h-3 w-32 bg-slate-200 rounded mb-2" />
                <div className="h-2 w-20 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : senders.length === 0 ? (
          <p className="text-[13px] text-slate-400 py-4 text-center">No sender accounts configured yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {senders.map((sender) => (
              <div
                key={sender.id}
                className="flex min-w-[200px] flex-1 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-slate-200"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${sender.is_active ? "bg-emerald-400 shadow-sm shadow-emerald-300 animate-pulse" : "bg-slate-300"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-slate-800">{sender.from_email}</p>
                  <p className="text-[11px] text-slate-400">
                    Sent today:{" "}
                    <span className="font-semibold text-slate-600">{sender.sent_today}</span>
                    {sender.daily_limit && (
                      <span className="text-slate-400"> / {sender.daily_limit}</span>
                    )}
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${sender.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {sender.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Campaigns Table ── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-[14px] font-bold text-slate-800">Campaigns</h3>
          <button
            type="button"
            onClick={() => navigate("/email/campaigns")}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
          >
            View All &rarr;
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-5 pr-3 text-left">Name</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right">Sent</th>
                <th className="px-3 py-3 text-right">Opens</th>
                <th className="px-3 py-3 text-right">Clicks</th>
                <th className="px-3 py-3 text-right">Bounced</th>
                <th className="py-3 pl-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-3 py-3.5">
                        <div className="h-3 rounded bg-slate-100 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-1">
                        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                      </div>
                      <p className="text-[13px] font-medium text-slate-500">No campaigns yet</p>
                      <button
                        type="button"
                        onClick={() => navigate("/email/campaigns")}
                        className="mt-1 text-[12px] font-semibold text-indigo-600 hover:underline"
                      >
                        Create your first campaign &rarr;
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                campaigns.slice(0, 10).map((c) => {
                  const openPct = c.sent > 0 ? ((c.opens / c.sent) * 100).toFixed(1) : "0.0";
                  const clickPct = c.sent > 0 ? ((c.clicks / c.sent) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={c.id} className="group transition-colors hover:bg-slate-50/70">
                      <td className="py-3.5 pl-5 pr-3">
                        <p className="text-[13px] font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-1">
                          {c.name}
                        </p>
                        {c.niche && (
                          <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            {c.niche}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="px-3 py-3.5 text-right text-[13px] font-semibold tabular-nums text-slate-700">
                        {(c.sent ?? 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <span className="text-[13px] font-semibold tabular-nums text-emerald-600">{(c.opens ?? 0).toLocaleString()}</span>
                        <span className="ml-1 text-[11px] text-slate-400">({openPct}%)</span>
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <span className="text-[13px] font-semibold tabular-nums text-sky-600">{(c.clicks ?? 0).toLocaleString()}</span>
                        <span className="ml-1 text-[11px] text-slate-400">({clickPct}%)</span>
                      </td>
                      <td className="px-3 py-3.5 text-right text-[13px] font-semibold tabular-nums text-red-500">
                        {(c.bounced ?? 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/email/campaigns?view=${c.id}`)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recent Activity Feed ── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[14px] font-bold text-slate-800">Recent Activity</h3>
            <p className="text-[11px] text-slate-400">Last 20 email events</p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Opens
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Clicks
            </span>
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-5 py-3.5">
                <div className="h-8 w-8 rounded-full bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                  <div className="h-2.5 w-64 bg-slate-100 rounded" />
                </div>
                <div className="h-3 w-16 bg-slate-100 rounded" />
              </div>
            ))
          ) : recentActivity.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-2">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>
              <p className="mt-2 text-[13px] text-slate-400">No email activity yet.</p>
            </div>
          ) : (
            recentActivity.slice(0, 20).map((item) => {
              const initials = (item.business_name || item.recipient_email || "?")
                .split(" ")
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("");
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/60"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-600">
                    {initials}
                  </div>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-slate-800">
                      {item.business_name || item.recipient_email}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      <span className="text-slate-500">{item.recipient_email}</span>
                      {" · "}
                      <span className="italic text-slate-400">{item.subject}</span>
                    </p>
                  </div>
                  {/* Badges */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.open_count > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Opens: {item.open_count}
                      </span>
                    )}
                    {item.click_count > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> Clicks: {item.click_count}
                      </span>
                    )}
                  </div>
                  {/* Time */}
                  <p className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">
                    {fmtTime(item.sent_at)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
