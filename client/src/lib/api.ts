export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "";

export type Lead = {
  id: string;
  business_name: string;
  city: string;
  state: string;
  niche: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  zip: string;
  gmb_url: string;
  gmb_claimed: boolean;
  gmb_rating: number | null;
  gmb_review_count: number | null;
  has_website: boolean;
  gmb_profile_incomplete: boolean;
  citations_found: boolean;
  lead_score: number;
  last_gmb_audit_score?: number | null;
  last_website_audit_score?: number | null;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
  notes: string;
};

export type LeadListResponse = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
};

export type AttentionCategory = {
  id: string;
  category: "audits" | "leads" | "tasks" | "suppression" | "campaigns";
  count: number;
  urgency: "critical" | "warning" | "info";
  title: string;
  description: string;
  actionLabel: string;
  actionLink: string;
  sampleItems?: Array<{ name: string; detail: string; link?: string }>;
};

export type DashboardSummary = {
  totalLeads: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalClients: number;
  activeBusinesses: number;
  auditsThisMonth: number;
  tasksDueToday: number;
  leadsThisWeek?: number;
  leadsTrendPercent?: number;
  auditsThisWeek?: number;
  leadsBySource?: Array<{ name: string; value: number }>;
  leadsByStatus?: Array<{ name: string; value: number }>;
  leadsGrowthTrend?: Array<{ date: string; count: number }>;
  attentionCategories?: AttentionCategory[];
  needsAttention?: Array<{
    id: string;
    type: "audit" | "lead" | "task" | "campaign";
    urgency: "critical" | "warning" | "info";
    title: string;
    subtitle: string;
    link: string;
  }>;
  activityFeed?: Array<{
    id: string;
    type: "audit" | "lead" | "campaign" | "automation";
    title: string;
    description: string;
    timestamp: string;
    link: string;
  }>;
  earningsByCurrency: CurrencyTotal[];
  recentFinanceEntries: FinanceEntry[];
  period: FinancePeriod;
};

export type FinancePeriod = {
  range: "month" | "year" | "custom";
  startDate: string;
  endDate: string;
  label: string;
  month: string;
  year: string;
};

export type CurrencyTotal = {
  currency: string;
  amount: number;
};

export type FinanceEntry = {
  id: string;
  client_id: string;
  client_name: string;
  business_id: string;
  business_name: string;
  label: string;
  amount: number;
  currency: string;
  entry_type: string;
  entry_date: string;
  notes: string;
  created_at: string;
};

export type FinanceFilters = {
  range?: "month" | "year" | "custom";
  month?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
};

export type ClientProject = {
  id: string;
  lead_id: string;
  business_name: string;
  city: string;
  state: string;
  website: string;
  package_type: string;
  monthly_budget: number | null;
  start_date: string;
  assigned_team_member: string;
  open_tasks: number;
  total_keywords: number;
  created_at: string;
  updated_at: string;
};

export type AppProfileSettings = {
  agencyName: string;
  agencyEmail: string;
  agencyPhone: string;
  businessAddress: string;
  defaultCity: string;
  defaultState: string;
  agencyLogoUrl: string;
  timezone: string;
  brandNotes: string;
  agencyWebsite?: string;
  bookingUrl?: string;
  country?: string;
  postalCode?: string;
  taxId?: string;
  defaultCurrency?: string;
  invoicePrefix?: string;
  paymentTermsDays?: number;
  invoiceFooter?: string;
  googleClientId: string;
  googleClientSecret: string;
  googlePlacesApiKey?: string;
  dataForSeoLogin?: string;
  dataForSeoPassword?: string;
  updatedAt: string;
};

export type AppSystemSettings = {
  appVersion: string;
  runtime: string;
  apiUrl: string;
  smtpAccounts: number;
  totalClients: number;
  totalLeads: number;
  totalCampaigns: number;
  activeBusinesses: number;
  timezone: string;
  databasePath: string;
  activeAiProviders: number;
  registeredAiProviders: number;
  emailAiProvider: string;
  auditAiProvider: string;
  generalAiProvider: string;
};

export type WebsiteAuditScoringConfig = {
  categoryWeights: {
    technical: number;
    content: number;
    trust: number;
    local: number;
    conversion: number;
  };
  localFactorWeights: {
    entitySchema: number;
    reputation: number;
    answerReadiness: number;
    doorwayRisk: number;
  };
};

export type AiProviderProtocol = "openai" | "anthropic" | "gemini";

export type AiProviderConfig = {
  providerKey: string;
  label: string;
  protocol: AiProviderProtocol;
  description: string;
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  useForEmail: boolean;
  useForAudit: boolean;
  useForGeneral: boolean;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
};

export type AiEmailDraft = {
  providerKey: string;
  subject: string;
  body: string;
  bodyHtml: string;
  followUpSubject: string;
  followUpBody: string;
  followUpBodyHtml: string;
  notes: string[];
};

export type AiAuditInsights = {
  providerKey: string;
  headline: string;
  executiveSummary: string;
  detailedSummary: string;
  technicalView?: string;
  contentView?: string;
  trustView?: string;
  uxView?: string;
  visibilityView?: string;
  conversionView?: string;
  ownerView?: string;
  customerView?: string;
  priorityActions: string[];
  quickWins: string[];
  nextStepCta: string;
  generatedAt: string;
};

export type SeoOverview = {
  totalClients: number;
  activeBusinesses: number;
  monthlyBudget: number;
  monthlyBudgetByCurrency: CurrencyTotal[];
  auditsThisMonth: number;
  activeCampaigns: number;
  smtpAccounts: number;
  templateCount: number;
  currentMonth: FinancePeriod;
  currentMonthEarningsByCurrency: CurrencyTotal[];
};

export type SeoClient = {
  id: string;
  name: string;
  primary_contact: string;
  contact_email: string;
  contact_phone: string;
  lifecycle_stage: string;
  notes: string;
  default_currency: string;
  business_count: number;
  active_orders: number;
  monthly_budget_total: number;
  created_at: string;
  updated_at: string;
};

export type SeoBusiness = {
  id: string;
  client_id: string;
  client_name: string;
  lead_id: string;
  name: string;
  website: string;
  gmb_url: string;
  city: string;
  state: string;
  service_type: string;
  package_type: string;
  monthly_budget: number | null;
  currency: string;
  billing_cycle: string;
  order_status: string;
  assigned_team_member: string;
  start_date: string;
  notes: string;
  last_gmb_audit_score: number | null;
  last_website_audit_score: number | null;
  created_at: string;
  updated_at: string;
};

export type AuditFinding = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  recommendation?: string;
  whyItMatters?: string;
};

export type WebsiteAuditCategory = {
  key: "technical" | "content" | "trust" | "local" | "conversion";
  label: string;
  score: number;
  summary: string;
};

export type WebsiteAuditModule = {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
};

export type WebsiteAuditEvidenceHighlight = {
  label: string;
  value: string;
  detail: string;
};

export type WebsiteAuditTopPage = {
  url: string;
  pageRole: string;
  depth: number;
  statusCode: number | null;
  issueWeight: number;
  summary: string;
};

export type GmbAuditResult = {
  score: number;
  verdict: "Strong" | "Needs Work" | "Urgent";
  summary: string;
  issues: AuditFinding[];
  wins: string[];
  recommendations: string[];
  signals: {
    claimed: boolean | null;
    rating: number | null;
    reviewCount: number | null;
    hasWebsite: boolean;
    profileIncomplete: boolean;
    citationsFound: boolean;
    hasContactSignals: boolean;
  };
};

