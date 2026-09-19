import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { apiFetch } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import {
  IconPlus,
  IconTrash,
  IconShield,
  IconAlertTriangle,
  IconSearch,
} from '../components/ui/Icons';

type SuppressionItem = {
  id: string;
  email: string;
  reason: 'bounced' | 'unsubscribed' | 'manual';
  campaign_id?: string;
  notes?: string;
  created_at: string;
};

type ReasonFilter = 'all' | 'bounced' | 'unsubscribed' | 'manual';

function formatDate(d: string) {
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const PAGE_SIZE = 50;

export function EmailSuppressionPage() {
  const { showToast } = useToast();

  const [items, setItems] = useState<SuppressionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ReasonFilter>('all');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addReason, setAddReason] = useState<'bounced' | 'unsubscribed' | 'manual'>('manual');
  const [addNotes, setAddNotes] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadData(tab: ReasonFilter = activeTab, p: number = page) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      if (tab !== 'all') params.set('reason', tab);
      const res = await apiFetch('/api/email/suppression?' + params.toString());
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load suppression list';
      setError(msg);
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(activeTab, page);
  }, [activeTab, page]);

  function switchTab(tab: ReasonFilter) {
    setActiveTab(tab);
    setPage(1);
  }

  async function handleAdd() {
    if (!addEmail.trim()) {
      showToast('error', 'Email address is required');
      return;
    }
    setAddSaving(true);
    try {
      const res = await apiFetch('/api/email/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addEmail.trim(), reason: addReason, notes: addNotes }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('success', 'Email added to suppression list');
      setShowAdd(false);
      setAddEmail('');
      setAddNotes('');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to add email');
    } finally {
      setAddSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await apiFetch('/api/email/suppression/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showToast('success', 'Removed from suppression list');
      setDeleteId(null);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Failed to remove entry');
    } finally {
      setDeleting(false);
    }
  }

  const filteredItems = items.filter((it) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return it.email.toLowerCase().includes(q) || (it.notes && it.notes.toLowerCase().includes(q));
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Suppression & Do-Not-Contact List"
        description="Prevent emails from ever being sent to bounced addresses, unsubscribes, or manually blacklisted prospects."
        actions={
          <Button onClick={() => setShowAdd(true)} icon={<IconPlus size={16} />} variant="primary">
            Suppress Email
          </Button>
        }
      />

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {[
            { key: 'all', label: 'All Suppressions' },
            { key: 'unsubscribed', label: 'Unsubscribes' },
            { key: 'bounced', label: 'Bounced' },
            { key: 'manual', label: 'Manual Blacklist' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key as ReasonFilter)}
              className={'rounded-md px-3 py-1.5 text-xs font-semibold transition ' + (
                activeTab === t.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search suppressed emails..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none shadow-sm"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <IconAlertTriangle size={18} className="shrink-0 text-rose-500" />
          <span>{error}</span>
          <Button onClick={() => void loadData()} variant="ghost" size="sm" className="ml-auto text-rose-700 hover:bg-rose-100">
            Retry
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500 font-medium">Loading suppression records...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredItems.length === 0 && (
        <EmptyState
          icon={<IconShield size={24} />}
          title="No suppressed email addresses"
          description={
            searchQuery
              ? 'No suppressed emails match your search query.'
              : 'Your suppression list is empty. Any future unsubscribes or hard bounces will be automatically captured here to safeguard your domain reputation.'
          }
          actionLabel={searchQuery ? undefined : 'Add Suppression'}
          onAction={searchQuery ? undefined : () => setShowAdd(true)}
        />
      )}

      {/* Table */}
      {!loading && filteredItems.length > 0 && (
        <Card className="overflow-hidden border border-slate-200/80 shadow-sm">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="min-w-[760px] w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5 w-64 min-w-[220px]">Email Address</th>
                  <th className="px-5 py-3.5 w-36">Reason</th>
                  <th className="px-5 py-3.5">Notes</th>
                  <th className="px-5 py-3.5 w-36">Added Date</th>
                  <th className="px-5 py-3.5 text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4 font-mono font-medium text-slate-900 truncate max-w-[260px]" title={item.email}>
                      {item.email}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <StatusBadge status={item.reason} customLabel={item.reason === 'manual' ? 'Manual Block' : item.reason === 'bounced' ? 'Bounced' : 'Unsubscribed'} />
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {item.notes || '—'}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        onClick={() => setDeleteId(item.id)}
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        icon={<IconTrash size={14} />}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 border border-slate-200">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Suppress Email Address</h3>
              <p className="text-xs text-slate-500 mt-0.5">Blacklist an email from receiving any cold outreach messages.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="prospect@company.com"
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                <select
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  <option value="manual">Manual Suppression / Do-Not-Contact</option>
                  <option value="unsubscribed">Unsubscribed</option>
                  <option value="bounced">Hard Bounced</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  placeholder="e.g. Requested removal via phone call"
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button onClick={() => setShowAdd(false)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button onClick={handleAdd} loading={addSaving} variant="primary" size="sm">
                {addSaving ? 'Adding...' : 'Add to Suppression'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-slate-200">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 mb-3">
              <IconTrash size={20} />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Remove from Suppression?</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              This will re-allow campaigns to deliver messages to this address.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button onClick={() => setDeleteId(null)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button
                onClick={() => void handleDelete(deleteId)}
                loading={deleting}
                variant="danger"
                size="sm"
              >
                {deleting ? 'Removing...' : 'Remove Entry'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
