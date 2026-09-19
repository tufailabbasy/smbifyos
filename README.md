# SMBify OS (Integration Build)

This workspace is the unified app shell for SMBify OS with Module 1 (Lead Management) implemented first, per prompt requirements.

## What Is Implemented

- Monorepo-style structure with `client`, `server`, `db`, `shared`
- SQLite setup with clean SQL migrations and required base tables
- Sidebar application shell with module routes
- Module 1 backend:
  - Lead CRUD
  - Lead filtering and scoring
  - CSV import
  - Lead notes + activity log
  - Bulk delete
- Real app workspaces instead of shell pages:
  - Dashboard
  - Lead Workspace
  - Lead Engine
  - Outreach Campaigns
  - CRM / Pipeline
  - SEO Dashboard
  - Audit Workspace
  - Settings
- Outreach module (campaign manager):
  - SMTP account management
  - Eligible lead selection (email-ready leads)
  - Campaign draft creation
  - Empty campaign shell creation for add-leads-later workflows
  - Add leads into existing campaigns with duplicate protection
  - Campaign send with SMTP, scheduling, retries, follow-ups, and send status tracking
  - Reusable campaign templates with source-aware defaults
  - Plain text, HTML source, and live preview editing for templates and campaign bodies
- Scraper wrappers via `child_process`:
  - Yellow Pages import job
  - GMB listings import job
  - State directory import job
  - Chamber directory discovery job
  - License registry discovery job
  - Website enrichment batch job
  - Google ads intelligence job
  - Meta ads intelligence job
  - Microsoft/Bing ads intelligence job
- Scraper jobs tracked in DB (`scraper_jobs`) with status and error logs
- Lead Engine bridge:
  - Audit-first staged lead review with website, GMB, and basic audit actions
  - Batch staged-audit runs with outreach-readiness badges and audit filters
  - Create campaign draft directly from selected staged leads
  - Add selected staged leads into an existing campaign
  - Source-based campaign recommendations from staged lead context
  - Multi-network expansion workspace for enrichment, local directory discovery, registry discovery, and advertiser-intelligence discovery
- Deep audit foundation:
  - Same-host website deep crawl with persisted page evidence
  - Saved crawl jobs and page-level audit signals for later review
  - AI multi-lens crawl report covering technical, content, trust, UX, owner, and customer views
- AI provider setup:
  - Single OpenRouter connection with automatic model routing for AI-assisted email, audit, and general workspace tasks
  - AI email drafting
  - AI client-facing audit report generation, including richer multi-lens website and GMB reporting

## Stack

- Frontend: React + Tailwind + Vite
- Backend: Node.js + Express + TypeScript
- Database: SQLite (`node:sqlite`)

## Commands

From SMBify OS root:

- Install backend dependencies: `npm install`
- Install client dependencies: `npm --prefix client install`
- Apply migrations: `npm run migrate`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Run backend only: `npm run dev:server`
- Run backend + frontend: `npm run dev`

## API Base

- Backend: `http://localhost:5050`
- Frontend (dev): `http://localhost:5173`

## Integration Notes

- Scraper wrappers now prefer internal legacy modules for single-folder deployment:
  - `legacy-modules/gmb-and-state-scrapper`
- GMB import was validated successfully.
- State directory wrapper runs and completes; some state scrapers may return no rows depending on source file implementation.
- Yellow Pages wrapper is connected; live scraping can fail if Yellow Pages blocks requests.
- Legacy code from older sibling projects was imported under `legacy-modules` for safe cleanup.

## Next

- Add background scheduled dispatch so future-dated campaigns can run without manual send.
- Deepen campaign analytics and template lifecycle controls.
- Expand evidence-backed audit coverage beyond website deep crawl into deeper GMB and competitive review layers.
- Continue Lead Engine source expansion and enrichment coverage.
