# LOCAL SEO AGENCY OS — MASTER AGENT PROMPT
## For AI Coding Agents (Kilo Code, Cursor, Claude, Codex, etc.)

---

## YOUR ROLE

You are a senior full-stack developer building a platform called **LocalRank OS** — a complete operating system for local SEO agencies. Your job is to take existing codebases (scrapers, email sender, audit scripts, etc.) and merge + extend them into a unified, modular web application. You are NOT rebuilding from scratch — you are integrating, restructuring, and upgrading.

This platform is for personal agency use first. It does NOT need to be multi-tenant yet. Focus on making it functional, fast, and reliable.

---

## TECH STACK RULES

- **Frontend**: React + Tailwind CSS (or Next.js if SSR needed)
- **Backend**: Node.js + Express (keep consistent with existing codebases)
- **Database**: SQLite for local/personal use (easy migration to PostgreSQL later)
- **AI Integration**: Anthropic Claude API (`claude-sonnet-4-20250514`) for audit intelligence
- **PDF Generation**: Puppeteer or pdfmake for audit reports
- **Auth**: Simple session-based auth (no OAuth needed at this stage)
- **File Structure**: Monorepo with `/client`, `/server`, `/modules` folders
- **Scraper Integration**: Existing scrapers run as local CLI processes — the platform triggers them via child_process and reads their CSV/JSON output. Do NOT convert scrapers to API-based yet.

---

## EXISTING CODEBASES TO MERGE

You will be given access to these existing repos/scripts. Your job per module:

| Existing Code | What to do |
|---|---|
| GMB Scraper | Wrap as internal module, trigger via backend, read output into Lead DB |
| Yellow Pages Scraper | Same as above, normalize output to same lead schema |
| Bulk Email Sender (SMTP) | Refactor into Campaign Engine module, keep SMTP logic intact |
| Any existing audit scripts | Absorb into Audit Module, run as sub-functions |

**Lead Schema (normalize all scraper output to this):**
```json
{
  "id": "uuid",
  "business_name": "",
  "phone": "",
  "email": "",
  "website": "",
  "address": "",
  "city": "",
  "state": "",
  "zip": "",
  "niche": "",
  "gmb_url": "",
  "gmb_claimed": true,
  "gmb_rating": 4.2,
  "gmb_review_count": 0,
  "has_website": true,
  "lead_score": 0,
  "source": "gmb_scraper | yellowpages",
  "status": "new | contacted | audit_sent | proposal_sent | closed | lost",
  "created_at": "",
  "notes": ""
}
```

---

## MODULE 1: LEAD MANAGEMENT

### Purpose
Central database of all scraped leads. User can view, filter, score, and take action on leads.

### Features to Build

**Lead Table View**
- Columns: Business Name, City, Niche, Rating, Has Website, Lead Score, Status, Actions
- Filters: niche, city, status, score range, has website (yes/no), GMB claimed (yes/no)
- Bulk select + bulk actions (add to campaign, export CSV, delete)
- Click any lead → Lead Detail Page

**Lead Detail Page**
- All lead fields editable
- Activity log (emails sent, audit run, notes added)
- Quick action buttons: Run Audit, Add to Campaign, Send Email, Update Status
- Notes section (timestamped)

**Lead Scoring Logic (auto-calculate on import)**
```
Score starts at 0.
+20 if no website
+15 if GMB rating < 3.5
+10 if review count < 10
+15 if GMB profile incomplete (missing hours, description, photos < 5)
+10 if no citations found (checked during audit)
+10 if phone only (no email found)
Max score = 80. Display as: Hot (60+), Warm (35-59), Cold (<35)
```

**Import Sources**
- Trigger GMB Scraper: input niche + city → runs existing scraper → imports results
- Trigger YP Scraper: same pattern
- Manual CSV import (map columns to lead schema)
- Manual single lead add

---

## MODULE 2: OUTREACH & EMAIL CAMPAIGNS

### Purpose
Send cold email sequences to leads using the existing SMTP bulk email system.

### Features to Build

**SMTP Account Manager**
- Add multiple SMTP accounts (host, port, user, password, from name, daily send limit)
- Status indicator per account (active / paused / error)
- Auto-rotate accounts across campaigns

