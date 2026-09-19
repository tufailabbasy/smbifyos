import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { getAuthHeaders, apiFetch } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, StatCard } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconMail,
  IconShield,
  IconCheckCircle,
  IconAlertTriangle,
  IconRefresh,
} from '../components/ui/Icons';

type SmtpAccount = {
  id: string;
  from_name: string;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  ssl: boolean;
  username: string;
  daily_limit: number;
  is_active: boolean;
  sent_today?: number;
};

type DashSender = {
  email: string;
  sent_today?: number;
  is_active?: boolean;
};

const DEFAULT_FORM = {
  from_name: '',
  from_email: '',
  smtp_host: 'smtp.titan.email',
  smtp_port: 465,
  ssl: true,
  username: '',
  password: '',
  daily_limit: 200,
};

export function EmailSendersPage() {
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState<SmtpAccount[]>([]);
  const [dashSenders, setDashSenders] = useState<DashSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Bulk add
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkHost, setBulkHost] = useState('smtp.titan.email');
  const [bulkPort, setBulkPort] = useState(465);
  const [bulkSsl, setBulkSsl] = useState(true);
  const [bulkLimit, setBulkLimit] = useState(200);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [accRes, dashRes] = await Promise.all([
        apiFetch('/api/outreach/smtp-accounts'),
        apiFetch('/api/email/dashboard'),
      ]);
      if (accRes.ok) {
        const d = await accRes.json();
        setAccounts(Array.isArray(d) ? d : d.items ?? []);
      }
      if (dashRes.ok) {
        const d = await dashRes.json();
        setDashSenders(d.senders ?? []);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load accounts';
      setError(msg);
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function openCreate() {
    setEditId(null);
    setForm({ ...DEFAULT_FORM });
    setShowPassword(false);
    setShowModal(true);
  }

  function openEdit(acc: SmtpAccount) {
    setEditId(acc.id);
    setForm({
      from_name: acc.from_name,
      from_email: acc.from_email,
      smtp_host: acc.smtp_host,
      smtp_port: acc.smtp_port,
      ssl: acc.ssl,
      username: acc.username,
      password: '',
      daily_limit: acc.daily_limit || 200,
    });
    setShowPassword(false);
    setShowModal(true);
  }

  async function testConnection() {
    if (!form.from_email || !form.smtp_host || !form.username) {
      showToast('error', 'Please enter Email, Host, and Username before testing');
      return;
    }
    setTesting(true);
    try {
      const res = await apiFetch('/api/outreach/smtp-accounts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success || data.ok) {
        showToast('success', 'SMTP Connection verified successfully!');
      } else {
        showToast('error', data.error || 'SMTP Connection failed');
      }
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  async function saveAccount() {
    if (!form.from_email.trim() || !form.from_name.trim()) {
      showToast('error', 'From Name and From Email are required');
      return;
    }
    setSaving(true);
    try {
      const url = editId ? ('/api/outreach/smtp-accounts/' + editId) : '/api/outreach/smtp-accounts';
      const method = editId ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('success', editId ? 'Sender account updated' : 'Sender account added');
      setShowModal(false);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await apiFetch('/api/outreach/smtp-accounts/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      showToast('success', 'Sender account removed');
      setDeleteId(null);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function saveBulk() {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    if (!lines.length) {
      showToast('error', 'Please enter at least one account');
      return;
    }
    setBulkSaving(true);
    try {
      const payload = lines.map((l) => {
        const parts = l.split(/[,:\t]/).map((p) => p.trim());
        const email = parts[0] || '';
        const pwd = parts[1] || '';
        const name = parts[2] || email.split('@')[0] || 'Outreach';
        return {
          from_name: name,
          from_email: email,
          username: email,
          password: pwd,
          smtp_host: bulkHost,
          smtp_port: bulkPort,
          ssl: bulkSsl,
          daily_limit: bulkLimit,
        };
      });

      const res = await apiFetch('/api/settings/smtp-accounts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('success', 'Imported ' + payload.length + ' accounts successfully');
      setShowBulk(false);
      setBulkText('');
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Bulk import failed');
    } finally {
      setBulkSaving(false);
    }
  }

  const activeAccounts = accounts.filter((a) => a.is_active);
  const totalDailyCapacity = activeAccounts.reduce((acc, a) => acc + (a.daily_limit || 200), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Sender Accounts"
        description="Manage SMTP mailboxes, monitor sending limits, and balance outbound delivery."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowBulk(true)} variant="outline">
              Bulk Import
            </Button>
            <Button onClick={openCreate} icon={<IconPlus size={16} />} variant="primary">
              Add Mailbox
            </Button>
          </div>
        }
      />

      {/* Quick Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Mailboxes"
          value={accounts.length}
          icon={<IconMail size={18} />}
          color="indigo"
        />
        <StatCard
          label="Active Senders"
          value={activeAccounts.length}
          icon={<IconCheckCircle size={18} />}
          color="emerald"
        />
        <StatCard
          label="Daily Sending Capacity"
          value={totalDailyCapacity.toLocaleString() + ' emails'}
          icon={<IconShield size={18} />}
          color="violet"
        />
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
          <p className="mt-3 text-sm text-slate-500 font-medium">Loading sender accounts...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && accounts.length === 0 && (
        <EmptyState
          icon={<IconMail size={24} />}
          title="No SMTP sender accounts configured"
          description="Connect your outbound mailboxes (Google Workspace, Titan, Outlook, or Custom SMTP) to start sending automated client pitch sequences."
          actionLabel="Add Your First Mailbox"
          onAction={openCreate}
        />
      )}

      {/* Senders Table */}
      {!loading && accounts.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Sender Info</th>
                  <th className="px-5 py-3.5">SMTP Host & Port</th>
                  <th className="px-5 py-3.5">Daily Limit</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-50/60 transition">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{acc.from_name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{acc.from_email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs font-mono text-slate-700">{acc.smtp_host}:{acc.smtp_port}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{acc.ssl ? 'SSL/TLS Enabled' : 'Standard Connection'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-slate-800">{acc.daily_limit || 200}</span>
                      <span className="text-xs text-slate-400"> / day</span>
                    </td>
                    <td className="px-5 py-4">
                      {acc.is_active ? (
                        <Badge variant="success" size="sm" dot>Active</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Paused</Badge>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button onClick={() => openEdit(acc)} variant="ghost" size="sm" icon={<IconEdit size={14} />}>
                          Edit
                        </Button>
                        <Button
                          onClick={() => setDeleteId(acc.id)}
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          icon={<IconTrash size={14} />}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 border border-slate-200 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {editId ? 'Edit Mailbox' : 'Add Outbound Mailbox'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure SMTP credentials for sending campaigns.</p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">From Name *</label>
                  <input
                    type="text"
                    value={form.from_name}
                    onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">From Email *</label>
                  <input
                    type="email"
                    value={form.from_email}
                    onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                    placeholder="sarah@agencygrowth.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={form.smtp_host}
                    onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                    placeholder="smtp.titan.email"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Port</label>
                  <input
                    type="number"
                    value={form.smtp_port}
                    onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) || 465 })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username / Auth Login</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="username@agencygrowth.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editId ? 'Password (leave blank to keep)' : 'Password *'}
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Daily Sending Limit</label>
                  <input
                    type="number"
                    value={form.daily_limit}
                    onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) || 200 })}
                    min={1}
                    max={2000}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.ssl}
                      onChange={(e) => setForm({ ...form, ssl: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Use SSL / TLS (Port 465)
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button onClick={testConnection} loading={testing} variant="outline" size="sm">
                Test Connection
              </Button>
              <div className="flex items-center gap-2">
                <Button onClick={() => setShowModal(false)} variant="secondary" size="sm">
                  Cancel
                </Button>
                <Button onClick={saveAccount} loading={saving} variant="primary" size="sm">
                  {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Mailbox'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 border border-slate-200 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Bulk Import Senders</h3>
              <p className="text-xs text-slate-500 mt-0.5">Paste multiple accounts in email:password:name format.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Accounts (1 per line)</label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={6}
                  placeholder={'sender1@agency.com:AppPass123:Alex\nsender2@agency.com:AppPass123:Jordan'}
                  className="w-full rounded-lg border border-slate-200 p-3 text-xs font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={bulkHost}
                    onChange={(e) => setBulkHost(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Daily Limit per Account</label>
                  <input
                    type="number"
                    value={bulkLimit}
                    onChange={(e) => setBulkLimit(Number(e.target.value) || 200)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button onClick={() => setShowBulk(false)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button onClick={saveBulk} loading={bulkSaving} variant="primary" size="sm">
                {bulkSaving ? 'Importing...' : 'Import Senders'}
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
            <h3 className="text-base font-semibold text-slate-900">Remove Mailbox?</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              This will disconnect this sender account. Ongoing campaigns will stop routing through this mailbox.
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
                {deleting ? 'Removing...' : 'Remove Mailbox'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
