import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { ConfirmModal } from "../components/ConfirmModal";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  createOutreachCampaign,
  deleteOutreachCampaign,
  fetchOutreachCampaigns,
  sendOutreachCampaign,
  type OutreachCampaign,
} from "../lib/api";

/* ── Status definitions for pills ── */
const campaignStatuses = [
  { key: "draft", label: "Draft", cls: "bg-slate-100 text-slate-700" },
  { key: "queued", label: "Queued", cls: "bg-sky-100 text-sky-700" },
  { key: "scheduled", label: "Scheduled", cls: "bg-violet-100 text-violet-700" },
  { key: "sending", label: "Sending", cls: "bg-amber-100 text-amber-700" },
  { key: "running", label: "Running", cls: "bg-orange-100 text-orange-700" },
  { key: "complete", label: "Complete", cls: "bg-emerald-100 text-emerald-700" },
  { key: "failed", label: "Failed", cls: "bg-rose-100 text-rose-700" },
] as const;

function statusInfo(key: string) {
  return (
    campaignStatuses.find((s) => s.key === key.toLowerCase()) || {
      key,
      label: key || "unknown",
      cls: "bg-slate-100 text-slate-600",
    }
  );
}

function formatDateTime(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "-";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

const pageSizeOptions = [25, 50, 100];

type FilterState = {
  query: string;
  niche: string;
  city: string;
};

export function OutreachCampaignsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [allCampaigns, setAllCampaigns] = useState<OutreachCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmSendId, setConfirmSendId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  /* Create modal */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  /* Filters & pills */
  const [activeStatus, setActiveStatus] = useState("");
  const [filters, setFilters] = useState<FilterState>({ query: "", niche: "", city: "" });
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({ query: "", niche: "", city: "" });

  /* Pagination */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  /* ── Data loading ── */
  async function loadCampaigns(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const data = await fetchOutreachCampaigns();
      setAllCampaigns(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  /* ── Status counts (computed from all campaigns) ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { "": allCampaigns.length };
    for (const s of campaignStatuses) counts[s.key] = 0;
    for (const c of allCampaigns) {
      const k = String(c.status || "").toLowerCase();
      if (counts[k] !== undefined) counts[k]++;
      else counts[k] = 1;
    }
    return counts;
  }, [allCampaigns]);

  /* ── Client-side filtering ── */
  const filtered = useMemo(() => {
    let list = allCampaigns;

    if (activeStatus) {
      list = list.filter((c) => c.status.toLowerCase() === activeStatus);
    }

    const q = appliedFilters.query.toLowerCase();
    const n = appliedFilters.niche.toLowerCase();
    const ci = appliedFilters.city.toLowerCase();

    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q));
    if (n) list = list.filter((c) => c.target_niche.toLowerCase().includes(n));
    if (ci) list = list.filter((c) => c.target_city.toLowerCase().includes(ci));

    return list;
  }, [allCampaigns, activeStatus, appliedFilters]);

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function applyFilters() {
    setAppliedFilters({ ...filters });
    setPage(1);
  }

  function clearFilters() {
    const empty: FilterState = { query: "", niche: "", city: "" };
    setFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  }

  const filterCount = Object.values(appliedFilters).filter(Boolean).length;

  function switchStatus(s: string) {
    setActiveStatus(s);
    setPage(1);
  }

  /* ── Actions ── */
  async function sendCampaign(campaignId: string): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const result = await sendOutreachCampaign(campaignId, { delayMs: 250 });
      showToast("success", `Campaign sent — ${result.sentCount || 0} delivered, ${result.failedCount || 0} failed`);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign send nahi ho saka");
    } finally {
      setLoading(false);
    }
  }

  async function createNewCampaign(): Promise<void> {
    if (!newName.trim()) {
      setError("Campaign name is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await createOutreachCampaign({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        leadIds: [],
        allowEmpty: true,
      });
      showToast("success", `Campaign created — ${result.campaignId.slice(0, 8)}`);
      setShowCreateModal(false);
      setNewName("");
      setNewDesc("");
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setLoading(false);
    }
  }

  async function removeCampaign(campaignId: string): Promise<void> {
    setLoading(true);
    setError("");
    try {
      await deleteOutreachCampaign(campaignId);
      showToast("success", "Campaign deleted");
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign delete nahi ho saka");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-enter gradient-mesh-bg -m-4 min-h-screen space-y-5 overflow-x-hidden p-5 sm:p-7" style={{ fontSize: "15px" }}>
      {/* Header */}
      <header className="glass-card glow-accent flex items-center justify-between rounded-2xl p-6">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#5e6ad2]">Outreach</p>
          <h2 className="mt-1 bg-gradient-to-r from-[#5e6ad2] via-[#7b85dc] to-[#a855f7] bg-clip-text text-2xl font-bold text-transparent">
            Campaigns
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            Manage all outreach campaigns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-gradient-primary rounded-lg px-5 py-2 text-[13px] font-semibold text-white"
          >
            + New Campaign
          </button>
          <span
            className="glass-badge rounded-full px-4 py-2 text-[13px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {filtered.length} campaign{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="glass-card-subtle rounded-xl border-l-4 border-red-400 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* Status Pills */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5" style={{ backgroundColor: "var(--bg-card)" }}>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => switchStatus("")}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              activeStatus === "" ? "bg-[#5e6ad2] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All{statusCounts[""] != null ? ` (${statusCounts[""]})` : ""}
          </button>
          {campaignStatuses.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => switchStatus(s.key)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                activeStatus === s.key ? "bg-[#5e6ad2] text-white" : `${s.cls} hover:opacity-80`
              }`}
            >
              {s.label}
              {statusCounts[s.key] ? ` (${statusCounts[s.key]})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2" style={{ backgroundColor: "var(--bg-card)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filters.query}
            onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
            placeholder="Search campaigns..."
            className="w-44 rounded border border-slate-200 px-2 py-1 text-[12px]"
          />
          <input
            type="text"
            value={filters.niche}
            onChange={(e) => setFilters((p) => ({ ...p, niche: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
            placeholder="Niche"
            className="w-24 rounded border border-slate-200 px-2 py-1 text-[12px]"
          />
          <input
            type="text"
            value={filters.city}
            onChange={(e) => setFilters((p) => ({ ...p, city: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
            placeholder="City"
            className="w-24 rounded border border-slate-200 px-2 py-1 text-[12px]"
          />
          <button
            type="button"
            onClick={applyFilters}
            className="rounded bg-[#5e6ad2] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#4e5abc]"
          >
            Apply
          </button>
          {filterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="glass-card glow-accent mx-4 w-full max-w-lg rounded-2xl p-6">
            <h3 className="mb-4 bg-gradient-to-r from-[#5e6ad2] to-[#a855f7] bg-clip-text text-lg font-bold text-transparent">
              Create New Campaign
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Campaign Name *</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) void createNewCampaign(); }}
                  placeholder="e.g. Plumbers Dallas Q2"
                  className="glass-input w-full rounded-lg px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="Brief description of this campaign..."
                  className="glass-input w-full rounded-lg px-3 py-2 text-[13px]"
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="glass-badge rounded-lg px-4 py-2 text-[13px] font-semibold transition-all duration-200 hover:shadow-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createNewCampaign()}
                disabled={loading || !newName.trim()}
                className="btn-gradient-primary rounded-lg px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-sm scrollbar-thin">
        <table className="min-w-[1020px] w-full text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 w-64 min-w-[220px]">Campaign Name</th>
              <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 w-32">Status</th>
              <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 w-32">Niche</th>
              <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 w-32">City</th>
              <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-20">Total</th>
              <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-20">Pending</th>
              <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-20">Sent</th>
              <th className="px-4 py-3.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-20">Failed</th>
              <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 w-44">Created</th>
              <th className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500 w-36">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && allCampaigns.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-4 animate-pulse rounded bg-slate-100" style={{ width: j < 2 ? "80%" : "50%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-14 text-center text-[13px] text-slate-400">
                  {allCampaigns.length === 0 ? (
                    <>
                      <p className="mb-3">No campaigns yet.</p>
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="btn-gradient-primary rounded-lg px-5 py-2 text-[13px] font-semibold text-white"
                      >
                        + Create Your First Campaign
                      </button>
                    </>
                  ) : (
                    <p>No campaigns match the current filters.</p>
                  )}
                </td>
              </tr>
            ) : (
              paginated.map((campaign) => {
                return (
                  <tr
                    key={campaign.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50/70"
                    onClick={() => navigate(`/outreach/campaigns/${campaign.id}`)}
                  >
                    <td className="px-4 py-3.5 font-medium text-slate-900 max-w-[240px]">
                      <div className="font-semibold text-slate-900 truncate" title={campaign.name}>{campaign.name}</div>
                      {campaign.description && (
                        <div className="mt-0.5 text-[11px] text-slate-400 truncate" title={campaign.description}>
                          {campaign.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusBadge status={campaign.status} />
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-600 whitespace-nowrap">
                      {campaign.target_niche || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-600 whitespace-nowrap">
                      {campaign.target_city || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center font-medium text-slate-900 tabular-nums">
                      {campaign.total_count}
                    </td>
                    <td className="px-4 py-3.5 text-center text-slate-600 tabular-nums">
                      {campaign.pending_count}
                    </td>
                    <td className="px-4 py-3.5 text-center text-emerald-600 font-bold tabular-nums">
                      {campaign.sent_count}
                    </td>
                    <td className="px-4 py-3.5 text-center text-rose-600 font-bold tabular-nums">
                      {campaign.failed_count}
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-slate-500 whitespace-nowrap">
                      {formatDateTime(campaign.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setConfirmSendId(campaign.id)}
                          disabled={loading || campaign.pending_count === 0}
                          className="btn-gradient-primary rounded-lg px-3 py-1.5 text-[12px] font-bold text-white shadow-sm disabled:opacity-50"
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(campaign.id)}
                          disabled={loading}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filtered.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="rounded border border-slate-200 px-2 py-1 text-[12px]"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-200 px-2 py-1 text-[12px] disabled:opacity-40"
            >
              ←
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-slate-200 px-2 py-1 text-[12px] disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Confirm Modals */}
      <ConfirmModal
        isOpen={confirmSendId !== ""}
        title="Send Campaign"
        message="Are you sure you want to send all pending emails in this campaign?"
        confirmLabel="Send"
        onCancel={() => setConfirmSendId("")}
        onConfirm={() => {
          const id = confirmSendId;
          setConfirmSendId("");
          void sendCampaign(id);
        }}
      />

      <ConfirmModal
        isOpen={confirmDeleteId !== ""}
        title="Delete Campaign"
        message="This will permanently delete the campaign and all its emails. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeleteId("")}
        onConfirm={() => {
          const id = confirmDeleteId;
          setConfirmDeleteId("");
          void removeCampaign(id);
        }}
      />
    </section>
  );
}