**Campaign Builder**
- Campaign name, target niche, target city (for tracking)
- Add leads: from lead list filter OR manual select
- Sequence builder:
  - Step 1: Subject, Body, Send on Day X
  - Step 2: Subject, Body, Send on Day Y (only if no reply to Step 1)
  - Up to 5 steps per sequence
- Personalization tokens available: `{{business_name}}`, `{{city}}`, `{{first_name}}`, `{{missing_item}}`, `{{audit_score}}`
- Option to attach: Audit Report PDF (auto-pull if audit exists for that lead)

**Campaign Sending**
- Use existing SMTP sender logic, wrapped here
- Send queue with status per email: pending / sent / opened / replied / bounced
- Per-email logging in activity log of the lead

**Inbox / Reply Tracker**
- Pull replies via IMAP (add IMAP credentials alongside SMTP)
- Show threaded conversation per lead
- Mark as replied, book call, move to proposal stage
- Quick reply from within the platform

---

## MODULE 3: AUDIT TOOLS

### Purpose
Run GMB and website audits on any lead. Produce a scored audit report. Two modes: AI-Assisted Audit and Manual Audit Checklist.

---

### 3A: GMB AUDIT TOOL

**Input**: Business Name + GMB URL (or Place ID if available)

**Data Points to Check** (pull what you can programmatically, rest user fills manually):
```
Profile Completeness:
- Business name present
- Primary category set
- Additional categories added
- Description written (250+ chars)
- Website linked
- Phone number added
- Address complete
- Hours set (including special hours)
- Service areas defined (if service-area business)
- Products / Services section filled

Visual Content:
- Profile photo set
- Cover photo set
- Total photo count (< 10 = bad, 10-30 = ok, 30+ = good)
- Has video posted

Engagement Signals:
- Total review count
- Average rating
- Owner responding to reviews (yes/no, response rate)
- Q&A section has entries
- Google Posts — last post date (< 7 days = good, > 30 days = bad)

Trust Signals:
- GMB listing claimed (yes/no)
- Any suspensions / issues visible
- Booking link added
- Attributes filled
```

**Scoring**: Each item has a weight (1-3 points). Total score out of 100.

**AI Layer (Claude API)**:
```
After collecting all data points above, send to Claude API with this system prompt:

"You are a local SEO expert analyzing a Google Business Profile audit. 
Given the following audit data for [business_name] in [city], [niche]:
[INSERT AUDIT DATA AS JSON]

Provide:
1. Top 3 critical issues hurting their local ranking (specific, not generic)
2. Top 3 quick wins they can implement this week
3. Estimated impact on map pack ranking if issues are fixed (Low/Medium/High)
4. A 3-sentence plain-English summary a business owner would understand
5. A professional verdict: Needs Urgent Work / Needs Improvement / Healthy

Return as JSON only."
```

**Output**: Audit score + AI insights combined into one audit record saved to lead profile.

---

### 3B: WEBSITE AUDIT TOOL

**Input**: Website URL

**Checks to Run** (use free/open methods):
```
Technical:
- SSL certificate valid (fetch headers, check HTTPS)
- Mobile responsive (use Google PageSpeed Insights API — free)
- Page speed score — desktop + mobile (PageSpeed API)
- Robots.txt present
- Sitemap.xml present
- Canonical tag present

On-Page SEO:
- Title tag present + character count (ideal: 50-60 chars)
- Meta description present + character count (ideal: 150-160 chars)
- H1 tag present (only one?)
- NAP (Name, Address, Phone) visible on homepage
- Schema markup present (LocalBusiness schema?)
- Target keyword in title (user enters target keyword)

Trust + Conversion:
- Contact form present
- Phone number clickable (tel: link)
- Google Maps embed present
- Reviews/testimonials section present
- Clear CTA above the fold (AI checks this)
```

