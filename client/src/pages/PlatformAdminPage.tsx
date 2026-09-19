import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader, StatCard } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/Toast";
import { createPlatformTenant, fetchPlatformSummary, fetchPlatformTenants, fetchPlatformUsers, resetPlatformUserPassword, updatePlatformTenant, updatePlatformUser, type SaaSPlan, type SaaSPlanKey, type SaaSRole, type SaaSTenant, type SaaSUser } from "../lib/api";

const ROLES: Array<{ value: Exclude<SaaSRole, "super_admin">; label: string }> = [
  { value: "admin", label: "Admin" }, { value: "manager", label: "Manager" }, { value: "member", label: "Member" }, { value: "viewer", label: "Viewer" },
];
const money = (amount: number) => amount === 0 ? "$0" : `$${amount}`;

export function PlatformAdminPage() {
  const { showToast } = useToast();
  const [summary, setSummary] = useState({ tenants: 0, activeTenants: 0, users: 0, activeUsers: 0, plans: [] as Array<{ plan: string; count: number }> });
  const [tenants, setTenants] = useState<SaaSTenant[]>([]);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [users, setUsers] = useState<SaaSUser[]>([]);
  const [tab, setTab] = useState<"workspaces"|"users">("workspaces");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SaaSUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ name: "", ownerName: "", ownerEmail: "", plan: "pro" as SaaSPlanKey });
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "member" as Exclude<SaaSRole,"super_admin">, isActive: true });

  const load = async () => {
    try {
      const [summaryResult, tenantResult, userResult] = await Promise.all([fetchPlatformSummary(), fetchPlatformTenants(), fetchPlatformUsers(search)]);
      setSummary(summaryResult); setTenants(tenantResult.items); setPlans(tenantResult.plans); setUsers(userResult.items);
    } catch (error) { showToast("error", error instanceof Error ? error.message : "Could not load platform administration"); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const timer=setTimeout(()=>{if(tab==="users") void fetchPlatformUsers(search).then((r)=>setUsers(r.items)).catch((error)=>showToast("error",error.message));},300); return()=>clearTimeout(timer); },[search,tab]);

  const createWorkspace = async () => {
    setSaving(true);
    try { const result=await createPlatformTenant(form); setCredential({email:result.owner.email,password:result.temporaryPassword}); setCreateOpen(false); setForm({name:"",ownerName:"",ownerEmail:"",plan:"pro"}); showToast("success","Workspace and owner created"); await load(); }
    catch(error){showToast("error",error instanceof Error?error.message:"Could not create workspace");}
    finally{setSaving(false);}
  };

  const changeTenant = async (tenant: SaaSTenant, changes: { plan?: SaaSPlanKey; status?: string }) => {
    try { await updatePlatformTenant(tenant.id,changes); showToast("success","Workspace updated"); await load(); }
    catch(error){showToast("error",error instanceof Error?error.message:"Could not update workspace");}
  };

  const openEdit = (member: SaaSUser) => {
    setEditTarget(member);
    setEditForm({name:member.name,email:member.email,role:member.workspace_role||(member.role==="super_admin"?"admin":member.role),isActive:Boolean(member.is_active)});
  };

  const saveUser = async () => {
    if(!editTarget) return;
    setSaving(true);
    try {
      const protectedOwner=editTarget.role==="super_admin";
      await updatePlatformUser(editTarget.id,{name:editForm.name,email:editForm.email,...(protectedOwner?{}:{role:editForm.role,isActive:editForm.isActive})});
      showToast("success","Existing user updated"); setEditTarget(null); await load();
    } catch(error){showToast("error",error instanceof Error?error.message:"Could not update user");}
    finally{setSaving(false);}
  };

  const resetPassword = async (member:SaaSUser) => {
    try { const result=await resetPlatformUserPassword(member.id); setCredential({email:member.email,password:result.temporaryPassword}); showToast("success","Temporary password generated"); }
    catch(error){showToast("error",error instanceof Error?error.message:"Could not reset password");}
  };

  const planCounts = useMemo(()=>Object.fromEntries(summary.plans.map((item)=>[item.plan,item.count])),[summary.plans]);

  return <div className="space-y-6">
    <PageHeader title="Platform administration" description="Manage every customer workspace, subscription plan and user account." badge={<Badge variant="danger">Super admin</Badge>} actions={<Button onClick={()=>setCreateOpen(true)}>Create workspace</Button>} />

    <div className="grid gap-3 md:grid-cols-4">
      {[{title:"Workspace",text:"One customer company with separate data and settings."},{title:"User",text:"One person with a unique email login inside a workspace."},{title:"Role",text:"Controls what that person may view or change."},{title:"Plan",text:"Controls price, seats, leads and workflow limits."}].map((item)=><div key={item.title} className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.text}</p></div>)}
    </div>

    {credential && <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-indigo-950">Temporary user login</p><p className="mt-1 font-mono text-xs text-indigo-900">{credential.email} · {credential.password}</p><p className="mt-1 text-xs text-indigo-700">Copy it now and share it securely.</p></div><Button size="sm" variant="outline" onClick={()=>navigator.clipboard.writeText(`${credential.email}\n${credential.password}`)}>Copy login</Button></div></div>}

    <div className="grid gap-4 md:grid-cols-4"><StatCard label="Workspaces" value={summary.tenants} description={`${summary.activeTenants} active`} color="indigo"/><StatCard label="Users" value={summary.users} description={`${summary.activeUsers} able to sign in`} color="emerald"/><StatCard label="Growth plans" value={planCounts.pro||0} description="$49/month workspaces" color="sky"/><StatCard label="Agency plans" value={planCounts.enterprise||0} description="$149/month workspaces" color="violet"/></div>

    <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit"><button onClick={()=>setTab("workspaces")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab==="workspaces"?"bg-slate-900 text-white":"text-slate-500 hover:bg-slate-50"}`}>Workspaces</button><button onClick={()=>setTab("users")} className={`rounded-lg px-4 py-2 text-xs font-semibold ${tab==="users"?"bg-slate-900 text-white":"text-slate-500 hover:bg-slate-50"}`}>All users</button></div>

    {tab==="workspaces" ? <Card><CardHeader title="Customer workspaces" subtitle="Plan and access changes take effect immediately."/><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Workspace</th><th className="px-4 py-3">Active users</th><th className="px-4 py-3">Plan & price</th><th className="px-4 py-3">Status</th><th className="px-5 py-3">Created</th></tr></thead><tbody className="divide-y divide-slate-100">{tenants.map((tenant)=>{const tenantPlan=plans.find((item)=>item.key===tenant.subscription_plan);return <tr key={tenant.id} className="hover:bg-slate-50/60"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{tenant.name}</p><p className="font-mono text-[10px] text-slate-400">{tenant.id}</p></td><td className="px-4 py-4"><span className="font-semibold text-slate-900">{tenant.active_user_count}</span><span className="text-slate-400"> / {tenant.user_count} total</span></td><td className="px-4 py-4"><select value={tenant.subscription_plan} onChange={(e)=>void changeTenant(tenant,{plan:e.target.value as SaaSPlanKey})} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium">{plans.map((plan)=><option key={plan.key} value={plan.key}>{plan.name} — {money(plan.pricing.monthly)}/mo</option>)}</select><p className="mt-1 text-[10px] text-slate-400">{tenantPlan?.limits.users===-1?"Unlimited":tenantPlan?.limits.users} active users</p></td><td className="px-4 py-4"><select value={tenant.billing_status} onChange={(e)=>void changeTenant(tenant,{status:e.target.value})} className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${tenant.billing_status==="active"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-amber-200 bg-amber-50 text-amber-700"}`}><option value="active">Active</option><option value="suspended">Suspended</option><option value="past_due">Past due</option><option value="canceled">Canceled</option></select></td><td className="px-5 py-4 text-xs text-slate-500">{new Date(tenant.created_at).toLocaleDateString()}</td></tr>})}</tbody></table></div></Card> : <Card><CardHeader title="Platform users" subtitle="Search and edit old or new users across every workspace." action={<input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search name, email or workspace…" className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-xs"/>}/><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map((member)=><tr key={member.id} className="hover:bg-slate-50/60"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{member.name}</p><p className="text-xs text-slate-500">{member.email}</p></td><td className="px-4 py-4 text-xs text-slate-600">{member.tenant_name}</td><td className="px-4 py-4"><Badge variant={member.role==="super_admin"?"danger":"neutral"}>{member.role==="super_admin"?"Platform owner":member.role}</Badge></td><td className="px-4 py-4 text-xs font-medium text-slate-600">{plans.find((item)=>item.key===member.subscription_plan)?.name||member.subscription_plan}</td><td className="px-4 py-4"><Badge variant={member.is_active?"success":"danger"} dot>{member.is_active?"Can sign in":"Disabled"}</Badge></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button size="xs" variant="outline" onClick={()=>openEdit(member)}>Edit</Button><Button size="xs" variant="ghost" onClick={()=>void resetPassword(member)}>Reset password</Button></div></td></tr>)}</tbody></table></div></Card>}

    <Card><CardHeader title="Plans & pricing" subtitle="Flat workspace pricing in USD. Yearly pricing includes two months free."/><CardBody className="grid gap-4 md:grid-cols-3">{plans.map((plan)=><div key={plan.key} className="rounded-2xl border border-slate-200 p-5"><div className="flex items-start justify-between"><div><p className="font-bold text-slate-950">{plan.name}</p><p className="mt-1 text-2xl font-black text-slate-950">{money(plan.pricing.monthly)}<span className="text-xs font-medium text-slate-500"> / month</span></p></div><Badge variant={plan.key==="enterprise"?"brand":"neutral"}>{plan.key}</Badge></div><p className="mt-2 text-xs leading-5 text-slate-500">{plan.description}</p><div className="mt-4 space-y-2 text-xs text-slate-700"><p><b>{plan.limits.users===-1?"Unlimited":plan.limits.users}</b> active users</p><p><b>{plan.limits.leads===-1?"Unlimited":plan.limits.leads}</b> leads</p><p><b>{plan.limits.activeCampaigns===-1?"Unlimited":plan.limits.activeCampaigns}</b> active campaigns</p><p>Automation: <b>{plan.features.automation?"Included":"Not included"}</b></p><p><b>{money(plan.pricing.yearly)}</b> billed yearly</p></div></div>)}</CardBody></Card>

    {createOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-950">Create customer workspace</h2><p className="mt-1 text-sm text-slate-500">Creates the organization and its first admin account.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700 sm:col-span-2">Organization name<input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-700">Owner name<input value={form.ownerName} onChange={(e)=>setForm({...form,ownerName:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-700">Owner email<input type="email" value={form.ownerEmail} onChange={(e)=>setForm({...form,ownerEmail:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-700 sm:col-span-2">Initial plan<select value={form.plan} onChange={(e)=>setForm({...form,plan:e.target.value as SaaSPlanKey})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">{plans.map((plan)=><option key={plan.key} value={plan.key}>{plan.name} — {money(plan.pricing.monthly)}/month</option>)}</select></label></div><div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={()=>setCreateOpen(false)}>Cancel</Button><Button loading={saving} disabled={!form.name||!form.ownerName||!form.ownerEmail} onClick={()=>void createWorkspace()}>Create workspace</Button></div></div></div>}

    {editTarget&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-lg font-bold text-slate-950">Edit existing user</h2><p className="mt-1 text-sm text-slate-500">Changes apply immediately to {editTarget.tenant_name}.</p><div className="mt-5 space-y-4"><label className="block text-xs font-semibold text-slate-700">Full name<input value={editForm.name} onChange={(e)=>setEditForm({...editForm,name:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="block text-xs font-semibold text-slate-700">Login email<input type="email" value={editForm.email} onChange={(e)=>setEditForm({...editForm,email:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label><label className="block text-xs font-semibold text-slate-700">Workspace role<select value={editForm.role} disabled={editTarget.role==="super_admin"} onChange={(e)=>setEditForm({...editForm,role:e.target.value as typeof editForm.role})} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm disabled:bg-slate-100">{ROLES.map((role)=><option key={role.value} value={role.value}>{role.label}</option>)}</select></label><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={editForm.isActive} disabled={editTarget.role==="super_admin"} onChange={(e)=>setEditForm({...editForm,isActive:e.target.checked})} className="mt-0.5"/><span><span className="block text-xs font-semibold text-slate-800">Allow this user to sign in</span><span className="mt-1 block text-xs text-slate-500">Turn this off to block access without deleting history.</span></span></label>{editTarget.role==="super_admin"&&<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">The platform owner's role and sign-in status are protected. Name, email and password can still be updated.</p>}</div><div className="mt-6 flex justify-between gap-2"><Button variant="outline" onClick={()=>void resetPassword(editTarget)}>Reset password</Button><div className="flex gap-2"><Button variant="ghost" onClick={()=>setEditTarget(null)}>Cancel</Button><Button loading={saving} disabled={!editForm.name.trim()||!editForm.email.trim()} onClick={()=>void saveUser()}>Save changes</Button></div></div></div></div>}
  </div>;
}