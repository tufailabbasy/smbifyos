import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  fetchBusinessDetail,
  fetchBusinessChecklist,
  generateBusinessChecklist,
  updateBusinessChecklistItem,
  createBusinessChecklistItem,
  deleteBusinessChecklistItem,
  fetchTeamMembers,
  fetchProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
  fetchGoogleStatus,
  fetchBusinessGoogleToken,
  fetchGoogleConnectUrl,
  disconnectGoogle,
  fetchGscSites,
  selectGscSite,
  syncGscData,
  fetchGscPerformance,
  fetchGscKeywords,
  type BusinessDetail,
  type BusinessChecklistItem,
  type TeamMember,
  type ProjectMember,
  type GoogleConnectionStatus,
  type BusinessGoogleToken,
  type GscSite,
  type GscPerformanceRow,
  type GscKeywordRow,
} from "../../lib/api";

const BRAND = "#5e6ad2";
type Tab = "checklist" | "team" | "audits" | "connections" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "checklist", label: "Checklist" },
  { key: "team", label: "Team & Access" },
  { key: "audits", label: "Audits" },
  { key: "connections", label: "Connections" },
  { key: "settings", label: "Settings" },
];

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: "#fef2f2", text: "#dc2626" },
  high: { bg: "#fff7ed", text: "#ea580c" },
  medium: { bg: "#eff6ff", text: "#2563eb" },
  low: { bg: "#f8fafc", text: "#64748b" },
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", icon: "\u25cb" },
  { value: "in_progress", label: "In Progress", icon: "\u25d4" },
  { value: "done", label: "Done", icon: "\u2713" },
  { value: "skipped", label: "Skipped", icon: "\u2014" },
];

const CATEGORIES = ["setup", "on-page", "technical", "local", "content", "off-page", "monthly", "custom"];
const CAT_LABELS: Record<string, string> = {
  setup: "Setup & Foundation",
  "on-page": "On-Page SEO",
  technical: "Technical SEO",
  local: "Local SEO",
  content: "Content",
  "off-page": "Off-Page / Links",
  monthly: "Monthly Tasks",
  custom: "Custom Tasks",
};

const PROJECT_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
  { value: "client", label: "Client" },
];

