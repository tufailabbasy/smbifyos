import { useEffect, useMemo, useState } from "react";
import {
  createClientProject,
  fetchClients,
  fetchLeads,
  updateClientProject,
  type ClientProject,
  type Lead,
} from "../lib/api";

type ClientFormState = {
  lead_id: string;
  business_name: string;
  city: string;
  state: string;
  website: string;
  package_type: string;
  monthly_budget: string;
  start_date: string;
  assigned_team_member: string;
};

const emptyForm: ClientFormState = {
  lead_id: "",
  business_name: "",
  city: "",
  state: "",
  website: "",
  package_type: "",
  monthly_budget: "",
  start_date: "",
  assigned_team_member: "",
};

export function ClientProjectsPage() {
  const [clients, setClients] = useState<ClientProject[]>([]);
  const [leadOptions, setLeadOptions] = useState<Lead[]>([]);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [query, setQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData(search = ""): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const [clientData, leadData] = await Promise.all([
        fetchClients(search || undefined),
        fetchLeads({ page: 1, pageSize: 200 }),
      ]);

      setClients(clientData.items);
      setLeadOptions(leadData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load client projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const stats = useMemo(() => {
    const totalBudget = clients.reduce((sum, client) => sum + Number(client.monthly_budget || 0), 0);
    const openTasks = clients.reduce((sum, client) => sum + Number(client.open_tasks || 0), 0);

    return {
      totalClients: clients.length,
      totalBudget,
      openTasks,
    };
  }, [clients]);

  function applyLeadPreset(leadId: string): void {
    const selectedLead = leadOptions.find((lead) => lead.id === leadId);

    setForm((current) => ({
      ...current,
      lead_id: leadId,
      business_name: selectedLead?.business_name || current.business_name,
      city: selectedLead?.city || current.city,
      state: selectedLead?.state || current.state,
      website: selectedLead?.website || current.website,
    }));
  }

  function applyClientToForm(client: ClientProject): void {
    setSelectedClientId(client.id);
    setForm({
      lead_id: client.lead_id,
      business_name: client.business_name,
      city: client.city,
      state: client.state,
      website: client.website,
      package_type: client.package_type,
      monthly_budget: client.monthly_budget === null ? "" : String(client.monthly_budget),
      start_date: client.start_date,
      assigned_team_member: client.assigned_team_member,
    });
  }

  async function saveClient(): Promise<void> {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        ...form,
        monthly_budget: form.monthly_budget ? Number(form.monthly_budget) : null,
      };

      if (selectedClientId) {
        const updated = await updateClientProject(selectedClientId, payload);
        setClients((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMessage(`Updated ${updated.business_name}.`);
      } else {
        const created = await createClientProject(payload);
        setClients((current) => [created, ...current]);
        setMessage(`Created client project for ${created.business_name}.`);
      }

      setSelectedClientId("");
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save client project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-enter space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-slate-400">Client Projects</p>
          <h2 className="text-2xl font-semibold text-slate-900">Managed Accounts</h2>
          <p className="text-[13px] text-slate-600">Promote leads into active client projects and track ownership basics.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]"
          />
          <button
            type="button"
            onClick={() => void loadData(query)}
            className="rounded-lg bg-[#5e6ad2] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4e5abc]"
          >
            Search
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {["totalClients", "totalBudget", "openTasks"].map((key) => (
          <article key={key} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[12px] uppercase tracking-[0.08em] text-slate-500">
              {key === "totalClients" ? "Total Clients" : key === "totalBudget" ? "Monthly Budget" : "Open Tasks"}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {key === "totalBudget" ? `$${stats.totalBudget.toLocaleString()}` : stats[key as keyof typeof stats]}
            </p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">
            {selectedClientId ? "Edit Client Project" : "Create Client Project"}
          </h3>
          <div className="mt-4 grid gap-3">
            <label className="space-y-1 text-[13px] text-slate-700">
              <span>Prefill from lead</span>
              <select
                value={form.lead_id}
                onChange={(event) => applyLeadPreset(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Manual entry</option>
                {leadOptions.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.business_name} • {lead.city || "Unknown city"}
                  </option>
                ))}
              </select>
            </label>

            {[
              ["business_name", "Business name"],
              ["city", "City"],
              ["state", "State"],
              ["website", "Website"],
              ["package_type", "Package type"],
              ["monthly_budget", "Monthly budget"],
              ["start_date", "Start date"],
              ["assigned_team_member", "Assigned team member"],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1 text-[13px] text-slate-700">
                <span>{label}</span>
                <input
                  type={key === "monthly_budget" ? "number" : key === "start_date" ? "date" : "text"}
                  value={form[key as keyof ClientFormState]}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
            ))}

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
                onClick={() => {
                  setSelectedClientId("");
                  setForm(emptyForm);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700"
              >
                Reset
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Client List</h3>
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
                    <p className="font-semibold text-slate-900">{client.business_name}</p>
                    <p className="text-[13px] text-slate-600">
                      {client.city || "Unknown city"}{client.state ? `, ${client.state}` : ""}
                    </p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-700">
                    {client.package_type || "No package"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-[13px] text-slate-600 sm:grid-cols-3">
                  <p>Budget: {client.monthly_budget === null ? "--" : `$${client.monthly_budget}`}</p>
                  <p>Open tasks: {client.open_tasks}</p>
                  <p>Keywords: {client.total_keywords}</p>
                </div>
              </button>
            ))}

            {!loading && clients.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">
                No client projects yet. Promote a lead into an active account from the form on the left.
              </p>
            ) : null}
          </div>
        </article>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-[13px] text-emerald-700">{message}</p>}
    </section>
  );
}