export type WebsiteAuditResult = {
  auditVersion?: "quick" | "advanced";
  score: number;
  verdict: "Strong" | "Needs Work" | "Urgent";
  summary: string;
  issues: AuditFinding[];
  wins: string[];
  recommendations: string[];
  metrics: {
    normalizedUrl: string;
    title: string;
    titleLength: number;
    metaDescriptionLength: number;
    h1Count: number;
    internalLinks: number;
    wordCount: number;
    hasViewport: boolean;
    hasCanonical: boolean;
    hasSchema: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
    imagesCount: number;
    imagesWithoutAlt: number;
    mentionsLocation: boolean;
    pagesCrawled?: number;
    pagesWithSchema?: number;
    pagesWithContactSignals?: number;
    pagesWithThinContent?: number;
    pagesMissingTitle?: number;
    pagesMissingMeta?: number;
    pagesMissingH1?: number;
    pagesWithCanonical?: number;
    pagesWithViewport?: number;
    pagesWithCta?: number;
    pagesWithTrustSignals?: number;
    pagesWithTestimonials?: number;
    pagesMentioningLocation?: number;
    averageWordCount?: number;
    averageResponseTimeMs?: number;
    brokenPages?: number;
    usesHttps?: boolean;
    hasRobotsTxt?: boolean;
    hasSitemapXml?: boolean;
    sitemapReferencedInRobots?: boolean;
    aboutPageFound?: boolean;
    contactPageFound?: boolean;
    policyPageFound?: boolean;
    servicePageCount?: number;
    locationServicePages?: number;
    localBusinessSchemaDetected?: boolean;
    localBusinessSchemaCompleteness?: number;
    hasAddressSignal?: boolean;
    hasGeoSignal?: boolean;
    hasOpeningHoursSignal?: boolean;
    hasSameAsSignal?: boolean;
    hasAggregateRatingSignal?: boolean;
    faqSignalsDetected?: boolean;
    reviewPlatformMentionsCount?: number;
    reviewPlatformMentions?: string[];
    duplicateTitlePages?: number;
    potentialDoorwayRisk?: boolean;
    scoringCategoryWeights?: {
      technical: number;
      content: number;
      trust: number;
      local: number;
      conversion: number;
    };
    scoringLocalFactorWeights?: {
      entitySchema: number;
      reputation: number;
      answerReadiness: number;
      doorwayRisk: number;
    };
    // Enhanced audit fields (quick audit)
    responseTimeMs?: number;
    pageSizeBytes?: number;
    schemaValid?: boolean;
    schemaErrors?: string[];
    hstsHeaderPresent?: boolean;
    cspHeaderPresent?: boolean;
    xFrameHeaderPresent?: boolean;
    xContentTypeHeaderPresent?: boolean;
    // New extended fields
    hasOpenGraph?: boolean;
    openGraphComplete?: boolean;
    hasTwitterCard?: boolean;
    noindexDetected?: boolean;
    hasRobotsTag?: boolean;
    usesHttp2?: boolean;
    speedClass?: "fast" | "medium" | "slow";
    altTextCoveragePercent?: number;
    missingAltPercent?: number;
    h2Count?: number;
    hasH2?: boolean;
    hasLangAttribute?: boolean;
    langAttribute?: string;
  };
  categories?: WebsiteAuditCategory[];
  modules?: WebsiteAuditModule[];
  evidenceHighlights?: WebsiteAuditEvidenceHighlight[];
  priorityRoadmap?: string[];
  topPages?: WebsiteAuditTopPage[];
};

export type EeatAuditCheck = {
  id: string;
  name: string;
  description: string;
  status: "pass" | "fail";
  result: string;
  guide_url: string;
};

export type EeatAuditCategory = {
  id: string;
  name: string;
  icon: string;
  total: number;
  passed: number;
  score_percent: number;
  checks: EeatAuditCheck[];
};

export type EeatAuditIssue = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type EeatAuditResult = {
  domain: string;
  score: number;
  rating: "Poor" | "Needs Work" | "Good" | "Excellent";
  total_checks: number;
  passed: number;
  failed: number;
  summary: string;
  issues: EeatAuditIssue[];
  wins: string[];
  recommendations: string[];
  categories: EeatAuditCategory[];
  manual_checklist_total: number;
  checked_at: string;
  cache: {
    cached: boolean;
    cached_at: string;
    age_ms: number;
    expires_at: string;
  };
};

export type DeepCrawlSummary = {
  normalizedUrl: string;
  host: string;
  targetName: string;
  maxPages: number;
  pagesCrawled: number;
  pagesWithSchema: number;
  pagesWithContactSignals: number;
  pagesWithThinContent: number;
  pagesMissingTitle: number;
  pagesMissingMeta: number;
  pagesMissingH1: number;
  pagesWithCanonical?: number;
  pagesWithViewport?: number;
  pagesWithCta?: number;
  pagesWithTrustSignals?: number;
  pagesWithTestimonials?: number;
  totalImagesWithoutAlt: number;
  pagesMentioningLocation: number;
  averageWordCount: number;
  averageResponseTimeMs?: number;
  brokenPages?: number;
  aboutPageFound?: boolean;
  contactPageFound?: boolean;
  policyPageFound?: boolean;
  recommendations: string[];
};

export type DeepCrawlAiInsights = {
  providerKey: string;
  headline: string;
  executiveSummary: string;
  technicalView: string;
  contentView: string;
  trustView: string;
  uxView: string;
  ownerView: string;
  customerView: string;
  priorityActions: string[];
  quickWins: string[];
  nextStepCta: string;
  generatedAt: string;
};

export type SeoCrawlJob = {
  id: string;
  audit_scope: string;
  target_name: string;
  start_url: string;
  host: string;
  status: string;
  max_pages: number;
  pages_crawled: number;
  issue_count: number;
  summary: DeepCrawlSummary;
  ai_insights: DeepCrawlAiInsights | null;
  created_at: string;
  updated_at: string;
};

export type SeoCrawlPage = {
  id: string;
  crawl_job_id: string;
  url: string;
  depth: number;
  status_code: number | null;
  was_redirected?: boolean;
  final_url?: string;
  title: string;
  title_tag_count?: number;
  meta_description: string;
  meta_description_count?: number;
  h1_count: number;
  word_count: number;
  internal_link_count: number;
  outgoing_internal_count?: number;
  incoming_internal_count?: number;
  links_to_broken_pages_count?: number;
  links_to_redirect_pages_count?: number;
  only_nofollow_incoming?: boolean;
  is_orphan?: boolean;
  has_schema: boolean;
  has_contact_signal: boolean;
  images_count: number;
  images_without_alt: number;
  image_alt_over_100_count?: number;
  canonical_url: string;
  canonical_tag_count?: number;
  canonical_to_redirect?: boolean;
  page_summary: string;
  has_phone: boolean;
  has_email: boolean;
  mentions_location: boolean;
  has_viewport?: boolean;
  has_canonical?: boolean;
  noindex?: boolean;
  nofollow?: boolean;
  meta_refresh?: boolean;
  has_cta?: boolean;
  has_trust_signal?: boolean;
  has_testimonials?: boolean;
  has_about_signal?: boolean;
  has_policy_signal?: boolean;
  has_open_graph?: boolean;
  open_graph_complete?: boolean;
  open_graph_url?: string;
  has_twitter_card?: boolean;
  twitter_card_complete?: boolean;
  lang_attribute?: string;
  invalid_lang_attribute?: boolean;
  hreflang_count?: number;
  invalid_hreflang_count?: number;
  has_x_default_hreflang?: boolean;
  hreflang_missing_self?: boolean;
  hreflang_lang_mismatch?: boolean;
  https_links_to_http_count?: number;
  https_links_to_http_js_count?: number;
  https_links_to_http_css_count?: number;
  https_links_to_http_image_count?: number;
  broken_image_count?: number;
  large_image_count?: number;
  redirected_image_count?: number;
  broken_js_count?: number;
  large_js_count?: number;
  redirected_js_count?: number;
  broken_css_count?: number;
  large_css_count?: number;
  redirected_css_count?: number;
  redirect_chain?: boolean;
  redirect_loop?: boolean;
  in_sitemap?: boolean;
  sitemap_status?: number | null;
  sitemap_is_redirect?: boolean;
  sitemap_is_noindex?: boolean;
  sitemap_is_non_canonical?: boolean;
  page_role?: string;
  response_time_ms?: number;
  html_bytes?: number;
  created_at: string;
};

export type SiteAuditMode = "crawler" | "urls" | "sitemap";

export type SiteAuditOptions = {
  max_pages: number;
  respect_robots: boolean;
  crawl_delay_ms: number;
  timeout_ms: number;
};

export type SiteAuditProgress = {
  crawled: number;
  total: number;
  current_url: string;
  issues_found: number;
  percent: number;
};

export type SiteAuditSummary = {
  errors: number;
  warnings: number;
  info: number;
  total_issues: number;
};

export type SiteAuditResult = {
  site: string;
  crawled_at: string;
  crawl_mode: SiteAuditMode;
  total_pages: number;
  health_score: number;
  summary: SiteAuditSummary;
  categories: Array<Record<string, unknown>>;
  all_pages: SeoCrawlPage[];
};

export type SiteAuditCacheMeta = {
  key: string;
  hit: boolean;
  last_audited_at: string;
  age_ms: number;
};

export type SiteAuditJob = {
  job_id: string;
  status: "queued" | "crawling" | "completed" | "failed";
  mode: SiteAuditMode;
  input: string | string[];
  options: SiteAuditOptions;
  progress: SiteAuditProgress;
  created_at: string;
  updated_at: string;
  cache: SiteAuditCacheMeta | null;
  result: SiteAuditResult | null;
  error: string | null;
};

export type SiteAuditCompareResponse = {
  current: SiteAuditJob;
  previous: SiteAuditJob;
};

export type AdvancedWebsiteAuditResponse = {
  audit: SeoAudit;
  crawlJob: SeoCrawlJob | null;
  crawlPages: SeoCrawlPage[];
};