export function SeoBusinessDetailPage() {
  const { clientId, businessId } = useParams<{ clientId: string; businessId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = (location.hash.replace("#", "") as Tab) || "checklist";
  const setTab = (t: Tab) => navigate(`#${t}`, { replace: true });

  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [items, setItems] = useState<BusinessChecklistItem[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [autoGenDone, setAutoGenDone] = useState(false);

  // Filters
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Add custom item
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("custom");
  const [newPriority, setNewPriority] = useState("medium");

  // Add project member
  const [addMemberId, setAddMemberId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("member");

  // Google integration state
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null);
  const [googleToken, setGoogleToken] = useState<BusinessGoogleToken | null>(null);
  const [gscSites, setGscSites] = useState<GscSite[]>([]);
  const [gscPerformance, setGscPerformance] = useState<GscPerformanceRow[]>([]);
  const [gscKeywords, setGscKeywords] = useState<GscKeywordRow[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [gscSyncing, setGscSyncing] = useState(false);
  const [gscSitesLoading, setGscSitesLoading] = useState(false);

  const loadGoogleData = useCallback(async () => {
    if (!businessId) return;
    setGoogleLoading(true);
    try {
      const [status, token] = await Promise.all([
        fetchGoogleStatus(),
        fetchBusinessGoogleToken(businessId),
      ]);
      setGoogleStatus(status);
      setGoogleToken(token);
      // If connected and has GSC site, load performance + keywords
      if (token?.gsc_connected && token?.gsc_site_url) {
        const [perf, kw] = await Promise.all([
          fetchGscPerformance(businessId),
          fetchGscKeywords(businessId),
        ]);
        setGscPerformance(perf);
        setGscKeywords(kw);
      }
    } catch { /* handled */ }
    setGoogleLoading(false);
  }, [businessId]);

  const loadChecklist = useCallback(async () => {
    if (!businessId) return;
    const params: { month?: string; status?: string; category?: string } = {};
    if (selectedMonth) params.month = selectedMonth;
    if (filterStatus) params.status = filterStatus;
    if (filterCategory) params.category = filterCategory;
    const list = await fetchBusinessChecklist(businessId, params);
    setItems(list);
    return list;
  }, [businessId, selectedMonth, filterStatus, filterCategory]);

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        fetchBusinessDetail(businessId),
        fetchTeamMembers({ active: 1 }),
      ]);
      setDetail(d);
      setTeam(t);
      setProjectMembers(d.projectMembers || []);

      // Load checklist
      const list = await loadChecklist();

      // AUTO-GENERATE: If no checklist items exist at all, auto-generate
      if (list && list.length === 0 && !autoGenDone) {
        setAutoGenDone(true);
        setGenerating(true);
        try {
          await generateBusinessChecklist(businessId, { month: selectedMonth });
          await loadChecklist();
          const d2 = await fetchBusinessDetail(businessId);
          setDetail(d2);
        } catch { /* handled */ }
        setGenerating(false);
      }
    } catch { /* handled */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [businessId]);
  useEffect(() => { if (!loading) loadChecklist(); }, [selectedMonth, filterStatus, filterCategory]);
  useEffect(() => { if (activeTab === "connections") loadGoogleData(); }, [activeTab, businessId]);

  const handleGenerate = async () => {
    if (!businessId) return;
    setGenerating(true);
    try {
      await generateBusinessChecklist(businessId, { month: selectedMonth });
      await loadChecklist();
      const d = await fetchBusinessDetail(businessId);
      setDetail(d);
    } catch { /* handled */ }
    setGenerating(false);
  };

  const handleToggleStatus = async (item: BusinessChecklistItem) => {
    if (!businessId) return;
    const newStatus = item.status === "done" ? "pending" : "done";
    await updateBusinessChecklistItem(businessId, item.id, { status: newStatus } as any);
    await loadChecklist();
    const d = await fetchBusinessDetail(businessId);
    setDetail(d);
  };

  const handleUpdateItem = async (itemId: string, data: Partial<BusinessChecklistItem>) => {
    if (!businessId) return;
    await updateBusinessChecklistItem(businessId, itemId, data);
    await loadChecklist();
  };

  const handleAddCustom = async () => {
    if (!businessId || !newTitle.trim()) return;
    await createBusinessChecklistItem(businessId, {
      title: newTitle.trim(),
      category: newCategory,
      priority: newPriority,
    } as any);
    setNewTitle(""); setShowAddForm(false);
    await loadChecklist();
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!businessId) return;
    await deleteBusinessChecklistItem(businessId, itemId);
    await loadChecklist();
  };

  // Project members
  const handleAddMember = async () => {
    if (!businessId || !addMemberId) return;
    try {
      await addProjectMember(businessId, { team_member_id: addMemberId, role: addMemberRole });
      setAddMemberId(""); setAddMemberRole("member");
      const members = await fetchProjectMembers(businessId);
      setProjectMembers(members);
    } catch { /* handled */ }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!businessId) return;
    await removeProjectMember(businessId, memberId);
    const members = await fetchProjectMembers(businessId);
    setProjectMembers(members);
  };

  const handleChangeMemberRole = async (memberId: string, role: string) => {
    if (!businessId) return;
    await updateProjectMemberRole(businessId, memberId, role);
    const members = await fetchProjectMembers(businessId);
    setProjectMembers(members);
  };

  // Google actions
  const handleGoogleConnect = async () => {
    if (!businessId) return;
    try {
      const { authUrl } = await fetchGoogleConnectUrl(businessId, "gsc");
      window.location.href = authUrl;
    } catch { /* handled */ }
  };

  const handleGoogleDisconnect = async () => {
    if (!businessId) return;
    await disconnectGoogle(businessId);
    setGoogleToken(null);
    setGscSites([]);
    setGscPerformance([]);
    setGscKeywords([]);
  };

  const handleLoadGscSites = async () => {
    if (!businessId) return;
    setGscSitesLoading(true);
    try {
      const sites = await fetchGscSites(businessId);
      setGscSites(sites);
    } catch { /* handled */ }
    setGscSitesLoading(false);
  };

  const handleSelectGscSite = async (siteUrl: string) => {
    if (!businessId) return;
    await selectGscSite(businessId, siteUrl);
    await loadGoogleData();
  };

  const handleSyncGsc = async () => {
    if (!businessId) return;
    setGscSyncing(true);
    try {
      await syncGscData(businessId);
      await loadGoogleData();
    } catch { /* handled */ }
    setGscSyncing(false);
  };

  // Group items by category
  const grouped = useMemo(() => {
    const map: Record<string, BusinessChecklistItem[]> = {};
    for (const item of items) {
      const cat = item.category || "custom";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    return map;
  }, [items]);

  const totalItems = items.length;
  const doneItems = items.filter((i) => i.status === "done").length;
  const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // Available team members not yet assigned
  const availableMembers = team.filter((m) => !projectMembers.some((pm) => pm.team_member_id === m.id));

  if (loading) {
    return (
      <section className="page-enter flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: BRAND }} />
        {generating && <p className="ml-3 text-[13px] text-slate-500">Generating SEO checklist...</p>}
      </section>
    );
  }

  if (!detail) return <section className="page-enter p-8 text-center text-slate-500">Business not found.</section>;

  const b = detail.business;

  // Month options
  const monthOptions: string[] = [];
  for (let i = -6; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const [viewMode, setViewMode] = useState<"agency" | "client">(() => {
    return (localStorage.getItem("smbify_seo_view_mode") as "agency" | "client") || "agency";
  });

  const handleToggleView = (mode: "agency" | "client") => {
    setViewMode(mode);
    localStorage.setItem("smbify_seo_view_mode", mode);
  };

  const [clientTab, setClientTab] = useState<"goals" | "performance" | "audits">("goals");

  return (
    <section className="page-enter space-y-5">
      {/* Breadcrumb + Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <Link to="/seo/dashboard" style={{ color: BRAND }}>Workspace</Link>
            <span>/</span>
            <Link to="/seo/clients" style={{ color: BRAND }}>Clients</Link>
            <span>/</span>
            <Link to={`/seo/clients/${clientId}`} style={{ color: BRAND }}>{b.client_name}</Link>
            <span>/</span>
            <span className="text-slate-600">{b.name}</span>
          </div>

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

        <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{b.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
              {b.website && <a href={b.website.startsWith("http") ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{b.website}</a>}
              {b.city && <span>&middot; {b.city}{b.state ? `, ${b.state}` : ""}</span>}
              {b.gmb_url && <a href={b.gmb_url} target="_blank" rel="noreferrer" className="text-green-600 hover:underline">&middot; GMB Profile</a>}
            </div>
          </div>
          <div className="text-left md:text-right">
            <p className="text-2xl font-bold" style={{ color: BRAND }}>{progress}% Optimized</p>
            <p className="text-[11px] text-slate-400">{doneItems}/{totalItems} tasks complete</p>
          </div>
        </div>
        {totalItems > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-[#5e6ad2] to-violet-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {/* Assigned team avatars */}
        {projectMembers.length > 0 && viewMode === "agency" && (
          <div className="mt-3 flex items-center gap-1">
            <span className="mr-1 text-[11px] text-slate-400">Team:</span>
            {projectMembers.map((pm) => (
              <div key={pm.id} title={`${pm.name} (${pm.role})`} className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: pm.avatar_color || BRAND }}>
                {pm.name.charAt(0).toUpperCase()}
              </div>
            ))}
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
                  activeTab === t.key ? "bg-[#5e6ad2] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-[#5e6ad2]/30",
                ].join(" ")}
              >
                {t.label}
                {t.key === "team" && projectMembers.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[10px]">{projectMembers.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* ═══════ CHECKLIST TAB ═══════ */}
          {activeTab === "checklist" && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>
                  ))}
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
                  <option value="">All Status</option>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
                  <option value="">All Categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                </select>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => setShowAddForm(!showAddForm)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">+ Custom Task</button>
                  <button onClick={handleGenerate} disabled={generating} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
                    {generating ? "Generating..." : "Generate Monthly Tasks"}
                  </button>
                </div>
              </div>

              {showAddForm && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap gap-3">
                    <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title *" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
                    <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
                      {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                    </select>
                    <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <button onClick={handleAddCustom} disabled={!newTitle.trim()} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>Add</button>
                  </div>
                </div>
              )}

              {/* Checklist Summary */}
              {detail.checklistSummary.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                  {detail.checklistSummary.map((cs) => (
                    <div key={cs.category} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{CAT_LABELS[cs.category] || cs.category}</p>
                      <p className="mt-1 text-lg font-bold" style={{ color: BRAND }}>{cs.done}/{cs.total}</p>
                      {cs.overdue > 0 && <p className="text-[10px] font-medium text-red-500">{cs.overdue} overdue</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Grouped Items */}
              {totalItems === 0 && !generating ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                  <p className="text-[14px] text-slate-500">No checklist items found for this month.</p>
                  <button onClick={handleGenerate} className="mt-3 rounded-lg px-4 py-2 text-[13px] font-medium text-white" style={{ backgroundColor: BRAND }}>Generate Checklist</button>
                </div>
              ) : (
                Object.entries(grouped)
                  .sort(([a], [bb]) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(bb))
                  .map(([cat, catItems]) => {
                    const catDone = catItems.filter((i) => i.status === "done").length;
                    return (
                      <div key={cat} className="rounded-lg border border-slate-200 bg-white">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-[14px] font-semibold text-slate-800">{CAT_LABELS[cat] || cat}</h3>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{catDone}/{catItems.length}</span>
                          </div>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${catItems.length > 0 ? (catDone / catItems.length) * 100 : 0}%`, backgroundColor: BRAND }} />
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {catItems.map((item) => {
                            const pc = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
                            const isOverdue = item.due_date && item.due_date < new Date().toISOString().slice(0, 10) && item.status !== "done" && item.status !== "skipped";
                            return (
                              <div key={item.id} className={`flex items-center gap-3 px-5 py-3 ${item.status === "done" ? "opacity-60" : ""}`}>
                                <button onClick={() => handleToggleStatus(item)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[12px] transition ${item.status === "done" ? "border-green-400 bg-green-50 text-green-600" : "border-slate-300 text-transparent hover:border-[#5e6ad2]"}`}>
                                  {item.status === "done" ? "\u2713" : ""}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-[13px] font-medium ${item.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.title}</p>
                                  {item.description && <p className="mt-0.5 text-[11px] text-slate-400 truncate">{item.description}</p>}
                                </div>
                                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ backgroundColor: pc.bg, color: pc.text }}>{item.priority}</span>
                                <select value={item.assigned_to || ""} onChange={(e) => handleUpdateItem(item.id, { assigned_to: e.target.value || null } as any)} className="w-28 shrink-0 truncate rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-[#5e6ad2] focus:outline-none">
                                  <option value="">Unassigned</option>
                                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <input type="date" value={item.due_date || ""} onChange={(e) => handleUpdateItem(item.id, { due_date: e.target.value || null } as any)} className={`w-32 shrink-0 rounded border px-2 py-1 text-[11px] focus:outline-none ${isOverdue ? "border-red-300 text-red-600" : "border-slate-200 text-slate-500"}`} />
                                <select value={item.status} onChange={(e) => handleUpdateItem(item.id, { status: e.target.value } as any)} className="w-24 shrink-0 rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-[#5e6ad2] focus:outline-none">
                                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.icon} {s.label}</option>)}
                                </select>
                                {!item.template_id && (
                                  <button onClick={() => handleDeleteItem(item.id)} className="shrink-0 text-[12px] text-slate-300 hover:text-red-500">&times;</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          )}

          {/* ═══════ TEAM & ACCESS TAB ═══════ */}
          {activeTab === "team" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <h3 className="mb-1 text-[15px] font-semibold text-slate-800">Project Team</h3>
                <p className="mb-4 text-[12px] text-slate-400">Assign team members and clients who can access this project. Each person sees only the projects they are assigned to.</p>

                {/* Add member */}
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <select value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
                    <option value="">Select team member...</option>
                    {availableMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                  <select value={addMemberRole} onChange={(e) => setAddMemberRole(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]">
                    {PROJECT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={handleAddMember} disabled={!addMemberId} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
                    Add to Project
                  </button>
                </div>

                {availableMembers.length === 0 && team.length === 0 && (
                  <p className="mb-3 text-[12px] text-slate-400">
                    No team members found. <Link to="/seo/team" className="underline" style={{ color: BRAND }}>Add team members first</Link>.
                  </p>
                )}

                {/* Member list */}
                {projectMembers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-[13px] text-slate-400">No one assigned to this project yet. Add team members or clients above.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projectMembers.map((pm) => (
                      <div key={pm.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ backgroundColor: pm.avatar_color || BRAND }}>
                          {pm.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-slate-800">{pm.name}</p>
                          <p className="text-[11px] text-slate-400">{pm.email || pm.team_role}</p>
                        </div>
                        <select value={pm.role} onChange={(e) => handleChangeMemberRole(pm.id, e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-[12px] focus:border-[#5e6ad2] focus:outline-none">
                          {PROJECT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <button onClick={() => handleRemoveMember(pm.id)} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-red-400 hover:bg-red-50">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <h3 className="mb-2 text-[14px] font-semibold text-slate-800">Access Control</h3>
                <div className="space-y-2 text-[12px] text-slate-500">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-slate-700">Owner:</span>
                    <span>Full control — can edit, delete, manage team, and run audits.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-slate-700">Manager:</span>
                    <span>Can edit settings, manage checklist, assign tasks, and view reports.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-slate-700">Member:</span>
                    <span>Can work on assigned tasks, update status, add notes.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-slate-700">Viewer:</span>
                    <span>Read-only access to project progress and reports.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-slate-700">Client:</span>
                    <span>Client-facing view — sees progress reports and can leave feedback.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ AUDITS TAB ═══════ */}
          {activeTab === "audits" && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-slate-800">Audit History</h3>
                <Link to="/audit-tools/hub" className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50" style={{ color: BRAND }}>
                  Run New Audit &rarr;
                </Link>
              </div>
              {detail.recentAudits.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <p className="text-[13px] text-slate-400">No audits yet.</p>
                  <Link to="/audit-tools/hub" className="mt-2 inline-block text-[12px] font-medium" style={{ color: BRAND }}>Go to SEO Tools to run an audit &rarr;</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.recentAudits.map((a) => (
                    <div key={a.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
                      <div>
                        <p className="text-[13px] font-medium text-slate-700">{a.audit_type.toUpperCase()} Audit</p>
                        <p className="text-[11px] text-slate-400">{new Date(a.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {a.score != null && (
                          <span className="text-[15px] font-bold" style={{ color: a.score >= 78 ? "#22c55e" : a.score >= 56 ? "#f59e0b" : "#ef4444" }}>{a.score}</span>
                        )}
                        {a.verdict && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{a.verdict}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════ CONNECTIONS TAB ═══════ */}
          {activeTab === "connections" && (
            <div className="space-y-4">
              {googleLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: BRAND }} />
                </div>
              )}

              {!googleLoading && !googleStatus?.configured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[13px] font-semibold text-amber-800">Google OAuth Not Configured</p>
                  <p className="mt-1 text-[12px] text-amber-600">
                    Add Google API Client ID and Client Secret in{" "}
                    <Link to="/settings" className="text-blue-600 underline">Settings (General tab)</Link>{" "}
                    to enable Google integrations. Your clients will simply click "Connect with Google" here.
                  </p>
                </div>
              )}

              {/* ── Google Account Connection ── */}
              {!googleLoading && googleStatus?.configured && (
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                        <path d="M2 12h20" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[14px] font-semibold text-slate-800">Google Account</h3>
                      {googleToken ? (
                        <p className="text-[12px] text-green-600">Connected as {googleToken.google_email}</p>
                      ) : (
                        <p className="text-[12px] text-slate-400">Connect to enable Search Console &amp; Business Profile access.</p>
                      )}
                    </div>
                    {googleToken ? (
                      <button onClick={handleGoogleDisconnect} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-100">
                        Disconnect
                      </button>
                    ) : (
                      <button onClick={handleGoogleConnect} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white" style={{ backgroundColor: BRAND }}>
                        Connect Google Account
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Google Search Console ── */}
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-slate-800">Google Search Console</h3>
                    <p className="text-[12px] text-slate-400">
                      {googleToken?.gsc_connected && googleToken?.gsc_site_url
                        ? `Tracking: ${googleToken.gsc_site_url}`
                        : "Pull keyword rankings, impressions, clicks, and CTR data."}
                    </p>
                  </div>
                  {googleToken?.gsc_connected && googleToken?.gsc_site_url ? (
                    <span className="rounded-full bg-green-50 px-3 py-1 text-[11px] font-semibold text-green-600">Connected</span>
                  ) : googleToken ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-600">Select Site</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-400">Not Connected</span>
                  )}
                </div>

                {/* Site selection */}
                {googleToken && !googleToken.gsc_site_url && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <button onClick={handleLoadGscSites} disabled={gscSitesLoading} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
                        {gscSitesLoading ? "Loading..." : "Load Verified Sites"}
                      </button>
                    </div>
                    {gscSites.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[12px] font-medium text-slate-600 mb-2">Select a site to track:</p>
                        {gscSites.map((site) => (
                          <button
                            key={site.siteUrl}
                            onClick={() => handleSelectGscSite(site.siteUrl)}
                            className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[13px] hover:border-blue-300 hover:bg-blue-50"
                          >
                            <span className="text-slate-700">{site.siteUrl}</span>
                            <span className="text-[10px] text-slate-400">{site.permissionLevel}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* GSC Data */}
                {googleToken?.gsc_connected && googleToken?.gsc_site_url && (
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <button onClick={handleSyncGsc} disabled={gscSyncing} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
                        {gscSyncing ? "Syncing..." : "Sync GSC Data (30 days)"}
                      </button>
                      <button onClick={() => { handleLoadGscSites(); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50">
                        Change Site
                      </button>
                      {googleToken.updated_at && (
                        <span className="text-[11px] text-slate-400">Last sync: {new Date(googleToken.updated_at).toLocaleString()}</span>
                      )}
                    </div>

                    {gscSites.length > 0 && (
                      <div className="rounded-lg bg-slate-50 p-3 space-y-1">
                        <p className="text-[12px] font-medium text-slate-600 mb-2">Change tracked site:</p>
                        {gscSites.map((site) => (
                          <button
                            key={site.siteUrl}
                            onClick={() => handleSelectGscSite(site.siteUrl)}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[13px] ${
                              site.siteUrl === googleToken.gsc_site_url
                                ? "border-blue-300 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                            }`}
                          >
                            <span>{site.siteUrl}</span>
                            <span className="text-[10px] text-slate-400">{site.permissionLevel}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {gscPerformance.length > 0 && (
                      <div>
                        <h4 className="text-[13px] font-semibold text-slate-700 mb-2">Performance (Last 30 Days)</h4>
                        <div className="grid gap-3 sm:grid-cols-4">
                          {(() => {
                            const totals = gscPerformance.reduce(
                              (acc, r) => ({
                                clicks: acc.clicks + r.clicks,
                                impressions: acc.impressions + r.impressions,
                                ctr: acc.ctr + r.ctr,
                                position: acc.position + r.avg_position,
                              }),
                              { clicks: 0, impressions: 0, ctr: 0, position: 0 }
                            );
                            const count = gscPerformance.length;
                            return [
                              { label: "Total Clicks", value: totals.clicks.toLocaleString(), color: "#2563eb" },
                              { label: "Total Impressions", value: totals.impressions.toLocaleString(), color: "#7c3aed" },
                              { label: "Avg CTR", value: `${(totals.ctr / count * 100).toFixed(1)}%`, color: "#059669" },
                              { label: "Avg Position", value: (totals.position / count).toFixed(1), color: "#ea580c" },
                            ].map((card) => (
                              <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
                                <p className="mt-1 text-xl font-bold" style={{ color: card.color }}>{card.value}</p>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Top keywords table */}
                    {gscKeywords.length > 0 && (
                      <div>
                        <h4 className="text-[13px] font-semibold text-slate-700 mb-2">Top Keywords</h4>
                        <div className="overflow-auto rounded-lg border border-slate-200">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Keyword</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600">Clicks</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600">Impressions</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600">CTR</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600">Position</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gscKeywords.slice(0, 25).map((kw) => (
                                <tr key={kw.id} className="border-b border-slate-50 hover:bg-slate-50">
                                  <td className="px-3 py-2 text-slate-700 font-medium">{kw.keyword}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{kw.clicks}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{kw.impressions.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{(kw.ctr * 100).toFixed(1)}%</td>
                                  <td className="px-3 py-2 text-right text-slate-600">{kw.avg_position.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {gscKeywords.length > 25 && (
                          <p className="mt-1 text-[11px] text-slate-400">Showing top 25 of {gscKeywords.length} keywords</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings */}
          {activeTab === "settings" && (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-[15px] font-semibold text-slate-800">Business Details</h3>
              <div className="grid gap-3 text-[13px] sm:grid-cols-2">
                <div><span className="text-slate-400">Name:</span> <span className="ml-2 text-slate-700">{b.name}</span></div>
                <div><span className="text-slate-400">Website:</span> <span className="ml-2 text-slate-700">{b.website || "\u2014"}</span></div>
                <div><span className="text-slate-400">GMB URL:</span> <span className="ml-2 text-slate-700">{b.gmb_url || "\u2014"}</span></div>
                <div><span className="text-slate-400">City:</span> <span className="ml-2 text-slate-700">{b.city || "\u2014"}</span></div>
                <div><span className="text-slate-400">State:</span> <span className="ml-2 text-slate-700">{b.state || "\u2014"}</span></div>
                <div><span className="text-slate-400">Service Type:</span> <span className="ml-2 text-slate-700">{b.service_type || "\u2014"}</span></div>
                <div><span className="text-slate-400">Package:</span> <span className="ml-2 text-slate-700">{b.package_type || "\u2014"}</span></div>
                <div><span className="text-slate-400">Status:</span> <span className="ml-2 text-slate-700">{b.order_status}</span></div>
                <div><span className="text-slate-400">Billing:</span> <span className="ml-2 text-slate-700">{b.billing_cycle} &middot; {b.currency} {b.monthly_budget ?? "\u2014"}</span></div>
                <div><span className="text-slate-400">Started:</span> <span className="ml-2 text-slate-700">{b.start_date ? new Date(b.start_date).toLocaleDateString() : "\u2014"}</span></div>
              </div>
              {b.notes && (
                <div className="mt-3">
                  <span className="text-[13px] text-slate-400">Notes:</span>
                  <p className="mt-1 text-[13px] text-slate-600">{b.notes}</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* CLIENT PORTAL VIEW */
        <div className="space-y-5">
          {/* Client Sub Tabs */}
          <div className="flex gap-2 border-b border-slate-100 pb-2">
            {[
              { key: "goals", label: "Work Progress & Milestones", icon: "" },
              { key: "performance", label: "Organic Rankings & Traffic", icon: "" },
              { key: "audits", label: "Site Quality & Audits", icon: "" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setClientTab(tab.key as any)}
                className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-semibold transition ${
                  clientTab === tab.key
                    ? "border-[#5e6ad2] text-[#5e6ad2]"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 1. Goals Tab */}
          {clientTab === "goals" && (
            <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
              {/* Completed Milestones */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Completed Optimizations</h4>
                {doneItems === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-400 text-xs">
                    Campaign onboarding underway. Optimizations will list here.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(grouped)
                      .sort(([a], [bb]) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(bb))
                      .map(([cat, catItems]) => {
                        const catDoneItems = catItems.filter((i) => i.status === "done");
                        if (catDoneItems.length === 0) return null;
                        return (
                          <div key={cat} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-50 pb-2 mb-2">
                              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                {CAT_LABELS[cat] || cat}
                              </h5>
                              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600">
                                {catDoneItems.length} Implemented
                              </span>
                            </div>
                            <div className="space-y-2">
                              {catDoneItems.map((item) => (
                                <div key={item.id} className="flex items-start gap-2 text-xs text-slate-600">
                                  <span className="mt-0.5 text-emerald-500">✓</span>
                                  <div>
                                    <p className="font-medium text-slate-800">{item.title}</p>
                                    {item.description && <p className="text-[10px] text-slate-400 mt-0.5">{item.description}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Ongoing / Next Up */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Active Technical Work</h4>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  {totalItems - doneItems === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">All set! No pending tasks remaining.</p>
                  ) : (
                    <div className="space-y-3.5">
                      {items
                        .filter((i) => i.status !== "done" && i.status !== "skipped")
                        .slice(0, 12)
                        .map((item) => (
                          <div key={item.id} className="flex items-start gap-3 text-xs">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[8px] font-bold text-indigo-600">
                              →
                            </span>
                            <div>
                              <p className="font-semibold text-slate-800">{item.title}</p>
                              <div className="flex gap-2 mt-1 items-center">
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  {CAT_LABELS[item.category] || item.category}
                                </span>
                                {item.due_date && (
                                  <span className="text-[9px] text-slate-400">
                                    • Due {new Date(item.due_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. Performance (GSC) Tab */}
          {clientTab === "performance" && (
            <div className="space-y-5">
              {googleToken?.gsc_connected && googleToken?.gsc_site_url ? (
                <>
                  {/* KPI dashboard cards */}
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                    {(() => {
                      const totals = gscPerformance.reduce(
                        (acc, r) => ({
                          clicks: acc.clicks + r.clicks,
                          impressions: acc.impressions + r.impressions,
                          ctr: acc.ctr + r.ctr,
                          position: acc.position + r.avg_position,
                        }),
                        { clicks: 0, impressions: 0, ctr: 0, position: 0 }
                      );
                      const count = gscPerformance.length || 1;
                      return [
                        { label: "Search Clicks", value: totals.clicks.toLocaleString(), color: "#2563eb", subtitle: "Monthly Visits" },
                        { label: "Impressions", value: totals.impressions.toLocaleString(), color: "#7c3aed", subtitle: "Search Views" },
                        { label: "Average CTR", value: `${(totals.ctr / count * 105).toFixed(1)}%`, color: "#059669", subtitle: "Click Efficiency" },
                        { label: "Avg Position", value: (totals.position / count).toFixed(1), color: "#ea580c", subtitle: "Keyword Rank" },
                      ].map((card) => (
                        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{card.label}</p>
                          <p className="mt-1.5 text-2xl font-bold" style={{ color: card.color }}>{card.value}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{card.subtitle}</p>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Rank distribution / Semrush widget */}
                  {gscKeywords.length > 0 && (
                    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Rank Distribution (Semrush-style Position Metrics)</h4>
                      {(() => {
                        const top3 = gscKeywords.filter(k => k.avg_position <= 3).length;
                        const top10 = gscKeywords.filter(k => k.avg_position > 3 && k.avg_position <= 10).length;
                        const top20 = gscKeywords.filter(k => k.avg_position > 10 && k.avg_position <= 20).length;
                        const top100 = gscKeywords.filter(k => k.avg_position > 20 && k.avg_position <= 100).length;
                        const totalKws = gscKeywords.length;

                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                              { label: "Top 3 Rankings", value: top3, color: "bg-emerald-500", percent: totalKws > 0 ? (top3 / totalKws) * 100 : 0 },
                              { label: "Top 10 Rankings", value: top10, color: "bg-indigo-500", percent: totalKws > 0 ? (top10 / totalKws) * 100 : 0 },
                              { label: "Top 20 Rankings", value: top20, color: "bg-blue-500", percent: totalKws > 0 ? (top20 / totalKws) * 100 : 0 },
                              { label: "Top 100 Rankings", value: top100, color: "bg-slate-400", percent: totalKws > 0 ? (top100 / totalKws) * 100 : 0 },
                            ].map((bucket) => (
                              <div key={bucket.label} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                                <div>
                                  <p className="text-[10px] font-bold text-slate-500 uppercase">{bucket.label}</p>
                                  <p className="text-2xl font-extrabold text-slate-800 mt-1">{bucket.value} keywords</p>
                                </div>
                                <div className="mt-3">
                                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div className={`h-full ${bucket.color} rounded-full`} style={{ width: `${bucket.percent}%` }} />
                                  </div>
                                  <p className="text-[9px] text-slate-400 mt-1">{bucket.percent.toFixed(0)}% of tracked words</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </article>
                  )}

                  {/* Top keywords table */}
                  {gscKeywords.length > 0 && (
                    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Top Keyword Rankings</h4>
                      <div className="overflow-auto rounded-xl border border-slate-200/60">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                              <th className="px-4 py-2.5 text-left font-semibold">Search Term</th>
                              <th className="px-4 py-2.5 text-right font-semibold">Monthly Clicks</th>
                              <th className="px-4 py-2.5 text-right font-semibold">Impressions</th>
                              <th className="px-4 py-2.5 text-right font-semibold">CTR</th>
                              <th className="px-4 py-2.5 text-right font-semibold">Avg Position</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gscKeywords.slice(0, 15).map((kw) => (
                              <tr key={kw.id} className="border-b border-slate-50 hover:bg-slate-50 text-slate-600">
                                <td className="px-4 py-2.5 font-semibold text-slate-800">{kw.keyword}</td>
                                <td className="px-4 py-2.5 text-right">{kw.clicks}</td>
                                <td className="px-4 py-2.5 text-right">{kw.impressions.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right">{(kw.ctr * 100).toFixed(1)}%</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                                  #{kw.avg_position.toFixed(1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                  
                  <p className="mt-3 text-sm font-bold text-slate-800">Rank Tracking Awaiting Link</p>
                  <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                    To display organic positions and click metrics, connect a Google Account under the Connections tab.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 3. Audits Tab */}
          {clientTab === "audits" && (
            <div className="space-y-5">
              {/* Circle Health gauges (Semrush & BrightLocal styles) */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Semrush Site Health style */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Site Crawl Health</h5>
                    <p className="mt-2 text-sm font-bold text-slate-800">
                      {b.last_website_audit_score != null ? "Excellent Website Quality" : "Pending Audit"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Crawling diagnostics, clean URL structures, and missing meta optimizations check.
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-center justify-center">
                    <div className="relative flex items-center justify-center h-20 w-20 rounded-full border-[6px] border-slate-100" style={{ borderTopColor: b.last_website_audit_score && b.last_website_audit_score >= 80 ? "#22c55e" : "#5e6ad2" }}>
                      <span className="text-base font-extrabold text-slate-800">
                        {b.last_website_audit_score != null ? `${b.last_website_audit_score}%` : "—"}
                      </span>
                    </div>
                    <span className="text-[9px] uppercase font-bold text-[#5e6ad2] mt-1.5">Semrush Score</span>
                  </div>
                </div>

                {/* BrightLocal GMB optimization status style */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Maps Optimization</h5>
                    <p className="mt-2 text-sm font-bold text-slate-800">
                      {b.last_gmb_audit_score != null ? "Highly Optimized Maps Profile" : "Pending Local Check"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Google Maps visibility, review counts, and NAP consistency ratings.
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-center justify-center">
                    <div className="relative flex items-center justify-center h-20 w-20 rounded-full border-[6px] border-slate-100" style={{ borderTopColor: b.last_gmb_audit_score && b.last_gmb_audit_score >= 80 ? "#22c55e" : "#8b5cf6" }}>
                      <span className="text-base font-extrabold text-slate-800">
                        {b.last_gmb_audit_score != null ? `${b.last_gmb_audit_score}%` : "—"}
                      </span>
                    </div>
                    <span className="text-[9px] uppercase font-bold text-[#8b5cf6] mt-1.5">BrightLocal Index</span>
                  </div>
                </div>
              </div>

              {/* Audit history list */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Optimization Crawl Reports</h4>
                {detail.recentAudits.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Your crawl reports will print here.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {detail.recentAudits.map((a) => (
                      <div key={a.id} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{a.audit_type.toUpperCase()} Audit</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">Report generated: {new Date(a.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex gap-2 items-center">
                          {a.score != null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              a.score >= 80 ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                            }`}>
                              {a.score}%
                            </span>
                          )}
                          {a.verdict && (
                            <span className="text-[9px] uppercase font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
                              {a.verdict}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
