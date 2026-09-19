import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import {
  fetchWorkspaceOverview,
  type WorkspaceOverview,
  type SeoActivityEntry,
} from "../../lib/api";

const BRAND = "#5e6ad2";
const PIE_COLORS = ["#22c55e", "#6366f1", "#f59e0b", "#94a3b8"];

function ActivityRow({ a }: { a: SeoActivityEntry }) {
  const icons: Record<string, string> = {
    task_completed: "\u2705",
    task_updated: "\ud83d\udd04",
    checklist_generated: "\ud83d\udcdd",
  };
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="mt-0.5 text-sm">{icons[a.action] || "\u2022"}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-slate-700">{a.detail || a.action.replace(/_/g, " ")}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {a.client_name && <span>{a.client_name}</span>}
          {a.business_name && <span> &middot; {a.business_name}</span>}
          {a.actor_name && <span> &middot; {a.actor_name}</span>}
          <span> &middot; {new Date(a.created_at).toLocaleDateString()}</span>
        </p>
      </div>
    </div>
  );
}

export function SeoWorkspacePage() {
  const [data, setData] = useState<WorkspaceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"agency" | "client">(() => {
    return (localStorage.getItem("smbify_seo_view_mode") as "agency" | "client") || "agency";
  });

  const handleToggleView = (mode: "agency" | "client") => {
    setViewMode(mode);
    localStorage.setItem("smbify_seo_view_mode", mode);
  };

  useEffect(() => {
    fetchWorkspaceOverview()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="page-enter flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: BRAND }} />
      </section>
    );
  }

  if (!data) {
    return <section className="page-enter p-8 text-center text-slate-500">Failed to load workspace data.</section>;
  }

  // Task status breakdown for pie chart
  const totalTasks = data.clients.reduce((s, c) => s + c.total_tasks, 0);
  const totalDone = data.clients.reduce((s, c) => s + c.tasks_done, 0);
  const totalOverdue = data.tasksOverdue;
  const totalPending = Math.max(0, totalTasks - totalDone - totalOverdue);

  const taskPie = [
    { name: "Done", value: totalDone },
    { name: "In Progress", value: totalPending },
    { name: "Overdue", value: totalOverdue },
  ].filter((d) => d.value > 0);
  if (taskPie.length === 0) taskPie.push({ name: "No tasks", value: 1 });

  // Team workload bar chart
  const teamBarData = data.tasksByMember.map((m) => ({
    name: m.name.split(" ")[0],
    done: m.done,
    active: m.in_progress,
    pending: m.pending,
  }));

  const globalProgress = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 100;

  return (
    <section className="page-enter space-y-6">
      {/* Header with Switch */}
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-[#1e1b4b] to-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#818cf8]">SEO Dashboard</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">
              {viewMode === "agency" ? "Agency Operations Control" : "SEO Client Portal"}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {viewMode === "agency"
                ? "Monitor team workload, run audits, edit templates, and track client campaign statuses."
                : "View live SEO achievements, crawl health, and keyword rank optimizations for your business."}
            </p>
          </div>

          {/* Persistent View Toggle */}
          <div className="flex self-start rounded-full bg-slate-950/80 p-1 border border-slate-800 sm:self-center">
            <button
              onClick={() => handleToggleView("agency")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                viewMode === "agency"
                  ? "bg-[#5e6ad2] text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Agency View
            </button>
            <button
              onClick={() => handleToggleView("client")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
                viewMode === "client"
                  ? "bg-[#5e6ad2] text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Client View
            </button>
          </div>
        </div>
      </header>

      {viewMode === "agency" ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Clients", value: data.totalClients, bg: "from-indigo-50 to-blue-50", border: "border-indigo-100", color: "#6366f1", icon: "C" },
              { label: "Active Sites", value: data.activeBusinesses, bg: "from-emerald-50 to-teal-50", border: "border-emerald-100", color: "#22c55e", icon: "S" },
              { label: "Team Members", value: data.totalTeamMembers, bg: "from-violet-50 to-purple-50", border: "border-violet-100", color: "#8b5cf6", icon: "T" },
              { label: "Due Today", value: data.tasksDueToday, bg: data.tasksDueToday > 0 ? "from-amber-50 to-orange-50" : "from-slate-50 to-gray-50", border: data.tasksDueToday > 0 ? "border-amber-200" : "border-slate-200", color: data.tasksDueToday > 0 ? "#f59e0b" : "#94a3b8", icon: "!" },
              { label: "Overdue", value: data.tasksOverdue, bg: data.tasksOverdue > 0 ? "from-red-50 to-rose-50" : "from-slate-50 to-gray-50", border: data.tasksOverdue > 0 ? "border-red-200" : "border-slate-200", color: data.tasksOverdue > 0 ? "#ef4444" : "#94a3b8", icon: "X" },
              { label: "Done This Month", value: data.tasksCompletedThisMonth, bg: "from-green-50 to-emerald-50", border: "border-green-200", color: "#22c55e", icon: "D" },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl border ${c.border} bg-gradient-to-br ${c.bg} p-4 shadow-sm`}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: c.color }}>{c.label}</p>
                  <div className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: c.color }}>{c.icon}</div>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Main Content: Clients + Charts + Activity */}
          <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Clients List — PRIMARY */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[15px] font-semibold text-slate-800">Clients</h3>
                  <Link to="/seo/clients" className="text-[12px] font-medium" style={{ color: BRAND }}>View All &rarr;</Link>
                </div>

                {data.clients.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-[13px] text-slate-400">No clients yet. <Link to="/seo/clients" className="underline" style={{ color: BRAND }}>Add one</Link></p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.clients.map((c) => {
                      const progress = c.total_tasks > 0 ? Math.round((c.tasks_done / c.total_tasks) * 100) : 0;
                      const progressColor = progress >= 75 ? "#22c55e" : progress >= 40 ? "#f59e0b" : BRAND;
                      return (
                        <Link
                          key={c.id}
                          to={`/seo/clients/${c.id}`}
                          className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-[13px] font-bold text-indigo-600">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="text-[14px] font-semibold text-slate-900">{c.name}</h4>
                                <p className="text-[11px] text-slate-400">
                                  {c.business_count} site{c.business_count !== 1 ? "s" : ""}
                                  {c.tasks_overdue > 0 && <span className="ml-2 font-medium text-red-500">{c.tasks_overdue} overdue</span>}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold" style={{ color: progressColor }}>{progress}%</span>
                              <p className="text-[11px] text-slate-400">{c.tasks_done}/{c.total_tasks}</p>
                            </div>
                          </div>
                          {c.total_tasks > 0 && (
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: progressColor }} />
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Task Status + Team Workload — compact row below clients */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Task Breakdown Pie */}
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-[13px] font-semibold text-slate-800">Task Status</h3>
                  <div className="flex items-center justify-center" style={{ height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                      <PieChart>
                        <Pie data={taskPie} cx="50%" cy="50%" outerRadius={50} innerRadius={25} dataKey="value" paddingAngle={3}>
                          {taskPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value: any, name: any) => [`${value}`, name]} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-3 text-[10px]">
                    {taskPie.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-slate-500">{d.name} ({d.value})</span>
                      </div>
                    ))}
                  </div>
                </article>

                {/* Team Workload Bar */}
                <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-[13px] font-semibold text-slate-800">Team Workload</h3>
                  {teamBarData.length > 0 ? (
                    <div style={{ height: 150 }}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                        <BarChart data={teamBarData} barSize={12}>
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={25} />
                          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 11 }} />
                          <Bar dataKey="done" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name="Done" />
                          <Bar dataKey="active" stackId="a" fill="#6366f1" name="Active" />
                          <Bar dataKey="pending" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} name="Pending" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-36 items-center justify-center text-[13px] text-slate-400">No team members assigned</div>
                  )}
                </article>
              </div>
            </div>

            {/* Right Column — Activity + Team */}
            <div>
              <h3 className="mb-2 text-[15px] font-semibold text-slate-800">Recent Activity</h3>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" style={{ maxHeight: 400, overflowY: "auto" }}>
                {data.recentActivity.length === 0 ? (
                  <p className="py-12 text-center text-[13px] text-slate-400">No activity yet. Start by generating checklists for your businesses.</p>
                ) : (
                  data.recentActivity.slice(0, 20).map((a) => <ActivityRow key={a.id} a={a} />)
                )}
              </div>

              {/* Team Members */}
              {data.tasksByMember.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-[15px] font-semibold text-slate-800">Team</h3>
                  <div className="grid gap-2">
                    {data.tasksByMember.map((m) => {
                      const memberTotal = m.done + m.in_progress + m.pending;
                      const memberProgress = memberTotal > 0 ? Math.round((m.done / memberTotal) * 100) : 0;
                      return (
                        <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white shadow-sm"
                            style={{ backgroundColor: m.avatar_color || BRAND }}
                          >
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <p className="truncate text-[13px] font-semibold text-slate-700">{m.name}</p>
                              <span className="text-[11px] font-medium text-slate-400">{memberProgress}%</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${memberProgress}%` }} />
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400">
                              <span className="text-emerald-500">{m.done} done</span> &middot; <span className="text-indigo-500">{m.in_progress} active</span> &middot; {m.pending} pending
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* CLIENT PORTAL VIEW */
        <>
          {/* Client Portal Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase">Tracked Websites</span>
                
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{data.activeBusinesses}</p>
              <p className="mt-1 text-xs text-green-600 font-medium">✓ Active Search Optimization</p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase">SEO Task Completion</span>
                
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{globalProgress}%</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${globalProgress}%` }} />
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase">Updates This Month</span>
                
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{data.tasksCompletedThisMonth}</p>
              <p className="mt-1 text-xs text-slate-500 font-medium">Optimizations deployed</p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase">Avg Crawl Health</span>
                
              </div>
              {data.avgCrawlHealth != null ? (
                <>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{data.avgCrawlHealth}%</p>
                  <p className="mt-1 text-xs text-slate-500 font-medium">
                    Based on {data.totalAuditsCompleted || 0} completed audit{data.totalAuditsCompleted !== 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-xl font-bold text-slate-400">Not yet audited</p>
                  <p className="mt-1 text-xs text-slate-400 font-medium">Run audits to calculate health</p>
                </>
              )}
            </article>
          </div>

          {/* Client Main Grid: Client Cards + Client Activity Milestones */}
          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            {/* Left: Beautiful Client Cards */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Your Campaign Portals</h3>
                <span className="text-xs text-slate-400">Click to view deep reports</span>
              </div>

              {data.clients.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-12 text-center">
                  <p className="text-sm text-slate-400">No campaigns created yet.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.clients.map((c) => {
                    const progress = c.total_tasks > 0 ? Math.round((c.tasks_done / c.total_tasks) * 100) : 0;
                    return (
                      <Link
                        key={c.id}
                        to={`/seo/clients/${c.id}`}
                        className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-[#5e6ad2]/40 hover:shadow-md"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[15px] font-bold text-indigo-600 transition group-hover:scale-105">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {c.avg_audit_score != null ? (
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                  Score: {c.avg_audit_score}%
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  Not yet audited
                                </span>
                              )}
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 uppercase">
                                Active Plan
                              </span>
                            </div>
                          </div>
                          
                          <h4 className="mt-4 text-base font-bold text-slate-950 group-hover:text-[#5e6ad2] transition">
                            {c.name}
                          </h4>
                          <p className="mt-1 text-xs text-slate-400">
                            {c.business_count} optimized website{c.business_count !== 1 ? "s" : ""}
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                            <span className="text-slate-400">Optimization Grade</span>
                            <span className="text-[#5e6ad2]">{progress}%</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#5e6ad2] to-violet-500 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <p className="mt-2 text-[10px] text-slate-400 font-medium">
                            ✓ {c.tasks_done} updates implemented • {c.total_tasks - c.tasks_done} upcoming items
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Milestone logs */}
            <div>
              <h3 className="mb-4 text-base font-semibold text-slate-900">Completed SEO Deliverables</h3>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" style={{ maxHeight: 420, overflowY: "auto" }}>
                {data.recentActivity.length === 0 ? (
                  <p className="py-12 text-center text-xs text-slate-400">Your completed milestones will appear here.</p>
                ) : (
                  <div className="relative border-l border-slate-100 pl-4 ml-2 space-y-5">
                    {data.recentActivity
                      .slice(0, 15)
                      .map((a) => (
                        <div key={a.id} className="relative">
                          <span className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white ring-4 ring-white">
                            ✓
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{a.detail || a.action.replace(/_/g, " ")}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              {a.client_name} • {new Date(a.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Quick Links */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { to: "/seo/clients", label: "Clients & Campaigns", sub: "Manage client accounts & websites", gradient: "from-indigo-500 to-indigo-600", shadow: "shadow-indigo-200" },
          { to: "/seo/team", label: "Team Settings", sub: "Add & manage SEO specialists", gradient: "from-violet-500 to-purple-600", shadow: "shadow-violet-200" },
          { to: "/seo/checklist-templates", label: "SEO Playbook (Templates)", sub: "Edit automated check templates", gradient: "from-emerald-500 to-teal-600", shadow: "shadow-emerald-200" },
        ].map((link) => (
          <Link key={link.to} to={link.to} className={`rounded-xl bg-gradient-to-br ${link.gradient} p-5 text-center text-white shadow-lg ${link.shadow} transition hover:scale-[1.01] hover:shadow-xl`}>
            <p className="text-base font-bold">{link.label}</p>
            <p className="mt-1 text-[11px] text-white/70">{link.sub}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
