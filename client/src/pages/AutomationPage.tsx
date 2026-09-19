import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  fetchAutomationWorkflows,
  createAutomationWorkflow,
  deleteAutomationWorkflow,
  fetchAutomationRuns,
  startAutomationRun,
  type AutomationWorkflow,
  type AutomationRun,
} from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import {
  IconPlus,
  IconPlay,
  IconTrash,
  IconClock,
  IconAlertTriangle,
  IconLayers,
} from '../components/ui/Icons';

/* ── Step type definitions ── */
const stepTypeOptions = [
  { type: 'scrape_google_maps', label: 'Scrape Google Maps', sourceLabel: 'Google Maps' },
  { type: 'scrape_yellow_pages', label: 'Scrape Yellow Pages', sourceLabel: 'Yellow Pages' },
  { type: 'scrape_yelp', label: 'Scrape Yelp', sourceLabel: 'Yelp' },
  { type: 'scrape_bbb', label: 'Scrape BBB', sourceLabel: 'Better Business Bureau' },
  { type: 'scrape_state_directory', label: 'Scrape State Directory', sourceLabel: 'State Directory' },
  { type: 'scrape_chamber_directory', label: 'Scrape Chamber Directory', sourceLabel: 'Chamber Directory' },
  { type: 'audit_website', label: 'Website Audit', sourceLabel: '' },
  { type: 'audit_gmb', label: 'GBP / Maps Audit', sourceLabel: '' },
  { type: 'audit_eeat', label: 'EEAT Authority Audit', sourceLabel: '' },
  { type: 'create_campaign', label: 'Create Outreach Campaign', sourceLabel: '' },
] as const;

function stepTypeLabel(type: string) {
  const found = stepTypeOptions.find((o) => o.type === type);
  return found?.label || type;
}

