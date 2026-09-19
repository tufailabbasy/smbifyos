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

const STATES: Record<string, string> = {
  alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",delaware:"DE",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",massachusetts:"MA",michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV","new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA","rhode island":"RI","south carolina":"SC","south dakota":"SD",tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",virginia:"VA",washington:"WA","west virginia":"WV",wisconsin:"WI",wyoming:"WY"
};

function clean(value: unknown): string { return String(value ?? "").trim(); }
function titleCase(value: string): string { return value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function parseNumber(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1] && Number.isFinite(Number(match[1]))) return Number(match[1]);
  }
  return undefined;
}

export function parseLeadCommand(rawPrompt: unknown): LeadCommandPlan {
  const prompt = clean(rawPrompt).replace(/\s+/g, " ");
  if (prompt.length < 12) throw new Error("Describe the business type, location, and desired lead count.");
  if (prompt.length > 2000) throw new Error("Keep the instruction under 2,000 characters.");

  const lower = prompt.toLowerCase();
  const maxLeads = Math.max(1, Math.min(200, Math.round(parseNumber(lower, [
    /(?:find|get|collect|build|need|want)\s+(\d{1,3})\b/i,
    /\b(\d{1,3})\s+(?:leads|businesses|companies|prospects|listings)\b/i,
  ]) || 25)));

  const locationMatch = prompt.match(/\b(?:in|near|around|from)\s+([A-Za-z .'-]{2,50}?)(?:,\s*([A-Z]{2}|[A-Za-z ]{4,20}))?(?=\s+(?:with|that|who|having|and|under|below|rated|for)\b|[.;]|$)/i);
  let city = clean(locationMatch?.[1]);
  let state = clean(locationMatch?.[2]).toUpperCase();
  if (!state && city.includes(",")) {
    const parts = city.split(",");
    city = clean(parts[0]);
    state = clean(parts[1]).toUpperCase();
  }
  if (state.length > 2) state = STATES[state.toLowerCase()] || state;

  const nicheMatch = prompt.match(/(?:find|get|collect|build|need|want)\s+(?:\d{1,3}\s+)?(.+?)(?:\s+(?:businesses|companies|contractors|services|providers|firms|agencies|practices|clinics|shops))?\s+(?:in|near|around|from)\b/i);
  let niche = clean(nicheMatch?.[1] || "local service businesses")
    .replace(/^(?:me\s+)?/i, "")
    .replace(/\b(?:local|qualified)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!niche || /^business(es)?$/i.test(niche)) niche = "local service businesses";

  const range = lower.match(/(?:rating|rated)\s*(?:between|from)?\s*(\d(?:\.\d)?)\s*(?:-|to|and)\s*(\d(?:\.\d)?)/i);
  const maxReviews = parseNumber(lower, [/(?:under|below|fewer than|less than|max(?:imum)?\s*)\s*(\d{1,5})\s+reviews?/i]);
  const minRating = range ? Number(range[1]) : parseNumber(lower, [/(?:rating|rated)\s*(?:above|over|at least|min(?:imum)?)\s*(\d(?:\.\d)?)/i]);
  const maxRating = range ? Number(range[2]) : parseNumber(lower, [/(?:rating|rated)\s*(?:under|below|at most|max(?:imum)?)\s*(\d(?:\.\d)?)/i]);
  const websitePreference = /(?:no|without|missing)\s+(?:a\s+)?website/i.test(lower)
    ? "missing" as const
    : /(?:weak|old|outdated|poor|bad)\s+(?:website|site)/i.test(lower) ? "weak" as const : "any" as const;

  const channels = ["email"];
  if (/whatsapp/i.test(lower)) channels.push("whatsapp");
  if (/\bsms\b|text message/i.test(lower)) channels.push("sms");
  if (/facebook|instagram|social/i.test(lower)) channels.push("social");
  if (/\bcall|calling|phone\b/i.test(lower)) channels.push("voice");

  const assumptions: string[] = [];
  if (!city) assumptions.push("Location was not clear; add a city before launch.");
  if (niche === "local service businesses") assumptions.push("Business category was not clear; a broad local-service search is planned.");
  assumptions.push("Outreach will be prepared as a draft and requires approval before sending.");

  return {
    prompt, niche: titleCase(niche), query: niche, city: titleCase(city), state, maxLeads,
    source: "best_available",
    filters: { minRating, maxRating, maxReviews, websitePreference },
    channels: Array.from(new Set(channels)),
    approvalRequired: true,
    steps: [
      { type:"scrape_google_places", label:"Discover businesses with the connected data API", config:{} },
      { type:"enrich_business_dna", label:"Build verified Business DNA", config:{} },
      { type:"audit_website", label:"Audit website SEO and conversion", config:{} },
      { type:"audit_gmb", label:"Audit Google Business Profile", config:{} },
      { type:"score_opportunities", label:"Rank outreach opportunities", config:{} },
      { type:"create_campaign", label:"Prepare personalized outreach draft", config:{ approvalRequired:true } },
    ],
    assumptions,
  };
}