export type SeoAudit = {
  id: string;
  lead_id: string;
  client_id: string;
  business_id: string;
  audit_type: "gmb" | "gmb_advanced" | "website" | "eeat";
  score: number | null;
  verdict: string;
  target_name: string;
  status: string;
  summary: string;
  issue_count: number;
  win_count: number;
  ai_insights: AiAuditInsights | null;
  result: GmbAuditResult | WebsiteAuditResult | EeatAuditResult;
  created_at: string;
  updated_at: string;
};

export type EeatAuditApiResponse = {
  audit: SeoAudit;
  report: EeatAuditResult;
};

export type EmailOpsStatus = {
  mode: string;
  smtpAccounts: number;
  templateCount: number;
  activeCampaigns: number;
  spamGuardEnabled: boolean;
  providerPresets: string[];
  note: string;
};

export type ScraperJob = {
  id: string;
  job_label: string | null;
  source: string;
  status: "queued" | "running" | "paused" | "complete" | "error" | "cancelled";
  staged_count?: number;
  imported_count: number;
  total_found: number;
  progress_percent: number;
  progress_message: string | null;
  csv_file: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type ScraperProxySettings = {
  enabled: boolean;
  proxiesText: string;
  proxyCount: number;
  maskedProxies: string[];
  nextIndex: number;
  message?: string;
};

export type StagedLeadAuditPreview = {
  id: string;
  lead_id: string;
  client_id: string;
  business_id: string;
  scraper_job_id: string;
  staged_lead_id: string;
  audit_type: string;
  score: number | null;
  verdict: string;
  target_name: string;
  status: string;
  summary: string;
  issue_count: number;
  win_count: number;
  ai_insights: Record<string, unknown> | null;
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type StagedScrapedLead = {
  id: string;
  job_id: string;
  business_name: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  niche: string;
  gmb_url: string;
  gmb_claimed: boolean;
  gmb_claim_source?: string;
  gmb_claim_status?: "claimed" | "unclaimed" | "unknown";
  gmb_rating: number | null;
  gmb_review_count: number | null;
  source: string;
  notes?: string;
  is_selected: boolean;
  added_to_dashboard: boolean;
  website_audit?: StagedLeadAuditPreview | null;
  gmb_audit?: StagedLeadAuditPreview | null;
  eeat_audit?: StagedLeadAuditPreview | null;
  audit_readiness?: "pending" | "ready" | "review" | "skip";
  audit_readiness_reason?: string;
  last_audited_at?: string | null;
  created_at: string;
  added_at: string | null;
};

type ScraperProxyPayload = {
  scraperProxy?: string;
};

export function getAuthHeaders(customHeaders?: HeadersInit): HeadersInit {
  const token = localStorage.getItem("smbify_lead_auth_token");
  const headers: Record<string, string> = {};
  if (token && token !== "null" && token !== "undefined" && token.trim() !== "") {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((val, key) => { headers[key] = val; });
    } else if (Array.isArray(customHeaders)) {
      customHeaders.forEach(([key, val]) => { headers[key] = val; });
    } else {
      Object.assign(headers, customHeaders);
    }
  }
  return headers;
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = getAuthHeaders(init?.headers);
  return fetch(input, {
    ...init,
    headers,
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (!response.ok) {
    let parsedMessage = "";

    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      parsedMessage = parsed.error || parsed.message || "";
    } catch {
      parsedMessage = "";
    }

    throw new Error(parsedMessage || raw || `Request failed (${response.status})`);
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    const normalized = raw.trim();
    if (normalized.startsWith("<!doctype") || normalized.startsWith("<html")) {
      throw new Error("API returned HTML instead of JSON. The backend may need a restart.");
    }

    throw new Error("API returned a non-JSON response.");
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("API returned invalid JSON.");
  }
}

export async function fetchLeads(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const response = await fetch(`${API_BASE_URL}/api/leads?${query.toString()}`);
  return parseResponse<LeadListResponse>(response);
}

export async function fetchLead(leadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}`);
  return parseResponse<any>(response);
}

export async function fetchDashboardSummary(filters?: FinanceFilters) {
  const query = new URLSearchParams();
  if (filters?.range) query.set("range", filters.range);
  if (filters?.month) query.set("month", filters.month);
  if (filters?.year) query.set("year", filters.year);
  if (filters?.startDate) query.set("startDate", filters.startDate);
  if (filters?.endDate) query.set("endDate", filters.endDate);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/dashboard/summary${suffix}`);
  return parseResponse<DashboardSummary>(response);
}

export async function fetchClients(query?: string) {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  const response = await fetch(`${API_BASE_URL}/api/clients${suffix}`);
  return parseResponse<{ items: ClientProject[] }>(response);
}

export async function createClientProject(payload: {
  lead_id?: string;
  business_name: string;
  city?: string;
  state?: string;
  website?: string;
  package_type?: string;
  monthly_budget?: number | null;
  start_date?: string;
  assigned_team_member?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<ClientProject>(response);
}

export async function updateClientProject(clientId: string, payload: Partial<ClientProject>) {
  const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<ClientProject>(response);
}

export async function fetchAppSettings() {
  const response = await fetch(`${API_BASE_URL}/api/settings`);
  return parseResponse<{ profile: AppProfileSettings; system: AppSystemSettings }>(response);
}

export async function fetchAiProviders() {
  const response = await fetch(`${API_BASE_URL}/api/ai/providers`);
  return parseResponse<{ items: AiProviderConfig[] }>(response);
}

export async function updateAiProvider(
  providerKey: string,
  payload: Partial<{
    baseUrl: string;
    model: string;
    apiKey: string;
    clearApiKey: boolean;
    isEnabled: boolean;
    useForEmail: boolean;
    useForAudit: boolean;
    useForGeneral: boolean;
  }>
) {
  const response = await fetch(`${API_BASE_URL}/api/ai/providers/${providerKey}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<AiProviderConfig>(response);
}

export async function testAiProvider(
  providerKey: string,
  payload?: Partial<{ baseUrl: string; model: string; apiKey: string }>
) {
  const response = await fetch(`${API_BASE_URL}/api/ai/providers/${providerKey}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });

  return parseResponse<{ ok: boolean; providerKey: string; preview: string }>(response);
}

