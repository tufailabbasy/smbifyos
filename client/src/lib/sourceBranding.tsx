/**
 * Centralized source & AI-provider branding with real brand logos.
 * Real brands load actual logos via img; internal tools use inline SVGs.
 */

/* ── Source (scraper) branding ── */

export interface SourceBrand {
  label: string;
  bg: string;
  fg: string;
  icon: JSX.Element;
}

/**
 * Load a real brand logo via img with a colored initial-letter fallback
 * shown when offline or if the image fails to load.
 */
function brandLogo(url: string, fallback: string, bg: string): JSX.Element {
  return (
    <span className={`relative flex h-full w-full items-center justify-center overflow-hidden ${bg}`}>
      <span className="absolute text-[8px] font-bold text-white select-none">{fallback}</span>
      <img
        src={url}
        alt={fallback}
        className="relative z-10 h-full w-full object-contain"
        referrerPolicy="no-referrer"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}

/* ── Real brand logos (loaded from each site's favicon) ── */

const F = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

const ypLogo      = brandLogo(F("yellowpages.com"),  "YP",  "bg-amber-500");
const gmapsLogo   = brandLogo(F("google.com"),       "G",   "bg-white");
const yelpLogo    = brandLogo(F("yelp.com"),         "Y",   "bg-red-600");
const bbbLogo     = brandLogo(F("bbb.org"),          "BBB", "bg-sky-700");
const gAdsLogo    = brandLogo(F("google.com"),       "GA",  "bg-white");
const metaLogo    = brandLogo(F("meta.com"),         "M",   "bg-blue-600");
const bingLogo    = brandLogo(F("bing.com"),         "B",   "bg-teal-600");

/* ── Internal tool SVG icons (no external brand) ── */

const stateLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#0284C7"/>
    <path d="M10 3l-6 3v1h12V6l-6-3zM5 8v6h2V8H5zm4 0v6h2V8H9zm4 0v6h2V8h-2zM4 15v2h12v-2H4z" fill="#fff"/>
  </svg>
);

const webLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#7C3AED"/>
    <circle cx="10" cy="10" r="6" stroke="#fff" strokeWidth="1.5" fill="none"/>
    <ellipse cx="10" cy="10" rx="3" ry="6" stroke="#fff" strokeWidth="1.2" fill="none"/>
    <line x1="4" y1="10" x2="16" y2="10" stroke="#fff" strokeWidth="1.2"/>
  </svg>
);

const chamberLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#0D9488"/>
    <path d="M10 3l-6 3h12l-6-3zM5 7v7h2V7H5zm4 0v7h2V7H9zm4 0v7h2V7h-2zM4 15h12v2H4v-2z" fill="#fff"/>
  </svg>
);

const licenseLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#4338CA"/>
    <rect x="5" y="3" width="10" height="14" rx="1.5" fill="none" stroke="#fff" strokeWidth="1.5"/>
    <line x1="7.5" y1="7" x2="12.5" y2="7" stroke="#fff" strokeWidth="1.2"/>
    <line x1="7.5" y1="10" x2="12.5" y2="10" stroke="#fff" strokeWidth="1.2"/>
    <circle cx="10" cy="14" r="1.5" fill="#fff"/>
  </svg>
);

const csvLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#64748B"/>
    <rect x="4" y="4" width="12" height="12" rx="1.5" fill="none" stroke="#fff" strokeWidth="1.3"/>
    <line x1="4" y1="8" x2="16" y2="8" stroke="#fff" strokeWidth="1"/>
    <line x1="4" y1="12" x2="16" y2="12" stroke="#fff" strokeWidth="1"/>
    <line x1="9" y1="4" x2="9" y2="16" stroke="#fff" strokeWidth="1"/>
  </svg>
);

const unknownLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#94A3B8"/>
    <text x="10" y="14" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="10" fill="#fff">?</text>
  </svg>
);

export const sourceBranding: Record<string, SourceBrand> = {
  yellowpages:        { label: "Yellow Pages",         bg: "bg-amber-50",    fg: "text-amber-700",   icon: ypLogo },
  gmb_scraper:        { label: "Google Maps",          bg: "bg-emerald-50",  fg: "text-emerald-700", icon: gmapsLogo },
  state_directory:    { label: "State Directory",      bg: "bg-sky-50",      fg: "text-sky-700",     icon: stateLogo },
  yelp_scraper:       { label: "Yelp",                 bg: "bg-rose-50",     fg: "text-rose-700",    icon: yelpLogo },
  bbb_scraper:        { label: "BBB.org",              bg: "bg-cyan-50",     fg: "text-cyan-700",    icon: bbbLogo },
  website_enrichment: { label: "Website Enrichment",   bg: "bg-violet-50",   fg: "text-violet-700",  icon: webLogo },
  chamber_directory:  { label: "Chamber Directory",    bg: "bg-teal-50",     fg: "text-teal-700",    icon: chamberLogo },
  license_registry:   { label: "License Registry",     bg: "bg-indigo-50",   fg: "text-indigo-700",  icon: licenseLogo },
  ads_google:         { label: "Google Ads",           bg: "bg-green-50",    fg: "text-green-700",   icon: gAdsLogo },
  ads_meta:           { label: "Meta Ads",             bg: "bg-blue-50",     fg: "text-blue-700",    icon: metaLogo },
  ads_bing:           { label: "Bing Ads",             bg: "bg-teal-50",     fg: "text-teal-700",    icon: bingLogo },
  csv_manual:         { label: "CSV Import",           bg: "bg-slate-50",    fg: "text-slate-600",   icon: csvLogo },
};

