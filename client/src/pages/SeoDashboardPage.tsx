import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  createFinanceEntry,
  createSeoBusiness,
  createSeoClient,
  fetchEmailOpsStatus,
  fetchLeads,
  fetchSeoBusinesses,
  fetchSeoClients,
  fetchSeoFinance,
  fetchSeoOverview,
  updateSeoBusiness,
  updateSeoClient,
  type CurrencyTotal,
  type EmailOpsStatus,
  type FinanceEntry,
  type FinancePeriod,
  type Lead,
  type SeoBusiness,
  type SeoClient,
  type SeoOverview,
} from "../lib/api";
import { currencyOptions, formatCurrencyAmount } from "../lib/finance";

type SeoTab = "overview" | "clients" | "businesses" | "finance" | "email";

type ClientFormState = {
  name: string;
  primary_contact: string;
  contact_email: string;
  contact_phone: string;
  lifecycle_stage: string;
  default_currency: string;
  notes: string;
};

type BusinessFormState = {
  client_id: string;
  lead_id: string;
  name: string;
  website: string;
  gmb_url: string;
  city: string;
  state: string;
  service_type: string;
  package_type: string;
  monthly_budget: string;
  currency: string;
  billing_cycle: string;
  order_status: string;
  assigned_team_member: string;
  start_date: string;
  notes: string;
};

type FinanceFormState = {
  client_id: string;
  business_id: string;
  label: string;
  amount: string;
  currency: string;
  entry_date: string;
  notes: string;
};

type FinanceSummaryState = {
  period: FinancePeriod;
  totalsByCurrency: CurrencyTotal[];
  items: FinanceEntry[];
};

const today = new Date();
const currentMonth = today.toISOString().slice(0, 7);
const currentYear = String(today.getFullYear());
const currentDate = today.toISOString().slice(0, 10);

const defaultPeriod: FinancePeriod = {
  range: "month",
  startDate: `${currentMonth}-01`,
  endDate: currentDate,
  label: currentMonth,
  month: currentMonth,
  year: currentYear,
};

const emptyOverview: SeoOverview = {
  totalClients: 0,
  activeBusinesses: 0,
  monthlyBudget: 0,
  monthlyBudgetByCurrency: [],
  auditsThisMonth: 0,
  activeCampaigns: 0,
  smtpAccounts: 0,
  templateCount: 0,
  currentMonth: defaultPeriod,
  currentMonthEarningsByCurrency: [],
};

const emptyFinanceSummary: FinanceSummaryState = {
  period: defaultPeriod,
  totalsByCurrency: [],
  items: [],
};

const emptyClientForm: ClientFormState = {
  name: "",
  primary_contact: "",
  contact_email: "",
  contact_phone: "",
  lifecycle_stage: "active",
  default_currency: "USD",
  notes: "",
};

const emptyBusinessForm: BusinessFormState = {
  client_id: "",
  lead_id: "",
  name: "",
  website: "",
  gmb_url: "",
  city: "",
  state: "",
  service_type: "",
  package_type: "",
  monthly_budget: "",
  currency: "USD",
  billing_cycle: "monthly",
  order_status: "active",
  assigned_team_member: "",
  start_date: "",
  notes: "",
};

const emptyFinanceForm: FinanceFormState = {
  client_id: "",
  business_id: "",
  label: "",
  amount: "",
  currency: "USD",
  entry_date: currentDate,
  notes: "",
};

const seoTabs: Array<{ value: SeoTab; label: string; caption: string }> = [
  { value: "overview", label: "Overview", caption: "Delivery health, retainers, and audit momentum." },
  { value: "clients", label: "Clients", caption: "Account owners, stages, and default currency setup." },
  { value: "businesses", label: "Businesses", caption: "Orders, retainers, billing cycle, and delivery ownership." },
  { value: "finance", label: "Finance", caption: "Track captured earnings with month, year, or custom filters." },
  { value: "email", label: "Email Ops", caption: "Outbound-only sending status, presets, and campaign readiness." },
];

function seoTabFromHash(hash: string, fallback: SeoTab): SeoTab {
  if (hash.includes("clients")) return "clients";
  if (hash.includes("businesses")) return "businesses";
  if (hash.includes("finance")) return "finance";
  if (hash.includes("email")) return "email";
  if (hash.includes("overview")) return "overview";
  return fallback;
}

