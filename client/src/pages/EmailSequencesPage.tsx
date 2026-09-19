import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  fetchEmailSequences,
  createEmailSequence,
  updateEmailSequence,
  deleteEmailSequence,
  type EmailSequence,
  type EmailSequenceStep,
} from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconMail,
  IconClock,
  IconAlertTriangle,
} from '../components/ui/Icons';

const DEFAULT_STEPS: EmailSequenceStep[] = [
  {
    step_number: 1,
    delay_days: 0,
    subject: 'Quick question regarding {{business_name}}',
    body: 'Hi {{name}},\n\nI came across {{business_name}} while reviewing top service providers in {{city}}.\n\nWe noticed a few quick technical optimizations that could significantly increase your customer inbound from Google Maps.\n\nWould you be open to a 2-minute video showing the exact breakdown?\n\nBest regards,\n{{sender_name}}',
  },
  {
    step_number: 2,
    delay_days: 3,
    subject: 'Following up — quick note for {{business_name}}',
    body: 'Hi {{name}},\n\nFollowing up on my previous note. We ran a quick diagnostic on your local visibility versus other competitors in {{city}}.\n\nHappy to send over the report if helpful.\n\nBest,\n{{sender_name}}',
  },
  {
    step_number: 3,
    delay_days: 5,
    subject: 'Permission to close your file?',
    body: 'Hi {{name}},\n\nI haven\'t heard back so I\'ll assume your inbound capacity is currently full.\n\nIf you ever want to review your local visibility audit down the road, feel free to reach out.\n\nAll the best,\n{{sender_name}}',
  },
];

