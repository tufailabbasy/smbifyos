# Remediation status — 18 September 2026

The P0/P1 application fixes from the deep audit have been applied where they can be resolved safely in this workspace.

## Completed

- Removed authentication fallbacks and weak seeded-password acceptance; bootstrap credentials are generated locally and ignored by Git.
- Bound development listeners to loopback by default, restricted browser JWT attachment to same-origin API requests, authenticated tenant WebSockets, and added SSRF-safe audit fetching.
- Added tenant-aware background audit/follow-up handling, restart recovery for scraper and automation queues, a durable lead auto-audit queue, overlap prevention for automation runs, all-tenant backups, signed public pitch/portal/tracking/unsubscribe links, and a ten-minute signed Google OAuth state.
- Added missing email/business columns, durable dispatch and auto-audit schemas, recurring-audit history, campaign compatibility bridge, runtime asset packaging, and applied migrations 031–034.
- Outbound email is centrally paused unless `OUTBOUND_EMAIL_ENABLED=true`; campaign, manual, quick-pitch, follow-up, legacy, SMTP test sends, follow-up scheduling, and IMAP bounce polling enforce the pause. All real delivery paths now use a guarded durable queue with atomic claims, stale-claim recovery, retries, idempotent tracking IDs, suppression checks, reply-aware follow-ups, daily limits, and sender rotation.
- Removed fabricated NAP matches, review quotations/sentiment, competitor ranks, geo-grid ranks (including the client-side estimated grid), recurring score improvements, fallback audit grades, speculative business-impact copy, and lead/revenue-loss claims. Missing evidence is shown as `Not checked`.
- Reworked recurring website audits to run the live crawler and persist measured results; missing sites are skipped without a score.
- Replaced unsupported outreach statistics and guarantees with evidence-bound English copy for local service businesses.
- Added audit-evidence and dispatch-queue regression tests and expanded CI to install client dependencies and run the full suite.
- Added production hosting guidance and safe environment defaults.

## SaaS UI refresh

- Rebuilt the application shell with a compact grouped sidebar, sticky command bar, persistent collapse preference, clear active states, quick actions, and a responsive mobile drawer.
- Added a consistent visual system for page backgrounds, cards, headers, buttons, data tables, focus states, spacing, and responsive behavior across existing workflows.
- Rebuilt the overview dashboard around real backend data, accurate loading and empty states, clearer workflow entry points, and evidence-based attention/activity panels.
- Removed invented dashboard chart fallbacks, fake lead-stage counts, and the hard-coded `50.2k` weekly figure.
- Reworked the Audit Hub around website, local, client-delivery, and outreach workflows with explicit evidence language.
- Rebuilt sign-in/sign-up presentation, fixed `/signup` opening in login mode, enabled appropriate autocomplete, added password visibility, and removed exposed preset administrator credentials from the UI.
- Corrected the mobile Campaigns navigation route.
## Agency settings simplification — 19 September 2026

- Removed the SaaS Billing and operator-irrelevant System tabs from the normal Settings experience.
- Split Settings into Agency Profile and guided Outreach Defaults, with a separate API Setup page.
- Expanded the agency profile with website, full address, country, postal code, tax/registration ID, currency, invoice prefix, payment terms, and invoice footer fields.
- Consolidated AI to one managed OpenRouter connection for email, audit, and general tasks; previous provider catalog entries are no longer exposed or selected.
- Moved Google OAuth, Google Places, and DataForSEO fallback credentials into the dedicated API Setup page with clear connector-status language.
- Replaced plain-text/HTML code toggles with a rich-text email composer, formatting toolbar, personalization-field insertion, and safe preview.
- Reframed outreach settings as three steps: connect a sender, write the default message, and choose delivery/follow-up timing. The page clearly shows that sending remains paused.

## Product branding — 19 September 2026

- Standardized the user-facing product name to **SMBify OS** across authentication, navigation, loading states, reports, outreach defaults, server messages, and hosting guidance.
- Kept the application shell identity fixed as SMBify OS instead of showing the tenant or agency name as the product title.
- Reserved the Agency Profile name and logo for client-facing audits, proposals, invoices, and outreach where the sender identity belongs.
- Added a data migration that updates previously seeded outreach templates from SMBify Lead OS to SMBify OS.
## Deliberately still disabled or external

- Outbound sending remains disabled until public HTTPS hosting, SMTP verification, SPF, DKIM, DMARC, and a test mailbox are configured.
- Live geo-grid ranks, directory/NAP verification, and review sentiment require an implemented provider connector or attributable imported source records. Saving a provider credential does not claim that the connector is active; the product reports these checks as unavailable rather than simulating them.
- The repository Git object database has invalid HEAD/main references and missing objects. Recover it from a verified full clone or backup; do not reset or reinitialize over this workspace.
- Historical migration `023_per_client_google_creds.sql` is recorded in the existing database but absent from this source snapshot. The current 37-file migration chain was verified against a clean database and is functionally reproducible; recover the original file only to restore exact historical provenance.

## Verification

- `npm run migrate`: passed; migrations 031–036 applied.
- `npm test`: passed, 9/9.
- Server and client TypeScript checks: passed.
- `npm run build`: passed.
- Production smoke test: health endpoint returned 200; an unauthenticated protected API returned 401; outbound remained disabled.
- Clean-install smoke test: all 36 current migrations applied to a fresh database; health returned 200; SQLite integrity check returned `ok`.
## Full application functional verification — 19 September 2026

- Ran the production build against isolated fresh authentication and tenant databases with outbound email disabled.
- Passed 99/99 API and workflow checks covering authentication, dashboard data, lead CRUD and CSV export, legacy and SEO clients, businesses, team assignments, checklist generation, finance entries, evidence-based GMB and live website audits, automation execution, outreach templates and campaigns, SMTP credential encryption, email sequences, suppression, settings, backups, OpenRouter configuration guards, Google configuration guards, and safe send blocking.
- Passed an authenticated browser sweep of all 18 primary application pages with correct headings, no error states, and no browser console warnings or errors.
- Fixed authentication lockouts caused by applying the login rate limiter to authenticated `/api/auth/me` refreshes.
- Added normalized automation input defaults so missing optional source and lead-limit values cannot be bound to SQLite as `undefined`.
- Corrected audit score persistence: lead scores are read from saved audit evidence, while client-business latest-score columns are updated directly.
- Added minimum responsive chart dimensions to eliminate transient Recharts size warnings during navigation.
- Re-ran the 9 regression tests, TypeScript checks, launcher checks, migrations, and production builds successfully.