**AI Layer (Claude API)**:
```
System prompt:
"You are a local SEO website expert. Review this website audit data for [business_name]:
[INSERT AUDIT DATA AS JSON]
Target keyword: [keyword]

Provide:
1. Top 3 on-page SEO issues
2. Top 3 conversion issues (why visitors might not call)
3. Schema markup recommendation — paste exact LocalBusiness schema JSON-LD they should add
4. Rewritten title tag suggestion (max 60 chars)
5. Rewritten meta description suggestion (max 160 chars)
6. Plain-English summary (3 sentences, for business owner)
7. Verdict: Poor / Needs Work / Good

Return as JSON only."
```

---

### 3C: MANUAL AUDIT CHECKLIST

A checklist-style audit that the user fills in manually during a client call or screen review.

- Pre-built checklists for: GMB Audit, Website Audit, Citation Audit, Competitor Analysis
- Each item is: checkbox + notes field + severity (Critical / Important / Minor)
- User checks items, adds notes per item
- System auto-calculates score based on checked items
- Feeds into the same report generator as AI audit

**Why both modes**: AI audit is fast for prospecting. Manual audit is thorough for paid clients. Both generate the same PDF report format.

---

### 3D: AUDIT REPORT GENERATOR

**Input**: Any completed audit (GMB, Website, or Manual)

**Output**: Branded PDF report with:
```
Page 1 — Cover
- Client business name, city, niche
- Audit date
- Agency logo + name
- Overall score (big number, color-coded)
- Verdict badge

Page 2 — GMB Audit Summary
- Score breakdown by category (profile, visuals, engagement)
- Issues list with severity color coding
- AI-generated insights section

Page 3 — Website Audit Summary
- Score breakdown
- Issues list
- AI title tag + meta description suggestions
- Schema code block (copy-paste ready)

Page 4 — Quick Wins
- Top 5 action items, numbered, plain English
- Estimated time to fix each

Page 5 — Next Steps / CTA
- Agency contact info
- Proposal invitation text
```

PDF styling: Professional, dark header, clean white body, green/red/yellow for score indicators.

---

## MODULE 4: CRM & PIPELINE

### Purpose
Track every lead through the sales process. Never lose a deal.

### Pipeline Stages
```
New Lead → Contacted → Audit Sent → Proposal Sent → Negotiating → Closed Won → Closed Lost → Retained Client
```

### Features to Build

**Kanban Board View**
- Each stage is a column
- Cards show: business name, city, lead score, last activity date
- Drag-and-drop between stages
- Click card → Lead Detail Page

**List View** (toggle)
- Same data as Kanban but as sortable table

**Per-Lead Thread**
- All emails sent/received (from campaign module)
- All audit reports generated
- Notes (timestamped, user-added)
- Status change history
- Tasks (with due dates and done toggle)

**Tasks & Reminders**
- Add task to any lead: text + due date
- Tasks list view (filter: today, overdue, upcoming)
- Simple — no notifications needed at this stage, just a list

**Proposal Builder** (simple version)
- Select services from pre-defined list (GMB Optimization, Citation Building, Monthly SEO, etc.)
- Enter price per service
- Add custom line items
- System generates a simple proposal text (HTML or PDF)
- Copy link or download PDF

---

## MODULE 5: SEO DASHBOARD

### Purpose
Manage active SEO clients. Track progress. Generate monthly reports. Maintain SOPs.

This is the delivery and retention layer — for paying clients after the deal is closed.

---

### 5A: CLIENT WORKSPACE

Each closed-won lead becomes a Client with their own workspace:
- Business info (pulled from lead)
- Target keywords list (user adds, with target city)
- Monthly budget / package type
- Start date, billing cycle
- Assigned team member (even if solo, keep the field)

---

### 5B: RANK TRACKER

**Input**: Client + keyword list + target location

**How to track** (free/cheap method):
- Use SERP API (ValueSERP or SerpApi free tier) OR
- Local scraping of Google results (careful with ToS) OR
- Use DataForSEO at low cost

**What to show**:
- Current rank per keyword (organic + map pack position tracked separately)
- Rank history chart (line graph, weekly data points)
- Movement indicator: ↑ ↓ — with delta number
- Best rank ever achieved per keyword

**Keyword Groups**:
- Primary keywords (main service)
- City variants (plumber Austin, plumber Round Rock, etc.)
- Long-tail (emergency plumber Austin, 24 hour plumber Austin)