export async function generateAiEmailDraft(payload: {
  providerKey?: string;
  businessName?: string;
  city?: string;
  state?: string;
  website?: string;
  niche?: string;
  currentSubject?: string;
  currentBody?: string;
  currentFollowUpSubject?: string;
  currentFollowUpBody?: string;
  followUpEnabled?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/api/ai/generate/email-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<AiEmailDraft>(response);
}

export async function generateAuditAiReport(auditId: string, providerKey?: string) {
  const response = await fetch(`${API_BASE_URL}/api/ai/generate/audit-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auditId, providerKey }),
  });

  return parseResponse<{ auditId: string; aiInsights: AiAuditInsights }>(response);
}

export type SpecialistAuditType =
  | "content"
  | "design"
  | "local-seo"
  | "reputation"
  | "customer-conversion"
  | "accessibility"
  | "competitor-organic"
  | "competitor-mappack";

export type SpecialistAuditFinding = {
  title: string;
  severity: "high" | "medium" | "low";
  detail: string;
};

export type SpecialistAuditResult = {
  id: string;
  providerKey: string;
  model: string;
  auditType: SpecialistAuditType;
  website: string;
  businessName: string;
  competitorUrl?: string;
  headline: string;
  executiveSummary: string;
  overallScore: number;
  verdict: string;
  findings: SpecialistAuditFinding[];
  wins: string[];
  recommendations: string[];
  priorityActions: string[];
  generatedAt: string;
};

export async function runSpecialistAudit(payload: {
  website: string;
  auditType: SpecialistAuditType;
  businessName?: string;
  competitorUrl?: string;
  providerKey?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/ai/generate/specialist-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SpecialistAuditResult>(response);
}

export async function updateSpecialistAudit(
  auditId: string,
  payload: Partial<{
    score: number;
    verdict: string;
    target_name: string;
    headline: string;
    executiveSummary: string;
    overallScore: number;
    findings: SpecialistAuditFinding[];
    wins: string[];
    recommendations: string[];
    priorityActions: string[];
  }>
) {
  const response = await fetch(`${API_BASE_URL}/api/seo/audits/${encodeURIComponent(auditId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<Record<string, unknown>>(response);
}

export async function generateCrawlAiReport(crawlJobId: string, providerKey?: string) {
  const response = await fetch(`${API_BASE_URL}/api/ai/generate/crawl-audit-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crawlJobId, providerKey }),
  });

  return parseResponse<{ crawlJobId: string; aiInsights: DeepCrawlAiInsights }>(response);
}

export async function fetchSeoOverview() {
  const response = await fetch(`${API_BASE_URL}/api/seo/overview`);
  return parseResponse<SeoOverview>(response);
}

export async function fetchSeoClients(query?: string) {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  const response = await fetch(`${API_BASE_URL}/api/seo/clients${suffix}`);
  return parseResponse<{ items: SeoClient[] }>(response);
}

export async function createSeoClient(payload: {
  name: string;
  primary_contact?: string;
  contact_email?: string;
  contact_phone?: string;
  lifecycle_stage?: string;
  notes?: string;
  default_currency?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SeoClient>(response);
}

export async function updateSeoClient(clientId: string, payload: Partial<SeoClient>) {
  const response = await fetch(`${API_BASE_URL}/api/seo/clients/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SeoClient>(response);
}

export async function fetchSeoBusinesses(params?: { query?: string; clientId?: string }) {
  const query = new URLSearchParams();
  if (params?.query) query.set("query", params.query);
  if (params?.clientId) query.set("clientId", params.clientId);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/seo/businesses${suffix}`);
  return parseResponse<{ items: SeoBusiness[] }>(response);
}

export async function createSeoBusiness(payload: {
  client_id: string;
  lead_id?: string;
  name: string;
  website?: string;
  gmb_url?: string;
  city?: string;
  state?: string;
  service_type?: string;
  package_type?: string;
  monthly_budget?: number | null;
  currency?: string;
  billing_cycle?: string;
  order_status?: string;
  assigned_team_member?: string;
  start_date?: string;
  notes?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/businesses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SeoBusiness>(response);
}

export async function updateSeoBusiness(businessId: string, payload: Partial<SeoBusiness>) {
  const response = await fetch(`${API_BASE_URL}/api/seo/businesses/${businessId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SeoBusiness>(response);
}

export async function fetchSeoAudits(params?: {
  auditType?: "gmb" | "gmb_advanced" | "website" | "eeat";
  businessId?: string;
  leadId?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.auditType) query.set("auditType", params.auditType);
  if (params?.businessId) query.set("businessId", params.businessId);
  if (params?.leadId) query.set("leadId", params.leadId);
  if (params?.limit) query.set("limit", String(params.limit));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/seo/audits${suffix}`);
  return parseResponse<{ items: SeoAudit[] }>(response);
}

export async function fetchSeoCrawlJobs(limit = 10) {
  const response = await fetch(`${API_BASE_URL}/api/seo/crawl-jobs?limit=${encodeURIComponent(String(limit))}`);
  return parseResponse<{ items: SeoCrawlJob[] }>(response);
}

export async function fetchSeoCrawlJob(crawlJobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/seo/crawl-jobs/${crawlJobId}`);
  return parseResponse<{ job: SeoCrawlJob; pages: SeoCrawlPage[] }>(response);
}

export async function runWebsiteDeepCrawl(payload: {
  lead_id?: string;
  business_id?: string;
  business_name?: string;
  city?: string;
  state?: string;
  website: string;
  maxPages?: number;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/crawl-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<{ job: SeoCrawlJob; pages: SeoCrawlPage[] }>(response);
}

export async function runAdvancedWebsiteAudit(payload: {
  client_id?: string;
  business_id?: string;
  lead_id?: string;
  business_name?: string;
  city?: string;
  state?: string;
  website: string;
  maxPages?: number;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/audits/website/advanced`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<AdvancedWebsiteAuditResponse>(response);
}

export async function fetchWebsiteAuditScoringConfig() {
  const response = await fetch(`${API_BASE_URL}/api/seo/audit-scoring-config`);
  return parseResponse<WebsiteAuditScoringConfig>(response);
}

export async function updateWebsiteAuditScoringConfig(payload: Partial<WebsiteAuditScoringConfig>) {
  const response = await fetch(`${API_BASE_URL}/api/seo/audit-scoring-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<WebsiteAuditScoringConfig>(response);
}

export async function fetchEmailOpsStatus() {
  const response = await fetch(`${API_BASE_URL}/api/seo/email-ops`);
  return parseResponse<EmailOpsStatus>(response);
}

export async function fetchSeoFinance(
  params?: FinanceFilters & { clientId?: string; businessId?: string; limit?: number }
) {
  const query = new URLSearchParams();
  if (params?.range) query.set("range", params.range);
  if (params?.month) query.set("month", params.month);
  if (params?.year) query.set("year", params.year);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  if (params?.clientId) query.set("clientId", params.clientId);
  if (params?.businessId) query.set("businessId", params.businessId);
  if (params?.limit) query.set("limit", String(params.limit));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/seo/finance${suffix}`);
  return parseResponse<{ period: FinancePeriod; totalsByCurrency: CurrencyTotal[]; items: FinanceEntry[] }>(response);
}

export async function createFinanceEntry(payload: {
  client_id: string;
  business_id?: string;
  label?: string;
  amount: number;
  currency?: string;
  entry_type?: string;
  entry_date?: string;
  notes?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/finance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<FinanceEntry>(response);
}

export async function runGmbAudit(payload: {
  client_id?: string;
  business_id?: string;
  lead_id?: string;
  business_name?: string;
  city?: string;
  state?: string;
  website?: string;
  gmb_url?: string;
  gmb_claimed?: boolean | string;
  gmb_rating?: number | null;
  gmb_review_count?: number | null;
  gmb_profile_incomplete?: boolean | string;
  citations_found?: boolean | string;
  phone?: string;
  email?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/audits/gmb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SeoAudit>(response);
}

export async function runAdvancedGmbAudit(payload: {
  client_id?: string;
  business_id?: string;
  lead_id?: string;
  business_name?: string;
  city?: string;
  state?: string;
  website?: string;
  gmb_url?: string;
  service_type?: string;
  providerKey?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/audits/gmb/advanced`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SeoAudit>(response);
}

export async function runWebsiteAudit(payload: {
  client_id?: string;
  business_id?: string;
  lead_id?: string;
  business_name?: string;
  city?: string;
  state?: string;
  website: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/seo/audits/website`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<SeoAudit>(response);
}

export async function runEeatAudit(payload: {
  website: string;
  force?: boolean;
  client_id?: string;
  business_id?: string;
  lead_id?: string;
  business_name?: string;
}) {
  const query = new URLSearchParams();
  query.set("website", payload.website);
  if (payload.force) query.set("force", "1");

  const response = await fetch(`${API_BASE_URL}/api/eeat-audit?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      website: payload.website,
      force: Boolean(payload.force),
      client_id: payload.client_id,
      business_id: payload.business_id,
      lead_id: payload.lead_id,
      business_name: payload.business_name,
    }),
  });

  return parseResponse<EeatAuditApiResponse>(response);
}

export async function startSiteAudit(payload: {
  mode: SiteAuditMode;
  input: string | string[];
  options?: Partial<SiteAuditOptions>;
  force?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/api/site-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: payload.mode,
      input: payload.input,
      options: payload.options || {},
      force: Boolean(payload.force),
    }),
  });

  return parseResponse<{
    job_id: string;
    status: "queued" | "crawling" | "completed" | "failed";
    progress: SiteAuditProgress;
    cache: SiteAuditCacheMeta | null;
    ws_path?: string;
  }>(response);
}

export async function fetchSiteAuditJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/site-audit/${encodeURIComponent(jobId)}`);
  return parseResponse<SiteAuditJob>(response);
}

export async function fetchSiteAuditCompare(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/site-audit/${encodeURIComponent(jobId)}/compare`);
  return parseResponse<SiteAuditCompareResponse>(response);
}

export async function updateAppSettings(payload: Partial<AppProfileSettings>) {
  const response = await fetch(`${API_BASE_URL}/api/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<AppProfileSettings>(response);
}

export async function updateLead(leadId: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<Lead>(response);
}

export async function addLeadNote(leadId: string, note: string) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  return parseResponse<{ id: string; note: string; createdAt: string }>(response);
}

export async function convertLeadToClient(leadId: string, payload?: { monthlyBudget?: number }) {
  const response = await fetch(`${API_BASE_URL}/api/leads/${leadId}/convert-to-client`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return parseResponse<{ ok: boolean; clientId: string; businessId: string; message: string }>(response);
}

export async function fetchScraperProxySettings() {
  const response = await fetch(`${API_BASE_URL}/api/import/proxy-settings`);
  return parseResponse<ScraperProxySettings>(response);
}

export async function updateScraperProxySettings(payload: {
  enabled: boolean;
  proxiesText: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/import/proxy-settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<ScraperProxySettings>(response);
}

export async function triggerYellowPagesImport(payload: {
  businessType: string;
  location: string;
  maxItems?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/yellow-pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerGmbImport(payload: {
  keyword: string;
  location: string;
  listingsPerQuery?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerStateImport(payload: {
  state: string;
  businessType: string;
  limit?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/state-directory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerYelpImport(payload: {
  businessType: string;
  location: string;
  maxItems?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/yelp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerBbbImport(payload: {
  businessType: string;
  location: string;
  maxItems?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/bbb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerWebsiteEnrichment(payload: {
  sourceJobId: string;
  selectedOnly?: boolean;
  pendingOnly?: boolean;
  limit?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/website-enrichment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerChamberDirectoryImport(payload: {
  businessType: string;
  location: string;
  directoryDomain?: string;
  maxItems?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/chamber-directory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerLicenseRegistryImport(payload: {
  state: string;
  businessType: string;
  registryDomain?: string;
  limit?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/license-registry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerGoogleAdsIntelImport(payload: {
  businessType: string;
  location: string;
  maxItems?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/ads-google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerMetaAdsIntelImport(payload: {
  businessType: string;
  location: string;
  maxItems?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/ads-meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function triggerBingAdsIntelImport(payload: {
  businessType: string;
  location: string;
  maxItems?: number;
} & ScraperProxyPayload) {
  const response = await fetch(`${API_BASE_URL}/api/import/ads-bing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ jobId: string; jobLabel?: string | null; message: string }>(response);
}

