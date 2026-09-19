import express from "express";
import { getDb } from "../db/database.js";
import { plainTextToEmailHtml } from "../modules/outreach/html.js";
import {
  generateAiText,
  listAiProviderConfigs,
  updateAiProviderConfig,
} from "../modules/ai/providers.js";

type AuditPromptRow = {
  id: string;
  audit_type: string;
  score: number | null;
  verdict: string | null;
  data_json: string | null;
  target_name: string | null;
};

type CrawlPromptRow = {
  id: string;
  target_name: string | null;
  start_url: string;
  summary_json: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function hasOwnValue(record: unknown, key: string): boolean {
  return Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key));
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = cleanText(value).toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseJsonObject<T extends Record<string, unknown>>(value: string): Partial<T> {
  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const tryParse = (candidate: string) => {
    try {
      return JSON.parse(candidate) as Partial<T>;
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) {
    return direct;
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const extracted = tryParse(cleaned.slice(start, end + 1));
    if (extracted) {
      return extracted;
    }
  }

  return {};
}

function readAgencyContext(): {
  agencyName: string;
  defaultCity: string;
  defaultState: string;
  brandNotes: string;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT agency_name, default_city, default_state, brand_notes
       FROM app_settings
       WHERE id = 1`
    )
    .get() as {
      agency_name?: string;
      default_city?: string;
      default_state?: string;
      brand_notes?: string;
    } | undefined;

  return {
    agencyName: cleanText(row?.agency_name),
    defaultCity: cleanText(row?.default_city),
    defaultState: cleanText(row?.default_state),
    brandNotes: cleanText(row?.brand_notes),
  };
}

export const aiRouter = express.Router();

aiRouter.get("/providers", (_req, res) => {
  try {
    res.json({ items: listAiProviderConfigs() });
  } catch (error) {
    console.error("Failed to load AI providers", error);
    res.status(500).json({ error: "Failed to load AI providers" });
  }
});

aiRouter.patch("/providers/:providerKey", (req, res) => {
  try {
    const providerKey = cleanText(req.params.providerKey);
    if (!providerKey) {
      res.status(400).json({ error: "providerKey is required" });
      return;
    }

    const updates: Partial<{
      baseUrl: string;
      model: string;
      apiKey: string;
      clearApiKey: boolean;
      isEnabled: boolean;
      useForEmail: boolean;
      useForAudit: boolean;
      useForGeneral: boolean;
    }> = {};

    if (hasOwnValue(req.body, "baseUrl")) {
      updates.baseUrl = cleanText(req.body?.baseUrl);
    }
    if (hasOwnValue(req.body, "model")) {
      updates.model = cleanText(req.body?.model);
    }
    if (hasOwnValue(req.body, "apiKey")) {
      updates.apiKey = cleanText(req.body?.apiKey);
    }
    if (hasOwnValue(req.body, "clearApiKey")) {
      updates.clearApiKey = toBoolean(req.body?.clearApiKey, false);
    }
    if (hasOwnValue(req.body, "isEnabled")) {
      updates.isEnabled = toBoolean(req.body?.isEnabled, false);
    }
    if (hasOwnValue(req.body, "useForEmail")) {
      updates.useForEmail = toBoolean(req.body?.useForEmail, false);
    }
    if (hasOwnValue(req.body, "useForAudit")) {
      updates.useForAudit = toBoolean(req.body?.useForAudit, false);
    }
    if (hasOwnValue(req.body, "useForGeneral")) {
      updates.useForGeneral = toBoolean(req.body?.useForGeneral, false);
    }

    const updated = updateAiProviderConfig(providerKey, updates);

    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save AI provider";
    res.status(400).json({ error: message });
  }
});

aiRouter.post("/providers/:providerKey/test", async (req, res) => {
  try {
    const providerKey = cleanText(req.params.providerKey);
    if (!providerKey) {
      res.status(400).json({ error: "providerKey is required" });
      return;
    }

    const overrides: Partial<{ apiKey: string; baseUrl: string; model: string }> = {};

    if (hasOwnValue(req.body, "apiKey")) {
      overrides.apiKey = cleanText(req.body?.apiKey);
    }
    if (hasOwnValue(req.body, "baseUrl")) {
      overrides.baseUrl = cleanText(req.body?.baseUrl);
    }
    if (hasOwnValue(req.body, "model")) {
      overrides.model = cleanText(req.body?.model);
    }

    const result = await generateAiText({
      task: "general",
      preferredProviderKey: providerKey,
      allowDisabledPreferred: true,
      overrides,
      systemPrompt: "You are testing API connectivity for a local operations app. Reply with READY only.",
      prompt: "Reply with READY only.",
      temperature: 0,
      maxTokens: 128,
    });

    res.json({
      ok: true,
      providerKey: result.providerKey,
      preview: cleanText(result.output).slice(0, 120),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI provider test failed";
    res.status(400).json({ error: message });
  }
});

aiRouter.post("/generate/email-draft", async (req, res) => {
  try {
    const agency = readAgencyContext();
    const businessName = cleanText(req.body?.businessName) || "{{business_name}}";
    const city = cleanText(req.body?.city) || agency.defaultCity || "{{city}}";
    const state = cleanText(req.body?.state) || agency.defaultState || "{{state}}";
    const website = cleanText(req.body?.website) || "{{website}}";
    const niche = cleanText(req.body?.niche);
    const currentSubject = cleanText(req.body?.currentSubject);
    const currentBody = cleanText(req.body?.currentBody);
    const currentFollowUpSubject = cleanText(req.body?.currentFollowUpSubject);
    const currentFollowUpBody = cleanText(req.body?.currentFollowUpBody);
    const followUpEnabled = toBoolean(req.body?.followUpEnabled, true);

    const prompt = [
      "Write a local SEO outreach draft for an agency operator.",
      "Return strict JSON with keys: subject, body, followUpSubject, followUpBody, notes.",
      "Use plain text only in body fields. No markdown. No HTML. No code fences.",
      "Preserve these placeholders exactly when variable recipient data is needed: {{business_name}}, {{city}}, {{state}}, {{website}}.",
      "Keep the tone human, consultative, and low-pressure.",
      "Avoid spammy language, hype, fake urgency, and guaranteed outcomes.",
      `Business: ${businessName}`,
      `City: ${city}`,
      `State: ${state}`,
      `Website: ${website}`,
      niche ? `Service niche: ${niche}` : "",
      agency.agencyName ? `Agency: ${agency.agencyName}` : "",
      agency.brandNotes ? `Brand notes: ${agency.brandNotes}` : "",
      currentSubject ? `Current subject to improve: ${currentSubject}` : "",
      currentBody ? `Current body to improve:\n${currentBody}` : "",
      followUpEnabled && currentFollowUpSubject ? `Current follow-up subject: ${currentFollowUpSubject}` : "",
      followUpEnabled && currentFollowUpBody ? `Current follow-up body:\n${currentFollowUpBody}` : "",
      followUpEnabled ? "Include a follow-up email draft." : "Set followUpSubject and followUpBody to empty strings.",
      "Keep each email short enough for cold outreach. 3 to 5 concise paragraphs max.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const generated = await generateAiText({
      task: "email",
      preferredProviderKey: cleanText(req.body?.providerKey),
      systemPrompt:
        "You write outbound local SEO emails for agencies. Your job is to create concise, respectful drafts that earn replies without sounding automated or spammy.",
      prompt,
      temperature: 0.7,
      maxTokens: 1000,
    });

    const parsed = parseJsonObject<{
      subject: string;
      body: string;
      followUpSubject: string;
      followUpBody: string;
      notes: string[];
    }>(generated.output);

    const subject = cleanText(parsed.subject) || currentSubject || "Quick idea for {{business_name}}";
    const body = cleanText(parsed.body) || currentBody || generated.output;
    const followUpSubject = followUpEnabled
      ? cleanText(parsed.followUpSubject) || currentFollowUpSubject || "Following up on {{business_name}}"
      : "";
    const followUpBody = followUpEnabled ? cleanText(parsed.followUpBody) || currentFollowUpBody : "";
    const notes = Array.isArray(parsed.notes)
      ? parsed.notes.map((item) => cleanText(item)).filter(Boolean)
      : [`Draft generated with ${generated.label}.`];

    res.json({
      providerKey: generated.providerKey,
      subject,
      body,
      bodyHtml: plainTextToEmailHtml(body),
      followUpSubject,
      followUpBody,
      followUpBodyHtml: followUpEnabled ? plainTextToEmailHtml(followUpBody) : "",
      notes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate AI email draft";
    res.status(400).json({ error: message });
  }
});

aiRouter.post("/generate/audit-report", async (req, res) => {
  try {
    const auditId = cleanText(req.body?.auditId);
    if (!auditId) {
      res.status(400).json({ error: "auditId is required" });
      return;
    }

    const db = getDb();
    const audit = db
      .prepare(
        `SELECT id, audit_type, score, verdict, data_json, target_name
         FROM audits
         WHERE id = ?`
      )
      .get(auditId) as AuditPromptRow | undefined;

    if (!audit) {
      res.status(404).json({ error: "Audit not found" });
      return;
    }

    const auditData = audit.data_json ? JSON.parse(audit.data_json) as Record<string, unknown> : {};
    const auditType = cleanText(audit.audit_type).toLowerCase();
    const isGmbAudit = auditType === "gmb";
    const prompt = [
      "Create a client-ready audit summary in strict JSON.",
      isGmbAudit
        ? "Return keys: headline, executiveSummary, detailedSummary, visibilityView, trustView, conversionView, ownerView, customerView, priorityActions, quickWins, nextStepCta."
        : "Return keys: headline, executiveSummary, detailedSummary, technicalView, contentView, trustView, uxView, ownerView, customerView, priorityActions, quickWins, nextStepCta.",
      "priorityActions and quickWins must be arrays of short strings.",
      "Write like an operator preparing a delivery report for a real client. Be specific and practical.",
      `Audit type: ${cleanText(audit.audit_type)}`,
      `Target: ${cleanText(audit.target_name)}`,
      `Score: ${audit.score ?? "unknown"}`,
      `Verdict: ${cleanText(audit.verdict)}`,
      `Raw audit summary: ${cleanText(auditData.summary)}`,
      `Issues: ${JSON.stringify(Array.isArray(auditData.issues) ? auditData.issues : [])}`,
      `Wins: ${JSON.stringify(Array.isArray(auditData.wins) ? auditData.wins : [])}`,
      `Recommendations: ${JSON.stringify(Array.isArray(auditData.recommendations) ? auditData.recommendations : [])}`,
    ].join("\n\n");

    const generated = await generateAiText({
      task: "audit",
      preferredProviderKey: cleanText(req.body?.providerKey),
      systemPrompt:
        "You turn local SEO audit findings into clear client-facing report copy with a short executive summary, practical action list, and confident next-step recommendation.",
      prompt,
      temperature: 0.45,
      maxTokens: 1200,
    });

    const parsed = parseJsonObject<{
      headline: string;
      executiveSummary: string;
      detailedSummary: string;
      technicalView: string;
      contentView: string;
      trustView: string;
      uxView: string;
      visibilityView: string;
      conversionView: string;
      ownerView: string;
      customerView: string;
      priorityActions: string[];
      quickWins: string[];
      nextStepCta: string;
    }>(generated.output);

    const aiInsights = {
      providerKey: generated.providerKey,
      headline: cleanText(parsed.headline) || `${cleanText(audit.target_name)} audit summary`,
      executiveSummary: cleanText(parsed.executiveSummary) || cleanText(auditData.summary) || cleanText(audit.verdict),
      detailedSummary: cleanText(parsed.detailedSummary) || cleanText(auditData.summary),
      technicalView: cleanText(parsed.technicalView),
      contentView: cleanText(parsed.contentView),
      trustView: cleanText(parsed.trustView),
      uxView: cleanText(parsed.uxView),
      visibilityView: cleanText(parsed.visibilityView),
      conversionView: cleanText(parsed.conversionView),
      ownerView: cleanText(parsed.ownerView),
      customerView: cleanText(parsed.customerView),
      priorityActions: Array.isArray(parsed.priorityActions)
        ? parsed.priorityActions.map((item) => cleanText(item)).filter(Boolean)
        : [],
      quickWins: Array.isArray(parsed.quickWins)
        ? parsed.quickWins.map((item) => cleanText(item)).filter(Boolean)
        : [],
      nextStepCta: cleanText(parsed.nextStepCta) || "Review the action items and schedule the implementation work.",
      generatedAt: new Date().toISOString(),
    };

    db.prepare("UPDATE audits SET ai_insights_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(aiInsights),
      aiInsights.generatedAt,
      auditId
    );

    res.json({ auditId, aiInsights });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate AI audit report";
    res.status(400).json({ error: message });
  }
});

aiRouter.post("/generate/crawl-audit-report", async (req, res) => {
  try {
    const crawlJobId = cleanText(req.body?.crawlJobId);
    if (!crawlJobId) {
      res.status(400).json({ error: "crawlJobId is required" });
      return;
    }

    const db = getDb();
    const crawlJob = db
      .prepare(
        `SELECT id, target_name, start_url, summary_json
         FROM audit_crawl_jobs
         WHERE id = ?`
      )
      .get(crawlJobId) as CrawlPromptRow | undefined;

    if (!crawlJob) {
      res.status(404).json({ error: "Crawl job not found" });
      return;
    }

    const crawlSummary = crawlJob.summary_json
      ? (JSON.parse(crawlJob.summary_json) as Record<string, unknown>)
      : {};

    const pages = db
      .prepare(
        `SELECT
           url,
           depth,
           status_code,
           title,
           meta_description,
           h1_count,
           word_count,
           internal_link_count,
           has_schema,
           has_contact_signal,
           images_without_alt,
           page_summary
         FROM audit_crawl_pages
         WHERE crawl_job_id = ?
         ORDER BY depth ASC, datetime(created_at) ASC
         LIMIT 20`
      )
      .all(crawlJobId) as Array<{
      url: string;
      depth: number;
      status_code: number | null;
      title: string | null;
      meta_description: string | null;
      h1_count: number;
      word_count: number;
      internal_link_count: number;
      has_schema: number;
      has_contact_signal: number;
      images_without_alt: number;
      page_summary: string | null;
    }>;

    const prompt = [
      "Create a multi-lens website audit summary in strict JSON.",
      "Return keys: headline, executiveSummary, technicalView, contentView, trustView, uxView, ownerView, customerView, priorityActions, quickWins, nextStepCta.",
      "priorityActions and quickWins must be arrays of short strings.",
      "Be specific, evidence-based, and grounded in the crawl data provided.",
      `Target: ${cleanText(crawlJob.target_name) || cleanText(crawlJob.start_url)}`,
      `Start URL: ${cleanText(crawlJob.start_url)}`,
      `Summary metrics: ${JSON.stringify(crawlSummary)}`,
      `Page evidence: ${JSON.stringify(
        pages.map((page) => ({
          url: page.url,
          depth: page.depth,
          statusCode: page.status_code,
          title: cleanText(page.title),
          metaDescription: cleanText(page.meta_description),
          h1Count: page.h1_count,
          wordCount: page.word_count,
          internalLinks: page.internal_link_count,
          hasSchema: page.has_schema === 1,
          hasContactSignal: page.has_contact_signal === 1,
          imagesWithoutAlt: page.images_without_alt,
          summary: cleanText(page.page_summary),
        }))
      )}`,
    ].join("\n\n");

    const generated = await generateAiText({
      task: "audit",
      preferredProviderKey: cleanText(req.body?.providerKey),
      systemPrompt:
        "You are a senior local SEO strategist. Convert crawl evidence into a concise multi-lens review covering technical SEO, content depth, trust signals, UX risk, owner priorities, and customer impact.",
      prompt,
      temperature: 0.35,
      maxTokens: 1600,
    });

    const parsed = parseJsonObject<{
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
    }>(generated.output);

    const aiInsights = {
      providerKey: generated.providerKey,
      headline: cleanText(parsed.headline) || `${cleanText(crawlJob.target_name) || "Website"} deep audit summary`,
      executiveSummary: cleanText(parsed.executiveSummary),
      technicalView: cleanText(parsed.technicalView),
      contentView: cleanText(parsed.contentView),
      trustView: cleanText(parsed.trustView),
      uxView: cleanText(parsed.uxView),
      ownerView: cleanText(parsed.ownerView),
      customerView: cleanText(parsed.customerView),
      priorityActions: Array.isArray(parsed.priorityActions)
        ? parsed.priorityActions.map((item) => cleanText(item)).filter(Boolean)
        : [],
      quickWins: Array.isArray(parsed.quickWins)
        ? parsed.quickWins.map((item) => cleanText(item)).filter(Boolean)
        : [],
      nextStepCta:
        cleanText(parsed.nextStepCta) ||
        "Use the crawl evidence to prioritize fixes page-by-page before sending a client roadmap.",
      generatedAt: new Date().toISOString(),
    };

    db.prepare("UPDATE audit_crawl_jobs SET ai_insights_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(aiInsights),
      aiInsights.generatedAt,
      crawlJobId
    );

    res.json({ crawlJobId, aiInsights });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate crawl audit report";
    res.status(400).json({ error: message });
  }
});

/* ── AI Specialist Audit — generic endpoint for all AI-powered audit types ── */

type SpecialistAuditType =
  | "content"
  | "design"
  | "local-seo"
  | "reputation"
  | "customer-conversion"
  | "accessibility"
  | "competitor-organic"
  | "competitor-mappack";

const AUDIT_JSON_KEYS = "headline, executiveSummary, overallScore (0-100), verdict (Strong/Needs Work/Urgent), findings (array of {title, severity: high|medium|low, detail} — return at least 5-8 findings), wins (array of strings), recommendations (array of strings — at least 5), priorityActions (array of strings — top 3-5 immediate actions)";

const specialistPrompts: Record<SpecialistAuditType, { system: string; task: string; keys: string }> = {
  content: {
    system: "You are a senior content strategist and SEO expert performing a detailed website content audit for a local SEO agency's client. Be thorough, specific, and reference actual content you see on the page.",
    task: `Analyze the website content deeply for ALL of the following areas:
1. TOPICAL COVERAGE — depth of service/product descriptions, industry expertise signals, topical completeness vs what a searcher expects
2. KEYWORD OPTIMIZATION — primary keyword in title/H1/URL, secondary keywords in subheadings, keyword density, LSI/semantic terms, over-optimization risks
3. READABILITY — sentence length, paragraph density, jargon usage, scan-ability (bullets/lists), reading level appropriateness for the audience
4. CONTENT FRESHNESS — copyright year, blog post dates, outdated references, seasonal content relevance
5. CONTENT GAPS — missing service pages, FAQ coverage, location pages, comparison/vs pages, how-to guides, resource pages
6. THIN/DUPLICATE CONTENT — pages under 300 words, boilerplate repeated across pages, doorway-style pages
7. HEADING STRUCTURE — H1 uniqueness, H2-H6 hierarchy, keyword placement in headings, logical content flow
8. INTERNAL LINKING — contextual links between pages, orphaned pages, anchor text quality, link depth
9. BLOG/RESOURCE STRATEGY — post frequency, topic relevance, word count per post, category structure, CTAs within content
10. E-E-A-T SIGNALS — author bios, credentials, experience demonstrations, original research/data, cited sources
11. META CONTENT — title tag optimization, meta description persuasiveness, Open Graph tags
12. MULTIMEDIA — image relevance, video usage, infographics, embedded tools/calculators
Focus on actionable findings for a local business. Be specific with page URLs and content snippets when possible.`,
    keys: AUDIT_JSON_KEYS,
  },
  design: {
    system: "You are a senior UI/UX auditor and conversion design expert evaluating website design for a local SEO agency's client. Reference specific design patterns you observe.",
    task: `Evaluate the website design thoroughly across ALL of the following areas:
1. VISUAL HIERARCHY — clear scanning path, size/color/weight emphasis on key elements, information priority
2. CTA VISIBILITY — above-fold CTA presence, button contrast/size, CTA copy persuasiveness, sticky/floating CTAs, CTA count per page
3. MOBILE RESPONSIVENESS — viewport meta, touch target sizes, horizontal scrolling, font sizes on mobile, hamburger menu usability
4. PAGE LAYOUT — grid consistency, content width, sidebar usage, section spacing, content density
5. NAVIGATION — menu clarity, breadcrumbs, footer navigation, search functionality, click depth to key pages
6. BRAND CONSISTENCY — color palette usage, logo quality, typography consistency, tone alignment, imagery style
7. WHITESPACE — breathing room between sections, text line spacing, padding around CTAs, cramped vs balanced
8. TYPOGRAPHY — font choices, size hierarchy, line length (45-75 chars ideal), contrast against background, web font loading
9. IMAGE QUALITY — resolution, relevance, lazy loading, modern formats (WebP), decorative vs informative
10. FORM DESIGN — field count, labels, validation messages, progress indicators, multi-step vs single form, autofill support
11. TRUST ELEMENTS — testimonial placement, star ratings, client logos, certifications, security badges, guarantee mentions
12. LOADING PERFORMANCE — hero image weight, render-blocking resources, skeleton screens, perceived speed
13. FOOTER — contact info, social links, sitemap, legal links, secondary CTAs
14. MICRO-INTERACTIONS — hover effects, scroll animations, loading states, feedback on user actions`,
    keys: AUDIT_JSON_KEYS,
  },
  "local-seo": {
    system: "You are a local SEO specialist with deep expertise in Google Business Profile optimization, local pack rankings, and geo-targeted search strategies.",
    task: `Audit the website for ALL local SEO factors:
1. NAP CONSISTENCY — Name, Address, Phone visible on every page (header/footer), consistent formatting, clickable phone, matching GMB listing
2. LOCAL KEYWORDS — city/neighborhood in title tags, H1s, content body, URL slugs, image alt text, meta descriptions
3. GEO-TARGETING — service area mentions, city-specific landing pages, county/region references, driving directions
4. SERVICE AREA PAGES — dedicated pages per location/city, unique content per page (not template duplicates), local testimonials on location pages
5. LOCAL SCHEMA — LocalBusiness schema type, opening hours, geo coordinates, areaServed, priceRange, paymentAccepted, hasMap
6. GOOGLE MAPS — embedded map presence, correct pin location, directions link, map on contact page
7. CITY/NEIGHBORHOOD MENTIONS — natural local content, community involvement mentions, local event references, local partnerships
8. LOCATION-SPECIFIC META — unique title/description per location page, local modifiers in meta tags
9. PROXIMITY SIGNALS — address in structured data, multiple location handling, service radius indicators
10. LOCAL LINK SIGNALS — links to local resources, chamber of commerce mentions, local charity/sponsorship references
11. REVIEWS ON SITE — Google review widget, testimonials with city names, review schema markup, review response display
12. LOCAL CONTENT STRATEGY — neighborhood guides, local event posts, community involvement blog posts, local case studies
13. CLICK-TO-CALL — mobile click-to-call, phone number format, tracking number usage
14. SOCIAL LOCAL SIGNALS — Facebook local page link, Instagram location tags, Nextdoor presence indicators`,
    keys: AUDIT_JSON_KEYS,
  },
  reputation: {
    system: "You are a reputation management specialist with expertise in trust psychology, social proof strategy, and online brand perception for local businesses.",
    task: `Analyze ALL reputation and trust signals visible on the website:
1. REVIEW/TESTIMONIAL DISPLAY — customer quotes, star ratings shown, review count, review recency, photo testimonials, video testimonials
2. REVIEW SCHEMA — AggregateRating markup, individual Review schema, proper rating values
3. REVIEW SOURCING — Google reviews embedded, Yelp badge, Facebook reviews, industry-specific review platforms
4. TRUST BADGES — BBB accreditation, industry certifications, awards, professional associations, insurance/bonding
5. SOCIAL PROOF — client logos, project count ("500+ projects completed"), years in business, team size
6. CASE STUDIES — before/after evidence, measurable results, client success stories, project portfolios
7. TEAM/ABOUT — owner photo and bio, team member pages, credentials listed, experience highlighted, personal story
8. TRANSPARENCY — pricing visibility, process explanation, guarantee/warranty, refund policy, service agreements
9. PRIVACY & LEGAL — privacy policy, terms of service, ADA compliance statement, licensing info
10. AUTHORITY SIGNALS — media mentions, publications, speaking engagements, partnerships, community leadership
11. RESPONSE PATTERNS — how reviews are displayed, negative review handling hints, complaint resolution evidence
12. CONTACT TRUST — multiple contact methods, physical address visible, office photos, business hours, live chat
13. SOCIAL MEDIA PROOF — active social links, follower counts, social feed embeds, UGC display
14. GUARANTEE/WARRANTY — service guarantees, satisfaction promises, money-back offers, free estimates/consultations`,
    keys: AUDIT_JSON_KEYS,
  },
  "customer-conversion": {
    system: "You are a conversion rate optimization specialist who evaluates websites by simulating the journey of a real potential customer. Think like a first-time visitor who found this site on Google and needs to decide whether to contact this business.",
    task: `Evaluate the website from a potential customer's viewpoint across ALL these areas:
1. FIRST IMPRESSION (0-3 seconds) — does the visitor instantly understand what the business does, who it serves, and why they should care?
2. VALUE PROPOSITION — is the unique selling point clear? How is this business different from competitors? Is it above the fold?
3. CTA PLACEMENT & URGENCY — how easy is it to take the next step? Are CTAs visible, compelling, and specific ("Get Free Quote" vs generic "Submit")?
4. FORM FRICTION — number of form fields, required vs optional, multi-step forms, progress bars, instant validation, mobile keyboard types
5. TRUST ABOVE THE FOLD — ratings, review count, years in business, certifications visible without scrolling
6. PRICING TRANSPARENCY — are prices/ranges shown? Free estimates mentioned? Hidden cost anxiety addressed?
7. CONTACT ACCESSIBILITY — phone clickable? Email visible? Live chat? Contact page easy to find? Response time mentioned?
8. MOBILE EXPERIENCE — can a phone user easily call, fill forms, navigate, and convert? Thumb-friendly targets?
9. FAQ SECTION — are common customer questions answered? Objections pre-handled? Concerns addressed?
10. OBJECTION HANDLING — does the page address "too expensive", "why not DIY", "are you reliable", "what if I'm not happy"?
11. SOCIAL PROOF PLACEMENT — testimonials near CTAs? Review count near pricing? Trust badges near forms?
12. BUYER JOURNEY FLOW — is there a clear path from landing → understanding → trust → action? Any dead ends?
13. URGENCY/SCARCITY — limited time offers, seasonal messaging, availability indicators, booking urgency
14. FOLLOW-UP SIGNALS — email capture, newsletter, lead magnet, retargeting pixel hints, chat follow-up
15. COMPARISON READINESS — vs competitor pages, service tiers, feature comparison tables, "why choose us"
16. PAGE SPEED PERCEPTION — does the page feel fast? Do images load quickly? Is there layout shift?`,
    keys: AUDIT_JSON_KEYS,
  },
  accessibility: {
    system: "You are a web accessibility specialist and WCAG 2.1 AA compliance auditor. Be specific about violations and reference WCAG success criteria numbers where applicable.",
    task: `Review the website for ALL accessibility concerns:
1. HEADING HIERARCHY — single H1, logical H2-H6 nesting, no skipped levels, descriptive heading text
2. IMAGE ALT TEXT — all images have alt attributes, alt text is descriptive (not "image1.jpg"), decorative images use alt=""
3. COLOR CONTRAST — text-to-background ratio meets 4.5:1 (normal text) and 3:1 (large text), links distinguishable from text
4. KEYBOARD NAVIGATION — all interactive elements focusable, logical tab order, no keyboard traps, skip-to-content link
5. ARIA LANDMARKS — main, nav, banner, contentinfo roles present, complementary for sidebars, proper aria-labels
6. FORM ACCESSIBILITY — labels associated with inputs, error messages descriptive, required fields indicated, fieldset/legend for groups
7. SKIP NAVIGATION — skip-to-main-content link present and functional, visible on focus
8. LINK DESCRIPTIVENESS — no "click here" or "read more" without context, links describe destination, distinguishable from surrounding text
9. TEXT RESIZING — content readable at 200% zoom, no horizontal scrolling at 320px width, relative units used
10. FOCUS INDICATORS — visible focus outline on all interactive elements, custom focus styles maintain visibility, focus not suppressed
11. MEDIA ACCESSIBILITY — video captions/subtitles, audio transcripts, auto-play disabled or controllable, media player keyboard accessible
12. SEMANTIC HTML — proper use of nav, article, section, aside, button vs link distinction, lists for list content, tables for data
13. LANGUAGE — html lang attribute set, language changes marked, reading direction correct
14. TOUCH TARGETS — minimum 44x44px touch targets on mobile, adequate spacing between clickable elements
15. MOTION/ANIMATION — prefers-reduced-motion respected, no flashing content >3 per second, parallax alternatives
16. ERROR HANDLING — form validation accessible, error messages linked to fields, success/failure announced to screen readers`,
    keys: AUDIT_JSON_KEYS,
  },
  "competitor-organic": {
    system: "You are a competitive SEO analyst with expertise in organic search strategy, content gap analysis, and SERP competitiveness evaluation.",
    task: `Compare the two websites for organic search competitiveness across ALL these dimensions:
1. CONTENT DEPTH — word count comparison, topic coverage breadth, service page detail level, FAQ completeness
2. KEYWORD TARGETING — primary keyword optimization, long-tail coverage, semantic keyword usage, keyword cannibalization
3. TITLE/HEADING OPTIMIZATION — title tag quality, H1 keyword placement, heading hierarchy, meta description CTR appeal
4. INTERNAL LINKING — link structure depth, contextual linking, hub-and-spoke content architecture, orphaned pages
5. BLOG/RESOURCE SECTION — post frequency, topic relevance, content quality, engagement signals, evergreen vs timely
6. SCHEMA MARKUP — types implemented, completeness, rich snippet eligibility, FAQ schema, HowTo schema
7. PAGE SPEED SIGNALS — resource loading, image optimization, code efficiency, mobile performance
8. BACKLINK-ATTRACTING CONTENT — linkable assets (tools, data, guides), original research, infographics, free resources
9. TOPICAL AUTHORITY — content depth in core topics, expertise signals, content clustering, pillar page strategy
10. SITE ARCHITECTURE — URL structure, crawl depth, category organization, breadcrumbs, XML sitemap signals
11. E-E-A-T COMPARISON — author credentials, about page depth, trust signals, industry authority markers
12. CONTENT FRESHNESS — last updated dates, recent publications, outdated content ratio
Identify specific gaps where the target can outperform the competitor and specific advantages to protect.`,
    keys: AUDIT_JSON_KEYS,
  },
  "competitor-mappack": {
    system: "You are a local SEO specialist focused on Google Map Pack rankings, comparing two businesses for local search dominance.",
    task: `Compare the two websites for local/map pack ranking factors across ALL dimensions:
1. LOCAL KEYWORD OPTIMIZATION — city keywords in titles, headings, content, URLs, image alt text
2. NAP VISIBILITY — Name/Address/Phone consistency, prominence, formatting, structured data
3. SERVICE AREA COVERAGE — dedicated location pages, city-specific content, service area radius indicators
4. LOCAL SCHEMA — LocalBusiness type and completeness, geo coordinates, opening hours, areaServed
5. GOOGLE MAPS INTEGRATION — embedded map, correct location, directions link, map prominence
6. REVIEW DISPLAY — review count, rating, review recency, review schema, platform diversity
7. LOCATION PAGES — unique content per location, local testimonials, area-specific services, local images
8. LOCAL CONTENT — community involvement, local events, neighborhood guides, local case studies
9. PROXIMITY SIGNALS — address visibility, multiple locations handling, service radius
10. LOCAL AUTHORITY — local backlink indicators, chamber of commerce, local sponsorships, community partnerships
11. CLICK-TO-CALL — mobile call button, phone format, tracking number, call CTA prominence
12. LOCAL TRUST — BBB badge, local certifications, local team bios, years serving the community
Identify specific local ranking advantages and gaps. Recommend where the target business can realistically outperform.`,
    keys: AUDIT_JSON_KEYS,
  },
};

async function fetchPageContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SMBifyLeadOS-Audit/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const html = await response.text();
    // Strip scripts/styles, keep text + structure
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 18_000);
  } finally {
    clearTimeout(timeout);
  }
}

aiRouter.post("/generate/specialist-audit", async (req, res) => {
  try {
    const website = cleanText(req.body?.website);
    const auditType = cleanText(req.body?.auditType) as SpecialistAuditType;
    const competitorUrl = cleanText(req.body?.competitorUrl);
    const businessName = cleanText(req.body?.businessName);
    const providerKey = cleanText(req.body?.providerKey);

    if (!website) {
      res.status(400).json({ error: "website URL is required" });
      return;
    }

    const config = specialistPrompts[auditType];
    if (!config) {
      res.status(400).json({ error: `Unknown audit type: ${auditType}` });
      return;
    }

    const isCompetitor = auditType === "competitor-organic" || auditType === "competitor-mappack";
    if (isCompetitor && !competitorUrl) {
      res.status(400).json({ error: "competitorUrl is required for competitor audits" });
      return;
    }

    // Fetch page content
    let pageContent: string;
    try {
      pageContent = await fetchPageContent(website);
    } catch (fetchErr) {
      res.status(400).json({ error: `Could not fetch website: ${fetchErr instanceof Error ? fetchErr.message : "unknown error"}` });
      return;
    }

    let competitorContent = "";
    if (isCompetitor && competitorUrl) {
      try {
        competitorContent = await fetchPageContent(competitorUrl);
      } catch {
        competitorContent = "(Could not fetch competitor page)";
      }
    }

    const prompt = [
      config.task,
      "",
      `Return strict JSON with these keys: ${config.keys}`,
      "",
      `Business: ${businessName || "Unknown"}`,
      `Website: ${website}`,
      "",
      "=== WEBSITE CONTENT ===",
      pageContent,
      ...(isCompetitor
        ? [
            "",
            `Competitor URL: ${competitorUrl}`,
            "=== COMPETITOR CONTENT ===",
            competitorContent,
          ]
        : []),
    ].join("\n");

    const generated = await generateAiText({
      task: "audit",
      preferredProviderKey: providerKey,
      systemPrompt: config.system,
      prompt,
      temperature: 0.4,
      maxTokens: 3500,
    });

    const parsed = parseJsonObject<{
      headline: string;
      executiveSummary: string;
      overallScore: number;
      verdict: string;
      findings: Array<{ title: string; severity: string; detail: string }>;
      wins: string[];
      recommendations: string[];
      priorityActions: string[];
    }>(generated.output);

    const result = {
      providerKey: generated.providerKey,
      model: generated.model,
      auditType,
      website,
      businessName,
      competitorUrl: isCompetitor ? competitorUrl : undefined,
      headline: cleanText(parsed.headline) || `${auditType} audit for ${businessName || website}`,
      executiveSummary: cleanText(parsed.executiveSummary) || "Audit completed.",
      overallScore: typeof parsed.overallScore === "number" ? Math.max(0, Math.min(100, parsed.overallScore)) : 50,
      verdict: cleanText(parsed.verdict) || "Needs Work",
      findings: Array.isArray(parsed.findings)
        ? parsed.findings.map((f) => ({
            title: cleanText(f.title),
            severity: (["high", "medium", "low"].includes(cleanText(f.severity)) ? cleanText(f.severity) : "medium") as "high" | "medium" | "low",
            detail: cleanText(f.detail),
          })).filter((f) => f.title)
        : [],
      wins: Array.isArray(parsed.wins) ? parsed.wins.map((w) => cleanText(w)).filter(Boolean) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map((r) => cleanText(r)).filter(Boolean) : [],
      priorityActions: Array.isArray(parsed.priorityActions) ? parsed.priorityActions.map((a) => cleanText(a)).filter(Boolean) : [],
      generatedAt: new Date().toISOString(),
    };

    // Store in audits table
    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO audits (id, audit_type, lead_id, business_id, client_id, target_name, score, verdict, summary, issue_count, win_count, data_json, ai_insights_json, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(
      id,
      `ai-${auditType}`,
      businessName || website,
      result.overallScore,
      result.verdict,
      result.executiveSummary,
      result.findings.length,
      result.wins.length,
      JSON.stringify(result),
      result.generatedAt,
      result.generatedAt,
    );

    res.json({ id, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run specialist audit";
    res.status(400).json({ error: message });
  }
});