---

### 5C: GBP HEALTH MONITOR

Track key GBP signals for each client on a weekly basis:
```
- Current rating (track changes)
- Total review count (track new reviews per week)
- New reviews this week (list them)
- Last Google Post date
- Photo count change
- Any listing edits detected (competitor edits are real — flag them)
- Profile completeness score (re-run weekly)
```

Alert system: Simple in-app badge/flag if anything drops or changes unexpectedly.

---

### 5D: CITATION TRACKER

Manual tracking (no paid API needed):
- Add citation entries: directory name, URL, NAP submitted, status (live / pending / incorrect)
- Completeness bar: X of Y citations live
- NAP consistency flag: if address/phone differs from master NAP, show warning
- Export citation list as CSV (for client reporting)

---

### 5E: MONTHLY REPORT GENERATOR

**Trigger**: User clicks "Generate Monthly Report" for a client

**Report pulls data from**:
- Rank tracker (this month vs last month)
- GBP health monitor (review count growth, rating change)
- Citation tracker (new citations built)
- Task list (work completed this month — user marks tasks as "include in report")
- Manual input fields (backlinks built, content published, etc.)

**AI Summary Layer (Claude API)**:
```
System prompt:
"You are an SEO account manager writing a monthly report summary for a local business client.
Here is this month's performance data:
[INSERT DATA JSON]

Write:
1. Executive summary (3 sentences, positive tone, plain English for business owner)
2. What we did this month (bullet list, professional)
3. What's working (data-backed)
4. What we're improving (honest but solution-focused)
5. Next month's plan (3 bullet points)

Tone: Professional, clear, confident. No jargon. Client is a small business owner."
```

**Output**: Branded PDF with cover, rank table, GBP stats, citation progress, AI narrative, next steps.

---

### 5F: SOP LIBRARY

Pre-loaded SOPs (built-in, read-only templates):
```
- GBP Optimization — Full Setup Checklist (step by step)
- GBP Optimization — Monthly Maintenance Checklist
- Citation Building — Process & Priority Directories
- Review Generation — Email + SMS Template Scripts
- Website On-Page SEO — Checklist per page
- Competitor Analysis — Step by Step
- New Client Onboarding — Checklist
- Monthly Reporting — Process
```

Each SOP:
- Is a structured checklist with explanations per step
- Can be duplicated and customized per client
- Can be assigned to a client workspace
- Tracks completion (checkbox per step, who checked it, when)

User can also create custom SOPs from scratch.

---

## MODULE 6: GOOGLE ACCOUNT INTEGRATION (GMB + SEARCH CONSOLE)

### Purpose
Connect client Google accounts via OAuth so the platform can read real GMB listing data and Search Console performance data directly. This replaces manual data entry and makes audits accurate, rank tracking real, and project management deep — for hundreds of client projects at scale.

---

### 6A: GOOGLE OAUTH SETUP

**How it works:**
- Agency creates ONE Google Cloud Project with the required APIs enabled
- That project handles OAuth for all client connections
- Each client goes through a one-time authorization flow (they click a link, approve, done)
- Platform stores their refresh token — access is permanent until revoked

**Required Google APIs to enable in Google Cloud Console:**
```
- Google My Business API (Business Profile API)
- Google Search Console API
- Google OAuth 2.0
```

**OAuth Scopes needed:**
```
https://www.googleapis.com/auth/business.manage       ← GMB read/write
https://www.googleapis.com/auth/webmasters.readonly   ← Search Console read
```

**Backend implementation:**
```
- Use google-auth-library + googleapis npm packages
- OAuth flow: /auth/google/start → Google consent screen → /auth/google/callback
- On callback: store { access_token, refresh_token, expiry } in DB against client_id
- Token refresh: auto-refresh using refresh_token before every API call
- Never expose tokens to frontend — all Google API calls are server-side only
```

**Agent must implement:**
```javascript
// Token storage schema in SQLite
google_tokens table:
  client_id (FK to clients)
  google_account_email
  access_token (encrypted at rest)
  refresh_token (encrypted at rest)
  token_expiry
  gmb_connected (boolean)
  gsc_connected (boolean)
  connected_at
  last_synced_at
```

