import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { IconArrowRight, IconCheckCircle, IconClock, IconGlobe, IconMail, IconPlay, IconRefresh, IconSearch, IconShield, IconSparkles } from "../components/ui/Icons";
import { fetchAutomationRun, fetchAutomationRuns, fetchCommandReadiness, fetchPipelineSummary, interpretLeadCommand, launchLeadCommand, type AutomationRun, type CommandReadiness, type LeadCommandPlan } from "../lib/api";

const examples = [
  "Find 25 HVAC companies in Dallas, TX with under 80 reviews and weak websites. Audit them and prepare personalized email outreach.",
  "Find 40 plumbers in Austin, TX rated between 3.5 and 4.6 with fewer than 100 reviews.",
  "Find 20 roofers in Miami, FL without a website and prepare email plus call follow-up.",
];

function parseSteps(run: AutomationRun) {
  try { return JSON.parse(run.steps_progress_json || "[]") as Array<{ step:number; status:string; label:string; message?:string }>; }
  catch { return []; }
}

export function LeadCommandCenterPage() {
  const [prompt,setPrompt]=useState(examples[0]);
  const [plan,setPlan]=useState<LeadCommandPlan|null>(null);
  const [readiness,setReadiness]=useState<CommandReadiness|null>(null);
  const [runs,setRuns]=useState<AutomationRun[]>([]);
  const [pipeline,setPipeline]=useState<Record<string,number>>({});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    try {
      const [ready,history,pipe]=await Promise.all([fetchCommandReadiness(),fetchAutomationRuns(undefined,8),fetchPipelineSummary()]);
      setReadiness(ready); setRuns(history.items); setPipeline(pipe.stages);
    } catch(err){setError(err instanceof Error?err.message:"Command center could not be loaded.");}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!runs.some((run)=>run.status==="queued"||run.status==="running")) return;
    const timer=setInterval(async()=>{
      const updated=await Promise.all(runs.map(async(run)=>(run.status==="queued"||run.status==="running")?(await fetchAutomationRun(run.id)).run:run));
      setRuns(updated);
      if(!updated.some((run)=>run.status==="queued"||run.status==="running")) void load();
    },2500);
    return()=>clearInterval(timer);
  },[runs,load]);

  async function interpret(){
    setBusy("interpret");setError("");
    try{setPlan((await interpretLeadCommand(prompt)).plan);}
    catch(err){setError(err instanceof Error?err.message:"Instruction could not be understood.");}
    finally{setBusy("");}
  }
  async function launch(){
    if(!plan)return;
    setBusy("launch");setError("");
    try{const result=await launchLeadCommand({prompt,city:plan.city,state:plan.state,niche:plan.niche,maxLeads:plan.maxLeads});setRuns((items)=>[result.run,...items]);setPlan(null);}
    catch(err){setError(err instanceof Error?err.message:"Workflow could not be launched.");}
    finally{setBusy("");}
  }
  const stages=[["discovered","Discovered"],["contacted","Contacted"],["replied","Replied"],["qualified","Qualified"],["meetings","Meetings"],["won","Won"]];
  return <section className="page-enter space-y-6">
    <div className="relative overflow-hidden rounded-[24px] border border-slate-800 bg-slate-950 px-6 py-8 text-white shadow-[0_24px_60px_rgba(15,23,42,.2)] lg:px-9">
      <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl"/><div className="absolute -bottom-24 left-1/3 h-48 w-72 rounded-full bg-cyan-400/10 blur-3xl"/>
      <div className="relative max-w-3xl"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.15em] text-indigo-200"><IconSparkles size={13}/>Prompt to meeting</div>
        <h1 className="text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Tell SMBify OS who to find.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">One instruction becomes a controlled workflow: discover businesses, build verified profiles, audit opportunities, and prepare outreach for approval.</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.07] p-2 shadow-2xl backdrop-blur">
          <textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} rows={4} placeholder="Find 30 electricians in Phoenix..." className="w-full resize-none rounded-xl border-0 bg-transparent px-3 py-3 text-[15px] leading-6 text-white outline-none placeholder:text-slate-500"/>
          <div className="flex flex-col gap-3 border-t border-white/10 px-2 pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] text-slate-400">Sending always stops for approval.</p><Button onClick={()=>void interpret()} loading={busy==="interpret"} disabled={prompt.trim().length<12} icon={<IconSparkles size={15}/>}>Build workflow</Button></div>
        </div>
      </div>
    </div>

    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}<button className="float-right font-bold" onClick={()=>setError("")}>x</button></div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["Google Places",readiness?.checks.googlePlaces,"Primary discovery API","/settings/api"],["DataForSEO",readiness?.checks.dataForSeo,"Automatic discovery fallback","/settings/api"],["OpenRouter",readiness?.checks.openRouter,"Automatic AI routing","/settings/api"],["Email sender",readiness?.checks.emailSender,"Delivery remains approval-based","/email/senders"],["Booking link",readiness?.checks.bookingLink,"Meeting conversion","/settings/profile"]].map(([name,ready,detail,to])=><Link key={String(name)} to={String(to)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-900">{String(name)}</span><span className={`h-2.5 w-2.5 rounded-full ${ready?"bg-emerald-500":"bg-amber-400"}`}/></div><p className="mt-1 text-[11px] text-slate-500">{String(detail)}</p><p className={`mt-3 text-[10px] font-semibold uppercase tracking-wider ${ready?"text-emerald-600":"text-amber-700"}`}>{ready?"Ready":"Setup needed"}</p></Link>)}
    </div>

    {plan&&<Card className="overflow-hidden border-indigo-200 shadow-[0_18px_45px_rgba(79,70,229,.1)]"><CardHeader title="Review the workflow" subtitle="Confirm the interpreted instruction before any API usage starts." action={<Badge variant="warning">Approval required</Badge>}/><CardBody>
      <div className="grid gap-5 lg:grid-cols-[.9fr_1.4fr]"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Target</p><p className="mt-1 text-sm font-semibold text-slate-900">{plan.niche}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Location</p><p className="mt-1 text-sm font-semibold text-slate-900">{[plan.city,plan.state].filter(Boolean).join(", ")||"Needs location"}</p></div><label className="text-[11px] font-semibold text-slate-600">Lead limit<input type="number" min={1} max={200} value={plan.maxLeads} onChange={(e)=>setPlan({...plan,maxLeads:Number(e.target.value)||1})} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"/></label><label className="text-[11px] font-semibold text-slate-600">City<input value={plan.city} onChange={(e)=>setPlan({...plan,city:e.target.value})} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"/></label></div>
        <div className="space-y-2">{plan.steps.map((step,index)=><div key={step.type} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[11px] font-bold text-indigo-600">{index+1}</span><span className="text-xs font-medium text-slate-700">{step.label}</span>{index<plan.steps.length-1&&<IconArrowRight size={14} className="ml-auto text-slate-300"/>}</div>)}</div></div>
      {plan.assumptions.length>0&&<div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-800">{plan.assumptions.join(" ")}</div>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={()=>setPlan(null)}>Cancel</Button><Button onClick={()=>void launch()} loading={busy==="launch"} disabled={!plan.city||!readiness?.launchReady} icon={<IconPlay size={14}/>}>{readiness?.launchReady?"Launch workflow":"Connect a discovery API first"}</Button></div>
    </CardBody></Card>}

    <Card><CardHeader title="Lead-to-meeting pipeline" subtitle="A single operating view for acquisition outcomes." action={<Link to="/meetings" className="text-xs font-semibold text-indigo-600">Open meetings</Link>}/><CardBody><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{stages.map(([key,label],index)=><div key={key} className="relative rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{pipeline[key]||0}</p>{index<stages.length-1&&<IconArrowRight size={14} className="absolute -right-2 top-1/2 hidden text-slate-300 xl:block"/>}</div>)}</div></CardBody></Card>

    <Card><CardHeader title="Recent workflow runs" subtitle="Live progress and review destinations." action={<Button variant="outline" size="sm" onClick={()=>void load()} icon={<IconRefresh size={13}/>}>Refresh</Button>}/><CardBody className="p-0">
      {runs.length?<div className="divide-y divide-slate-100">{runs.map((run)=>{const steps=parseSteps(run);let result:any={};try{result=JSON.parse(run.result_json||"{}");}catch{}const campaign=Object.values(result).find((x:any)=>x?.campaignId) as any;return <div key={run.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-900">{run.workflow_name}</p><Badge variant={run.status==="completed"?"success":run.status==="failed"?"danger":"brand"} dot>{run.status}</Badge></div><p className="mt-1 text-[11px] text-slate-500">{run.progress_message||"Queued"}</p></div><div className="flex gap-2">{campaign?.campaignId&&<Link to={`/email/campaigns?campaignId=${campaign.campaignId}`} className="text-xs font-semibold text-indigo-600">Review outreach</Link>}<Link to="/leads" className="text-xs font-semibold text-slate-600">Prospects</Link></div></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{width:`${run.progress_percent}%`}}/></div><div className="mt-3 grid gap-2 md:grid-cols-3">{steps.map((step)=><div key={step.step} className="flex items-center gap-2 text-[10px] text-slate-500">{step.status==="completed"?<IconCheckCircle size={13} className="text-emerald-500"/>:step.status==="running"?<IconRefresh size={13} className="animate-spin text-indigo-500"/>:<IconClock size={13}/>}<span className="truncate">{step.label||`Step ${step.step}`}</span></div>)}</div></div>})}</div>:<div className="p-10 text-center"><IconSearch size={22} className="mx-auto text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-900">No command runs yet</p><p className="mt-1 text-xs text-slate-500">Start with one of the example instructions below.</p></div>}
    </CardBody></Card>

    <div><p className="mb-3 text-xs font-semibold text-slate-600">Try an example</p><div className="grid gap-3 lg:grid-cols-3">{examples.map((item)=><button key={item} onClick={()=>{setPrompt(item);window.scrollTo({top:0,behavior:"smooth"});}} className="rounded-xl border border-slate-200 bg-white p-4 text-left text-xs leading-5 text-slate-600 shadow-sm hover:border-indigo-200 hover:text-slate-900">{item}</button>)}</div></div>
  </section>;
}
