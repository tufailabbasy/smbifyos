import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchChecklistTemplates,
  createChecklistTemplate,
  updateChecklistTemplate,
  type ChecklistTemplate,
} from "../../lib/api";

const BRAND = "#5e6ad2";

const CATEGORIES = ["setup", "on-page", "technical", "local", "content", "off-page", "monthly"];
const CAT_LABELS: Record<string, string> = {
  setup: "Setup & Foundation",
  "on-page": "On-Page SEO",
  technical: "Technical SEO",
  local: "Local SEO",
  content: "Content",
  "off-page": "Off-Page / Links",
  monthly: "Monthly Tasks",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#2563eb",
  low: "#64748b",
};

export function SeoChecklistTemplatesPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(CATEGORIES));

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCat, setFormCat] = useState("setup");
  const [formPriority, setFormPriority] = useState("medium");
  const [formRecurring, setFormRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchChecklistTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleCat = (c: string) => {
    const next = new Set(openCats);
    if (next.has(c)) next.delete(c); else next.add(c);
    setOpenCats(next);
  };

  const handleAdd = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      await createChecklistTemplate({
        title: formTitle.trim(),
        description: formDesc || undefined,
        category: formCat,
        default_priority: formPriority,
        is_recurring: formRecurring ? 1 : 0,
        recurrence_interval: formRecurring ? "monthly" : undefined,
      } as any);
      setFormTitle(""); setFormDesc(""); setFormRecurring(false); setShowForm(false);
      load();
    } catch { /* handled */ }
    setSaving(false);
  };

  const handleToggleActive = async (tpl: ChecklistTemplate) => {
    await updateChecklistTemplate(tpl.id, { is_active: tpl.is_active ? 0 : 1 } as any);
    load();
  };

  const grouped: Record<string, ChecklistTemplate[]> = {};
  for (const tpl of templates) {
    if (!grouped[tpl.category]) grouped[tpl.category] = [];
    grouped[tpl.category].push(tpl);
  }

  return (
    <section className="page-enter space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <Link to="/seo/dashboard" style={{ color: BRAND }}>Workspace</Link>
          <span>/</span>
          <span className="text-slate-600">SEO Playbook</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">SEO Checklist Playbook</h2>
            <p className="mt-1 text-[13px] text-slate-500">Master list of SEO tasks. These templates are used when generating checklists for businesses.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white" style={{ backgroundColor: BRAND }}>
            + Add Template
          </button>
        </div>
      </header>

      {showForm && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-slate-800">New Template</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Task Title *" className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <select value={formCat} onChange={(e) => setFormCat(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
              {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Description" className="sm:col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <label className="flex items-center gap-2 text-[13px] text-slate-600">
              <input type="checkbox" checked={formRecurring} onChange={(e) => setFormRecurring(e.target.checked)} className="rounded" />
              Monthly Recurring
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleAdd} disabled={saving || !formTitle.trim()} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
              {saving ? "Saving..." : "Add Template"}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] text-slate-600">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: BRAND }} />
        </div>
      ) : (
        CATEGORIES.map((cat) => {
          const catTemplates = grouped[cat] || [];
          if (catTemplates.length === 0) return null;
          const isOpen = openCats.has(cat);
          return (
            <div key={cat} className="rounded-lg border border-slate-200 bg-white">
              <button onClick={() => toggleCat(cat)} className="flex w-full items-center justify-between px-5 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[14px]">{isOpen ? "\u25bc" : "\u25b6"}</span>
                  <h3 className="text-[14px] font-semibold text-slate-800">{CAT_LABELS[cat]}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{catTemplates.length}</span>
                </div>
              </button>

              {isOpen && (
                <div className="divide-y divide-slate-50 border-t border-slate-100">
                  {catTemplates.map((tpl) => (
                    <div key={tpl.id} className={`flex items-center gap-3 px-5 py-3 ${!tpl.is_active ? "opacity-40" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-slate-800">{tpl.title}</p>
                        {tpl.description && <p className="mt-0.5 text-[11px] text-slate-400">{tpl.description}</p>}
                      </div>
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ color: PRIORITY_COLORS[tpl.default_priority] || PRIORITY_COLORS.medium }}>
                        {tpl.default_priority}
                      </span>
                      {tpl.is_recurring ? (
                        <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-600">Monthly</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400">One-time</span>
                      )}
                      <button onClick={() => handleToggleActive(tpl)} className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium ${tpl.is_active ? "border-slate-200 text-slate-400 hover:text-red-500" : "border-green-200 text-green-500 hover:bg-green-50"}`}>
                        {tpl.is_active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