**Encryption:** Use `crypto` (Node built-in) with AES-256 to encrypt tokens before DB storage. Decryption key stored in `.env` file only.

---

### 6B: GOOGLE MY BUSINESS (GMB) INTEGRATION

**What we can pull via API once connected:**

**Listing Discovery:**
```
GET /accounts/{accountId}/locations
- Lists all GMB locations under the connected account
- User selects which location belongs to this client project
- Store location_id (e.g., "locations/123456789") against client
```

**Real GMB Audit Data (replaces manual entry):**
```
Profile fields (auto-pulled):
- Business name, address, phone, website, description
- Primary category + additional categories
- Opening hours (regular + special/holiday)
- Service areas (if applicable)
- Attributes list
- Labels

Photo data:
- Total photo count (CUSTOMER + OWNER photos separately)
- Profile photo present (yes/no)
- Cover photo present (yes/no)
- Latest photo upload date

Services & Products:
- Services list with descriptions
- Products list (if any)
```

**Review Monitoring (real-time via API):**
```
GET /accounts/{accountId}/locations/{locationId}/reviews
- Pull all reviews with: rating, text, date, reply status
- Store in DB, compare with previous sync to detect NEW reviews
- Alert flag: new review in last 24 hours
- Track: average rating over time (weekly snapshots)
- Track: total count growth (week over week)
- Response rate calculation: replied / total reviews
```

**Google Posts Tracking:**
```
GET /accounts/{accountId}/locations/{locationId}/localPosts
- Last post date
- Total posts count
- Post types used (OFFER, EVENT, PRODUCT, STANDARD)
- Days since last post (flag if > 14 days)
```

**Q&A Monitoring:**
```
GET /accounts/{accountId}/locations/{locationId}/questions
- Total questions count
- Unanswered questions (flag these — hurts ranking)
- Agency can reply to Q&A directly from platform
```

**GMB Actions from Platform (write access):**
```
- Reply to reviews (POST /reviews/{reviewId}/reply)
- Create new Google Post (POST /localPosts)
- Update business description (PATCH /locations/{locationId})
- Update hours (PATCH /locations/{locationId})
- Add/update services (PATCH /locations/{locationId}/services)
```

**Sync Schedule:**
- Auto-sync all connected GMB accounts: every 24 hours (cron job)
- Manual "Sync Now" button per client
- Log every sync with timestamp and what changed

---

### 6C: GOOGLE SEARCH CONSOLE INTEGRATION

**What we can pull via API:**

**Property Discovery:**
```
GET https://www.googleapis.com/webmasters/v3/sites
- Lists all Search Console properties the client has verified
- User selects which property belongs to this client
- Store property URL against client_id
```

**Search Performance Data:**
```
POST /sites/{siteUrl}/searchAnalytics/query

Pull weekly + monthly:
- Total clicks (organic)
- Total impressions
- Average CTR
- Average position

Broken down by:
- Query (keyword) — top 50 queries by clicks
- Page — top pages
- Device — mobile vs desktop vs tablet
- Date — daily data for trend charts
```

**Keyword Tracking via GSC (replaces or supplements SERP API):**
```
- For each target keyword the user adds to a client project,
  query GSC for that exact keyword's clicks, impressions, position
- Track position history week by week
- Show: current position, position last week, best position ever
- Flag: keywords that dropped more than 5 positions week over week
```

**Index Coverage:**
```
GET /sites/{siteUrl}/urlInspection/index:inspect
- Check if key pages are indexed
- Detect crawl errors (404s, redirect issues)
- Show: indexed pages count, excluded pages, errors
```

**Core Web Vitals (from GSC API):**
```
- Pull CWV data: LCP, FID/INP, CLS scores
- Good / Needs Improvement / Poor breakdown
- Mobile vs Desktop separately
```

**Sync Schedule:**
- GSC data: auto-sync every 7 days (GSC data has 3-4 day delay anyway)
- Manual "Sync Now" per client
- Store raw data in DB for historical trend charts

---

### 6D: CLIENT PROJECT DASHBOARD (upgraded with Google data)

