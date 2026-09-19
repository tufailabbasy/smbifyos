import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";

function ProductMark() { return <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-xs font-black tracking-wide text-white shadow-[0_10px_30px_rgba(99,102,241,.28)]">SO</div>; }

export function AuthPage() {
  const { login, signup } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(location.pathname !== "/signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/dashboard";

  function switchMode(loginMode: boolean) {
    setIsLogin(loginMode);
    setPassword("");
    navigate(loginMode ? "/login" : "/signup", { replace: true, state: location.state });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password || (!isLogin && !name.trim())) { showToast("error", "Please complete the required fields."); return; }
    setLoading(true);
    try {
      if (isLogin) { await login(email.trim(), password); showToast("success", "Welcome back."); }
      else { await signup(email.trim(), password, name.trim(), orgName.trim()); showToast("success", "Your workspace is ready."); }
      navigate(from, { replace: true });
    } catch (error) { showToast("error", error instanceof Error ? error.message : "Authentication failed."); }
    finally { setLoading(false); }
  }

  const fieldClass = "mt-1.5 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10";

  return <main className="relative min-h-screen overflow-hidden bg-[#07101f]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(99,102,241,.22),transparent_35%),radial-gradient(circle_at_90%_90%,rgba(14,165,233,.12),transparent_32%)]" />
    <div className="relative mx-auto grid min-h-screen max-w-[1440px] lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden flex-col justify-between p-12 lg:flex xl:p-16">
        <div className="flex items-center gap-3"><ProductMark /><div><p className="text-sm font-semibold text-white">SMBify OS</p><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-500">Local growth workspace</p></div></div>
        <div className="max-w-xl"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-[11px] font-semibold text-indigo-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />One system from prospect to pitch</div><h1 className="text-4xl font-semibold leading-[1.13] tracking-[-.035em] text-white xl:text-5xl">Find local businesses.<br/>Prove the opportunity.<br/><span className="text-indigo-300">Win the conversation.</span></h1><p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-400">Run evidence-based website and local audits, organize qualified prospects, and build relevant outreach from the findings.</p>
          <div className="mt-9 grid max-w-lg grid-cols-3 gap-3">{[["01","Collect","Local prospects"],["02","Audit","Real evidence"],["03","Reach","Relevant pitches"]].map(([number,title,caption]) => <div key={number} className="rounded-2xl border border-white/10 bg-white/[.045] p-4 backdrop-blur"><p className="text-[10px] font-bold text-indigo-300">{number}</p><p className="mt-4 text-xs font-semibold text-white">{title}</p><p className="mt-1 text-[10px] text-slate-500">{caption}</p></div>)}</div>
        </div>
        <p className="text-[11px] text-slate-600">Private agency workspace · Outbound sending remains controlled by configuration</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-6 shadow-[0_30px_90px_rgba(0,0,0,.34)] sm:p-8">
          <div className="mb-7 flex items-center gap-3 lg:hidden"><ProductMark /><div><p className="text-sm font-semibold text-slate-900">SMBify OS</p><p className="text-[10px] uppercase tracking-wider text-slate-400">Local growth workspace</p></div></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-indigo-600">{isLogin ? "Welcome back" : "Create workspace"}</p><h2 className="mt-2 text-2xl font-bold tracking-[-.03em] text-slate-950">{isLogin ? "Sign in to continue" : "Start your agency workspace"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{isLogin ? "Access your leads, audits and campaigns." : "Set up the workspace your team will use."}</p></div>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" onClick={() => switchMode(true)} className={`rounded-lg py-2.5 text-xs font-semibold transition ${isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Sign in</button>
            <button type="button" onClick={() => switchMode(false)} className={`rounded-lg py-2.5 text-xs font-semibold transition ${!isLogin ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Create account</button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {!isLogin && <><label className="block"><span className="text-xs font-semibold text-slate-700">Full name</span><input type="text" required autoComplete="name" placeholder="Alex Morgan" value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} /></label><label className="block"><span className="text-xs font-semibold text-slate-700">Agency or company <span className="font-normal text-slate-400">(optional)</span></span><input type="text" autoComplete="organization" placeholder="Northstar Local" value={orgName} onChange={(event) => setOrgName(event.target.value)} className={fieldClass} /></label></>}
            <label className="block"><span className="text-xs font-semibold text-slate-700">Email address</span><input type="email" required autoComplete="email" placeholder="you@agency.com" value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} /></label>
            <label className="block"><span className="text-xs font-semibold text-slate-700">Password</span><div className="relative"><input type={showPassword ? "text" : "password"} required autoComplete={isLogin ? "current-password" : "new-password"} placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${fieldClass} pr-16`} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500 hover:text-slate-900">{showPassword ? "Hide" : "Show"}</button></div></label>
            <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(15,23,42,.2)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}{loading ? (isLogin ? "Signing in…" : "Creating workspace…") : (isLogin ? "Sign in" : "Create workspace")}</button>
          </form>
          <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">Use credentials created for this installation. Contact the workspace administrator if you need access.</p>
        </div>
      </section>
    </div>
  </main>;
}