const defaultSourceBrand: SourceBrand = {
  label: "",
  bg: "bg-slate-100",
  fg: "text-slate-500",
  icon: unknownLogo,
};

export function getSourceBrand(source: string): SourceBrand {
  const brand = sourceBranding[source];
  if (brand) return brand;
  return { ...defaultSourceBrand, label: source || "Unknown" };
}

/** Render a small pill: brand logo + label */
export function SourceBadge({ source }: { source: string }) {
  const brand = getSourceBrand(source);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-5 w-5 shrink-0 overflow-hidden rounded">
        {brand.icon}
      </span>
      <span className="text-xs font-medium text-slate-700">{brand.label}</span>
    </span>
  );
}

/* ── AI Provider branding ── */

export interface AiProviderBrand {
  bg: string;
  fg: string;
  icon: JSX.Element;
}

/* Real AI provider logos */
const openaiLogo    = brandLogo(F("openai.com"),    "OA", "bg-[#10A37F]");
const anthropicLogo = brandLogo(F("anthropic.com"), "A",  "bg-[#D97706]");
const geminiLogo    = brandLogo(F("gemini.google.com"), "G", "bg-[#4285F4]");
const openrouterLogo = brandLogo(F("openrouter.ai"), "OR", "bg-[#6366F1]");
const groqLogo      = brandLogo(F("groq.com"),     "GQ", "bg-[#F55036]");
const deepseekLogo  = brandLogo(F("deepseek.com"), "DS", "bg-[#0891B2]");
const togetherLogo  = brandLogo(F("together.ai"),  "T",  "bg-[#7C3AED]");
const mistralLogo   = brandLogo(F("mistral.ai"),   "M",  "bg-[#FF7000]");
const xaiLogo       = brandLogo(F("x.ai"),         "X",  "bg-[#0F172A]");

/* Internal / custom — SVG icon */
const customLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#2563EB"/>
    <circle cx="10" cy="10" r="2.5" fill="none" stroke="#fff" strokeWidth="1.5"/>
    <path d="M10 4v1.5M10 14.5V16M4 10h1.5M14.5 10H16M5.76 5.76l1.06 1.06M13.18 13.18l1.06 1.06M14.24 5.76l-1.06 1.06M6.82 13.18l-1.06 1.06" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const defaultAiLogo: JSX.Element = (
  <svg className="h-full w-full" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="4" fill="#64748B"/>
    <text x="10" y="13.5" textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="8" fill="#fff">AI</text>
  </svg>
);

export const aiProviderBranding: Record<string, AiProviderBrand> = {
  openai:       { bg: "bg-emerald-50", fg: "text-emerald-700", icon: openaiLogo },
  anthropic:    { bg: "bg-amber-50",   fg: "text-amber-700",   icon: anthropicLogo },
  gemini:       { bg: "bg-blue-50",    fg: "text-blue-700",    icon: geminiLogo },
  openrouter:   { bg: "bg-indigo-50",  fg: "text-indigo-700",  icon: openrouterLogo },
  groq:         { bg: "bg-fuchsia-50", fg: "text-fuchsia-700", icon: groqLogo },
  deepseek:     { bg: "bg-cyan-50",    fg: "text-cyan-700",    icon: deepseekLogo },
  together:     { bg: "bg-violet-50",  fg: "text-violet-700",  icon: togetherLogo },
  mistral:      { bg: "bg-rose-50",    fg: "text-rose-700",    icon: mistralLogo },
  xai:          { bg: "bg-slate-100",  fg: "text-slate-700",   icon: xaiLogo },
  custom_openai:{ bg: "bg-blue-50",    fg: "text-blue-700",    icon: customLogo },
};

const defaultAiProviderBrand: AiProviderBrand = { bg: "bg-slate-100", fg: "text-slate-600", icon: defaultAiLogo };

export function getAiProviderBrand(key: string): AiProviderBrand {
  return aiProviderBranding[key] || defaultAiProviderBrand;
}

/** Render a brand logo for an AI provider */
export function AiProviderIcon({ providerKey, size = "sm" }: { providerKey: string; size?: "sm" | "md" }) {
  const brand = getAiProviderBrand(providerKey);
  const cls = size === "md" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span className={`inline-flex ${cls} shrink-0 overflow-hidden rounded`}>
      {brand.icon}
    </span>
  );
}
