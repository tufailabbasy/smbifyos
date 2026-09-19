import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, StatCard } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { createWorkspaceUser, deleteWorkspaceUser, fetchWorkspacePlan, fetchWorkspaceUsers, resetWorkspaceUserPassword, updateWorkspaceUser, type SaaSPlan, type SaaSRole, type SaaSUser } from "../lib/api";

const ROLES: Array<{ value: Exclude<SaaSRole, "super_admin">; label: string; note: string }> = [
  { value: "admin", label: "Admin", note: "Full workspace, integrations and user control" },
  { value: "manager", label: "Manager", note: "Leads, audits, outreach and automation" },
  { value: "member", label: "Member", note: "Daily lead, audit and outreach work" },
  { value: "viewer", label: "Viewer", note: "Read-only operational access" },
];

export function UserManagementPage() {
  const { user: currentUser, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<SaaSUser[]>([]);
  const [plan, setPlan] = useState<SaaSPlan | null>(null);
  const [seatUsage, setSeatUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SaaSUser | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "member" as Exclude<SaaSRole, "super_admin"> });

  const load = async () => {
    setLoading(true);
    try {
      const [usersResult, planResult] = await Promise.all([fetchWorkspaceUsers(), fetchWorkspacePlan()]);
      setUsers(usersResult.items); setPlan(planResult.plan); setSeatUsage(planResult.seatUsage);
    } catch (error) { showToast("error", error instanceof Error ? error.message : "Could not load workspace users"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const seatLimit = plan?.limits.users ?? 1;
  const seatPercent = seatLimit === -1 ? 25 : Math.min(100, Math.round((seatUsage / Math.max(1, seatLimit)) * 100));
  const canAdd = seatLimit === -1 || seatUsage < seatLimit;
  const activeUsers = useMemo(() => users.filter((item) => Boolean(item.is_active)).length, [users]);

  const createUser = async () => {
    setSaving(true);
    try {
      const result = await createWorkspaceUser(form);
      setCredential({ email: result.user.email, password: result.temporaryPassword });
      setForm({ name: "", email: "", role: "member" }); setCreateOpen(false);
      showToast("success", "User created and access is ready"); await load();
    } catch (error) { showToast("error", error instanceof Error ? error.message : "Could not create user"); }
    finally { setSaving(false); }
  };

  const updateUser = async (target: SaaSUser, changes: { role?: Exclude<SaaSRole, "super_admin">; isActive?: boolean }) => {
    try { await updateWorkspaceUser(target.id, changes); showToast("success", "User access updated"); await load(); if (target.id === currentUser?.id) await refreshProfile(); }
    catch (error) { showToast("error", error instanceof Error ? error.message : "Could not update user"); }
  };

  const resetPassword = async (target: SaaSUser) => {
    try { const result = await resetWorkspaceUserPassword(target.id); setCredential({ email: target.email, password: result.temporaryPassword }); showToast("success", "Temporary password generated"); }
    catch (error) { showToast("error", error instanceof Error ? error.message : "Could not reset password"); }
  };

  return <div className="space-y-6">
    <PageHeader title="Team & access" description="Manage workspace users, roles and plan-based seat limits from one place." badge={<Badge variant="brand">{plan?.name || "Plan"}</Badge>} actions={<Button onClick={() => setCreateOpen(true)} disabled={!canAdd}>Add user</Button>} />

    {credential && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Temporary login created</p><p className="mt-1 font-mono text-xs">{credential.email} · {credential.password}</p><p className="mt-1 text-xs text-emerald-700">Copy this now and share it securely. It is only displayed in this session.</p></div><Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`${credential.email}\n${credential.password}`)}>Copy login</Button></div></div>}

    <div className="grid gap-4 md:grid-cols-3">
      <StatCard label="Active users" value={activeUsers} description="Enabled workspace accounts" color="indigo" />
      <StatCard label="Available seats" value={seatLimit === -1 ? "Unlimited" : Math.max(0, seatLimit - seatUsage)} description={`${seatUsage} currently used`} color="emerald" />
      <StatCard label="Plan" value={plan?.name || "—"} description={plan?.description} color="violet" />
    </div>

    <Card><CardHeader title="Seat usage" subtitle={seatLimit === -1 ? "Your Agency plan has unlimited seats." : `${seatUsage} of ${seatLimit} seats are active.`} /><CardBody><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${seatPercent}%` }} /></div>{!canAdd && <p className="mt-3 text-xs font-medium text-amber-700">Your current plan seat limit is reached. A platform administrator can change the workspace plan.</p>}</CardBody></Card>

    <Card><CardHeader title="Workspace users" subtitle="Permissions are enforced by both the interface and API." /><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last login</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Loading users…</td></tr> : users.map((member) => <tr key={member.id} className="hover:bg-slate-50/60"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">{member.name.slice(0,2).toUpperCase()}</div><div><p className="font-semibold text-slate-900">{member.name}{member.id === currentUser?.id && <span className="ml-2 text-[10px] font-medium text-indigo-600">YOU</span>}</p><p className="text-xs text-slate-500">{member.email}</p></div></div></td><td className="px-4 py-4"><select value={member.role === "super_admin" ? "admin" : member.role} disabled={member.id === currentUser?.id || member.role === "super_admin"} onChange={(event) => void updateUser(member, { role: event.target.value as Exclude<SaaSRole,"super_admin"> })} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700">{ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></td><td className="px-4 py-4"><Badge variant={member.is_active ? "success" : "danger"} dot>{member.is_active ? "Active" : "Disabled"}</Badge></td><td className="px-4 py-4 text-xs text-slate-500">{member.last_login_at ? new Date(member.last_login_at).toLocaleString() : "Never"}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button size="xs" variant="ghost" onClick={() => void resetPassword(member)}>Reset password</Button>{member.id !== currentUser?.id && member.role !== "super_admin" && <><Button size="xs" variant="outline" onClick={() => void updateUser(member, { isActive: !Boolean(member.is_active) })}>{member.is_active ? "Disable" : "Enable"}</Button><Button size="xs" variant="ghost" className="text-rose-600" onClick={() => setDeleteTarget(member)}>Remove</Button></>}</div></td></tr>)}</tbody></table></div></Card>

    <Card><CardHeader title="Role capabilities" subtitle="Use the lowest role that matches each team member's responsibilities." /><CardBody className="grid gap-3 md:grid-cols-2">{ROLES.map((role) => <div key={role.value} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="font-semibold text-slate-900">{role.label}</p><Badge>{role.value}</Badge></div><p className="mt-2 text-xs leading-5 text-slate-500">{role.note}</p></div>)}</CardBody></Card>

    {createOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-950">Add workspace user</h2><p className="mt-1 text-sm text-slate-500">A secure temporary password will be generated automatically.</p><div className="mt-5 space-y-4"><label className="block text-xs font-semibold text-slate-700">Full name<input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Email address<input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Role<select value={form.role} onChange={(e)=>setForm({...form,role:e.target.value as typeof form.role})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{ROLES.map((role)=><option key={role.value} value={role.value}>{role.label} — {role.note}</option>)}</select></label></div><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button loading={saving} disabled={!form.name.trim() || !form.email.trim()} onClick={()=>void createUser()}>Create user</Button></div></div></div>}
    <ConfirmModal isOpen={Boolean(deleteTarget)} title="Remove user?" message={`${deleteTarget?.name || "This user"} will immediately lose workspace access.`} confirmLabel="Remove user" destructive onCancel={()=>setDeleteTarget(null)} onConfirm={()=>{const target=deleteTarget;setDeleteTarget(null);if(target) void deleteWorkspaceUser(target.id).then(()=>{showToast("success","User removed");return load();}).catch((error)=>showToast("error",error.message));}} />
  </div>;
}