Each client workspace now has tabs:

```
Tab 1 — Overview
- GMB health score (calculated from live API data)
- GSC clicks + impressions this month vs last month
- New reviews this week
- Keyword movements summary (up X, down Y, new in top 10: Z)
- Tasks due + SOP progress
- Last sync timestamp for GMB + GSC

Tab 2 — GMB Management
- Live profile data pulled from API
- Edit fields directly (description, hours, services)
- Post creator (create + schedule Google Posts)
- Reviews inbox (all reviews, reply from here)
- Q&A inbox (all questions, answer from here)
- Photo gallery with upload
- Audit score with real data (no manual entry needed)

Tab 3 — Search Console
- Clicks + impressions chart (last 90 days, weekly)
- Top keywords table with position tracking
- Top pages performance
- Index status (indexed / not indexed per key URL)
- Core Web Vitals status
- Drops alert: keywords or pages that lost significant visibility

Tab 4 — Rank Tracker
- Target keywords list (user-added)
- GSC position for each keyword (pulled automatically)
- Supplemented by SERP API if keyword not in GSC data yet
- Map pack position (SERP API or manual entry)
- History chart per keyword

Tab 5 — Citations
- Same as before (manual tracking)

Tab 6 — Reports
- Generate monthly report (now pulls real GMB + GSC data automatically)

Tab 7 — Tasks & SOPs
- Same as before
```

---

### 6E: MULTI-CLIENT GOOGLE ACCOUNTS MANAGEMENT

Since the agency manages hundreds of projects:

**Connected Accounts page (under Settings):**
```
- Table of all connected Google accounts
- Columns: Client name, Google email, GMB connected (yes/no), GSC connected (yes/no), Last synced, Status
- Reconnect button per client (if token expired or revoked)
- Disconnect button
- Bulk sync all button
```

**Client Onboarding Flow:**
```
Step 1: Create client in CRM (deal closed)
Step 2: System generates a unique OAuth link for that client
Step 3: Agency sends link to client (email template built-in)
Step 4: Client clicks link, logs into their Google account, approves permissions
Step 5: Redirect back to platform, tokens stored, GMB + GSC synced immediately
Step 6: Agency selects which GMB location + GSC property belongs to this client
Step 7: Client workspace activated with live data
```

**Email template for client (built-in):**
```
Subject: Quick step to connect your Google account — [Business Name]

Hi [Name],

To get started with your SEO dashboard, please click the link below and 
approve access to your Google Business Profile and Search Console.

This gives us read access to your data so we can track your progress 
and send you accurate monthly reports.

[CONNECT GOOGLE ACCOUNT — button/link]

This takes less than 60 seconds. Let me know if you need help.

[Agency name]
```

---

## MODULE 7: SETTINGS & CONFIGURATION

```
Agency Profile
- Agency name, logo, contact info (used in reports and emails)

Google API Credentials
- Google Cloud Project Client ID (input field)
- Google Cloud Project Client Secret (input field)
- OAuth redirect URI (auto-filled based on server URL)
- Test connection button
- Status: connected / not configured

SMTP Accounts
- Manage multiple SMTP credentials

AI API Settings
- Anthropic API key input (stored locally, used for audit AI layer)

SERP API Settings
- API key for rank tracking provider (ValueSERP or SerpApi)
- Fallback: if no SERP API key, rank tracking uses GSC data only

Niche Library
- Pre-loaded list of home service niches (user can add more)
- Per niche: default keywords, default GMB categories, default SOP set

Report Branding
- Upload logo, set brand colors (hex), set footer text
- Preview report cover with current settings

Security
- Token encryption key (auto-generated on first setup, stored in .env)
- Show warning if .env is missing or key is default
```

---

## NAVIGATION STRUCTURE