export async function fetchImportJobs() {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs`);
  return parseResponse<{ jobs: ScraperJob[] }>(response);
}

export async function cancelImportJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/cancel`, {
    method: "POST",
  });
  return parseResponse<{ cancelled: boolean }>(response);
}

export async function stopImportJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/stop`, {
    method: "POST",
  });
  return parseResponse<{ stopped: boolean }>(response);
}

export async function pauseImportJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/pause`, {
    method: "POST",
  });
  return parseResponse<{ paused: boolean; jobId: string }>(response);
}

export async function resumeImportJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/resume`, {
    method: "POST",
  });
  return parseResponse<{ resumed: boolean; jobId: string; jobLabel?: string | null }>(response);
}

export async function restartImportJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/restart`, {
    method: "POST",
  });
  return parseResponse<{ restarted: boolean; jobId: string; jobLabel?: string | null; source: string }>(response);
}

export async function cleanImportJobs(scope: "finished" = "finished") {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/clean`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
  return parseResponse<{ deleted: number; scope: string }>(response);
}

export async function deleteImportJob(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}`, {
    method: "DELETE",
  });
  return parseResponse<{ deleted: boolean; jobId: string }>(response);
}

export async function fetchJobScrapedLeads(
  jobId: string,
  params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    pendingOnly?: boolean;
    stageFilter?: "pending" | "added" | "all";
    city?: string;
    state?: string;
    niche?: string;
    selectedOnly?: boolean;
    contactFilter?: "has_email" | "has_phone" | "has_website" | "contact_ready" | "missing_contact" | "missing_website";
    gmbClaimed?: boolean;
    gmbClaimStatus?: "claimed" | "unclaimed" | "unknown";
    auditCoverage?: "audited" | "unaudited" | "partial";
    readiness?: "pending" | "ready" | "review" | "skip";
    websiteAuditStatus?: "not_run" | "completed" | "failed" | "unavailable";
    gmbAuditStatus?: "not_run" | "completed" | "failed" | "unavailable";
    websiteVerdict?: string;
    gmbVerdict?: string;
  }
) {
  const query = new URLSearchParams();

  if (params?.page) query.set("page", String(params.page));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));
  if (params?.query) query.set("query", params.query);
  if (typeof params?.pendingOnly === "boolean") {
    query.set("pendingOnly", String(params.pendingOnly));
  }
  if (params?.stageFilter) query.set("stageFilter", params.stageFilter);
  if (params?.city) query.set("city", params.city);
  if (params?.state) query.set("state", params.state);
  if (params?.niche) query.set("niche", params.niche);
  if (typeof params?.selectedOnly === "boolean") {
    query.set("selectedOnly", String(params.selectedOnly));
  }
  if (params?.contactFilter) query.set("contactFilter", params.contactFilter);
  if (typeof params?.gmbClaimed === "boolean") {
    query.set("gmbClaimed", String(params.gmbClaimed));
  }
  if (params?.gmbClaimStatus) {
    query.set("gmbClaimStatus", params.gmbClaimStatus);
  }
  if (params?.auditCoverage) query.set("auditCoverage", params.auditCoverage);
  if (params?.readiness) query.set("readiness", params.readiness);
  if (params?.websiteAuditStatus) query.set("websiteAuditStatus", params.websiteAuditStatus);
  if (params?.gmbAuditStatus) query.set("gmbAuditStatus", params.gmbAuditStatus);
  if (params?.websiteVerdict) query.set("websiteVerdict", params.websiteVerdict);
  if (params?.gmbVerdict) query.set("gmbVerdict", params.gmbVerdict);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads${suffix}`);

  return parseResponse<{
    jobId: string;
    items: StagedScrapedLead[];
    total: number;
    pending: number;
    added: number;
    selectedPending: number;
    page: number;
    pageSize: number;
  }>(response);
}

export async function runStagedLeadAudit(
  jobId: string,
  leadId: string,
  auditType: "website" | "gmb" | "eeat" | "basic" | "all"
) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads/${leadId}/audits/${auditType}`, {
    method: "POST",
  });

  return parseResponse<{
    jobId: string;
    leadId: string;
    auditType: "website" | "gmb" | "eeat" | "basic" | "all";
    lead: StagedScrapedLead;
    websiteAudit: StagedLeadAuditPreview | null;
    gmbAudit: StagedLeadAuditPreview | null;
    eeatAudit: StagedLeadAuditPreview | null;
  }>(response);
}

export async function runSelectedStagedLeadAudits(
  jobId: string,
  payload: {
    auditType: "website" | "gmb" | "eeat" | "basic" | "all";
    selectedOnly?: boolean;
    limit?: number;
  }
) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads/audits/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<{
    jobId: string;
    auditType: "website" | "gmb" | "eeat" | "basic" | "all";
    processed: number;
    selectedOnly: boolean;
    items: StagedScrapedLead[];
  }>(response);
}

export async function setJobScrapedLeadSelection(jobId: string, leadId: string, selected: boolean) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads/${leadId}/select`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected }),
  });

  return parseResponse<{ updated: boolean; selected: boolean }>(response);
}

export async function setAllJobScrapedLeadSelection(jobId: string, selected: boolean) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads/select-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected }),
  });

  return parseResponse<{ changed: number; selected: boolean }>(response);
}

export async function addSelectedScrapedLeadsToDashboard(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads/add-selected`, {
    method: "POST",
  });

  return parseResponse<{
    inserted: number;
    updated: number;
    processed: number;
    selectedBeforeImport: number;
    pending: number;
    added: number;
    selectedPending: number;
  }>(response);
}

export function getImportJobCsvUrl(jobId: string): string {
  return `${API_BASE_URL}/api/import/jobs/${jobId}/csv`;
}

export async function importLeadsCsv(file: File, mapping?: Record<string, string | string[]>) {
  const formData = new FormData();
  formData.append("file", file);
  if (mapping) {
    formData.append("mapping", JSON.stringify(mapping));
  }

  const response = await fetch(`${API_BASE_URL}/api/leads/import/csv`, {
    method: "POST",
    body: formData,
  });

  return parseResponse<any>(response);
}

export type OutreachSummary = {
  campaignsByStatus: Array<{ status: string; count: number }>;
  queuedEmails: number;
  sentEmails: number;
  smtpAccounts: number;
  eligibleLeads: number;
};

export type SmtpAccount = {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  from_name: string;
  from_email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  password_set: boolean;
};

export type OutreachLead = {
  id: string;
  business_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  gmb_url: string | null;
  city: string | null;
  state: string | null;
  niche: string | null;
  status: string;
  has_website: boolean;
  gmb_claimed: boolean;
  gmb_rating: number | null;
  gmb_review_count: number | null;
  gmb_profile_incomplete: boolean;
  citations_found: boolean;
  last_gmb_audit_score: number | null;
  last_gmb_audited_at: string | null;
  last_website_audit_score: number | null;
  last_website_audited_at: string | null;
};

export type OutreachCampaign = {
  id: string;
  name: string;
  description: string;
  target_niche: string;
  target_city: string;
  status: string;
  subject: string;
  body: string;
  body_html?: string;
  smtp_account_id: string;
  template_id: string;
  send_interval_ms: number;
  follow_up_enabled: boolean;
  follow_up_delay_hours: number;
  follow_up_subject: string;
  follow_up_body: string;
  follow_up_body_html?: string;
  max_retries: number;
  scheduled_at: string;
  last_run_at: string;
  email_mode: string;
  attach_gmb_audit: boolean;
  attach_website_audit: boolean;
  total_count: number;
  pending_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
};

export type CampaignRecipient = {
  email_id: string;
  lead_id: string | null;
  step_number?: number;
  email: string | null;
  business_name: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  subject: string | null;
  body: string | null;
  body_html?: string | null;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  error_message: string | null;
};

export type CampaignAppendResult = {
  campaignId: string;
  appendedCount: number;
  matchedLeadIds: string[];
  duplicateLeadIds: string[];
};

