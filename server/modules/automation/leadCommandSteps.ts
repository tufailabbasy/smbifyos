import * as cheerio from "cheerio";
import { getDb } from "../../db/database.js";
import { decryptCredential } from "../../utils/encryption.js";
import { safeFetch } from "../../utils/safeFetch.js";
import type { AutomationRun, WorkflowInput } from "./repository.js";

function clean(value: unknown): string { return String(value ?? "").trim(); }
function now(): string { return new Date().toISOString(); }

function findJobId(run: AutomationRun): string {
  try {
    const results = run.result_json ? JSON.parse(run.result_json) as Record<string, { jobId?: string }> : {};
    for (const result of Object.values(results)) if (result?.jobId) return result.jobId;
  } catch {}
  return "";
}

type DiscoveryCredentials = { googlePlacesKey: string; dataForSeoLogin: string; dataForSeoPassword: string };
type DiscoveredBusiness = {
  id: string; name: string; phone: string; website: string; address: string; city: string; state: string;
  zip: string; category: string; gmbUrl: string; rating: number | null; reviews: number; status?: string;
};

function getDiscoveryCredentials(): DiscoveryCredentials {
  const row = getDb().prepare("SELECT google_places_api_key, dataforseo_login, dataforseo_password FROM app_settings LIMIT 1").get() as {
    google_places_api_key?: string | null; dataforseo_login?: string | null; dataforseo_password?: string | null;
  } | undefined;
  return {
    googlePlacesKey: decryptCredential(row?.google_places_api_key || "") || clean(process.env.GOOGLE_PLACES_API_KEY),
    dataForSeoLogin: clean(row?.dataforseo_login) || clean(process.env.DATAFORSEO_LOGIN),
    dataForSeoPassword: decryptCredential(row?.dataforseo_password || "") || clean(process.env.DATAFORSEO_PASSWORD),
  };
}

function addressPart(components: Array<{ longText?: string; shortText?: string; types?: string[] }> | undefined, type: string, short = false): string {
  const part = components?.find((item) => item.types?.includes(type));
  return clean(short ? part?.shortText : part?.longText);
}

function matchesFilters(item: DiscoveredBusiness, input: WorkflowInput): boolean {
  const filters = input.filters || {};
  if (filters.minRating != null && Number(item.rating || 0) < filters.minRating) return false;
  if (filters.maxRating != null && Number(item.rating || 0) > filters.maxRating) return false;
  if (filters.maxReviews != null && item.reviews > filters.maxReviews) return false;
  if (filters.websitePreference === "missing" && item.website) return false;
  return item.status !== "CLOSED_PERMANENTLY";
}

