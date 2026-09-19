import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, StatCard } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { ConfirmModal } from "../components/ConfirmModal";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { createWorkspaceUser, deleteWorkspaceUser, fetchWorkspacePlan, fetchWorkspaceUsers, resetWorkspaceUserPassword, updateWorkspaceUser, type SaaSPlan, type SaaSRole, type SaaSUser } from "../lib/api";

const ROLES: Array<{ value: Exclude<SaaSRole, "super_admin">; label: string; note: string; access: string }> = [
  { value: "admin", label: "Admin", note: "Runs this workspace and manages its team.", access: "Everything in the workspace, including users, settings and integrations" },
  { value: "manager", label: "Manager", note: "Leads day-to-day acquisition work.", access: "Leads, audits, outreach and automations; no users or workspace settings" },
  { value: "member", label: "Member", note: "Works assigned leads and outreach.", access: "Leads, audits and outreach; no automations, users or settings" },
  { value: "viewer", label: "Viewer", note: "Observes results without making changes.", access: "Read-only dashboard and lead access" },
];

const money = (amount: number) => amount === 0 ? "$0" : `$${amount}`;

export function UserManagementPage() {
  const { user: currentUser, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<SaaSUser[]>([]);
  const [plan, setPlan] = useState<SaaSPlan | null>(null);
  const [catalog, setCatalog] = useState<SaaSPlan[]>([]);
  const [seatUsage, setSeatUsage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SaaSUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SaaSUser | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "member" as Exclude<SaaSRole, "super_admin"> });
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "member" as Exclude<SaaSRole, "super_admin">, isActive: true });

  const load = async () => {
    setLoading(true);
    try {
      const [usersResult, planResult] = await Promise.all([fetchWorkspaceUsers(), fetchWorkspacePlan()]);
      setUsers(usersResult.items); setPlan(planResult.plan); setCatalog(planResult.catalog); setSeatUsage(planResult.seatUsage);
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

  const openEdit = (member: SaaSUser) => {
    setEditTarget(member);
    setEditForm({ name: member.name, email: member.email, role: member.workspace_role || (member.role === "super_admin" ? "admin" : member.role), isActive: Boolean(member.is_active) });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const locksAccess = editTarget.id === currentUser?.id || editTarget.role === "super_admin";
      await updateWorkspaceUser(editTarget.id, { name: editForm.name, email: editForm.email, ...(locksAccess ? {} : { role: editForm.role, isActive: editForm.isActive }) });
      showToast("success", "User details and access updated"); setEditTarget(null); await load();
      if (editTarget.id === currentUser?.id) await refreshProfile();
    } catch (error) { showToast("error", error instanceof Error ? error.message : "Could not update user"); }
    finally { setSaving(false); }
  };

  const resetPassword = async (target: SaaSUser) => {
    try { const result = await resetWorkspaceUserPassword(target.id); setCredential({ email: target.email, password: result.temporaryPassword }); showToast("success", "Temporary password generated"); }
    catch (error) { showToast("error", error instanceof Error ? error.message : "Could not reset password"); }
  };

  return <div className="space-y-6">
    <PageHeader title="Team & access" description="Give each person their own login and control exactly what they can do." badge={<Badge variant="brand">{plan?.name || "Plan"}</Badge>} actions={<Button onClick={() => setCreateOpen(true)} disabled={!canAdd}>Add user</Button>} />

    <div className="grid gap-3 md:grid-cols-4">
      {[{title:"User",text:"A person with their own email and password."},{title:"Seat",text:"Each active user uses one seat from your plan."},{title:"Role",text:"Controls which pages and actions that user can access."},{title:"Disabled",text:"Cannot sign in and does not use an active seat."}].map((item)=><div key={item.title} className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.text}</p></div>)}
    </div>

    {credential && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Temporary login ready</p><p className="mt-1 font-mono text-xs">{credential.email} · {credential.password}</p><p className="mt-1 text-xs text-emerald-700">Copy and share it securely. Resetting creates a new password immediately.</p></div><Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`${credential.email}\n${credential.password}`)}>Copy login</Button></div></div>}

    <div className="grid gap-4 md:grid-cols-3">
      <StatCard label="Active users" value={activeUsers} description="People who can sign in" color="indigo" />
      <StatCard label="Available seats" value={seatLimit === -1 ? "Unlimited" : Math.max(0, seatLimit - seatUsage)} description={`${seatUsage} active seat${seatUsage === 1 ? "" : "s"} used`} color="emerald" />
      <StatCard label="Current plan" value={plan?.name || "—"} description={plan ? `${money(plan.pricing.monthly)}/month · ${money(plan.pricing.yearly)}/year` : ""} color="violet" />
    </div>

    <Card><CardHeader title="Seat usage" subtitle={seatLimit === -1 ? "Your Agency plan includes unlimited active users." : `${seatUsage} of ${seatLimit} active-user seats are in use.`} /><CardBody><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${seatPercent}%` }} /></div>{!canAdd && <p className="mt-3 text-xs font-medium text-amber-700">Seat limit reached. Disable an unused account or ask the platform owner to change this workspace plan.</p>}</CardBody></Card>

    <Card><CardHeader title="Workspace users" subtitle="Use Edit to change an existing user's name, email, role or login status." /><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last login</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">Loading users…</td></tr> : users.map((member) => <tr key={member.id} className="hover:bg-slate-50/60"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-white">{member.name.slice(0,2).toUpperCase()}</div><div><p className="font-semibold text-slate-900">{member.name}{member.id === currentUser?.id && <span className="ml-2 text-[10px] font-medium text-indigo-600">YOU</span>}</p><p className="text-xs text-slate-500">{member.email}</p></div></div></td><td className="px-4 py-4"><Badge variant={member.role === "super_admin" ? "danger" : "neutral"}>{member.role === "super_admin" ? "Platform owner" : ROLES.find((role)=>role.value===member.role)?.label || member.role}</Badge></td><td className="px-4 py-4"><Badge variant={member.is_active ? "success" : "danger"} dot>{member.is_active ? "Can sign in" : "Disabled"}</Badge></td><td className="px-4 py-4 text-xs text-slate-500">{member.last_login_at ? new Date(member.last_login_at).toLocaleString() : "Never"}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button size="xs" variant="outline" onClick={() => openEdit(member)}>Edit</Button><Button size="xs" variant="ghost" onClick={() => void resetPassword(member)}>Reset password</Button>{member.id !== currentUser?.id && member.role !== "super_admin" && <Button size="xs" variant="ghost" className="text-rose-600" onClick={() => setDeleteTarget(member)}>Remove</Button>}</div></td></tr>)}</tbody></table></div></Card>

    <Card><CardHeader title="What each role means" subtitle="Roles affect access. Plans affect limits such as seats and lead volume." /><CardBody className="grid gap-3 md:grid-cols-2">{ROLES.map((role) => <div key={role.value} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="font-semibold text-slate-900">{role.label}</p><Badge>{role.value}</Badge></div><p className="mt-2 text-xs font-medium text-slate-700">{role.note}</p><p className="mt-1 text-xs leading-5 text-slate-500">{role.access}</p></div>)}</CardBody></Card>

    <Card><CardHeader title="Plans & pricing" subtitle="Flat workspace pricing in USD. Yearly pricing includes two months free." /><CardBody className="grid gap-4 md:grid-cols-3">{catalog.map((item)=><div key={item.key} className={`rounded-2xl border p-5 ${item.key===plan?.key?"border-indigo-300 bg-indigo-50/40":"border-slate-200"}`}><div className="flex items-start justify-between"><div><p className="font-bold text-slate-950">{item.name}</p><p className="mt-1 text-2xl font-black text-slate-950">{money(item.pricing.monthly)}<span className="text-xs font-medium text-slate-500"> / month</span></p></div>{item.key===plan?.key&&<Badge variant="brand">Current</Badge>}</div><p className="mt-3 text-xs leading-5 text-slate-500">{item.description}</p><div className="mt-4 space-y-1.5 text-xs text-slate-700"><p><b>{item.limits.users===-1?"Unlimited":item.limits.users}</b> active users</p><p><b>{item.limits.leads===-1?"Unlimited":item.limits.leads}</b> leads</p><p><b>{item.limits.activeCampaigns===-1?"Unlimited":item.limits.activeCampaigns}</b> active campaigns</p><p><b>{money(item.pricing.yearly)}</b> billed yearly</p></div></div>)}</CardBody></Card>

    {createOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-950">Add workspace user</h2><p className="mt-1 text-sm text-slate-500">Creates a separate login and uses one active seat.</p><div className="mt-5 space-y-4"><label className="block text-xs font-semibold text-slate-700">Full name<input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Email address<input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Role<select value={form.role} onChange={(e)=>setForm({...form,role:e.target.value as typeof form.role})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{ROLES.map((role)=><option key={role.value} value={role.value}>{role.label} — {role.note}</option>)}</select></label></div><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button loading={saving} disabled={!form.name.trim() || !form.email.trim()} onClick={()=>void createUser()}>Create user</Button></div></div></div>}

    {editTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-950">Edit {editTarget.name}</h2><p className="mt-1 text-sm text-slate-500">Update identity and access for this existing account.</p><div className="mt-5 space-y-4"><label className="block text-xs font-semibold text-slate-700">Full name<input value={editForm.name} onChange={(e)=>setEditForm({...editForm,name:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Login email<input type="email" value={editForm.email} onChange={(e)=>setEditForm({...editForm,email:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block text-xs font-semibold text-slate-700">Role<select value={editForm.role} disabled={editTarget.id===currentUser?.id||editTarget.role==="super_admin"} onChange={(e)=>setEditForm({...editForm,role:e.target.value as typeof editForm.role})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-100">{ROLES.map((role)=><option key={role.value} value={role.value}>{role.label} — {role.note}</option>)}</select></label><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={editForm.isActive} disabled={editTarget.id===currentUser?.id||editTarget.role==="super_admin"} onChange={(e)=>setEditForm({...editForm,isActive:e.target.checked})} className="mt-0.5"/><span><span className="block text-xs font-semibold text-slate-800">Allow this user to sign in</span><span className="mt-1 block text-xs text-slate-500">Disabled users lose access immediately and stop using an active seat.</span></span></label>{(editTarget.id===currentUser?.id||editTarget.role==="super_admin")&&<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">For safety, you can edit this account's name and email here, but its role and status are protected.</p>}</div><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={()=>setEditTarget(null)}>Cancel</Button><Button loading={saving} disabled={!editForm.name.trim()||!editForm.email.trim()} onClick={()=>void saveEdit()}>Save changes</Button></div></div></div>}

    <ConfirmModal isOpen={Boolean(deleteTarget)} title="Remove user?" message={`${deleteTarget?.name || "This user"} will immediately lose workspace access.`} confirmLabel="Remove user" destructive onCancel={()=>setDeleteTarget(null)} onConfirm={()=>{const target=deleteTarget;setDeleteTarget(null);if(target) void deleteWorkspaceUser(target.id).then(()=>{showToast("success","User removed");return load();}).catch((error)=>showToast("error",error.message));}} />
  </div>;
}