function seoHashForTab(tab: SeoTab): string {
  return `#${tab}`;
}

function formatCurrencyBreakdown(items: CurrencyTotal[]): string {
  if (items.length === 0) {
    return "No values yet";
  }

  return items.slice(0, 3).map((item) => formatCurrencyAmount(item.currency, item.amount)).join(" • ");
}

function billingCycleLabel(value: string): string {
  if (value === "one-time") return "One-time";
  if (value === "quarterly") return "Quarterly";
  if (value === "yearly") return "Yearly";
  return "Monthly";
}

export function SeoDashboardPage({ initialTab = "overview" }: { initialTab?: SeoTab }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<SeoOverview>(emptyOverview);
  const [clients, setClients] = useState<SeoClient[]>([]);
  const [businesses, setBusinesses] = useState<SeoBusiness[]>([]);
  const [emailOps, setEmailOps] = useState<EmailOpsStatus | null>(null);
  const [leadOptions, setLeadOptions] = useState<Lead[]>([]);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummaryState>(emptyFinanceSummary);
  const [clientForm, setClientForm] = useState<ClientFormState>(emptyClientForm);
  const [businessForm, setBusinessForm] = useState<BusinessFormState>(emptyBusinessForm);
  const [financeForm, setFinanceForm] = useState<FinanceFormState>(emptyFinanceForm);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [activeTab, setActiveTab] = useState<SeoTab>(() => seoTabFromHash(location.hash, initialTab));
  const [financeRange, setFinanceRange] = useState<"month" | "year" | "custom">("month");
  const [financeMonth, setFinanceMonth] = useState(currentMonth);
  const [financeYear, setFinanceYear] = useState(currentYear);
  const [financeStartDate, setFinanceStartDate] = useState(`${currentMonth}-01`);
  const [financeEndDate, setFinanceEndDate] = useState(currentDate);
  const [loading, setLoading] = useState(true);
  const [financeLoading, setFinanceLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadDashboard(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const [overviewData, clientData, businessData, emailOpsData, leadData] = await Promise.all([
        fetchSeoOverview(),
        fetchSeoClients(),
        fetchSeoBusinesses(),
        fetchEmailOpsStatus(),
        fetchLeads({ page: 1, pageSize: 200 }),
      ]);

      setOverview(overviewData);
      setClients(clientData.items);
      setBusinesses(businessData.items);
      setEmailOps(emailOpsData);
      setLeadOptions(leadData.items);

      setBusinessForm((current) => {
        const fallbackClient = clientData.items.find((client) => client.id === current.client_id) || clientData.items[0];
        return {
          ...current,
          client_id: current.client_id || fallbackClient?.id || "",
          currency: current.currency || fallbackClient?.default_currency || "USD",
        };
      });

      setFinanceForm((current) => {
        const fallbackClient = clientData.items.find((client) => client.id === current.client_id) || clientData.items[0];
        const businessStillValid = businessData.items.some(
          (business) => business.id === current.business_id && business.client_id === (current.client_id || fallbackClient?.id)
        );

        return {
          ...current,
          client_id: current.client_id || fallbackClient?.id || "",
          business_id: businessStillValid ? current.business_id : "",
          currency: current.currency || fallbackClient?.default_currency || "USD",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SEO dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function loadFinanceSummary(): Promise<void> {
    setFinanceLoading(true);

    try {
      const data = await fetchSeoFinance({
        range: financeRange,
        month: financeRange === "month" ? financeMonth : undefined,
        year: financeRange === "year" ? financeYear : undefined,
        startDate: financeRange === "custom" ? financeStartDate : undefined,
        endDate: financeRange === "custom" ? financeEndDate : undefined,
        limit: 12,
      });

      setFinanceSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance summary");
    } finally {
      setFinanceLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    void loadFinanceSummary();
  }, [financeEndDate, financeMonth, financeRange, financeStartDate, financeYear]);

  useEffect(() => {
    setActiveTab(seoTabFromHash(location.hash, initialTab));
  }, [location.hash, initialTab]);

  const businessesNeedingAttention = useMemo(
    () =>
      businesses
        .filter(
          (business) =>
            (business.last_website_audit_score ?? 0) < 65 || (business.last_gmb_audit_score ?? 0) < 65
        )
        .slice(0, 5),
    [businesses]
  );

  const financeBusinessOptions = useMemo(
    () => businesses.filter((business) => !financeForm.client_id || business.client_id === financeForm.client_id),
    [businesses, financeForm.client_id]
  );

  function switchTab(nextTab: SeoTab): void {
    if (nextTab === activeTab && location.hash === seoHashForTab(nextTab)) {
      return;
    }

    setActiveTab(nextTab);
    navigate(`/seo/dashboard${seoHashForTab(nextTab)}`, { replace: true });
  }

  function resetClientForm(): void {
    setSelectedClientId("");
    setClientForm(emptyClientForm);
  }

  function resetBusinessForm(): void {
    const fallbackClient = clients.find((client) => client.id === businessForm.client_id) || clients[0];
    setSelectedBusinessId("");
    setBusinessForm({
      ...emptyBusinessForm,
      client_id: fallbackClient?.id || "",
      currency: fallbackClient?.default_currency || "USD",
    });
  }

  function resetFinanceForm(): void {
    const fallbackClient = clients.find((client) => client.id === financeForm.client_id) || clients[0];
    setFinanceForm({
      ...emptyFinanceForm,
      client_id: fallbackClient?.id || "",
      currency: fallbackClient?.default_currency || "USD",
    });
  }

  function applyLeadPreset(leadId: string): void {
    const selectedLead = leadOptions.find((lead) => lead.id === leadId);
    if (!selectedLead) return;

    setBusinessForm((current) => ({
      ...current,
      lead_id: leadId,
      name: selectedLead.business_name || current.name,
      city: selectedLead.city || current.city,
      state: selectedLead.state || current.state,
      website: selectedLead.website || current.website,
      gmb_url: selectedLead.gmb_url || current.gmb_url,
    }));
  }

  function applyClientToForm(client: SeoClient): void {
    setSelectedClientId(client.id);
    setClientForm({
      name: client.name,
      primary_contact: client.primary_contact,
      contact_email: client.contact_email,
      contact_phone: client.contact_phone,
      lifecycle_stage: client.lifecycle_stage,
      default_currency: client.default_currency,
      notes: client.notes,
    });
    switchTab("clients");
  }

  function applyBusinessToForm(business: SeoBusiness): void {
    setSelectedBusinessId(business.id);
    setBusinessForm({
      client_id: business.client_id,
      lead_id: business.lead_id,
      name: business.name,
      website: business.website,
      gmb_url: business.gmb_url,
      city: business.city,
      state: business.state,
      service_type: business.service_type,
      package_type: business.package_type,
      monthly_budget: business.monthly_budget === null ? "" : String(business.monthly_budget),
      currency: business.currency,
      billing_cycle: business.billing_cycle,
      order_status: business.order_status,
      assigned_team_member: business.assigned_team_member,
      start_date: business.start_date,
      notes: business.notes,
    });
    switchTab("businesses");
  }

  function handleBusinessClientChange(clientId: string): void {
    const client = clients.find((item) => item.id === clientId);
    setBusinessForm((current) => ({
      ...current,
      client_id: clientId,
      currency: client?.default_currency || current.currency || "USD",
    }));
  }

  function handleFinanceClientChange(clientId: string): void {
    const client = clients.find((item) => item.id === clientId);
    setFinanceForm((current) => ({
      ...current,
      client_id: clientId,
      business_id: businesses.some((business) => business.id === current.business_id && business.client_id === clientId)
        ? current.business_id
        : "",
      currency: client?.default_currency || current.currency || "USD",
    }));
  }

  function handleFinanceBusinessChange(businessId: string): void {
    const business = businesses.find((item) => item.id === businessId);
    setFinanceForm((current) => ({
      ...current,
      client_id: business?.client_id || current.client_id,
      business_id: businessId,
      currency: business?.currency || current.currency || "USD",
    }));
  }

  async function saveClient(): Promise<void> {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (selectedClientId) {
        await updateSeoClient(selectedClientId, clientForm);
        setMessage(`Updated ${clientForm.name}.`);
      } else {
        await createSeoClient(clientForm);
        setMessage(`Created ${clientForm.name}.`);
      }

      resetClientForm();
      await Promise.all([loadDashboard(), loadFinanceSummary()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client");
    } finally {
      setSaving(false);
    }
  }

  async function saveBusiness(): Promise<void> {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        ...businessForm,
        monthly_budget: businessForm.monthly_budget ? Number(businessForm.monthly_budget) : null,
      };

      if (selectedBusinessId) {
        await updateSeoBusiness(selectedBusinessId, payload);
        setMessage(`Updated ${businessForm.name}.`);
      } else {
        await createSeoBusiness(payload);
        setMessage(`Created business order for ${businessForm.name}.`);
      }

      resetBusinessForm();
      await Promise.all([loadDashboard(), loadFinanceSummary()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save business");
    } finally {
      setSaving(false);
    }
  }

  async function saveFinance(): Promise<void> {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await createFinanceEntry({
        client_id: financeForm.client_id,
        business_id: financeForm.business_id || undefined,
        label: financeForm.label || undefined,
        amount: Number(financeForm.amount),
        currency: financeForm.currency,
        entry_date: financeForm.entry_date,
        notes: financeForm.notes || undefined,
      });

      setMessage(`Captured finance entry for ${financeForm.label || "selected account"}.`);
      resetFinanceForm();
      await Promise.all([loadDashboard(), loadFinanceSummary()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save finance entry");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-enter space-y-4">
      <header className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5e6ad2]">SEO Dashboard</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">Client Delivery Workspace</h2>
        <p className="mt-1 text-[13px] text-slate-400">
          Keep active SEO accounts, billing, business orders, audits, and outbound delivery separate from the lead engine.
        </p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-2">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {seoTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchTab(tab.value)}
              className={[
                "rounded-lg border px-4 py-3 text-left transition-colors",
                activeTab === tab.value
                  ? "border-[#5e6ad2] bg-[#5e6ad2] text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white",
              ].join(" ")}
            >
              <p className="text-[13px] font-semibold">{tab.label}</p>
              <p className={activeTab === tab.value ? "mt-1 text-[12px] text-white/70" : "mt-1 text-[12px] text-slate-500"}>
                {tab.caption}
              </p>
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Client Accounts", String(overview.totalClients)],
              ["Active Businesses", String(overview.activeBusinesses)],
              ["Retainers", formatCurrencyBreakdown(overview.monthlyBudgetByCurrency)],
              ["This Month Earnings", formatCurrencyBreakdown(overview.currentMonthEarningsByCurrency)],
              ["Audits This Month", String(overview.auditsThisMonth)],
              ["Active Campaigns", String(overview.activeCampaigns)],
            ].map(([label, value]) => (
              <article key={label} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[12px] uppercase tracking-[0.08em] text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{loading ? "..." : value}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">SEO Audit Tools</h3>
                  <p className="text-[13px] text-slate-600">Run AI-powered audits on websites, GMB profiles, and competitors.</p>
                </div>
                <Link to="/audit-tools" className="text-[13px] font-semibold text-[#5e6ad2]">
                  Open Audit Tools →
                </Link>
              </div>
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">
                Audits are managed in the <Link to="/audit-tools" className="font-semibold text-[#5e6ad2]">SEO Tools</Link> section.
                Run audits, edit findings, and save manual reports there.
              </p>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">Needs Attention</h3>
              <div className="mt-4 space-y-3">
                {businessesNeedingAttention.map((business) => (
                  <button
                    key={business.id}
                    type="button"
                    onClick={() => applyBusinessToForm(business)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-brand hover:bg-white"
                  >
                    <p className="font-semibold text-slate-900">{business.name}</p>
                    <p className="mt-1 text-[13px] text-slate-600">{business.client_name}</p>
                    <p className="mt-2 text-[12px] text-slate-500">
                      GMB: {business.last_gmb_audit_score ?? "--"} | Website: {business.last_website_audit_score ?? "--"}
                    </p>
                  </button>
                ))}

                {!loading && businessesNeedingAttention.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">
                    No urgent low-score businesses found right now.
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  to="/outreach/campaigns"
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] font-semibold text-slate-900 transition hover:border-brand hover:bg-white"
                >
                  Open Campaigns
                </Link>
                <button
                  type="button"
                  onClick={() => switchTab("finance")}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-[13px] font-semibold text-slate-900 transition hover:border-brand hover:bg-white"
                >
                  Open Finance Tracker
                </button>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {activeTab === "clients" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">
              {selectedClientId ? "Edit Client Account" : "Create Client Account"}
            </h3>
            <div className="mt-4 grid gap-3">
              {[
                ["name", "Client name"],
                ["primary_contact", "Primary contact"],
                ["contact_email", "Contact email"],
                ["contact_phone", "Contact phone"],
              ].map(([key, label]) => (
                <label key={key} className="space-y-1 text-[13px] text-slate-700">
                  <span>{label}</span>
                  <input
                    value={clientForm[key as keyof ClientFormState]}
                    onChange={(event) => setClientForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              ))}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Lifecycle stage</span>
                  <select
                    value={clientForm.lifecycle_stage}
                    onChange={(event) => setClientForm((current) => ({ ...current, lifecycle_stage: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {[
                      ["active", "Active"],
                      ["onboarding", "Onboarding"],
                      ["paused", "Paused"],
                      ["retainer-risk", "Retainer Risk"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Default currency</span>
                  <select
                    value={clientForm.default_currency}
                    onChange={(event) => setClientForm((current) => ({ ...current, default_currency: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {currencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Notes</span>
                <textarea
                  rows={5}
                  value={clientForm.notes}
                  onChange={(event) => setClientForm((current) => ({ ...current, notes: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveClient()}
                  disabled={saving}
                  className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#4e5abc] disabled:opacity-50"
                >
                  {saving ? "Saving..." : selectedClientId ? "Update Client" : "Create Client"}
                </button>
                <button
                  type="button"
                  onClick={resetClientForm}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700"
                >
                  Reset
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Client Accounts</h3>
            <div className="mt-4 space-y-3">
              {clients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => applyClientToForm(client)}
                  className="w-full rounded-lg border border-slate-200 p-4 text-left transition hover:border-brand hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{client.name}</p>
                      <p className="text-[13px] text-slate-600">
                        {client.primary_contact || client.contact_email || "No contact set"}
                      </p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-700">
                      {client.lifecycle_stage}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-[13px] text-slate-600 sm:grid-cols-4">
                    <p>Businesses: {client.business_count}</p>
                    <p>Active orders: {client.active_orders}</p>
                    <p>Currency: {client.default_currency}</p>
                    <p>Retainers: {formatCurrencyAmount(client.default_currency, client.monthly_budget_total)}</p>
                  </div>
                </button>
              ))}

              {!loading && clients.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">No client accounts created yet.</p>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "businesses" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">
              {selectedBusinessId ? "Edit Business / Order" : "Create Business / Order"}
            </h3>
            <div className="mt-4 grid gap-3">
              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Client account</span>
                <select
                  value={businessForm.client_id}
                  onChange={(event) => handleBusinessClientChange(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Prefill from lead</span>
                <select
                  value={businessForm.lead_id}
                  onChange={(event) => applyLeadPreset(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Manual entry</option>
                  {leadOptions.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.business_name} {lead.city ? `• ${lead.city}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {[
                ["name", "Business / order name"],
                ["website", "Website"],
                ["gmb_url", "Google Maps URL"],
                ["city", "City"],
                ["state", "State"],
                ["service_type", "Service type"],
                ["package_type", "Package type"],
                ["assigned_team_member", "Assigned team member"],
              ].map(([key, label]) => (
                <label key={key} className="space-y-1 text-[13px] text-slate-700">
                  <span>{label}</span>
                  <input
                    value={businessForm[key as keyof BusinessFormState]}
                    onChange={(event) => setBusinessForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              ))}

              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Retainer amount</span>
                  <input
                    type="number"
                    value={businessForm.monthly_budget}
                    onChange={(event) => setBusinessForm((current) => ({ ...current, monthly_budget: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>

                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Currency</span>
                  <select
                    value={businessForm.currency}
                    onChange={(event) => setBusinessForm((current) => ({ ...current, currency: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {currencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Billing cycle</span>
                  <select
                    value={businessForm.billing_cycle}
                    onChange={(event) => setBusinessForm((current) => ({ ...current, billing_cycle: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {[
                      ["monthly", "Monthly"],
                      ["quarterly", "Quarterly"],
                      ["yearly", "Yearly"],
                      ["one-time", "One-time"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Order status</span>
                  <select
                    value={businessForm.order_status}
                    onChange={(event) => setBusinessForm((current) => ({ ...current, order_status: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {[
                      ["active", "Active"],
                      ["onboarding", "Onboarding"],
                      ["deliverables-due", "Deliverables Due"],
                      ["paused", "Paused"],
                      ["completed", "Completed"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Start date</span>
                  <input
                    type="date"
                    value={businessForm.start_date}
                    onChange={(event) => setBusinessForm((current) => ({ ...current, start_date: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>

              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Notes</span>
                <textarea
                  rows={4}
                  value={businessForm.notes}
                  onChange={(event) => setBusinessForm((current) => ({ ...current, notes: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveBusiness()}
                  disabled={saving}
                  className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#4e5abc] disabled:opacity-50"
                >
                  {saving ? "Saving..." : selectedBusinessId ? "Update Business" : "Create Business"}
                </button>
                <button
                  type="button"
                  onClick={resetBusinessForm}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700"
                >
                  Reset
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Business Orders</h3>
            <div className="mt-4 space-y-3">
              {businesses.map((business) => (
                <button
                  key={business.id}
                  type="button"
                  onClick={() => applyBusinessToForm(business)}
                  className="w-full rounded-lg border border-slate-200 p-4 text-left transition hover:border-brand hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{business.name}</p>
                      <p className="text-[13px] text-slate-600">
                        {business.client_name} • {[business.city, business.state].filter(Boolean).join(", ") || "Location not set"}
                      </p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-700">
                      {business.order_status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-[13px] text-slate-600 sm:grid-cols-4">
                    <p>
                      Retainer: {business.monthly_budget === null ? "--" : formatCurrencyAmount(business.currency, business.monthly_budget)}
                    </p>
                    <p>Cycle: {billingCycleLabel(business.billing_cycle)}</p>
                    <p>GMB audit: {business.last_gmb_audit_score ?? "--"}</p>
                    <p>Site audit: {business.last_website_audit_score ?? "--"}</p>
                  </div>
                </button>
              ))}

              {!loading && businesses.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">No businesses or orders exist yet.</p>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "finance" ? (
        <section className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Capture Earnings</h3>
            <p className="mt-1 text-[13px] text-slate-600">
              Log real payments against a client or specific business order to keep dashboard earnings accurate.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Client account</span>
                <select
                  value={financeForm.client_id}
                  onChange={(event) => handleFinanceClientChange(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Business order</span>
                <select
                  value={financeForm.business_id}
                  onChange={(event) => handleFinanceBusinessChange(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Client-level payment</option>
                  {financeBusinessOptions.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Entry label</span>
                <input
                  value={financeForm.label}
                  onChange={(event) => setFinanceForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="April retainer, setup fee, add-on payment"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-[13px] text-slate-700 md:col-span-1">
                  <span>Amount</span>
                  <input
                    type="number"
                    value={financeForm.amount}
                    onChange={(event) => setFinanceForm((current) => ({ ...current, amount: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Currency</span>
                  <select
                    value={financeForm.currency}
                    onChange={(event) => setFinanceForm((current) => ({ ...current, currency: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {currencyOptions.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-[13px] text-slate-700">
                  <span>Entry date</span>
                  <input
                    type="date"
                    value={financeForm.entry_date}
                    onChange={(event) => setFinanceForm((current) => ({ ...current, entry_date: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>

              <label className="space-y-1 text-[13px] text-slate-700">
                <span>Notes</span>
                <textarea
                  rows={4}
                  value={financeForm.notes}
                  onChange={(event) => setFinanceForm((current) => ({ ...current, notes: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveFinance()}
                  disabled={saving}
                  className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#4e5abc] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Entry"}
                </button>
                <button
                  type="button"
                  onClick={resetFinanceForm}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700"
                >
                  Reset
                </button>
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Earnings Tracker</h3>
                <p className="text-[13px] text-slate-600">Filter finance entries by month, year, or a custom date window.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-[13px] text-slate-700">
                  <span className="mb-1 block text-[12px] uppercase tracking-[0.08em] text-slate-500">Range</span>
                  <select
                    value={financeRange}
                    onChange={(event) => setFinanceRange(event.target.value as "month" | "year" | "custom")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                {financeRange === "month" ? (
                  <label className="text-[13px] text-slate-700">
                    <span className="mb-1 block text-[12px] uppercase tracking-[0.08em] text-slate-500">Month</span>
                    <input
                      type="month"
                      value={financeMonth}
                      onChange={(event) => setFinanceMonth(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </label>
                ) : null}

                {financeRange === "year" ? (
                  <label className="text-[13px] text-slate-700">
                    <span className="mb-1 block text-[12px] uppercase tracking-[0.08em] text-slate-500">Year</span>
                    <input
                      type="number"
                      min="2000"
                      max="2100"
                      value={financeYear}
                      onChange={(event) => setFinanceYear(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                    />
                  </label>
                ) : null}

                {financeRange === "custom" ? (
                  <>
                    <label className="text-[13px] text-slate-700">
                      <span className="mb-1 block text-[12px] uppercase tracking-[0.08em] text-slate-500">Start</span>
                      <input
                        type="date"
                        value={financeStartDate}
                        onChange={(event) => setFinanceStartDate(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>
                    <label className="text-[13px] text-slate-700">
                      <span className="mb-1 block text-[12px] uppercase tracking-[0.08em] text-slate-500">End</span>
                      <input
                        type="date"
                        value={financeEndDate}
                        onChange={(event) => setFinanceEndDate(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {financeSummary.totalsByCurrency.length > 0 ? (
                financeSummary.totalsByCurrency.map((item) => (
                  <div key={item.currency} className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-[12px] uppercase tracking-[0.08em] text-[#5e6ad2]">{item.currency}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                      {financeLoading ? "..." : formatCurrencyAmount(item.currency, item.amount)}
                    </p>
                    <p className="mt-1 text-[13px] text-slate-400">{financeSummary.period.label}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-600 sm:col-span-2">
                  {financeLoading ? "Loading finance totals..." : "No recorded earnings for this period yet."}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {financeSummary.items.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {entry.label || entry.business_name || entry.client_name}
                      </p>
                      <p className="text-[13px] text-slate-600">
                        {entry.client_name}
                        {entry.business_name ? ` • ${entry.business_name}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold text-emerald-700">
                      {formatCurrencyAmount(entry.currency, entry.amount)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-slate-500">
                    <span>{entry.entry_date}</span>
                    <span>{entry.entry_type}</span>
                    {entry.notes ? <span>{entry.notes}</span> : null}
                  </div>
                </div>
              ))}

              {!financeLoading && financeSummary.items.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">No finance entries found for this filter.</p>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "email" ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Email Ops Status</h3>
            <p className="mt-1 text-[13px] text-slate-600">
              Outbound-only delivery mode is active. Inbox handling is intentionally left out.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["SMTP Accounts", emailOps?.smtpAccounts ?? overview.smtpAccounts],
                ["Templates", emailOps?.templateCount ?? overview.templateCount],
                ["Live Campaigns", emailOps?.activeCampaigns ?? overview.activeCampaigns],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-[13px] text-slate-700">
              <p className="font-semibold text-slate-900">Integrated direction</p>
              <p className="mt-1">{emailOps?.note}</p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/outreach/campaigns"
                className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4e5abc]"
              >
                Open Campaign Manager
              </Link>
              <Link
                to="/settings/profile#outreach-settings"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700"
              >
                Manage SMTP & Templates
              </Link>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Provider Presets</h3>
            <p className="mt-1 text-[13px] text-slate-600">
              SMTP setup now uses email-sender-derived provider presets and composer guardrails.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(emailOps?.providerPresets || []).map((provider) => (
                <span key={provider} className="rounded bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
                  {provider}
                </span>
              ))}
            </div>

            <div className="mt-4 rounded-lg border border-[#5e6ad2]/20 bg-[#5e6ad2]/5 p-4 text-[13px] text-[#5e6ad2]">
              <p className="font-semibold">Spam guard</p>
              <p className="mt-1">
                {emailOps?.spamGuardEnabled ? "Enabled in campaign composer." : "Disabled."} Subject and body checks now flag risky promo phrases before draft creation.
              </p>
            </div>
          </article>
        </section>
      ) : null}

      {error && <p className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-[13px] text-emerald-700">{message}</p>}
    </section>
  );
}