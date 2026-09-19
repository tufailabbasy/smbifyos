import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { IconCheckCircle, IconGlobe, IconRefresh, IconShield } from "../components/ui/Icons";
import { fetchAiProviders, fetchAppSettings, testAiProvider, updateAiProvider, updateAppSettings, type AiProviderConfig, type AppProfileSettings } from "../lib/api";

const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400";
const labelClass = "block text-xs font-semibold text-slate-700";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "openrouter/auto";

export function ApiSetupPage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Partial<AppProfileSettings>>({});
  const [provider, setProvider] = useState<AiProviderConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [testMessage, setTestMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [settings, providers] = await Promise.all([fetchAppSettings(), fetchAiProviders()]);
      setProfile(settings.profile);
      setProvider(providers.items.find((entry) => entry.providerKey === "openrouter") || null);
    } catch (err) { setError(err instanceof Error ? err.message : "API settings could not be loaded."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function saveOpenRouter() {
    if (!provider) return;
    if (!apiKey.trim() && !provider.apiKeyConfigured) { setError("Enter an OpenRouter API key first."); return; }
    setBusy("save-ai"); setError(""); setTestMessage("");
    try {
      const updated = await updateAiProvider("openrouter", { apiKey: apiKey.trim() || undefined, baseUrl: OPENROUTER_BASE_URL, model: OPENROUTER_MODEL, isEnabled: true, useForEmail: true, useForAudit: true, useForGeneral: true });
      setProvider(updated); setApiKey(""); showToast("success", "OpenRouter connected");
    } catch (err) { setError(err instanceof Error ? err.message : "OpenRouter could not be saved."); }
    finally { setBusy(""); }
  }
  async function testConnection() {
    if (!provider) return;
    if (!apiKey.trim() && !provider.apiKeyConfigured) { setError("Save or enter an API key before testing."); return; }
    setBusy("test-ai"); setError(""); setTestMessage("");
    try {
      const result = await testAiProvider("openrouter", { apiKey: apiKey.trim() || undefined, baseUrl: OPENROUTER_BASE_URL, model: OPENROUTER_MODEL });
      setTestMessage(`Connection passed: ${result.preview || "READY"}`);
    } catch (err) { setError(err instanceof Error ? err.message : "OpenRouter test failed."); }
    finally { setBusy(""); }
  }
  async function disconnect() {
    setBusy("disconnect"); setError("");
    try {
      const updated = await updateAiProvider("openrouter", { clearApiKey: true, isEnabled: false, useForEmail: false, useForAudit: false, useForGeneral: false });
      setProvider(updated); setApiKey(""); showToast("success", "OpenRouter disconnected");
    } catch (err) { setError(err instanceof Error ? err.message : "OpenRouter could not be disconnected."); }
    finally { setBusy(""); }
  }
  async function saveServiceApis() {
    setBusy("services"); setError("");
    try {
      const updated = await updateAppSettings({
        googleClientId: profile.googleClientId || "", googleClientSecret: profile.googleClientSecret || "",
        googlePlacesApiKey: profile.googlePlacesApiKey || "", dataForSeoLogin: profile.dataForSeoLogin || "",
        dataForSeoPassword: profile.dataForSeoPassword || "",
      });
      setProfile((current) => ({ ...current, ...updated }));
      showToast("success", "Service API credentials saved");
    } catch (err) { setError(err instanceof Error ? err.message : "Service APIs could not be saved."); }
    finally { setBusy(""); }
  }

  if (loading) return <section className="space-y-5"><div className="h-20 animate-pulse rounded-2xl bg-white"/><div className="h-96 animate-pulse rounded-2xl bg-white"/></section>;
  const connected = Boolean(provider?.isEnabled && provider.apiKeyConfigured);
  const dataForSeoConnected = Boolean(profile.dataForSeoLogin && profile.dataForSeoPassword);
  return <section className="page-enter space-y-6">
    <PageHeader title="API Setup" description="Connect OpenRouter and the data services used by lead workflows." breadcrumbs={[{ label: "Settings", href: "/settings/profile" }, { label: "API Setup" }]} actions={<Button variant="outline" size="sm" onClick={() => void load()} icon={<IconRefresh size={14}/>}>Refresh</Button>} />
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}<button type="button" onClick={() => setError("")} className="float-right font-bold">x</button></div>}
    {testMessage && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700"><IconCheckCircle size={15}/>{testMessage}</div>}

    <Card><CardHeader title={<span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><IconShield size={16}/></span>OpenRouter</span>} subtitle="One API key for AI analysis, audit writing, and personalized outreach. Model selection is automatic." action={<Badge variant={connected ? "success" : "neutral"} dot>{connected ? "Connected" : "Not connected"}</Badge>}/><CardBody>
      <label className={labelClass}>API key<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider?.apiKeyConfigured ? `Saved: ${provider.apiKeyMasked}` : "Paste OpenRouter API key"} autoComplete="off" className={inputClass}/><span className="mt-1 block text-[10px] font-normal text-slate-400">Leave blank to keep the saved key. SMBify OS manages the endpoint and model router automatically.</span></label>
      <div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => void saveOpenRouter()} loading={busy === "save-ai"}>Save and use OpenRouter</Button><Button variant="outline" onClick={() => void testConnection()} loading={busy === "test-ai"}>Test connection</Button>{provider?.apiKeyConfigured && <Button variant="ghost" className="text-rose-600" onClick={() => void disconnect()} loading={busy === "disconnect"}>Disconnect</Button>}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{["Email writing", "Audit analysis", "General content"].map((task) => <div key={task} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600"><span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}/>{task}</div>)}</div>
    </CardBody></Card>

    <Card><CardHeader title={<span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><IconGlobe size={16}/></span>Lead data APIs</span>} subtitle="Google Places is preferred. DataForSEO automatically takes over when a Google Places key is unavailable."/><CardBody>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-900">Google OAuth</p><Badge size="sm" variant={profile.googleClientId && profile.googleClientSecret ? "success" : "neutral"}>{profile.googleClientId && profile.googleClientSecret ? "Configured" : "Optional"}</Badge></div><p className="mt-1 text-[11px] leading-5 text-slate-500">Connect Google accounts for supported Google workflows.</p><label className={`${labelClass} mt-4`}>Client ID<input value={profile.googleClientId || ""} onChange={(e) => setProfile((p) => ({ ...p, googleClientId: e.target.value }))} className={inputClass}/></label><label className={`${labelClass} mt-3`}>Client secret<input type="password" value={profile.googleClientSecret || ""} onChange={(e) => setProfile((p) => ({ ...p, googleClientSecret: e.target.value }))} className={inputClass}/></label></div>
        <div className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-900">Google Places</p><Badge size="sm" variant={profile.googlePlacesApiKey ? "success" : "neutral"}>{profile.googlePlacesApiKey ? "Connected" : "Primary"}</Badge></div><p className="mt-1 text-[11px] leading-5 text-slate-500">Primary source for fast local business discovery and Google profile data.</p><label className={`${labelClass} mt-4`}>API key<input type="password" value={profile.googlePlacesApiKey || ""} onChange={(e) => setProfile((p) => ({ ...p, googlePlacesApiKey: e.target.value }))} className={inputClass}/></label></div>
        <div className="rounded-xl border border-slate-200 p-4 lg:col-span-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-900">DataForSEO</p><Badge size="sm" variant={dataForSeoConnected ? "success" : "info"}>{dataForSeoConnected ? "Connected" : "Automatic fallback"}</Badge></div><p className="mt-1 text-[11px] leading-5 text-slate-500">Used for live Google Maps discovery when Google Places is not connected. Enter the API login and password from DataForSEO API Access.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className={labelClass}>API login<input type="email" value={profile.dataForSeoLogin || ""} onChange={(e) => setProfile((p) => ({ ...p, dataForSeoLogin: e.target.value }))} className={inputClass}/></label><label className={labelClass}>API password<input type="password" value={profile.dataForSeoPassword || ""} onChange={(e) => setProfile((p) => ({ ...p, dataForSeoPassword: e.target.value }))} className={inputClass}/></label></div></div>
      </div>
      <div className="mt-5 flex justify-end"><Button onClick={() => void saveServiceApis()} loading={busy === "services"}>Save service APIs</Button></div>
    </CardBody></Card>
    <div className="text-right"><Link to="/settings/profile" className="text-xs font-semibold text-indigo-600">Back to agency settings</Link></div>
  </section>;
}