export type CampaignTemplate = {
  id: string;
  name: string;
  source_key: string;
  subject: string;
  body: string;
  body_html: string;
  send_interval_ms: number;
  follow_up_enabled: boolean;
  follow_up_delay_hours: number;
  follow_up_subject: string;
  follow_up_body: string;
  follow_up_body_html: string;
  max_retries: number;
  is_default: boolean;
  origin: "database" | "built-in";
};

export type ImportJobCampaignContext = {
  jobId: string;
  source: string;
  sourceLabel: string;
  pendingCount: number;
  selectedPendingCount: number;
  city: string;
  niche: string;
  recommendedTemplate: CampaignTemplate;
};

export async function fetchOutreachSummary() {
  const response = await fetch(`${API_BASE_URL}/api/outreach/summary`);
  return parseResponse<OutreachSummary>(response);
}

export async function fetchSmtpAccounts() {
  const response = await fetch(`${API_BASE_URL}/api/outreach/smtp-accounts`);
  return parseResponse<{ items: SmtpAccount[] }>(response);
}

export async function createSmtpAccount(payload: {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from_name?: string;
  from_email?: string;
  is_active?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/smtp-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<SmtpAccount>(response);
}

export async function deleteSmtpAccount(accountId: string) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/smtp-accounts/${accountId}`, {
    method: "DELETE",
  });
  return parseResponse<{ deleted: boolean; id: string }>(response);
}

export async function sendSmtpAccountTest(accountId: string, toEmail: string) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/smtp-accounts/${accountId}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to_email: toEmail }),
  });
  return parseResponse<{ sent: boolean }>(response);
}

export async function sendDirectOutreachEmail(payload: {
  smtpAccountId?: string;
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  leadId?: string;
  auditId?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/send-direct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      smtpAccountId: payload.smtpAccountId,
      to: payload.to,
      subject: payload.subject,
      body: payload.body,
      bodyHtml: payload.bodyHtml,
      leadId: payload.leadId,
      auditId: payload.auditId,
    }),
  });

  return parseResponse<{ sent: boolean; queued?: boolean; campaignId?: string; smtpAccountId: string | null; messageId?: string | null }>(response);
}

export async function fetchOutreachEligibleLeads(params?: {
  query?: string;
  city?: string;
  niche?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();

  if (params?.query) query.set("query", params.query);
  if (params?.city) query.set("city", params.city);
  if (params?.niche) query.set("niche", params.niche);
  if (params?.limit) query.set("limit", String(params.limit));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/outreach/eligible-leads${suffix}`);
  return parseResponse<{ items: OutreachLead[]; count: number }>(response);
}

export async function fetchOutreachCampaigns() {
  const response = await fetch(`${API_BASE_URL}/api/outreach/campaigns`);
  return parseResponse<{ items: OutreachCampaign[] }>(response);
}

export async function fetchOutreachCampaign(campaignId: string) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/campaigns/${campaignId}`);
  return parseResponse<{ campaign: OutreachCampaign; recipients: CampaignRecipient[] }>(response);
}

export async function createOutreachCampaign(payload: {
  name: string;
  description?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string;
  leadIds?: string[];
  allowEmpty?: boolean;
  smtpAccountId?: string;
  targetNiche?: string;
  targetCity?: string;
  templateId?: string;
  sendIntervalMs?: number;
  followUpEnabled?: boolean;
  followUpDelayHours?: number;
  followUpSubject?: string;
  followUpBody?: string;
  followUpBodyHtml?: string;
  maxRetries?: number;
  scheduledAt?: string;
}) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{
    campaignId: string;
    queuedCount: number;
    matchedLeadIds: string[];
    createdEmpty?: boolean;
  }>(response);
}

export async function appendLeadsToOutreachCampaign(campaignId: string, payload: { leadIds: string[] }) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/campaigns/${campaignId}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<CampaignAppendResult>(response);
}

export async function sendOutreachCampaign(campaignId: string, payload?: { testEmail?: string; delayMs?: number }) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/campaigns/${campaignId}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return parseResponse<{ sentCount?: number; failedCount?: number; total?: number; sent?: boolean; test?: boolean }>(response);
}

export async function fetchOutreachTemplates(params?: { source?: string; city?: string; niche?: string }) {
  const query = new URLSearchParams();
  if (params?.source) query.set("source", params.source);
  if (params?.city) query.set("city", params.city);
  if (params?.niche) query.set("niche", params.niche);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/outreach/templates${suffix}`);
  return parseResponse<{ items: CampaignTemplate[]; recommended: CampaignTemplate }>(response);
}

export async function createOutreachTemplate(payload: {
  name: string;
  sourceKey?: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  sendIntervalMs?: number;
  followUpEnabled?: boolean;
  followUpDelayHours?: number;
  followUpSubject?: string;
  followUpBody?: string;
  followUpBodyHtml?: string;
  maxRetries?: number;
  isDefault?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<CampaignTemplate>(response);
}

export async function deleteOutreachCampaign(campaignId: string) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/campaigns/${campaignId}`, {
    method: "DELETE",
  });
  return parseResponse<{ deleted: boolean; campaignId: string }>(response);
}

export async function updateOutreachCampaign(campaignId: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/api/outreach/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ campaign?: OutreachCampaign; updated?: boolean }>(response);
}

export async function createCampaignDraftFromImportJob(
  jobId: string,
  payload: {
    name?: string;
    subject?: string;
    body?: string;
    bodyHtml?: string;
    smtpAccountId?: string;
    targetNiche?: string;
    targetCity?: string;
    templateId?: string;
    sendIntervalMs?: number;
    followUpEnabled?: boolean;
    followUpDelayHours?: number;
    followUpSubject?: string;
    followUpBody?: string;
    followUpBodyHtml?: string;
    maxRetries?: number;
    scheduledAt?: string;
  }
) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads/create-campaign-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<{
    campaignId: string;
    queuedCount: number;
    matchedLeadIds: string[];
    imported: {
      inserted: number;
      updated: number;
      processed: number;
      selectedBeforeImport: number;
    };
  }>(response);
}

export async function appendSelectedImportJobLeadsToCampaign(jobId: string, payload: { campaignId: string }) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/leads/add-to-campaign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse<CampaignAppendResult & {
    imported: {
      inserted: number;
      updated: number;
      processed: number;
      selectedBeforeImport: number;
    };
  }>(response);
}

export async function fetchImportJobCampaignContext(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/import/jobs/${jobId}/campaign-context`);
  return parseResponse<ImportJobCampaignContext>(response);
}

/* ═══════════════════════════════════════════════════════
   SEO WORKSPACE — Types & API functions
   ═══════════════════════════════════════════════════════ */

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatar_color: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type ChecklistTemplate = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  is_recurring: number;
  recurrence_interval: string | null;
  default_priority: string;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type BusinessChecklistItem = {
  id: string;
  business_id: string;
  template_id: string | null;
  category: string;
  title: string;
  description: string | null;
  is_recurring: number;
  priority: string;
  status: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_color: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  period_month: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SeoActivityEntry = {
  id: string;
  client_id: string | null;
  business_id: string | null;
  actor_id: string | null;
  action: string;
  detail: string | null;
  metadata_json: string | null;
  client_name?: string;
  business_name?: string;
  actor_name?: string;
  created_at: string;
};

export type WorkspaceOverview = {
  totalClients: number;
  activeBusinesses: number;
  totalTeamMembers: number;
  tasksDueToday: number;
  tasksOverdue: number;
  tasksPending: number;
  tasksInProgress: number;
  tasksCompletedThisMonth: number;
  avgCrawlHealth?: number | null;
  totalAuditsCompleted?: number;
  tasksByMember: {
    id: string;
    name: string;
    avatar_color: string;
    total_tasks: number;
    done: number;
    pending: number;
    in_progress: number;
  }[];
  recentActivity: SeoActivityEntry[];
  clients: (SeoClient & {
    total_tasks: number;
    tasks_done: number;
    tasks_overdue: number;
    avg_audit_score?: number | null;
  })[];
};

export type ClientDetail = {
  client: SeoClient;
  businesses: (SeoBusiness & {
    checklist_total: number;
    checklist_done: number;
    checklist_in_progress: number;
    checklist_overdue: number;
  })[];
  recentActivity: SeoActivityEntry[];
};

export type BusinessDetail = {
  business: SeoBusiness & { client_name: string };
  checklistSummary: {
    category: string;
    total: number;
    done: number;
    in_progress: number;
    pending: number;
    overdue: number;
  }[];
  recentAudits: {
    id: string;
    audit_type: string;
    score: number | null;
    verdict: string;
    target_name: string;
    status: string;
    created_at: string;
  }[];
  recentActivity: SeoActivityEntry[];
  projectMembers: ProjectMember[];
};

/* ── Team Member API ── */
export async function fetchTeamMembers(params?: { role?: string; active?: number }): Promise<TeamMember[]> {
  const query = new URLSearchParams();
  if (params?.role) query.set("role", params.role);
  if (params?.active !== undefined) query.set("active", String(params.active));
  const suffix = query.toString() ? `?${query}` : "";
  const response = await fetch(`${API_BASE_URL}/api/seo/team${suffix}`);
  return parseResponse<TeamMember[]>(response);
}

export async function createTeamMember(data: { name: string; email?: string; role?: string; avatar_color?: string }): Promise<TeamMember> {
  const response = await fetch(`${API_BASE_URL}/api/seo/team`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<TeamMember>(response);
}

export async function updateTeamMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
  const response = await fetch(`${API_BASE_URL}/api/seo/team/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<TeamMember>(response);
}

export async function deleteTeamMember(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/seo/team/${id}`, { method: "DELETE" });
}

/* ── Checklist Templates API ── */
export async function fetchChecklistTemplates(category?: string): Promise<ChecklistTemplate[]> {
  const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
  const response = await fetch(`${API_BASE_URL}/api/seo/checklist/templates${suffix}`);
  return parseResponse<ChecklistTemplate[]>(response);
}

export async function createChecklistTemplate(data: Partial<ChecklistTemplate>): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE_URL}/api/seo/checklist/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<ChecklistTemplate>(response);
}

