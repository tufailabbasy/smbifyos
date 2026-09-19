import { useEffect, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { IconCheckCircle, IconClock, IconExternalLink, IconPlus } from "../components/ui/Icons";
import { createLeadMeeting, fetchLeadMeetings, updateLeadMeetingStatus, type LeadMeeting } from "../lib/api";

export function MeetingsPage() {
  const [items,setItems]=useState<LeadMeeting[]>([]);
  const [showForm,setShowForm]=useState(false);
  const [businessName,setBusinessName]=useState("");
  const [contactName,setContactName]=useState("");
  const [contactEmail,setContactEmail]=useState("");
  const [startsAt,setStartsAt]=useState("");
  const [meetingUrl,setMeetingUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function load(){try{setItems((await fetchLeadMeetings()).items);}catch(err){setError(err instanceof Error?err.message:"Meetings could not be loaded.");}}
  useEffect(()=>{void load();},[]);
  async function save(){setBusy(true);setError("");try{await createLeadMeeting({businessName,contactName,contactEmail,startsAt:new Date(startsAt).toISOString(),meetingUrl});setBusinessName("");setContactName("");setContactEmail("");setStartsAt("");setMeetingUrl("");setShowForm(false);await load();}catch(err){setError(err instanceof Error?err.message:"Meeting could not be saved.");}finally{setBusy(false);}}
  async function setStatus(item:LeadMeeting,status:LeadMeeting["status"]){try{await updateLeadMeetingStatus(item.id,status);await load();}catch(err){setError(err instanceof Error?err.message:"Meeting could not be updated.");}}
  const upcoming=items.filter((item)=>item.status==="scheduled"&&new Date(item.starts_at)>=new Date());
  return <section className="page-enter space-y-6"><PageHeader title="Meetings" description="Qualified prospects and booked sales conversations." actions={<Button onClick={()=>setShowForm((value)=>!value)} icon={<IconPlus size={14}/>}>Book meeting</Button>}/>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Upcoming</p><p className="mt-2 text-3xl font-bold text-slate-900">{upcoming.length}</p></Card><Card className="p-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Completed</p><p className="mt-2 text-3xl font-bold text-slate-900">{items.filter((item)=>item.status==="completed").length}</p></Card><Card className="p-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Conversion outcome</p><p className="mt-2 text-sm font-semibold text-slate-900">Track every booked conversation</p></Card></div>
    {showForm&&<Card><CardHeader title="Add a booked meeting" subtitle="Record a confirmed prospect conversation."/><CardBody><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[["Business name",businessName,setBusinessName,"text"],["Contact name",contactName,setContactName,"text"],["Contact email",contactEmail,setContactEmail,"email"],["Meeting time",startsAt,setStartsAt,"datetime-local"],["Meeting URL",meetingUrl,setMeetingUrl,"url"]].map(([label,value,setter,type])=><label key={String(label)} className="text-xs font-semibold text-slate-700">{String(label)}<input type={String(type)} value={String(value)} onChange={(e)=>(setter as (v:string)=>void)(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"/></label>)}</div><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={()=>setShowForm(false)}>Cancel</Button><Button onClick={()=>void save()} loading={busy} disabled={!businessName||!startsAt}>Save meeting</Button></div></CardBody></Card>}
    <Card><CardHeader title="Meeting schedule" subtitle="Upcoming and historical sales meetings."/><CardBody className="p-0">{items.length?<div className="divide-y divide-slate-100">{items.map((item)=><div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.status==="completed"?"bg-emerald-50 text-emerald-600":"bg-indigo-50 text-indigo-600"}`}>{item.status==="completed"?<IconCheckCircle size={18}/>:<IconClock size={18}/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-slate-900">{item.business_name}</p><Badge variant={item.status==="completed"?"success":item.status==="cancelled"?"danger":"brand"}>{item.status}</Badge></div><p className="mt-1 text-[11px] text-slate-500">{new Date(item.starts_at).toLocaleString()}  |  {item.duration_minutes} minutes{item.contact_name?`  |  ${item.contact_name}`:""}</p></div><div className="flex items-center gap-2">{item.meeting_url&&<a href={item.meeting_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">Join <IconExternalLink size={12}/></a>}{item.status==="scheduled"&&<Button size="sm" variant="outline" onClick={()=>void setStatus(item,"completed")}>Mark completed</Button>}</div></div>)}</div>:<div className="p-12 text-center"><IconClock size={24} className="mx-auto text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-900">No meetings booked yet</p><p className="mt-1 text-xs text-slate-500">Qualified prospect meetings will appear here.</p></div>}</CardBody></Card>
  </section>;
}