function formatDateTime(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '-';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AutomationPage() {
  const { showToast } = useToast();

  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Create modal */
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newScheduleType, setNewScheduleType] = useState('none');
  const [newScheduleSpec, setNewScheduleSpec] = useState('');
  const [newDefaultInput, setNewDefaultInput] = useState({ source: 'google_maps', query: '', city: '', state: '', niche: '', maxLeads: 50 });
  const [saving, setSaving] = useState(false);

  /* Wizard states */
  const [wizardStep, setWizardStep] = useState(1);
  const [wizScraper, setWizScraper] = useState('scrape_google_maps');
  const [wizAuditWebsite, setWizAuditWebsite] = useState(true);
  const [wizAuditGmb, setWizAuditGmb] = useState(true);
  const [wizAuditEeat, setWizAuditEeat] = useState(false);
  const [wizRunCampaign, setWizRunCampaign] = useState(true);

  /* Run modal */
  const [runWorkflow, setRunWorkflow] = useState<AutomationWorkflow | null>(null);
  const [runSource, setRunSource] = useState('google_maps');
  const [runQuery, setRunQuery] = useState('');
  const [runCity, setRunCity] = useState('');
  const [runState, setRunState] = useState('');
  const [runNiche, setRunNiche] = useState('');
  const [runMaxLeads, setRunMaxLeads] = useState(50);
  const [runCampaignName, setRunCampaignName] = useState('');
  const [runCampaignSubject, setRunCampaignSubject] = useState('');
  const [runCampaignBody, setRunCampaignBody] = useState('');
  const [running, setRunning] = useState(false);

  /* Delete modal */
  const [deleteId, setDeleteId] = useState('');

  /* Expanded runs */
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);

  async function loadWorkflows() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAutomationWorkflows();
      setWorkflows(data.items ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load workflows';
      setError(msg);
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns(workflowId: string) {
    try {
      const data = await fetchAutomationRuns(workflowId, 10);
      setRuns(data.items ?? []);
    } catch {
      // silent background refresh
    }
  }

  useEffect(() => {
    void loadWorkflows();
  }, []);

  useEffect(() => {
    if (!expandedWorkflowId) {
      setRuns([]);
      return;
    }
    loadRuns(expandedWorkflowId);
    const timer = setInterval(() => {
      loadRuns(expandedWorkflowId);
    }, 4000);
    return () => clearInterval(timer);
  }, [expandedWorkflowId]);

  function handleExpandWorkflow(wf: AutomationWorkflow) {
    if (expandedWorkflowId === wf.id) {
      setExpandedWorkflowId(null);
    } else {
      setExpandedWorkflowId(wf.id);
    }
  }

  useEffect(() => {
    if (!runWorkflow) return;
    try {
      const defaults = runWorkflow.default_input_json ? JSON.parse(runWorkflow.default_input_json) : {};
      setRunSource(defaults.source || 'google_maps');
      setRunQuery(defaults.query || '');
      setRunCity(defaults.city || '');
      setRunState(defaults.state || '');
      setRunNiche(defaults.niche || '');
      setRunMaxLeads(defaults.maxLeads || 50);
      setRunCampaignName(defaults.campaignName || (runWorkflow.name + ' Campaign'));
      setRunCampaignSubject(defaults.campaignSubject || '');
      setRunCampaignBody(defaults.campaignBody || '');
    } catch {
      setRunSource('google_maps');
      setRunQuery('');
      setRunCity('');
      setRunState('');
      setRunNiche('');
      setRunMaxLeads(50);
      setRunCampaignName(runWorkflow.name + ' Campaign');
      setRunCampaignSubject('');
      setRunCampaignBody('');
    }
  }, [runWorkflow]);

  async function handleCreateWorkflow() {
    setSaving(true);
    try {
      const builtSteps = [];
      const scraperLabel = stepTypeOptions.find((o) => o.type === wizScraper)?.label || 'Scrape Leads';
      builtSteps.push({ type: wizScraper, label: scraperLabel, config: {} });

      if (wizAuditWebsite) builtSteps.push({ type: 'audit_website', label: 'Website Audit', config: {} });
      if (wizAuditGmb) builtSteps.push({ type: 'audit_gmb', label: 'GBP / Google Maps Audit', config: {} });
      if (wizAuditEeat) builtSteps.push({ type: 'audit_eeat', label: 'EEAT Authority Audit', config: {} });
      if (wizRunCampaign) builtSteps.push({ type: 'create_campaign', label: 'Create Outreach Campaign', config: {} });

      const autoName = newName.trim() || (scraperLabel + ' + Audits Automation');
      const autoDesc = newDesc.trim() || ('Automated workflow harvesting leads from ' + scraperLabel + ', running audits, and generating campaigns.');

      const mapWizScraperToSource: Record<string, string> = {
        scrape_google_maps: 'google_maps',
        scrape_yellow_pages: 'yellow_pages',
        scrape_yelp: 'yelp',
        scrape_bbb: 'bbb',
        scrape_state_directory: 'state_directory',
        scrape_chamber_directory: 'chamber_directory',
      };

      await createAutomationWorkflow({
        name: autoName,
        description: autoDesc,
        steps: builtSteps,
        scheduleType: newScheduleType,
        scheduleSpec: newScheduleSpec || null,
        defaultInput: {
          ...newDefaultInput,
          source: mapWizScraperToSource[wizScraper] || 'google_maps',
        },
      });

      showToast('success', 'Workflow created successfully');
      setShowCreate(false);
      resetCreateForm();
      await loadWorkflows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create workflow';
      showToast('error', msg);
    } finally {
      setSaving(false);
    }
  }

  function resetCreateForm() {
    setNewName('');
    setNewDesc('');
    setNewScheduleType('none');
    setNewScheduleSpec('');
    setNewDefaultInput({ source: 'google_maps', query: '', city: '', state: '', niche: '', maxLeads: 50 });
    setWizardStep(1);
    setWizScraper('scrape_google_maps');
    setWizAuditWebsite(true);
    setWizAuditGmb(true);
    setWizAuditEeat(false);
    setWizRunCampaign(true);
  }

  async function handleDeleteWorkflow() {
    if (!deleteId) return;
    try {
      await deleteAutomationWorkflow(deleteId);
      showToast('success', 'Workflow deleted');
      setDeleteId('');
      await loadWorkflows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      showToast('error', msg);
    }
  }

  async function handleRunWorkflow() {
    if (!runWorkflow) return;
    setRunning(true);
    try {
      await startAutomationRun(runWorkflow.id, {
        source: runSource,
        query: runQuery,
        city: runCity,
        state: runState,
        niche: runNiche,
        maxLeads: runMaxLeads,
        campaignName: runCampaignName || undefined,
        campaignSubject: runCampaignSubject || undefined,
        campaignBody: runCampaignBody || undefined,
      });
      showToast('success', 'Workflow run started');
      const targetWfId = runWorkflow.id;
      setRunWorkflow(null);
      setExpandedWorkflowId(targetWfId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start run';
      showToast('error', msg);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Automation Workflows"
        description="Build multi-step automated pipelines that scrape leads, run diagnostics, and launch outreach campaigns."
        actions={
          <Button
            onClick={() => {
              resetCreateForm();
              setShowCreate(true);
            }}
            icon={<IconPlus size={16} />}
            variant="primary"
          >
            New Workflow
          </Button>
        }
      />

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <IconAlertTriangle size={18} className="shrink-0 text-rose-500" />
          <span>{error}</span>
          <Button onClick={() => void loadWorkflows()} variant="ghost" size="sm" className="ml-auto text-rose-700 hover:bg-rose-100">
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500 font-medium">Loading workflows...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && workflows.length === 0 && (
        <EmptyState
          icon={<IconLayers size={24} />}
          title="No automation workflows found"
          description="Create your first automated workflow to harvest local business leads, run SEO audits, and generate email sequences in a single automated flow."
          actionLabel="Create Automation Workflow"
          onAction={() => {
            resetCreateForm();
            setShowCreate(true);
          }}
        />
      )}

      {/* Workflows List */}
      {!loading && workflows.length > 0 && (
        <div className="space-y-4">
          {workflows.map((wf) => {
            const steps = (() => {
              try {
                return JSON.parse(wf.steps_json);
              } catch {
                return [];
              }
            })();
            const isExpanded = expandedWorkflowId === wf.id;

            return (
              <Card key={wf.id} className="overflow-hidden border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
                {/* Workflow Header / Summary */}
                <div
                  onClick={() => handleExpandWorkflow(wf)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 cursor-pointer bg-white hover:bg-slate-50/60 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-semibold text-slate-900 truncate">{wf.name}</h3>
                      {wf.is_active ? (
                        <Badge variant="success" size="sm" dot>Active</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Inactive</Badge>
                      )}
                      {wf.schedule_type && wf.schedule_type !== 'none' && (
                        <Badge variant="brand" size="sm">
                          <IconClock size={12} className="mr-1 inline" />
                          {wf.schedule_type === 'daily' ? ('Daily @ ' + (wf.schedule_spec || '09:00')) : wf.schedule_spec}
                        </Badge>
                      )}
                    </div>
                    {wf.description && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-1">{wf.description}</p>
                    )}

                    {/* Step chips */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {steps.map((s: { label?: string; type: string }, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        >
                          <span className="text-[10px] text-slate-400 font-bold">{idx + 1}.</span>
                          {s.label || stepTypeLabel(s.type)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      onClick={() => setRunWorkflow(wf)}
                      variant="primary"
                      size="sm"
                      icon={<IconPlay size={14} />}
                    >
                      Run Now
                    </Button>
                    <Button
                      onClick={() => setDeleteId(wf.id)}
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      icon={<IconTrash size={14} />}
                    />
                  </div>
                </div>

                {/* Expanded Execution History */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Execution History (Live)</span>
                      <span className="text-[11px] text-slate-400">Auto-refreshing every 4s</span>
                    </div>

                    {runs.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                        No recorded execution runs yet. Click 'Run Now' above to trigger an automated pipeline.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {runs.map((r) => {
                          const stepsProgress = (() => {
                            try {
                              return JSON.parse(r.steps_progress_json || '[]');
                            } catch {
                              return [];
                            }
                          })();

                          return (
                            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 font-medium">
                                  <StatusBadge status={r.status} customLabel={r.status === 'running' ? `Running (${r.progress_percent}%)` : undefined} />
                                  <span className="text-slate-600 font-mono text-[11px]">ID: {r.id.slice(0, 8)}</span>
                                </div>
                                <span className="text-slate-400 text-[11px]">{formatDateTime(r.created_at)}</span>
                              </div>

                              {r.progress_message && (
                                <p className="text-xs text-slate-600">{r.progress_message}</p>
                              )}

                              {/* Progress bar */}
                              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 transition-all duration-300"
                                  style={{ width: (r.progress_percent + '%') }}
                                />
                              </div>

                              {/* Step pills */}
                              <div className="flex flex-wrap gap-1">
                                {stepsProgress.map((sp: { step: number; status: string; label?: string }) => (
                                  <span
                                    key={sp.step}
                                    className={'rounded px-2 py-0.5 text-[10px] font-medium ' + (
                                      sp.status === 'completed'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : sp.status === 'running'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : sp.status === 'failed'
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-slate-100 text-slate-500'
                                    )}
                                  >
                                    {sp.label || ('Step ' + sp.step)}
                                  </span>
                                ))}
                              </div>

                              {r.error_message && (
                                <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100">{r.error_message}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create Wizard Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Header & Stepper */}
            <div className="p-6 border-b border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">New Automation Pipeline</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Configure scraping, diagnostics, and campaign generation in 4 steps.</p>
                </div>
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                  Step {wizardStep} of 4
                </span>
              </div>

              {/* Stepper pills */}
              <div className="grid grid-cols-4 gap-2 pt-2">
                {[
                  { step: 1, label: '1. Source' },
                  { step: 2, label: '2. Audits' },
                  { step: 3, label: '3. Campaign' },
                  { step: 4, label: '4. Trigger' },
                ].map((s) => (
                  <div
                    key={s.step}
                    className={'rounded-lg py-1.5 px-2 text-center text-xs font-semibold transition ' + (
                      wizardStep === s.step
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : wizardStep > s.step
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-400'
                    )}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Step Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* Step 1: Scraper */}
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">Choose lead harvest source:</label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { type: 'scrape_google_maps', label: 'Google Maps Scraper', desc: 'Extract businesses, phones, reviews & coordinates directly from Google Maps.' },
                      { type: 'scrape_yellow_pages', label: 'Yellow Pages Scraper', desc: 'Harvest categorized local trade directories and contact numbers.' },
                      { type: 'scrape_yelp', label: 'Yelp Scraper', desc: 'Extract local service providers, customer ratings, and profile links.' },
                      { type: 'scrape_bbb', label: 'BBB Scraper', desc: 'Extract business trust credentials and accreditation ratings.' },
                      { type: 'scrape_state_directory', label: 'State Registry Scraper', desc: 'Harvest corporate registry listings from state databases.' },
                      { type: 'scrape_chamber_directory', label: 'Chamber Directory', desc: 'Extract vetted local chamber of commerce member records.' },
                    ].map((opt) => (
                      <div
                        key={opt.type}
                        onClick={() => setWizScraper(opt.type)}
                        className={'rounded-xl border p-4 cursor-pointer transition text-left ' + (
                          wizScraper === opt.type
                            ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        )}
                      >
                        <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                        <span className="block text-xs text-slate-500 mt-1 leading-normal">{opt.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Audits */}
              {wizardStep === 2 && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">Select automated background diagnostics:</label>
                  <div className="space-y-2.5">
                    {[
                      { checked: wizAuditWebsite, setChecked: setWizAuditWebsite, label: 'Website SEO & Performance Audit', desc: 'Analyzes title/meta, speed, schema markup, mobile responsiveness, and security.' },
                      { checked: wizAuditGmb, setChecked: setWizAuditGmb, label: 'Google Business Profile (GBP) Audit', desc: 'Validates claim status, review velocity, rating tiers, and citation signals.' },
                      { checked: wizAuditEeat, setChecked: setWizAuditEeat, label: 'EEAT Authority & Trust Audit', desc: 'Checks author signals, social footprint, and credibility factors.' },
                    ].map((opt, i) => (
                      <label
                        key={i}
                        className={'flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ' + (
                          opt.checked ? 'border-indigo-600 bg-indigo-50/40' : 'border-slate-200 hover:border-slate-300 bg-white'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          onChange={(e) => opt.setChecked(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                          <span className="block text-xs text-slate-500 mt-0.5">{opt.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Campaign */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <label className="block text-xs font-semibold text-slate-700">Automated Outreach Campaign:</label>
                  <label className={'flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ' + (
                    wizRunCampaign ? 'border-indigo-600 bg-indigo-50/40' : 'border-slate-200 hover:border-slate-300 bg-white'
                  )}>
                    <input
                      type="checkbox"
                      checked={wizRunCampaign}
                      onChange={(e) => setWizRunCampaign(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-slate-900">Auto-create Outreach Campaign</span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Immediately prepares cold outreach email drafts for leads once their audits are completed.
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* Step 4: Details & Schedule */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Workflow Name (Optional)</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Miami Plumber Growth Engine"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Notes about this automation flow..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                    />
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                    <label className="block text-xs font-semibold text-slate-800">Trigger Schedule</label>
                    <div className="flex items-center gap-3">
                      <select
                        value={newScheduleType}
                        onChange={(e) => setNewScheduleType(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="none">Manual Trigger Only</option>
                        <option value="daily">Daily Schedule</option>
                        <option value="cron">Advanced Cron Expression</option>
                      </select>

                      {newScheduleType === 'daily' && (
                        <input
                          type="time"
                          value={newScheduleSpec}
                          onChange={(e) => setNewScheduleSpec(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                        />
                      )}
                      {newScheduleType === 'cron' && (
                        <input
                          type="text"
                          value={newScheduleSpec}
                          onChange={(e) => setNewScheduleSpec(e.target.value)}
                          placeholder="0 9 * * *"
                          className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4 rounded-b-2xl">
              <Button
                onClick={() => {
                  if (wizardStep === 1) {
                    setShowCreate(false);
                  } else {
                    setWizardStep(wizardStep - 1);
                  }
                }}
                variant="secondary"
              >
                {wizardStep === 1 ? 'Cancel' : 'Back'}
              </Button>
              <Button
                onClick={() => {
                  if (wizardStep < 4) {
                    setWizardStep(wizardStep + 1);
                  } else {
                    void handleCreateWorkflow();
                  }
                }}
                loading={saving}
                variant="primary"
              >
                {saving ? 'Saving...' : wizardStep === 4 ? 'Create Pipeline' : 'Next Step'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Run Modal ── */}
      {runWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 border border-slate-200 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Run Automation Pipeline</h3>
              <p className="text-xs text-slate-500 mt-0.5">{runWorkflow.name}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Search Query *</label>
                <input
                  type="text"
                  value={runQuery}
                  onChange={(e) => setRunQuery(e.target.value)}
                  placeholder="e.g. roofing contractor, cosmetic dentist"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={runCity}
                    onChange={(e) => setRunCity(e.target.value)}
                    placeholder="Miami"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={runState}
                    onChange={(e) => setRunState(e.target.value)}
                    placeholder="FL"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Niche Category</label>
                  <input
                    type="text"
                    value={runNiche}
                    onChange={(e) => setRunNiche(e.target.value)}
                    placeholder="Roofing"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Max Leads</label>
                  <input
                    type="number"
                    value={runMaxLeads}
                    onChange={(e) => setRunMaxLeads(Number(e.target.value) || 50)}
                    min={1}
                    max={500}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <Button onClick={() => setRunWorkflow(null)} variant="secondary">
                Cancel
              </Button>
              <Button
                onClick={handleRunWorkflow}
                loading={running}
                disabled={!runQuery.trim()}
                variant="primary"
                icon={<IconPlay size={14} />}
              >
                {running ? 'Starting Run...' : 'Start Execution'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Workflow"
        message="Are you sure you want to delete this workflow and its execution logs? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteWorkflow}
        onCancel={() => setDeleteId('')}
      />
    </div>
  );
}