export function EmailSequencesPage() {
  const { showToast } = useToast();

  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editSeq, setEditSeq] = useState<EmailSequence | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<EmailSequenceStep[]>(DEFAULT_STEPS);
  const [activeStepTab, setActiveStepTab] = useState(0);
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEmailSequences();
      setSequences(data.items ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sequences';
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
    setEditSeq(null);
    setName('');
    setDescription('');
    setSteps(DEFAULT_STEPS);
    setActiveStepTab(0);
    setShowModal(true);
  }

  function openEdit(seq: EmailSequence) {
    setEditSeq(seq);
    setName(seq.name);
    setDescription(seq.description || '');
    try {
      const parsed = typeof seq.steps_json === 'string' ? JSON.parse(seq.steps_json) : seq.steps_json;
      setSteps(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_STEPS);
    } catch {
      setSteps(DEFAULT_STEPS);
    }
    setActiveStepTab(0);
    setShowModal(true);
  }

  function handleStepChange(index: number, field: keyof EmailSequenceStep, value: any) {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  }

  function addStep() {
    const nextNum = steps.length + 1;
    const lastDelay = steps[steps.length - 1]?.delay_days || 0;
    setSteps([
      ...steps,
      {
        step_number: nextNum,
        delay_days: lastDelay + 3,
        subject: 'Quick update for {{business_name}}',
        body: 'Hi {{name}},\n\nFollowing up on my previous notes...\n\nBest,\n{{sender_name}}',
      },
    ]);
    setActiveStepTab(steps.length);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) {
      showToast('error', 'A sequence must have at least one step');
      return;
    }
    const updated = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_number: i + 1 }));
    setSteps(updated);
    if (activeStepTab >= updated.length) {
      setActiveStepTab(updated.length - 1);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      showToast('error', 'Sequence name is required');
      return;
    }
    setSaving(true);
    try {
      if (editSeq) {
        await updateEmailSequence(editSeq.id, {
          name: name.trim(),
          description: description.trim(),
          steps,
        });
        showToast('success', 'Sequence updated');
      } else {
        await createEmailSequence({
          name: name.trim(),
          description: description.trim(),
          steps,
        });
        showToast('success', 'Sequence created');
      }
      setShowModal(false);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteEmailSequence(deleteId);
      showToast('success', 'Sequence deleted');
      setDeleteId(null);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Email Sequences"
        description="Design multi-step cold outreach follow-up cadences with dynamic placeholders."
        actions={
          <Button onClick={openCreate} icon={<IconPlus size={16} />} variant="primary">
            New Sequence
          </Button>
        }
      />

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <IconAlertTriangle size={18} className="shrink-0 text-rose-500" />
          <span>{error}</span>
          <Button onClick={() => void loadData()} variant="ghost" size="sm" className="ml-auto text-rose-700 hover:bg-rose-100">
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500 font-medium">Loading sequences...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sequences.length === 0 && (
        <EmptyState
          icon={<IconMail size={24} />}
          title="No email sequences created yet"
          description="Create automated multi-step outreach sequences with customized delays to nurture prospects into clients."
          actionLabel="Create Sequence"
          onAction={openCreate}
        />
      )}

      {/* Grid of Sequences */}
      {!loading && sequences.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {sequences.map((seq) => {
            const stepList: EmailSequenceStep[] = (() => {
              try {
                const parsed = typeof seq.steps_json === 'string' ? JSON.parse(seq.steps_json) : seq.steps_json;
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })();

            return (
              <Card key={seq.id} className="flex flex-col justify-between hover:border-slate-300 transition-all">
                <CardHeader
                  title={seq.name}
                  subtitle={seq.description || 'No description provided'}
                  action={
                    <div className="flex items-center gap-1">
                      <Button onClick={() => openEdit(seq)} variant="ghost" size="sm" icon={<IconEdit size={14} />} />
                      <Button
                        onClick={() => setDeleteId(seq.id)}
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        icon={<IconTrash size={14} />}
                      />
                    </div>
                  }
                />
                <CardBody className="space-y-4">
                  {/* Step visual timeline */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Steps ({stepList.length})
                    </div>
                    <div className="space-y-1.5">
                      {stepList.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                              {step.step_number}
                            </span>
                            <span className="font-medium text-slate-700 truncate">{step.subject}</span>
                          </div>
                          <Badge variant="neutral" size="sm">
                            <IconClock size={11} className="mr-1 inline" />
                            {idx === 0 ? 'Day 0' : '+' + step.delay_days + 'd'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardBody>
                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 rounded-b-xl flex items-center justify-between text-xs text-slate-400">
                  <span>Created {new Date(seq.created_at).toLocaleDateString()}</span>
                  <span className="text-indigo-600 font-medium cursor-pointer hover:underline" onClick={() => openEdit(seq)}>
                    Edit cadence &rarr;
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 border border-slate-200 p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {editSeq ? 'Edit Email Sequence' : 'Create Email Sequence'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure follow-up delays, subject lines, and personalized templates.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sequence Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Local SEO Cold Pitch Cadence"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. 3-step sequence with audit preview"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Step Tab Buttons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">Sequence Steps:</span>
                  <button
                    type="button"
                    onClick={addStep}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    + Add Step
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pb-2">
                  {steps.map((step, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveStepTab(idx)}
                      className={
                        'rounded-lg px-3 py-1.5 text-xs font-medium transition ' +
                        (activeStepTab === idx
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                      }
                    >
                      Step {step.step_number} {idx > 0 ? '(+' + step.delay_days + 'd)' : '(Initial)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Step Editor */}
              {steps[activeStepTab] && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-slate-800">
                        Step {steps[activeStepTab].step_number} Settings
                      </span>
                      {activeStepTab > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span>Delay:</span>
                          <input
                            type="number"
                            min={1}
                            max={60}
                            value={steps[activeStepTab].delay_days}
                            onChange={(e) =>
                              handleStepChange(activeStepTab, 'delay_days', Number(e.target.value) || 1)
                            }
                            className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-center focus:border-indigo-500 focus:outline-none"
                          />
                          <span>days after previous</span>
                        </div>
                      )}
                    </div>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStep(activeStepTab)}
                        className="text-xs text-rose-600 hover:text-rose-700"
                      >
                        Remove Step
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Line</label>
                    <input
                      type="text"
                      value={steps[activeStepTab].subject}
                      onChange={(e) => handleStepChange(activeStepTab, 'subject', e.target.value)}
                      placeholder="e.g. Quick question for {{business_name}}"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">Email Body</label>
                      <span className="text-[11px] text-slate-400">
                        Available tags: {'{{name}}'}, {'{{business_name}}'}, {'{{city}}'}, {'{{sender_name}}'}
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={steps[activeStepTab].body}
                      onChange={(e) => handleStepChange(activeStepTab, 'body', e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none font-mono leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <Button onClick={() => setShowModal(false)} variant="secondary">
                Cancel
              </Button>
              <Button onClick={handleSave} loading={saving} variant="primary">
                {saving ? 'Saving...' : editSeq ? 'Save Changes' : 'Create Sequence'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Sequence"
        message="Are you sure you want to delete this email sequence? Active campaigns using this sequence will be unlinked."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
