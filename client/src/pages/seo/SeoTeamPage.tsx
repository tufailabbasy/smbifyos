import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  type TeamMember,
} from "../../lib/api";

const BRAND = "#5e6ad2";
const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "specialist", label: "SEO Specialist" },
  { value: "client", label: "Client" },
];
const COLORS = ["#5e6ad2", "#ef4444", "#22c55e", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

export function SeoTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  // Form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("specialist");
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchTeamMembers()
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const resetForm = () => { setName(""); setEmail(""); setRole("specialist"); setColor(COLORS[0]); setEditing(null); };

  const startEdit = (m: TeamMember) => {
    setEditing(m);
    setName(m.name);
    setEmail(m.email || "");
    setRole(m.role);
    setColor(m.avatar_color || COLORS[0]);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateTeamMember(editing.id, { name: name.trim(), email: email || undefined, role, avatar_color: color } as any);
      } else {
        await createTeamMember({ name: name.trim(), email: email || undefined, role, avatar_color: color });
      }
      resetForm();
      load();
    } catch { /* handled */ }
    setSaving(false);
  };

  const handleDeactivate = async (id: string) => {
    await deleteTeamMember(id);
    load();
  };

  const handleReactivate = async (id: string) => {
    await updateTeamMember(id, { is_active: 1 } as any);
    load();
  };

  const activeMembers = members.filter((m) => m.is_active);
  const inactiveMembers = members.filter((m) => !m.is_active);

  return (
    <section className="page-enter space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <Link to="/seo/dashboard" style={{ color: BRAND }}>Workspace</Link>
          <span>/</span>
          <span className="text-slate-600">Team</span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Team Members</h2>
        <p className="mt-1 text-[13px] text-slate-500">Manage your team — assign tasks and track workload.</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        {/* Form */}
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-[14px] font-semibold text-slate-800">{editing ? "Edit Member" : "Add Team Member"}</h3>
          <div className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name *" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] focus:border-[#5e6ad2] focus:outline-none">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div>
              <p className="mb-1 text-[12px] text-slate-400">Avatar Color</p>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 transition ${color === c ? "border-slate-800 scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={handleSave} disabled={saving || !name.trim()} className="rounded-lg px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" style={{ backgroundColor: BRAND }}>
              {saving ? "Saving..." : editing ? "Update" : "Add Member"}
            </button>
            {editing && (
              <button onClick={resetForm} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] text-slate-600">Cancel</button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200" style={{ borderTopColor: BRAND }} />
            </div>
          ) : (
            <>
              {activeMembers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <p className="text-[13px] text-slate-400">No team members yet. Add your first team member.</p>
                </div>
              ) : (
                activeMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white" style={{ backgroundColor: m.avatar_color || BRAND }}>
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-slate-800">{m.name}</p>
                      <p className="text-[12px] text-slate-400">
                        {ROLES.find((r) => r.value === m.role)?.label || m.role}
                        {m.email && <span> &middot; {m.email}</span>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(m)} className="rounded border border-slate-200 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-50">Edit</button>
                      <button onClick={() => handleDeactivate(m.id)} className="rounded border border-slate-200 px-3 py-1 text-[11px] text-red-400 hover:bg-red-50">Deactivate</button>
                    </div>
                  </div>
                ))
              )}

              {inactiveMembers.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Inactive</p>
                  {inactiveMembers.map((m) => (
                    <div key={m.id} className="flex items-center gap-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 opacity-60">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[12px] font-bold text-white">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-slate-500">{m.name}</p>
                      </div>
                      <button onClick={() => handleReactivate(m.id)} className="rounded border border-slate-200 px-3 py-1 text-[11px] text-green-500 hover:bg-green-50">Reactivate</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
