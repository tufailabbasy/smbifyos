import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  fetchClientDetail,
  createSeoBusiness,
  type ClientDetail,
  type SeoActivityEntry,
  fetchSeoFinance,
  createFinanceEntry,
  type FinanceEntry,
  type CurrencyTotal,
} from "../../lib/api";
import { formatCurrencyAmount } from "../../lib/finance";

const BRAND = "#5e6ad2";

type Tab = "overview" | "businesses" | "finance" | "activity";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "businesses", label: "Websites / GMB" },
  { key: "finance", label: "Finance" },
  { key: "activity", label: "Activity" },
];

export function SeoClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<"agency" | "client">(() => {
    return (localStorage.getItem("smbify_seo_view_mode") as "agency" | "client") || "agency";
  });

  const handleToggleView = (mode: "agency" | "client") => {
    setViewMode(mode);
    localStorage.setItem("smbify_seo_view_mode", mode);
  };

  const activeTab = (location.hash.replace("#", "") as Tab) || "overview";
  const setTab = (t: Tab) => navigate(`#${t}`, { replace: true });

  // Business form
  const [showBizForm, setShowBizForm] = useState(false);
  const [bizName, setBizName] = useState("");
  const [bizWebsite, setBizWebsite] = useState("");
  const [bizGmb, setBizGmb] = useState("");
  const [bizCity, setBizCity] = useState("");
  const [bizState, setBizState] = useState("");
  const [bizSaving, setBizSaving] = useState(false);

  // Finance
  const [financeItems, setFinanceItems] = useState<FinanceEntry[]>([]);
  const [finTotals, setFinTotals] = useState<CurrencyTotal[]>([]);


  const load = () => {
    if (!clientId) return;
    setLoading(true);
    fetchClientDetail(clientId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [clientId]);

  useEffect(() => {
    if (activeTab === "finance" && clientId) {
      fetchSeoFinance({}).then((d: any) => {
        const filtered = (d.entries || d.items || []).filter((e: any) => e.client_id === clientId);
        setFinanceItems(filtered);
        setFinTotals(d.totalsByCurrency || []);
      }).catch(() => {});
    }
  }, [activeTab, clientId]);

  // Load finance items for client view always
  useEffect(() => {
    if (viewMode === "client" && clientId) {
      fetchSeoFinance({}).then((d: any) => {
        const filtered = (d.entries || d.items || []).filter((e: any) => e.client_id === clientId);
        setFinanceItems(filtered);
      }).catch(() => {});
    }
  }, [viewMode, clientId]);

  const handleAddBiz = async () => {
    if (!bizName.trim() || !clientId) return;
    setBizSaving(true);
    try {
      await createSeoBusiness({ client_id: clientId, name: bizName.trim(), website: bizWebsite, gmb_url: bizGmb, city: bizCity, state: bizState });
      setBizName(""); setBizWebsite(""); setBizGmb(""); setBizCity(""); setBizState("");
      setShowBizForm(false);
      load();
    } catch { /* handled */ }
    setBizSaving(false);
  };

  if (loading) {
    return (
      <section className="page-enter flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: BRAND }} />
      </section>
    );
  }

  if (!data) return <section className="page-enter p-8 text-center text-slate-500">Client not found.</section>;

  const { client: c, businesses, recentActivity } = data;
  const totalTasks = businesses.reduce((s, b) => s + b.checklist_total, 0);
  const doneTasks = businesses.reduce((s, b) => s + b.checklist_done, 0);
  const overdueTasks = businesses.reduce((s, b) => s + b.checklist_overdue, 0);
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <section className="page-enter space-y-5">
      {/* Breadcrumb + Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <Link to="/seo/dashboard" className="hover:text-slate-600" style={{ color: BRAND }}>Workspace</Link>
            <span>/</span>
            <Link to="/seo/clients" className="hover:text-slate-600" style={{ color: BRAND }}>Clients</Link>
            <span>/</span>
            <span className="text-slate-600">{c.name}</span>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={async () => { const response = await fetch(`/api/share/portal/${c.id}`); const payload = await response.json(); if (response.ok) window.open(payload.url, "_blank", "noopener,noreferrer"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm">Live Client Portal ↗</button>

            {/* Persistent View Toggle */}
            <div className="flex rounded-full bg-slate-100 p-1 border border-slate-200/80">
              <button
                onClick={() => handleToggleView("agency")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-300 ${
                  viewMode === "agency"
                    ? "bg-[#5e6ad2] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Agency View
              </button>
              <button
                onClick={() => handleToggleView("client")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all duration-300 ${
                  viewMode === "client"
                    ? "bg-[#5e6ad2] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Client View
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{c.name}</h2>
            <div className="mt-1 flex items-center gap-3 text-[12px] text-slate-400">
              {c.contact_email && <span>{c.contact_email}</span>}
              {c.contact_phone && <span>&middot; {c.contact_phone}</span>}
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: BRAND + "18", color: BRAND }}>
                {c.lifecycle_stage}
              </span>
            </div>
          </div>
          <div className="text-left md:text-right">
            <p className="text-2xl font-bold" style={{ color: BRAND }}>{progress}% Optimized</p>
            <p className="text-[11px] text-slate-400">{doneTasks}/{totalTasks} goals hit</p>
          </div>
        </div>
        {totalTasks > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-[#5e6ad2] to-indigo-500" style={{ width: `${progress}%` }} />
          </div>
        )}
      </header>

      {viewMode === "agency" ? (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "rounded-lg px-4 py-2 text-[13px] font-medium transition-all",
                  activeTab === t.key
                    ? "bg-[#5e6ad2] text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-[#5e6ad2]/30",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "overview" && (
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              {/* Stats */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <p className="text-xl font-bold text-slate-800">{businesses.length}</p>
                    <p className="text-[11px] text-slate-400">Sites</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <p className="text-xl font-bold text-slate-800">{totalTasks}</p>
                    <p className="text-[11px] text-slate-400">Total Tasks</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <p className="text-xl font-bold text-green-600">{doneTasks}</p>
                    <p className="text-[11px] text-slate-400">Completed</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <p className="text-xl font-bold" style={{ color: overdueTasks > 0 ? "#ef4444" : "#94a3b8" }}>{overdueTasks}</p>
                    <p className="text-[11px] text-slate-400">Overdue</p>
                  </div>
                </div>

                {/* Business list quick view */}
                <h3 className="text-[14px] font-semibold text-slate-700">Websites & GMB</h3>
                {businesses.map((b) => {
                  const bp = b.checklist_total > 0 ? Math.round((b.checklist_done / b.checklist_total) * 100) : 0;
                  return (
                    <Link
                      key={b.id}
                      to={`/seo/clients/${clientId}/businesses/${b.id}`}
                      className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-[#5e6ad2]/40 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-[14px] font-semibold text-slate-900">{b.name}</h4>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                            {b.website && <span className="truncate max-w-[180px]">{b.website}</span>}
                            {b.city && <span>&middot; {b.city}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          {b.last_website_audit_score != null && (
                            <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: BRAND + "40", color: BRAND }}>
                              Site: {b.last_website_audit_score}
                            </span>
                          )}
                          {b.last_gmb_audit_score != null && (
                            <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ borderColor: "#22c55e40", color: "#22c55e" }}>
                              GMB: {b.last_gmb_audit_score}
                            </span>
                          )}
                          <span className="text-[12px] font-medium" style={{ color: BRAND }}>{bp}%</span>
                        </div>
                      </div>
                      {b.checklist_total > 0 && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full" style={{ width: `${bp}%`, backgroundColor: BRAND }} />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Activity Sidebar */}
              <div>
                <h3 className="mb-2 text-[14px] font-semibold text-slate-700">Recent Activity</h3>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  {recentActivity.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-slate-400">No activity yet.</p>
                  ) : (
                    recentActivity.slice(0, 12).map((a) => (
                      <div key={a.id} className="border-b border-slate-100 py-2 last:border-0">
                        <p className="text-[13px] text-slate-700">{a.detail || a.action.replace(/_/g, " ")}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {a.business_name && <span>{a.business_name} &middot; </span>}
                          {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "businesses" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-slate-800">Websites & GMB Profiles</h3>
                <button onClick={() => setShowBizForm(!showBizForm)} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white" style={{ backgroundColor: BRAND }}>
                  + Add Website
                </button>
              </div>

              {showBizForm && (
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Business Name *" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
                    <input value={bizWebsite} onChange={(e) => setBizWebsite(e.target.value)} placeholder="Website URL" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
                    <input value={bizGmb} onChange={(e) => setBizGmb(e.target.value)} placeholder="GMB Profile URL" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
                    <input value={bizCity} onChange={(e) => setBizCity(e.target.value)} placeholder="City" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
                    <input value={bizState} onChange={(e) => setBizState(e.target.value)} placeholder="State" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={handleAddBiz} disabled={bizSaving || !bizName.trim()} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
                      {bizSaving ? "Saving..." : "Add Website"}
                    </button>
                    <button onClick={() => setShowBizForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] text-slate-600">Cancel</button>
                  </div>
                </div>
              )}

              {businesses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                  <p className="text-[14px] text-slate-400">No websites yet. Click &quot;+ Add Website&quot; to add one.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {businesses.map((b) => {
                    const bp = b.checklist_total > 0 ? Math.round((b.checklist_done / b.checklist_total) * 100) : 0;
                    return (
                      <Link
                        key={b.id}
                        to={`/seo/clients/${clientId}/businesses/${b.id}`}
                        className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-[#5e6ad2]/40 hover:shadow-sm"
                      >
                        <h4 className="text-[15px] font-semibold text-slate-900">{b.name}</h4>
                        {b.website && <p className="mt-0.5 text-[12px] text-blue-500 truncate">{b.website}</p>}
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                          {b.city && <span>{b.city}{b.state ? `, ${b.state}` : ""}</span>}
                          <span>&middot; {b.order_status}</span>
                          {b.assigned_team_member && <span>&middot; {b.assigned_team_member}</span>}
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          {b.last_website_audit_score != null && <span className="rounded border px-1.5 py-0.5 text-[10px] font-bold" style={{ borderColor: BRAND + "40", color: BRAND }}>Site {b.last_website_audit_score}</span>}
                          {b.last_gmb_audit_score != null && <span className="rounded border px-1.5 py-0.5 text-[10px] font-bold" style={{ borderColor: "#22c55e40", color: "#22c55e" }}>GMB {b.last_gmb_audit_score}</span>}
                        </div>
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-[11px]">
                            <span className="text-slate-400">{b.checklist_done}/{b.checklist_total} tasks</span>
                            <span className="font-medium" style={{ color: BRAND }}>{bp}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${bp}%`, backgroundColor: BRAND }} />
                          </div>
                        </div>
                        {b.checklist_overdue > 0 && (
                          <p className="mt-2 text-[11px] font-medium text-red-500">{b.checklist_overdue} overdue task{b.checklist_overdue !== 1 ? "s" : ""}</p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "finance" && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-[15px] font-semibold text-slate-800">Finance Entries</h3>
              {financeItems.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-slate-400">No finance entries for this client. Add entries from the SEO Dashboard finance tab.</p>
              ) : (
                <div className="space-y-2">
                  {financeItems.map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
                      <div>
                        <p className="text-[13px] font-medium text-slate-700">{f.label || "Payment"}</p>
                        <p className="text-[11px] text-slate-400">{new Date(f.entry_date).toLocaleDateString()}</p>
                      </div>
                      <p className="text-[14px] font-semibold text-slate-800">{f.currency} {f.amount}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "activity" && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-[15px] font-semibold text-slate-800">Activity Log</h3>
              {recentActivity.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-slate-400">No activity yet.</p>
              ) : (
                recentActivity.map((a) => (
                  <div key={a.id} className="border-b border-slate-100 py-3 last:border-0">
                    <p className="text-[13px] text-slate-700">{a.detail || a.action.replace(/_/g, " ")}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {a.business_name && <span>{a.business_name} &middot; </span>}
                      {a.actor_name && <span>{a.actor_name} &middot; </span>}
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      ) : (
        /* CLIENT PORTAL VIEW */
        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          {/* Left Column: Business Health Scorecards */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Your Search Properties</h3>
            {businesses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-400">
                Awaiting website connection configurations.
              </div>
            ) : (
              <div className="space-y-4">
                {businesses.map((b) => {
                  const bp = b.checklist_total > 0 ? Math.round((b.checklist_done / b.checklist_total) * 100) : 0;
                  return (
                    <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <h4 className="text-base font-bold text-slate-950">{b.name}</h4>
                          {b.website && (
                            <a href={b.website.startsWith("http") ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                              {b.website}
                            </a>
                          )}
                        </div>

                        {/* Semrush Site Health & BrightLocal GMB Grade */}
                        <div className="flex flex-wrap gap-2">
                          {b.last_website_audit_score != null && (
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              b.last_website_audit_score >= 80 
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200" 
                                : "bg-amber-50 text-amber-600 border border-amber-200"
                            }`}>
                              Site Health: {b.last_website_audit_score}%
                            </span>
                          )}
                          {b.last_gmb_audit_score != null && (
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              b.last_gmb_audit_score >= 80 
                                ? "bg-indigo-50 text-indigo-600 border border-indigo-200" 
                                : "bg-amber-50 text-amber-600 border border-amber-200"
                            }`}>
                              Maps Presence: {b.last_gmb_audit_score}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Goal Completion Progress Bar */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="flex justify-between items-center text-xs font-semibold mb-1">
                          <span className="text-slate-400">Optimization Goal Completion</span>
                          <span className="text-[#5e6ad2]">{bp}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#5e6ad2] to-violet-500 rounded-full" style={{ width: `${bp}%` }} />
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">
                          ✓ {b.checklist_done} implementations active • {b.checklist_overdue} overdue
                        </span>
                        <Link to={`/seo/clients/${clientId}/businesses/${b.id}`} className="text-xs font-bold text-[#5e6ad2] hover:underline">
                          View Interactive Report &rarr;
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Retainer & Billing Status Card */}
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-3">Billing & Retainer Status</h3>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 mb-4">
                
                <div>
                  <h5 className="text-xs font-bold text-slate-700 uppercase">Monthly Retainer Status</h5>
                  <p className="text-sm font-semibold text-green-600">✓ Up-to-date (Active Campaign)</p>
                </div>
              </div>

              {financeItems.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Payment Statements</p>
                  {financeItems.slice(0, 5).map((f: any) => (
                    <div key={f.id} className="flex justify-between items-center text-xs text-slate-600 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                      <span>✓ {f.label || "SEO Optimization Retainer"}</span>
                      <span className="font-semibold">{f.currency} {f.amount} ({new Date(f.entry_date).toLocaleDateString()})</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>

          {/* Right Column: Achievements & Timeline highlights */}
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-4">SEO Work Completed</h3>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {recentActivity.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">Awaiting campaign execution events.</p>
              ) : (
                <div className="relative border-l border-slate-100 pl-4 ml-2 space-y-4">
                  {recentActivity
                    .filter(a => a.action === "task_completed" || a.action === "checklist_generated")
                    .slice(0, 10)
                    .map((a) => (
                      <div key={a.id} className="relative">
                        <span className="absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white ring-4 ring-white">
                          ✓
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{a.detail || a.action.replace(/_/g, " ")}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {a.business_name} • {new Date(a.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