export async function updateChecklistTemplate(id: string, data: Partial<ChecklistTemplate>): Promise<ChecklistTemplate> {
  const response = await fetch(`${API_BASE_URL}/api/seo/checklist/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<ChecklistTemplate>(response);
}

/* ── Business Checklist API ── */
export async function fetchBusinessChecklist(businessId: string, params?: { month?: string; status?: string; category?: string }): Promise<BusinessChecklistItem[]> {
  const query = new URLSearchParams();
  if (params?.month) query.set("month", params.month);
  if (params?.status) query.set("status", params.status);
  if (params?.category) query.set("category", params.category);
  const suffix = query.toString() ? `?${query}` : "";
  const response = await fetch(`${API_BASE_URL}/api/seo/checklist/business/${businessId}${suffix}`);
  return parseResponse<BusinessChecklistItem[]>(response);
}

export async function generateBusinessChecklist(businessId: string, data?: { month?: string; categories?: string[] }): Promise<{ created: number; month: string }> {
  const response = await fetch(`${API_BASE_URL}/api/seo/checklist/business/${businessId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
  return parseResponse<{ created: number; month: string }>(response);
}

export async function createBusinessChecklistItem(businessId: string, data: Partial<BusinessChecklistItem>): Promise<BusinessChecklistItem> {
  const response = await fetch(`${API_BASE_URL}/api/seo/checklist/business/${businessId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<BusinessChecklistItem>(response);
}

export async function updateBusinessChecklistItem(businessId: string, itemId: string, data: Partial<BusinessChecklistItem>): Promise<BusinessChecklistItem> {
  const response = await fetch(`${API_BASE_URL}/api/seo/checklist/business/${businessId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<BusinessChecklistItem>(response);
}

export async function deleteBusinessChecklistItem(businessId: string, itemId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/seo/checklist/business/${businessId}/items/${itemId}`, { method: "DELETE" });
}

/* ── Workspace API ── */
export async function fetchWorkspaceOverview(): Promise<WorkspaceOverview> {
  const response = await fetch(`${API_BASE_URL}/api/seo/workspace/overview`);
  return parseResponse<WorkspaceOverview>(response);
}

export async function fetchClientDetail(clientId: string): Promise<ClientDetail> {
  const response = await fetch(`${API_BASE_URL}/api/seo/workspace/clients/${clientId}`);
  return parseResponse<ClientDetail>(response);
}

export async function fetchBusinessDetail(businessId: string): Promise<BusinessDetail> {
  const response = await fetch(`${API_BASE_URL}/api/seo/workspace/businesses/${businessId}`);
  return parseResponse<BusinessDetail>(response);
}

/* ── Project Members API ── */
export type ProjectMember = {
  id: string;
  business_id: string;
  team_member_id: string;
  role: string;
  name: string;
  email: string | null;
  team_role: string;
  avatar_color: string;
  is_active: number;
  created_at: string;
};

export async function fetchProjectMembers(businessId: string): Promise<ProjectMember[]> {
  const response = await fetch(`${API_BASE_URL}/api/seo/workspace/businesses/${businessId}/members`);
  return parseResponse<ProjectMember[]>(response);
}

export async function addProjectMember(businessId: string, data: { team_member_id: string; role?: string }): Promise<ProjectMember> {
  const response = await fetch(`${API_BASE_URL}/api/seo/workspace/businesses/${businessId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResponse<ProjectMember>(response);
}

export async function updateProjectMemberRole(businessId: string, memberId: string, role: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/seo/workspace/businesses/${businessId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export async function removeProjectMember(businessId: string, memberId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/seo/workspace/businesses/${businessId}/members/${memberId}`, { method: "DELETE" });
}

/* ── Google Integration API ── */
export type GoogleConnectionStatus = {
  configured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
};

export type BusinessGoogleToken = {
  id: string;
  business_id: string;
  google_email: string;
  gsc_connected: number;
  gsc_site_url: string | null;
  gmb_connected: number;
  gmb_account_id: string | null;
  gmb_location_id: string | null;
  scopes: string;
  created_at: string;
  updated_at: string;
};

export type GscSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscPerformanceRow = {
  id: string;
  business_id: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
};

export type GscKeywordRow = {
  id: string;
  business_id: string;
  keyword: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
};

export async function fetchGoogleStatus(): Promise<GoogleConnectionStatus> {
  const response = await fetch(`${API_BASE_URL}/api/google/status`);
  return parseResponse<GoogleConnectionStatus>(response);
}

export async function fetchGoogleConnectUrl(businessId: string, scopes = "gsc"): Promise<{ authUrl: string }> {
  const response = await fetch(`${API_BASE_URL}/api/google/connect?businessId=${businessId}&scopes=${scopes}`);
  return parseResponse<{ authUrl: string }>(response);
}

export async function fetchBusinessGoogleToken(businessId: string): Promise<BusinessGoogleToken | null> {
  const response = await fetch(`${API_BASE_URL}/api/google/business/${businessId}/token`);
  return parseResponse<BusinessGoogleToken | null>(response);
}

export async function disconnectGoogle(businessId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/google/business/${businessId}/disconnect`, { method: "DELETE" });
}

export async function fetchGscSites(businessId: string): Promise<GscSite[]> {
  const response = await fetch(`${API_BASE_URL}/api/google/gsc/${businessId}/sites`);
  return parseResponse<GscSite[]>(response);
}

export async function selectGscSite(businessId: string, siteUrl: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/google/gsc/${businessId}/select-site`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteUrl }),
  });
}

export async function syncGscData(businessId: string): Promise<{ perfInserted: number; kwInserted: number }> {
  const response = await fetch(`${API_BASE_URL}/api/google/gsc/${businessId}/sync`, { method: "POST" });
  return parseResponse<{ perfInserted: number; kwInserted: number }>(response);
}

export async function fetchGscPerformance(businessId: string, days = 30): Promise<GscPerformanceRow[]> {
  const response = await fetch(`${API_BASE_URL}/api/google/gsc/${businessId}/performance?days=${days}`);
  return parseResponse<GscPerformanceRow[]>(response);
}

export async function fetchGscKeywords(businessId: string, limit = 50): Promise<GscKeywordRow[]> {
  const response = await fetch(`${API_BASE_URL}/api/google/gsc/${businessId}/keywords?limit=${limit}`);
  return parseResponse<GscKeywordRow[]>(response);
}

/* ── Automation ── */

export type AutomationWorkflow = {
  id: string;
  name: string;
  description: string | null;
  steps_json: string;
  is_active: number;
  schedule_type?: string;
  schedule_spec?: string | null;
  default_input_json?: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  current_step: number;
  total_steps: number;
  steps_progress_json: string;
  input_json: string;
  result_json: string | null;
  error_message: string | null;
  progress_percent: number;
  progress_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export async function fetchAutomationWorkflows(): Promise<{ items: AutomationWorkflow[] }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/workflows`);
  return parseResponse<{ items: AutomationWorkflow[] }>(response);
}

export async function fetchAutomationWorkflow(id: string): Promise<{ workflow: AutomationWorkflow }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/workflows/${id}`);
  return parseResponse<{ workflow: AutomationWorkflow }>(response);
}

export async function createAutomationWorkflow(payload: {
  name: string;
  description?: string;
  steps: Array<{ type: string; label: string; config?: Record<string, unknown> }>;
  scheduleType?: string;
  scheduleSpec?: string | null;
  defaultInput?: Record<string, unknown>;
}): Promise<{ workflow: AutomationWorkflow }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ workflow: AutomationWorkflow }>(response);
}

export async function updateAutomationWorkflow(
  id: string,
  payload: Partial<{ name: string; description: string; steps: unknown[]; is_active: boolean }>
): Promise<{ workflow: AutomationWorkflow }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/workflows/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ workflow: AutomationWorkflow }>(response);
}

export async function deleteAutomationWorkflow(id: string): Promise<{ ok: boolean }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/workflows/${id}`, {
    method: "DELETE",
  });
  return parseResponse<{ ok: boolean }>(response);
}

export async function fetchAutomationRuns(workflowId?: string, limit = 20): Promise<{ items: AutomationRun[] }> {
  const params = new URLSearchParams();
  if (workflowId) params.set("workflowId", workflowId);
  params.set("limit", String(limit));
  const response = await apiFetch(`${API_BASE_URL}/api/automation/runs?${params}`);
  return parseResponse<{ items: AutomationRun[] }>(response);
}

export async function fetchAutomationRun(id: string): Promise<{ run: AutomationRun }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/runs/${id}`);
  return parseResponse<{ run: AutomationRun }>(response);
}

export async function startAutomationRun(workflowId: string, input: Record<string, unknown>): Promise<{ run: AutomationRun }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflowId, input }),
  });
  return parseResponse<{ run: AutomationRun }>(response);
}

export type LeadCommandPlan = {
  prompt: string;
  niche: string;
  query: string;
  city: string;
  state: string;
  maxLeads: number;
  source: "best_available";
  filters: { minRating?: number; maxRating?: number; maxReviews?: number; websitePreference: "any" | "missing" | "weak" };
  channels: string[];
  approvalRequired: true;
  steps: Array<{ type: string; label: string; config: Record<string, unknown> }>;
  assumptions: string[];
};

export type CommandReadiness = {
  checks: { googlePlaces: boolean; dataForSeo: boolean; emailSender: boolean; openRouter: boolean; bookingLink: boolean };
  launchReady: boolean;
  sendReady: boolean;
  meetingReady: boolean;
};

export type LeadMeeting = {
  id: string; lead_id?: string | null; business_name: string; contact_name?: string | null;
  contact_email?: string | null; starts_at: string; duration_minutes: number;
  meeting_url?: string | null; status: "scheduled" | "completed" | "cancelled" | "no_show"; notes?: string | null;
};

export async function interpretLeadCommand(prompt: string): Promise<{ plan: LeadCommandPlan }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/commands/interpret`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ prompt }) });
  return parseResponse<{ plan: LeadCommandPlan }>(response);
}
export async function fetchCommandReadiness(): Promise<CommandReadiness> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/commands/readiness`);
  return parseResponse<CommandReadiness>(response);
}
export async function launchLeadCommand(payload: { prompt:string; city?:string; state?:string; niche?:string; maxLeads?:number }): Promise<{ plan:LeadCommandPlan; workflow:AutomationWorkflow; run:AutomationRun }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/commands`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
  return parseResponse<{ plan:LeadCommandPlan; workflow:AutomationWorkflow; run:AutomationRun }>(response);
}
export async function fetchPipelineSummary(): Promise<{ stages:Record<string,number> }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/pipeline/summary`);
  return parseResponse<{ stages:Record<string,number> }>(response);
}
export async function fetchLeadMeetings(): Promise<{ items:LeadMeeting[] }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/meetings`);
  return parseResponse<{ items:LeadMeeting[] }>(response);
}
export async function createLeadMeeting(payload: { businessName:string; contactName?:string; contactEmail?:string; startsAt:string; durationMinutes?:number; meetingUrl?:string; notes?:string }): Promise<{ meeting:LeadMeeting }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/meetings`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
  return parseResponse<{ meeting:LeadMeeting }>(response);
}
export async function updateLeadMeetingStatus(id:string,status:LeadMeeting["status"]): Promise<{ meeting:LeadMeeting }> {
  const response = await apiFetch(`${API_BASE_URL}/api/automation/meetings/${id}`, { method:"PATCH", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ status }) });
  return parseResponse<{ meeting:LeadMeeting }>(response);
}

export type EmailSequenceStep = {
  day?: number;
  delay_days?: number;
  step_number?: number;
  subject: string;
  body: string;
};

export type EmailSequence = {
  id: string;
  name: string;
  niche: string;
  description: string;
  steps_json: string;
  created_at: string;
  updated_at?: string;
};

export async function fetchEmailSequences(): Promise<{ items: EmailSequence[] }> {
  const response = await apiFetch(`${API_BASE_URL}/api/email/sequences`);
  return parseResponse<{ items: EmailSequence[] }>(response);
}

export async function createEmailSequence(payload: {
  name: string;
  niche?: string;
  description?: string;
  steps: EmailSequenceStep[];
}): Promise<{ sequence: EmailSequence }> {
  const response = await apiFetch(`${API_BASE_URL}/api/email/sequences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ sequence: EmailSequence }>(response);
}