```
Sidebar (always visible):
├── Dashboard (overview: active clients, today's tasks, recent leads)
├── Lead Management
│   ├── All Leads
│   ├── Import Leads
│   └── Lead Scoring Settings
├── Outreach
│   ├── Campaigns
│   ├── Inbox
│   └── SMTP Accounts
├── Audit Tools
│   ├── GMB Audit
│   ├── Website Audit
│   ├── Manual Checklist
│   └── Audit Reports
├── CRM / Pipeline
│   ├── Pipeline Board
│   ├── All Deals
│   └── Tasks
├── Client Projects          ← (renamed from SEO Dashboard, now Google-powered)
│   ├── All Clients
│   ├── [Client Name]
│   │   ├── Overview
│   │   ├── GMB Management
│   │   ├── Search Console
│   │   ├── Rank Tracker
│   │   ├── Citations
│   │   ├── Monthly Reports
│   │   └── Tasks & SOPs
│   └── SOP Library
└── Settings
    ├── Agency Profile
    ├── Google API Setup
    ├── Connected Accounts
    ├── SMTP Accounts
    ├── API Keys
    └── Report Branding
```

---

## DASHBOARD HOME (overview page)

Show at a glance:
- Total leads in system + new this week
- Active campaigns + emails sent today
- Audits run this month
- Pipeline summary: X leads in each stage
- Active clients count + how many have Google connected
- Clients with new reviews today (badge count)
- Clients with keyword drops this week (alert list)
- Tasks due today (list, max 5 shown)
- Recent activity feed (last 10 actions across the platform)

---

## DEVELOPMENT RULES FOR THE AGENT

1. **Do not rebuild what exists** — locate existing scraper and email sender code, import it, wrap it, call it. Do not rewrite scraper logic.

2. **Scrapers run locally via child_process** — the backend spawns the scraper script, waits for it to complete, reads the output file (CSV/JSON), normalizes to Lead Schema, inserts into DB. No scraper should be converted to an HTTP API at this stage.

3. **SQLite DB** — one database file, multiple tables: leads, campaigns, emails_sent, audits, clients, keywords, ranks, citations, tasks, notes, sops, google_tokens, gmb_reviews, gmb_posts, gsc_performance, gsc_keywords. Write migrations cleanly.

4. **AI calls are server-side only** — API key never exposed to frontend. All Claude API calls go through `/api/audit/ai-analyze` or similar backend endpoints.

5. **Google API calls are server-side only** — all OAuth tokens stored encrypted in DB. No token ever sent to frontend. Refresh tokens auto-renewed before each call.

6. **Build module by module** — do not scaffold the entire app first. Build Module 1 (Lead Management) completely functional before starting Module 2. Each module should work independently.

7. **No external SaaS dependencies** where free alternatives exist. No Zapier, no third-party CRM APIs, no paid email verification at this stage.

8. **PDF generation** — use Puppeteer (render HTML template to PDF). Keep one report HTML template per report type, style with inline CSS, inject data, convert to PDF.

9. **Error handling** — every scraper trigger, API call, Google OAuth flow, and PDF generation must have try/catch with clear error messages returned to the frontend. No silent failures. Google API quota errors must be caught and displayed clearly.

10. **Local-first** — this runs on localhost or a private VPS. No need for CDN, multi-region, or scalability concerns right now.

11. **When in doubt about a feature**, implement the simpler version first and leave a `// TODO: upgrade` comment. Do not over-engineer.

12. **Google API quota awareness** — GMB API and GSC API have daily quotas. Build a simple quota tracker: log every API call with timestamp. If approaching limit (>80% of quota), show warning in UI and pause auto-syncs.

---

## STARTING INSTRUCTION FOR AGENT

When you begin:

1. Ask the user to share existing codebase locations (or paste the relevant files)
2. Read and map each existing codebase to its target module
3. Scaffold the monorepo structure: `/client`, `/server`, `/modules`, `/db`
4. Set up SQLite + schema migrations (include all tables listed in Rule 3 above)
5. Build a basic layout shell with sidebar navigation (all links, even if pages are empty)
6. Begin with Module 1: Lead Management — import logic, lead table, lead detail page
7. Confirm completion of each module before moving to next
8. Build Google OAuth setup (Module 6A) during the Settings module — it must be configured before Client Projects module is functional

Do not proceed to the next module until the current one is fully functional and tested with sample data.

---

---

*Platform Name: LocalRank OS*
*Version: 1.1 — Personal Agency Use (Google API Integration included)*
*Prepared for: SMBify Local SEO Agency*
