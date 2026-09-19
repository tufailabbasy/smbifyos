# Scraper Roadmap

This roadmap is focused on expanding Lead Engine with higher-quality sources and enrichment layers instead of only increasing raw row count.

## Priority Order

### 1. Website Enrichment Scraper

- Type: enrichment, not a raw-source scraper
- Input: existing staged leads or dashboard leads with website domains
- Output:
  - contact page URL
  - email / form URL
  - services list
  - served cities / service areas
  - social links
  - lightweight SEO signals such as weak titles, missing H1, no schema, or no clear local landing pages
- Why first:
  - upgrades all current lead sources at once
  - improves outreach personalization
  - improves audit/report quality
  - helps score which leads are truly sales-ready
- Delivery note:
  - this should also support a bulk "Enrich selected leads" workflow from Lead Engine

### 2. Chamber / City Directory Scraper

- Type: raw-source scraper
- Input: city, niche, or supported local directory URL
- Output:
  - business name
  - phone
  - website
  - address
  - city/state
  - category/niche
- Why second:
  - strong local SMB relevance
  - directory structures are usually more stable than major consumer platforms
  - lower anti-bot pressure than some large public directories
- Risk:
  - likely needs per-directory adapters instead of one universal parser

### 3. State License / Contractor Registry Scraper

- Type: raw-source scraper
- Input: state + trade/niche
- Best fit verticals:
  - home services
  - contractors
  - licensed professionals
- Why third:
  - strong commercial intent
  - businesses are usually real operators, not junk listings
  - useful when prospecting local trades that already spend on operations
- Risk:
  - every state registry can have a different structure

### 4. Multi-Network Ad Intelligence Layer

- Type: premium lead-intelligence layer, not a single scraper
- Goal:
  - aggregate advertiser discovery across multiple paid-ad ecosystems into one normalized lead stream
- Core idea:
  - local businesses already paying for traffic are high-value SEO prospects because they understand customer acquisition cost and usually have budget
- Connector model:
  - every ad network should be implemented as its own connector, then normalized into one shared schema
- Recommended normalized output:
  - advertiser name
  - landing page domain
  - ad network/source
  - ad activity status or recency signal
  - city/niche tagging
  - notes about whether the advertiser appears local, franchise, agency-managed, or nationwide
  - confidence score for how likely the record maps to a real local business
- Product note:
  - these leads should get a visible "Active Advertiser" badge and score boost inside Lead Engine

### 5. Ad-Network Connector Rollout

- Recommended connector order:
  - Google Ads Transparency
  - Meta Ad Library / Facebook ads discovery
  - Microsoft/Bing advertiser discovery
- Phase one scope ends here; these three are enough for the first paid-intent expansion.
- Practical value notes:
  - Google: highest priority for local service lead intent
  - Meta/Facebook: useful for businesses actively buying local attention, especially visual/home-service niches
  - Microsoft/Bing: useful but likely lower volume than Google
- Delivery note:
  - do not promise one universal scraper for all networks; build source-specific connectors into one ad-intelligence pipeline

## Rollout Logic

Recommended sequence:

1. Build enrichment first so every existing lead source becomes more useful.
2. Add Chamber / city directories for stable local discovery.
3. Add state license registries for high-value verticals.
4. Build the ad-intelligence layer and launch Google Ads Transparency as the first connector.
5. Add Meta and Microsoft/Bing next after validating advertiser normalization and scoring.

## Product Positioning

Lead Engine should not treat every source equally.

- Standard sources: Yellow Pages, Yelp, BBB, state directories
- High-intent sources: Google Maps claim gaps, licensed registries
- Premium sources: active advertisers from ad-transparency networks

That ranking should eventually affect default sorting, badges, and lead scoring.

## Network Feasibility Summary

- Yes, multiple ad sources can be brought together in one system.
- No, they should not be treated as one identical scraper because every network exposes different data, query behavior, and maintenance cost.
- Best architecture:
  - one shared ad-intelligence schema
  - one connector per network
  - one dedupe layer by advertiser/domain/business
  - one scoring layer for paid-intent signals
- Phase one recommendation:
  - stop at Google + Meta/Facebook + Microsoft/Bing until the workflow proves ROI