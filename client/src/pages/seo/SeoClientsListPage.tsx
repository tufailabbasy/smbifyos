import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchSeoClients,
  createSeoClient,
  type SeoClient,
  fetchWorkspaceOverview,
  type WorkspaceOverview,
} from "../../lib/api";

const BRAND = "#5e6ad2";

const STAGES = [
  { value: "active", label: "Active", color: "#22c55e" },
  { value: "onboarding", label: "Onboarding", color: "#3b82f6" },
  { value: "paused", label: "Paused", color: "#f59e0b" },
  { value: "retainer-risk", label: "At Risk", color: "#ef4444" },
  { value: "churned", label: "Churned", color: "#94a3b8" },
];

export function SeoClientsListPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<(SeoClient & { total_tasks: number; tasks_done: number; tasks_overdue: number; avg_audit_score?: number | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formStage, setFormStage] = useState("active");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchWorkspaceOverview()
      .then((d) => setClients(d.clients))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.primary_contact && c.primary_contact.toLowerCase().includes(q)) ||
      (c.contact_email && c.contact_email.toLowerCase().includes(q));

    const stage = (c.lifecycle_stage || "active").toLowerCase();
    const matchesStage =
      selectedStage === "all" ||
      stage === selectedStage ||
      (selectedStage === "retainer-risk" && (stage === "retainer-risk" || stage === "at_risk" || stage === "at-risk"));

    return matchesSearch && matchesStage;
  });

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const newClient = await createSeoClient({
        name: formName.trim(),
        contact_email: formEmail,
        contact_phone: formPhone,
        primary_contact: formContact,
        lifecycle_stage: formStage,
      });
      setShowForm(false);
      setFormName(""); setFormEmail(""); setFormPhone(""); setFormContact(""); setFormStage("active");
      navigate(`/seo/clients/${newClient.id}`);
    } catch { /* handled */ }
    setSaving(false);
  };

  return (
    <section className="page-enter space-y-5">
      {/* Header */}
      <header className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <Link to="/seo/dashboard" className="hover:text-slate-600" style={{ color: BRAND }}>Workspace</Link>
          <span>/</span>
          <span className="text-slate-600">Clients</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Clients</h2>
            <p className="mt-1 text-[13px] text-slate-500">{clients.length} client{clients.length !== 1 ? "s" : ""} total</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            + New Client
          </button>
        </div>
      </header>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-slate-800">New Client</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Client / Business Name *" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <input value={formContact} onChange={(e) => setFormContact(e.target.value)} placeholder="Primary Contact" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <select value={formStage} onChange={(e) => setFormStage(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
              {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleCreate} disabled={saving || !formName.trim()} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
              {saving ? "Saving..." : "Create Client"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Stage Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedStage("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              selectedStage === "all"
                ? "bg-[#5e6ad2] text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            All ({clients.length})
          </button>
          {[
            { id: "active", label: "Active", count: clients.filter((c) => (c.lifecycle_stage || "active").toLowerCase() === "active").length },
            { id: "onboarding", label: "Onboarding", count: clients.filter((c) => (c.lifecycle_stage || "").toLowerCase() === "onboarding").length },
            { id: "retainer-risk", label: "At Risk", count: clients.filter((c) => ["retainer-risk", "at_risk", "at-risk"].includes((c.lifecycle_stage || "").toLowerCase())).length },
            { id: "paused", label: "Paused", count: clients.filter((c) => (c.lifecycle_stage || "").toLowerCase() === "paused").length },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStage(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                selectedStage === tab.id
                  ? "bg-[#5e6ad2] text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="sm:w-72">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-[13px] focus:border-[#5e6ad2] focus:outline-none"
          />
        </div>
      </div>

      {/* Client Grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: BRAND }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 text-xl font-bold">
            
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-800">No SEO Clients Found</h3>
          <p className="mt-1 text-[13px] text-slate-500 max-w-md mx-auto">
            {search ? "No clients match your search query." : "Retained clients will appear here when converted from leads or created manually."}
          </p>
          {!search && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[#4e5abc]"
            >
              + Add First Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const stage = STAGES.find((s) => s.value === c.lifecycle_stage) || STAGES[0];
            const progress = c.total_tasks > 0 ? Math.round((c.tasks_done / c.total_tasks) * 100) : 0;
            return (
              <Link
                key={c.id}
                to={`/seo/clients/${c.id}`}
                className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-[#5e6ad2]/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">{c.name}</h3>
                    {c.contact_email && <p className="mt-0.5 text-[12px] text-slate-400">{c.contact_email}</p>}
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ backgroundColor: stage.color + "18", color: stage.color }}>
                    {stage.label}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-4 text-[12px] text-slate-500">
                  <span>{c.business_count} site{c.business_count !== 1 ? "s" : ""}</span>
                  {c.tasks_overdue > 0 && <span className="font-medium text-red-500">{c.tasks_overdue} overdue</span>}
                </div>

                {c.total_tasks > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Progress</span>
                      <span className="font-medium" style={{ color: BRAND }}>{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: BRAND }} />
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