export async function updateEmailSequence(
  id: string,
  payload: {
    name: string;
    niche?: string;
    description?: string;
    steps: EmailSequenceStep[];
  }
): Promise<{ sequence: EmailSequence }> {
  const response = await apiFetch(`${API_BASE_URL}/api/email/sequences/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseResponse<{ sequence: EmailSequence }>(response);
}

export async function deleteEmailSequence(id: string): Promise<{ ok: boolean }> {
  const response = await apiFetch(`${API_BASE_URL}/api/email/sequences/${id}`, {
    method: "DELETE",
  });
  return parseResponse<{ ok: boolean }>(response);
}

// SaaS user and platform administration
export type SaaSRole = "super_admin" | "admin" | "manager" | "member" | "viewer";
export type SaaSPlanKey = "free" | "pro" | "enterprise";
export type SaaSUser = { id: string; name: string; email: string; role: SaaSRole; workspace_role?: Exclude<SaaSRole, "super_admin">; platform_role?: string; is_active: number; last_login_at?: string | null; created_at: string; tenant_id?: string; tenant_name?: string; subscription_plan?: SaaSPlanKey };
export type SaaSPlan = { key: SaaSPlanKey; name: string; description: string; pricing: { currency: "USD"; monthly: number; yearly: number }; limits: { users: number; leads: number; activeCampaigns: number; scraperJobs: number }; features: { multiUser: boolean; automation: boolean; advancedAudits: boolean; apiIntegrations: boolean; priorityWorkflows: boolean } };
export type SaaSTenant = { id: string; name: string; subscription_plan: SaaSPlanKey; billing_status: string; created_at: string; updated_at: string; user_count: number; active_user_count: number };

export async function fetchWorkspaceUsers(): Promise<{ items: SaaSUser[] }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/users`)); }
export async function fetchWorkspacePlan(): Promise<{ tenant: SaaSTenant; plan: SaaSPlan; seatUsage: number; catalog: SaaSPlan[] }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/users/plan`)); }
export async function createWorkspaceUser(data: { name: string; email: string; role: Exclude<SaaSRole, "super_admin">; password?: string }): Promise<{ user: SaaSUser; temporaryPassword: string }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })); }
export async function updateWorkspaceUser(id: string, data: { name?: string; email?: string; role?: Exclude<SaaSRole, "super_admin">; isActive?: boolean }): Promise<void> { await parseResponse(await apiFetch(`${API_BASE_URL}/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })); }
export async function resetWorkspaceUserPassword(id: string): Promise<{ temporaryPassword: string }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/users/${id}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })); }
export async function deleteWorkspaceUser(id: string): Promise<void> { await parseResponse(await apiFetch(`${API_BASE_URL}/api/users/${id}`, { method: "DELETE" })); }

export async function fetchPlatformSummary(): Promise<{ tenants: number; activeTenants: number; users: number; activeUsers: number; plans: Array<{ plan: string; count: number }> }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/platform/summary`)); }
export async function fetchPlatformTenants(): Promise<{ items: SaaSTenant[]; plans: SaaSPlan[] }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/platform/tenants`)); }
export async function fetchPlatformUsers(search = ""): Promise<{ items: SaaSUser[] }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/platform/users?search=${encodeURIComponent(search)}`)); }
export async function createPlatformTenant(data: { name: string; ownerName: string; ownerEmail: string; plan: SaaSPlanKey; password?: string }): Promise<{ tenant: { id: string; name: string; plan: SaaSPlanKey }; owner: SaaSUser; temporaryPassword: string }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/platform/tenants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })); }
export async function updatePlatformTenant(id: string, data: { name?: string; plan?: SaaSPlanKey; status?: string }): Promise<void> { await parseResponse(await apiFetch(`${API_BASE_URL}/api/platform/tenants/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })); }
export async function updatePlatformUser(id: string, data: { name?: string; email?: string; role?: Exclude<SaaSRole, "super_admin">; isActive?: boolean }): Promise<void> { await parseResponse(await apiFetch(`${API_BASE_URL}/api/platform/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })); }
export async function resetPlatformUserPassword(id: string): Promise<{ temporaryPassword: string }> { return parseResponse(await apiFetch(`${API_BASE_URL}/api/platform/users/${id}/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })); }