function createDiscoveryJob(input: WorkflowInput, source: string, message: string): { jobId: string; createdAt: string } {
  const jobId = `command-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const createdAt = now();
  getDb().prepare(`INSERT INTO scraper_jobs (
    id, job_label, source, status, input_json, output_file, csv_file, imported_count,
    total_found, progress_percent, progress_message, error_message, created_at, started_at, completed_at
  ) VALUES (?, ?, ?, 'running', ?, NULL, NULL, 0, 0, 5, ?, NULL, ?, ?, NULL)`)
    .run(jobId, `prompt-${Math.random().toString(36).slice(2, 8)}`, source, JSON.stringify(input), message, createdAt, createdAt);
  return { jobId, createdAt };
}

function saveDiscoveredBusinesses(jobId: string, createdAt: string, source: string, providerLabel: string, input: WorkflowInput, businesses: DiscoveredBusiness[]): number {
  const db = getDb();
  const matches = businesses.filter((item) => matchesFilters(item, input)).slice(0, input.maxLeads);
  const insert = db.prepare(`INSERT INTO scraper_staged_leads (
    id, job_id, business_name, phone, email, website, address, city, state, zip, niche,
    gmb_url, gmb_claimed, gmb_rating, gmb_review_count, has_website, source, status,
    notes, is_selected, added_to_dashboard, created_at, added_at, business_dna_json
  ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'pending', ?, 1, 0, ?, NULL, ?)`);
  db.exec("BEGIN");
  try {
    for (const item of matches) {
      const dna = {
        identity: { placeId: item.id, name: item.name, category: item.category || clean(input.niche) },
        contact: { phone: item.phone, website: item.website, address: item.address },
        googleProfile: { url: item.gmbUrl, rating: item.rating, reviews: item.reviews },
        provenance: [{ provider: providerLabel, retrievedAt: createdAt, confidence: "verified" }],
      };
      insert.run(crypto.randomUUID(), jobId, item.name, item.phone, item.website, item.address, item.city || clean(input.city),
        item.state || clean(input.state), item.zip, item.category || clean(input.niche), item.gmbUrl, item.rating,
        item.reviews, item.website ? 1 : 0, source, `${providerLabel} place_id=${item.id}`, createdAt, JSON.stringify(dna));
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  db.prepare("UPDATE scraper_jobs SET status='complete', total_found=?, progress_percent=100, progress_message=?, completed_at=? WHERE id=?")
    .run(matches.length, `Found ${matches.length} matching businesses through ${providerLabel}`, now(), jobId);
  return matches.length;
}

type Place = {
  id?: string; displayName?: { text?: string }; formattedAddress?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
  nationalPhoneNumber?: string; internationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string;
  rating?: number; userRatingCount?: number; primaryTypeDisplayName?: { text?: string }; businessStatus?: string;
};

async function discoverWithGooglePlaces(input: WorkflowInput, apiKey: string): Promise<{ jobId: string; stagedCount: number; provider: string }> {
  const query = [clean(input.query || input.niche), "in", clean(input.city), clean(input.state)].filter(Boolean).join(" ");
  const { jobId, createdAt } = createDiscoveryJob(input, "google_places", `Searching Google Places for ${query}`);
  const collected: Place[] = [];
  let pageToken = "";
  try {
    while (collected.length < input.maxLeads) {
      const body: Record<string, unknown> = { textQuery: query, pageSize: Math.min(20, input.maxLeads - collected.length), languageCode: "en" };
      if (pageToken) body.pageToken = pageToken;
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.businessStatus,nextPageToken" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
      });
      const payload = await response.json() as { places?: Place[]; nextPageToken?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || `Google Places returned HTTP ${response.status}`);
      collected.push(...(payload.places || []));
      pageToken = clean(payload.nextPageToken);
      if (!pageToken || !(payload.places || []).length) break;
    }
    const normalized = collected.map((place): DiscoveredBusiness => ({
      id: clean(place.id), name: clean(place.displayName?.text), phone: clean(place.internationalPhoneNumber || place.nationalPhoneNumber),
      website: clean(place.websiteUri), address: clean(place.formattedAddress),
      city: addressPart(place.addressComponents, "locality") || clean(input.city),
      state: addressPart(place.addressComponents, "administrative_area_level_1", true) || clean(input.state),
      zip: addressPart(place.addressComponents, "postal_code"), category: clean(place.primaryTypeDisplayName?.text) || clean(input.niche),
      gmbUrl: clean(place.googleMapsUri), rating: Number(place.rating || 0) || null, reviews: Number(place.userRatingCount || 0),
      status: clean(place.businessStatus),
    }));
    return { jobId, stagedCount: saveDiscoveredBusinesses(jobId, createdAt, "google_places", "Google Places API", input, normalized), provider: "google_places_api" };
  } catch (error) {
    getDb().prepare("UPDATE scraper_jobs SET status='failed', error_message=?, completed_at=? WHERE id=?").run(error instanceof Error ? error.message : "Google Places failed", now(), jobId);
    throw error;
  }
}

type DataForSeoItem = {
  type?: string; place_id?: string; title?: string; url?: string; domain?: string; phone?: string; address?: string;
  address_info?: { city?: string; region?: string; zip?: string }; category?: string;
  rating?: { value?: number; votes_count?: number };
};

async function discoverWithDataForSeo(input: WorkflowInput, login: string, password: string): Promise<{ jobId: string; stagedCount: number; provider: string }> {
  const keyword = clean(input.query || input.niche);
  const locationName = [clean(input.city), clean(input.state), "United States"].filter(Boolean).join(",");
  const { jobId, createdAt } = createDiscoveryJob(input, "dataforseo", `Searching DataForSEO Google Maps for ${keyword} in ${locationName}`);
  try {
    const response = await fetch("https://api.dataforseo.com/v3/serp/google/maps/live/advanced", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ keyword, location_name: locationName, language_code: "en", depth: Math.min(100, Math.max(10, input.maxLeads)) }]),
      signal: AbortSignal.timeout(45000),
    });
    const payload = await response.json() as { status_code?: number; status_message?: string; tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<{ items?: DataForSeoItem[] }> }> };
    const task = payload.tasks?.[0];
    if (!response.ok || payload.status_code !== 20000 || task?.status_code !== 20000) {
      throw new Error(task?.status_message || payload.status_message || `DataForSEO returned HTTP ${response.status}`);
    }
    const items = (task.result || []).flatMap((result) => result.items || []).filter((item) => item.type === "maps_search");
    const normalized = items.map((item): DiscoveredBusiness => {
      const website = clean(item.url) || (clean(item.domain) ? `https://${clean(item.domain)}` : "");
      const placeId = clean(item.place_id);
      return {
        id: placeId, name: clean(item.title), phone: clean(item.phone), website, address: clean(item.address),
        city: clean(item.address_info?.city) || clean(input.city), state: clean(item.address_info?.region) || clean(input.state),
        zip: clean(item.address_info?.zip), category: clean(item.category) || clean(input.niche),
        gmbUrl: placeId ? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}` : "",
        rating: Number(item.rating?.value || 0) || null, reviews: Number(item.rating?.votes_count || 0),
      };
    });
    return { jobId, stagedCount: saveDiscoveredBusinesses(jobId, createdAt, "dataforseo", "DataForSEO Google Maps Live", input, normalized), provider: "dataforseo" };
  } catch (error) {
    getDb().prepare("UPDATE scraper_jobs SET status='failed', error_message=?, completed_at=? WHERE id=?").run(error instanceof Error ? error.message : "DataForSEO failed", now(), jobId);
    throw error;
  }
}

export async function runBusinessDiscovery(input: WorkflowInput): Promise<{ jobId: string; stagedCount: number; provider: string }> {
  if (!clean(input.city)) throw new Error("A city is required for business discovery.");
  const credentials = getDiscoveryCredentials();
  if (credentials.googlePlacesKey) return discoverWithGooglePlaces(input, credentials.googlePlacesKey);
  if (credentials.dataForSeoLogin && credentials.dataForSeoPassword) return discoverWithDataForSeo(input, credentials.dataForSeoLogin, credentials.dataForSeoPassword);
  throw new Error("Connect Google Places or DataForSEO in API Setup before launching.");
}

function normalizeUrl(value: string): string {
  const raw = clean(value);
  if (!raw) return "";
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString(); } catch { return ""; }
}

function socialFromLinks(links: string[], host: string): string {
  return links.find((link) => {
    try { const name = new URL(link).hostname.toLowerCase(); return name === host || name.endsWith(`.${host}`); } catch { return false; }
  }) || "";
}

export async function enrichBusinessDna(run: AutomationRun, input: WorkflowInput): Promise<{ enrichedCount: number; emailCount: number; socialCount: number }> {
  const jobId = findJobId(run);
  if (!jobId) throw new Error("Discovery output was not found for Business DNA enrichment.");
  const db = getDb();
  const rows = db.prepare("SELECT * FROM scraper_staged_leads WHERE job_id=? ORDER BY created_at LIMIT ?").all(jobId, input.maxLeads) as Array<Record<string, unknown>>;
  let enrichedCount = 0, emailCount = 0, socialCount = 0;

  for (const row of rows) {
    const website = normalizeUrl(clean(row.website));
    let email = clean(row.email);
    let links: string[] = [];
    let title = "";
    let description = "";
    if (website) {
      try {
        const response = await safeFetch(website, { headers: { "User-Agent": "SMBifyOS/1.0 BusinessAudit" } });
        if (response.ok) {
          const html = (await response.text()).slice(0, 2_000_000);
          const $ = cheerio.load(html);
          title = clean($("title").first().text());
          description = clean($('meta[name="description"]').attr("content"));
          links = $("a[href]").map((_i, element) => {
            try { return new URL(clean($(element).attr("href")), website).toString(); } catch { return ""; }
          }).get().filter(Boolean);
          const emails = Array.from(new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
            .filter((value) => !/example\.|sentry\.|wixpress|domain\.com/i.test(value))));
          if (!email && emails[0]) email = emails[0];
        }
      } catch {}
    }

    const facebook = socialFromLinks(links, "facebook.com");
    const instagram = socialFromLinks(links, "instagram.com");
    const linkedin = socialFromLinks(links, "linkedin.com");
    const twitter = socialFromLinks(links, "x.com") || socialFromLinks(links, "twitter.com");
    const socialLinks = [facebook, instagram, linkedin, twitter].filter(Boolean);
    const currentDna = (() => { try { return JSON.parse(clean(row.business_dna_json) || "{}"); } catch { return {}; } })();
    const dna = {
      ...currentDna,
      websiteEvidence: { title, description, inspectedAt: now() },
      contact: { ...(currentDna.contact || {}), email, phone: clean(row.phone), website, address: clean(row.address) },
      social: { facebook, instagram, linkedin, twitter },
      provenance: [...(Array.isArray(currentDna.provenance) ? currentDna.provenance : []), { provider: "Public business website", url: website, retrievedAt: now(), confidence: website ? "observed" : "unavailable" }],
    };
    db.prepare(`UPDATE scraper_staged_leads SET email=?, facebook_url=?, instagram_url=?, linkedin_url=?, twitter_url=?, business_dna_json=? WHERE id=?`)
      .run(email || null, facebook || null, instagram || null, linkedin || null, twitter || null, JSON.stringify(dna), clean(row.id));
    enrichedCount += 1;
    if (email) emailCount += 1;
    if (socialLinks.length) socialCount += 1;
  }
  return { enrichedCount, emailCount, socialCount };
}

export function scoreOpportunities(run: AutomationRun, input: WorkflowInput): { scoredCount: number; highOpportunityCount: number } {
  const jobId = findJobId(run);
  if (!jobId) throw new Error("Discovery output was not found for opportunity scoring.");
  const db = getDb();
  const rows = db.prepare("SELECT * FROM scraper_staged_leads WHERE job_id=? LIMIT ?").all(jobId, input.maxLeads) as Array<Record<string, unknown>>;
  let highOpportunityCount = 0;
  const update = db.prepare("UPDATE scraper_staged_leads SET opportunity_score=?, audit_readiness=?, audit_readiness_reason=? WHERE id=?");
  for (const row of rows) {
    let score = 20;
    const reasons: string[] = [];
    const websiteScore = Number(row.website_audit_score || 0);
    const gmbScore = Number(row.gmb_audit_score || 0);
    const reviews = Number(row.gmb_review_count || 0);
    if (!clean(row.website)) { score += 28; reasons.push("No website"); }
    else if (websiteScore > 0 && websiteScore < 60) { score += 24; reasons.push(`Website audit ${websiteScore}/100`); }
    else if (websiteScore > 0 && websiteScore < 75) { score += 14; reasons.push(`Website audit ${websiteScore}/100`); }
    if (gmbScore > 0 && gmbScore < 65) { score += 20; reasons.push(`GBP audit ${gmbScore}/100`); }
    if (reviews < 25) { score += 12; reasons.push("Low review volume"); }
    else if (reviews < 100) { score += 7; reasons.push("Review growth opportunity"); }
    if (clean(row.email)) score += 8;
    if (clean(row.phone)) score += 5;
    score = Math.max(0, Math.min(100, score));
    if (score >= 70) highOpportunityCount += 1;
    update.run(score, clean(row.email) ? "ready" : "needs_contact", reasons.join("; ") || "Profile is complete; review evidence manually", clean(row.id));
  }
  return { scoredCount: rows.length, highOpportunityCount };
}
