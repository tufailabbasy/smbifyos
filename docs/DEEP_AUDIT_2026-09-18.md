**SMBify Lead OS — Deep Code and Runtime Audit**

Date: 18 September 2026. Intended use confirmed by owner: internal agency use now, multi-agency SaaS later.

**Assessment**

The purpose and broad architecture are understandable: collect leads, audit websites/Google Business Profiles, create pitches and outreach, convert leads to clients, and manage SEO delivery and revenue. The application has substantial implemented functionality, but it is not ready for a public SaaS launch. Several existing internal workflows also fail or present unreliable results.

The main architectural problem is incomplete integration between generations of modules: two campaign systems, inconsistent credential decryption, SQL queries out of sync with migrations, and tenant scoping applied to HTTP requests but not consistently to queues, public links and background jobs.

The existing SMBify_Final_Audit_Report.md says many of these areas are fully complete. Current source and reproducible checks contradict several of those claims.

**Structure reviewed**

| Area | Responsibility | Main concern |
|---|---|---|
| client/src | React/Vite UI, routing, reports and email workspaces | Campaign redirects target another campaign store; global fetch interceptor; large eager bundle |
| server/routes | Express APIs | Large route modules combine validation, persistence, scheduling and sending |
| server/modules | Crawlers, audit calculations, AI, outreach, automation | Live and simulated outputs mixed; send paths and queues differ |
| server/db + db/migrations | Central authentication DB and per-tenant SQLite DBs | Migration/schema drift; incomplete background tenant support |
| shared | Shared lead types | Runtime SQL correctness is not guaranteed by TypeScript types |
| legacy-modules | Older applications and scraper integrations | Deployment depends on more than compiled TypeScript |
| scratch / GMB Automation | Operational scripts, experiments, exported reports | Not treated as authoritative tests; scripts that send mail were not executed |
| .github/workflows | CI | Client dependency installation and critical integration coverage missing |

**Checks actually completed**

- Production build: npm run build passed. TypeScript server/client compilation and Vite bundling completed.
- Existing regression tests: npm run test:counters passed, 3/3 tests.
- A separate compiled audit build and disposable SQLite databases were created under scratch/deep-audit-2026-09-18.
- The isolated harness ran successfully using loopback HTTP and mocked SMTP. It did not import the real server entry point or start the application's live schedulers.
- All 32 migration files applied successfully to a clean fixture database. Successful migration application does not mean every runtime query matches that schema.
- Existing application database schema was inspected read-only. It also lacks the email-tracking and business-score columns identified below.
- Git integrity checks confirmed invalid HEAD/main references and missing objects.
- Initial sandbox EPERM failures were environment restrictions. The allowed reruns completed; those initial failures are not counted as application bugs.

Evidence: [scratch/deep-audit-2026-09-18/results.json](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/scratch/deep-audit-2026-09-18/results.json>). Reproduction harness: [scratch/deep-audit-2026-09-18/verify.mjs](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/scratch/deep-audit-2026-09-18/verify.mjs>).

P0 = immediate critical security fix. P1 = major functional/security/reliability issue. P2 = fix before expansion or reliance on the affected feature. “Reproduced” means demonstrated with controlled local fixtures. “Source confirmed” means the faulty code path was identified without exercising real external services.

**Findings**

**1. [P0] Production admin authentication accepts hardcoded weak passwords — reproduced**

[server/routes/auth.ts:165](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/auth.ts:165>); [server/db/mainDb.ts:85](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/db/mainDb.ts:85>).

The special admin-password branch bypasses password-hash verification for two seeded admin accounts. Despite the variable name suggesting development use, there is no NODE_ENV guard. In the isolated test, NODE_ENV=production and a weak fallback password returned HTTP 200 and a valid admin token. Changing only the stored password hash does not remove the bypass.

Fix: remove the bypass and hardcoded account credentials, create initial administrators through a controlled setup flow, and invalidate existing sessions after remediation.

**2. [P1] Local mode silently grants unauthenticated API callers admin access — source confirmed**

[server/utils/authMiddleware.ts:61](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/utils/authMiddleware.ts:61>); [server/index.ts:514](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:514>); [client/vite.config.ts:9](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/client/vite.config.ts:9>).

When NODE_ENV is not production, missing tokens become a default admin identity. The current .env does not set NODE_ENV. The API listener does not restrict binding to loopback, and Vite uses host:true. Therefore a reachable development instance exposes its default workspace to callers without login; exact external exposure depends on firewall/network configuration.

Fix: require authentication by default in every mode. If a local-only bypass is needed, make it explicit and bind that instance to loopback.

**3. [P1] Several client-facing audit findings are fabricated from scores/templates — reproduced and source confirmed**

[server/modules/audits/napChecker.ts:41](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/napChecker.ts:41>); [server/modules/audits/reviewSentiment.ts:55](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/reviewSentiment.ts:55>); [server/modules/audits/competitorBenchmark.ts:67](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/competitorBenchmark.ts:67>); [server/routes/public.ts:250](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/public.ts:250>).

NAP directory statuses are derived from baseScore, without checking those directories. Passing a high score produced seven “verified_match” records for a never-scanned business. Review analysis returned praise mentions of 4, 3 and 2 even with zero reviews, with hardcoded quotations. Competitor speed, schema presence and map positions are generated or assumed. The competitor query also requests a nonexistent leads.last_website_audit_score column and catches the SQL error, forcing fallback data on the reviewed schema.

Geo-grid ranks are simulated too, although its UI does label the simulation. That label does not make the separate NAP, sentiment or competitor claims verified.

Fix: store source evidence and timestamps for actual observations; return unknown/unavailable when evidence is absent. Keep demos explicitly separate from client reports.

**4. [P1] Recurring audits fabricate improvement, fail after partial writes, and have no recurring dispatcher — reproduced and source confirmed**

[server/modules/audits/recurringAudits.ts:48](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/recurringAudits.ts:48>); [server/modules/audits/recurringAudits.ts:103](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/recurringAudits.ts:103>); [server/modules/audits/recurringAudits.ts:183](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/recurringAudits.ts:183>); [server/routes/seo.ts:2168](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/seo.ts:2168>).

The implementation adds 2–5 random points instead of crawling the business. It inserts a completed audit, then updates missing client_businesses score columns. The fixture returned status=failed but left one completed audit with the invented score saved. Null service_type can cause an earlier sentiment-function exception as well.

The “next scheduled run” is simply now plus 30 days on each status request. Source search found the executor called from run-now, not a monthly scheduler. History is process-global memory.

Fix: run real audits, write consistent results transactionally, and persist tenant-scoped schedules/history with a worker.

**5. [P1] Email senders, open tracking and Quick Send use columns that do not exist — reproduced**

[server/routes/email.ts:105](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:105>); [server/routes/email.ts:696](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:696>); [server/routes/email.ts:840](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:840>); [db/migrations/027_email_marketing_suite.sql:5](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/db/migrations/027_email_marketing_suite.sql:5>).

Three concrete failures:

- GET /api/email/senders returns 500: smtp_accounts.daily_limit is missing.
- Open tracking writes email_tracking.updated_at, which is missing. The error is swallowed and a pixel is returned; open_count remains zero.
- Quick Send inserts email_tracking.status and updated_at, both missing. It reports HTTP 200 after the mocked successful send, but no tracking row is saved and the lead remains new because the status update is inside the same swallowed-error block.

These missing columns were also confirmed in the existing application DB, not only on clean installation.

Fix: reconcile migrations and queries, and add an integration test covering send → tracking → lead status → dashboard.

**6. [P1] Leads and automation create campaigns that the current Email workspace cannot display — reproduced**

[client/src/pages/LeadsPage.tsx:629](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/client/src/pages/LeadsPage.tsx:629>); [client/src/App.tsx:88](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/client/src/App.tsx:88>); [server/modules/outreach/repository.ts:251](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/outreach/repository.ts:251>); [server/routes/email.ts:123](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:123>).

Lead Workspace creates campaigns in campaigns/emails_sent, then navigates to an old outreach route that redirects to /email/campaigns. That workspace reads email_campaigns/email_tracking. The controlled test created a valid campaign through the old repository and confirmed it was absent from the new workspace list. Automation uses the old repository as well.

Fix: choose one campaign model and migrate/bridge the other; preserve recipient queues, template settings and tracking during migration.

**7. [P1] “Create campaign” automation can send mail immediately — source confirmed**

[server/modules/automation/engine.ts:869](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/automation/engine.ts:869>); [server/modules/automation/engine.ts:885](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/automation/engine.ts:885>); [server/index.ts:521](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:521>); [server/modules/automation/repository.ts:106](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/automation/repository.ts:106>).

The create_campaign step calls the sending routine whenever an active SMTP account exists. It is not just draft creation. A clean default workspace is seeded with an active daily sample workflow described as creating campaign drafts. Thus a nominal draft workflow can attempt unsolicited sending when it runs. The encrypted-password bug currently prevents some sends, but legacy plaintext accounts can still work; fixing encryption alone can expose this behavior.

Fix: separate explicit draft and send steps. Seed example workflows paused, and require an intentional send configuration.

**8. [P1] Credential encryption is not consistently reversed before use — reproduced/source confirmed**

[server/routes/outreach.ts:977](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/outreach.ts:977>); [server/modules/email/followup-scheduler.ts:151](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/email/followup-scheduler.ts:151>); [server/modules/email/followup-scheduler.ts:210](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/email/followup-scheduler.ts:210>); [server/modules/automation/engine.ts:912](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/automation/engine.ts:912>); [server/routes/googleIntegration.ts:16](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/googleIntegration.ts:16>).

SMTP account creation stores encrypted passwords. Follow-ups, IMAP bounce sync, and automation pass the stored ciphertext directly to the provider. Mocked transport confirmed an enc:v1: string was supplied as the SMTP password. Google OAuth reads the encrypted client secret directly as well.

Fix: use shared credential accessors for every provider call. Include initial send, follow-up, automation, SMTP verification, bounce sync and OAuth in regression coverage.

**9. [P2] Follow-up time comparison, sequence selection and reply stopping are inconsistent — reproduced/source confirmed**

[server/routes/email.ts:481](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:481>); [server/modules/email/followup-scheduler.ts:78](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/email/followup-scheduler.ts:78>); [server/modules/email/followup-scheduler.ts:110](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/email/followup-scheduler.ts:110>).

scheduled_at is stored as ISO text with T, but compared directly to SQLite datetime text with a space. A follow-up due at 08:00 was considered not due at 20:00 on the same day. It can remain pending until the next date plus polling delay.

Scheduling hardcodes days 3 and 8 and does not populate sequence_id from the campaign, so the worker's custom-sequence branch is bypassed. Its “replied or unsubscribed” check only excludes unsubscribed/bounced and never checks email_tracking.replied.

Fix: compare normalized timestamps, enqueue the selected sequence/step, and stop future steps on replies or terminal lead states.

**10. [P1] Campaign sending lacks an atomic claim and ignores stored daily caps — source confirmed**

[server/routes/email.ts:358](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:358>); [server/routes/email.ts:401](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:401>); [server/routes/email.ts:406](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:406>).

The endpoint marks a campaign sending and starts a background loop without rejecting an already-running campaign or atomically claiming recipients. Two requests with the same lead IDs can send twice. daily_limit is stored and displayed, but the loop never applies it. Work is an in-process setImmediate loop, without durable resume/checkpoint handling after a restart.

Fix: durable per-recipient jobs, unique/idempotent claims, atomic state transitions, and enforced sender/campaign daily budgets.

**11. [P1] Suppression protection is bypassed by alternative send paths — source confirmed**

[server/routes/email.ts:647](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:647>); [server/routes/outreach.ts:1678](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/outreach.ts:1678>); [server/modules/automation/engine.ts:1007](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/automation/engine.ts:1007>).

The new campaign sender checks email_suppression, but Quick Send, legacy campaign sends, and automation do not share that guard. A lead suppressed through one workspace can be emailed through another.

Fix: enforce suppression immediately before transport invocation in a single sending service, regardless of caller.

**12. [P1] Clean production build omits a required CommonJS module — reproduced**

[server/routes/scrapers.ts:30](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/scrapers.ts:30>); [tsconfig.server.json:16](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/tsconfig.server.json:16>); [package.json:13](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/package.json:13>).

The compiled route requires ../modules/scraper-proxy.cjs, but tsc emits only the included TypeScript. The normal build has no asset-copy step. Importing the route from a clean compiled output failed with MODULE_NOT_FOUND. The same route is imported by the production server, so build success does not establish startup success.

Fix: explicitly package CommonJS/JavaScript runtime assets and migrations, then smoke-test the assembled production output with disposable databases.

**13. [P1] Public pitches, portals, tracking and unsubscribe links are not tenant-aware — reproduced/source confirmed**

[server/index.ts:85](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:85>); [server/routes/public.ts:24](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/public.ts:24>); [server/routes/public.ts:367](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/public.ts:367>); [server/routes/email.ts:875](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:875>).

These routes call getDb outside an authenticated tenant context, which selects default. A second-tenant lead's public pitch returned 404. Opening its unsubscribe link displayed the success page but left status=new and unsubscribed_at=null.

Fix: resolve a signed public token to the owning tenant and resource before accessing data. Return truthful failure responses for invalid links; do not put tenant admin JWTs in public URLs.

**14. [P1] Audit WebSocket exposes all jobs without authentication — reproduced**

[server/modules/siteAuditRealtime.ts:48](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/siteAuditRealtime.ts:48>); [server/modules/siteAuditRealtime.ts:68](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/siteAuditRealtime.ts:68>); [server/modules/siteAuditRealtime.ts:100](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/siteAuditRealtime.ts:100>).

A socket without a token and without jobId is subscribed to all audit jobs. No tenant check is applied to subscriptions or broadcasts. The isolated socket received a synthetic job representing another tenant.

Fix: authenticate upgrade requests, authorize job ownership, and partition subscriptions by tenant. Remove public wildcard subscriptions.

**15. [P1] Auto-audit queue loses tenant ownership across concurrent requests — reproduced**

[server/modules/leads/autoAudit.ts:7](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/leads/autoAudit.ts:7>); [server/modules/leads/autoAudit.ts:33](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/leads/autoAudit.ts:33>).

The singleton queue stores only lead IDs. Its next timeout inherits the context of the running audit. In the controlled test, tenant A queued a job, tenant B queued while A was processing, and B's job ran in tenant A's context. Normally that silently misses B's lead; matching IDs could target the wrong record.

Fix: persist tenantId with each queued item and explicitly run each job within that tenant context.

**16. [P1] Automatic follow-up and bounce processing only use the default tenant — source confirmed**

[server/index.ts:516](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:516>); [server/modules/email/followup-scheduler.ts:71](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/email/followup-scheduler.ts:71>); [server/modules/email/followup-scheduler.ts:324](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/email/followup-scheduler.ts:324>).

The timer is started at server startup with no tenant context. getDb therefore selects default on each pass. Unlike the automation scheduler, it does not iterate tenants. Newly signed-up organizations can queue follow-ups that are never processed.

Fix: dispatch jobs per tenant with tenant-scoped locks, budgets and error reporting.

**17. [P1] Scheduled backups omit tenant business databases — reproduced**

[server/modules/backup/databaseBackup.ts:33](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/backup/databaseBackup.ts:33>); [server/modules/backup/databaseBackup.ts:59](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/backup/databaseBackup.ts:59>); [server/modules/backup/databaseBackup.ts:148](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/backup/databaseBackup.ts:148>).

The startup/day scheduler backs up default and central authentication databases only. A fixture containing a separate tenant DB produced two backups and no tenant-business backup. Manual calls under a tenant can back up that tenant, but use a shared filename/list, while the copy fallback still references default. Central backup discovery also hardcodes db/main.db rather than MAIN_DATABASE_PATH.

Fix: enumerate tenant databases, label backups by tenant, honor configured paths, use a consistent snapshot mechanism, and verify restoration of central plus tenant data.

**18. [P1] Google OAuth flow fails in production and loses organization context — middleware behavior reproduced; provider path inspected**

[server/index.ts:87](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:87>); [server/routes/googleIntegration.ts:103](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/googleIntegration.ts:103>); [server/routes/googleIntegration.ts:114](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/googleIntegration.ts:114>); [server/routes/googleIntegration.ts:166](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/googleIntegration.ts:166>).

The callback sits behind bearer-token middleware, but a browser OAuth redirect does not supply the token stored in localStorage. The mounted middleware test returned 401. In nonproduction, bypassing auth chooses default rather than the originating tenant. The state is unsigned JSON without tenant/session binding, and the return redirect is hardcoded to localhost:5173. The encrypted client-secret defect is described in finding 8.

Fix: a public callback with expiring one-time server-side state bound to tenant/session, correct secret decryption, and a configured return origin. Google itself was not contacted.

**19. [P1] Browser fetch interceptor can forward an admin JWT to external image hosts — source confirmed**

[client/src/main.tsx:9](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/client/src/main.tsx:9>); [client/src/lib/pdfBranding.ts:76](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/client/src/lib/pdfBranding.ts:76>).

Every window.fetch gets the Authorization header regardless of destination. PDF branding fetches the configured logo URL. An external logo server that permits the CORS preflight can receive the token; other hosts may instead fail image loading because of the unexpected header.

Fix: attach bearer credentials only to the exact trusted API origin/path. Keep arbitrary media fetches credential-free.

**20. [P1] Crawler accepts internal/private network targets — reproduced on a controlled loopback service**

[server/modules/audits/crawl.ts:158](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/crawl.ts:158>); [server/modules/audits/crawl.ts:315](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/audits/crawl.ts:315>).

URL normalization and fetching do not reject private/loopback/link-local destinations or validate redirect targets. The crawler fetched our own 127.0.0.1 fixture and returned its page title and HTTP 200. Public SaaS users could use the same capability against reachable internal services.

Fix: enforce destination restrictions at resolution/connection time and on redirects/resource fetches, with explicit allowances only for intentionally supported internal deployments.

**21. [P2] Rate limiting trusts an arbitrary X-Forwarded-For value — reproduced**

[server/utils/rateLimiter.ts:28](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/utils/rateLimiter.ts:28>).

The limiter takes the first supplied forwarded IP without checking a trusted proxy. Same direct caller, same spoofed IP: 200 then 429; changing the header: 200 again. This undermines authentication throttling when the reverse proxy does not sanitize the header.

Fix: configure trusted proxy boundaries and use the derived trusted client address; add an account-level login limit.

**22. [P2] SaaS subscription controls are incomplete and inconsistent — partially reproduced/source confirmed**

[server/routes/auth.ts:284](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/auth.ts:284>); [server/index.ts:86](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:86>); [server/utils/limitsMiddleware.ts:39](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/utils/limitsMiddleware.ts:39>); [server/routes/leads.ts:317](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/leads.ts:317>); [server/routes/email.ts:146](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:146>).

The upgrade route lacks its own auth middleware and is mounted before the global middleware, so even a valid bearer request returns 401. Its underlying behavior is a simulated direct plan update, not verified billing. Lead limits check only the existing count, allowing a CSV batch to exceed the remaining allowance. New email_campaigns creation does not use the campaign limiter, which counts only legacy campaigns.

Fix: authenticated server-authoritative entitlement management; check the requested resource delta transactionally and cover every creation path. Simply adding auth to upgrade would still leave self-selected paid plans without billing verification.

**23. [P1] Local Git history is damaged; migration history has drifted — observed**

[.git/HEAD](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/.git/HEAD>); [db/migrations](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/db/migrations>).

After handling Git's ownership check with a per-command safe.directory option, status still failed with bad object HEAD. cat-file could not resolve HEAD. fsck reported invalid HEAD/main pointers and multiple missing blobs. This is more than a safe-directory warning.

Separately, the existing database records 33 migrations, while this folder contains 32 SQL files. The recorded 023_per_client_google_creds.sql is absent from source, so clean installs cannot reproduce that historical migration.

Fix: preserve a full workspace/DB snapshot, recover Git objects from a verified complete clone or backup, then reconcile the missing migration. Do not initialize over or reset the current repository as a shortcut.

**24. [P2] CI and regression coverage do not exercise the critical product flows — source confirmed**

[.github/workflows/counters-regression.yml:27](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/.github/workflows/counters-regression.yml:27>); [package.json:17](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/package.json:17>).

CI runs root npm ci but does not install the separately managed client dependencies before frontend checks/build. The root package has no npm workspaces configuration to install them implicitly. The only configured test script exercises three personalization-counter cases. Those pass while authentication, tracking, tenant isolation and production packaging fail.

Fix: install both dependency sets in CI; test clean migrations plus runtime queries, authentication, draft visibility, mocked sending/tracking, tenant isolation, and production startup.

**Additional confirmed limitations and lower-priority observations**

- Legacy scheduled campaigns/retries require an explicit send invocation: source search found no general dispatcher for campaigns.scheduled_at/emails_sent.next_attempt_at. The newer email follow-up worker processes a different table. See [server/routes/outreach.ts:1548](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/outreach.ts:1548>).
- Template syntax is inconsistent. Default email sequence text uses {{business_name}}, but the new sender replaces only the inner {business_name}, leaving an extra pair of braces. See [server/routes/email.ts:436](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:436>) and [server/routes/email.ts:613](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:613>).
- Neither APP_BASE_URL nor APP_URL is configured in the current .env. Generated email tracking/unsubscribe URLs fall back to the recipient's localhost; the two variable names are used inconsistently. See [server/routes/email.ts:427](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:427>) and [server/routes/email.ts:683](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/routes/email.ts:683>).
- Dashboard lead-growth query takes the oldest 14 dates, not the most recent 14. Suppression attention counts invalid email with a space while the email verifier writes invalid_email with an underscore. Dashboard campaigns also count the legacy store. See [server/index.ts:171](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:171>) and [server/index.ts:330](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/index.ts:330>).
- Google/Meta/Bing ads “intelligence” runners use Google Maps searches and fixed confidence values as proxies. They do not establish actual advertiser activity. Some internal model labels acknowledge the proxy; product/output claims should preserve that distinction. See [server/modules/scraper-runners/ads-google-runner.cjs:26](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/modules/scraper-runners/ads-google-runner.cjs:26>).
- Places/SERP/Apify keys have settings storage, but the reviewed TypeScript server code references those DB fields only in settings. Adding a key does not make the synthetic geo-grid a live integration.
- The Vite entry bundle is about 2.11 MB minified / 598 kB gzip. Routes are imported eagerly; XLSX is both statically and dynamically imported. Build succeeds, but slower devices/connections will download substantial code upfront. See [client/src/App.tsx:1](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/client/src/App.tsx:1>).
- Many production handlers use any and silent catch blocks. This is why compile success did not reveal SQL-column mistakes or missing tracking.
- Database initialization logs and swallows migration failures, then returns a cached connection. The retry flag is only checked in the connection-creation branch, so the advertised retry does not occur for that cached connection. See [server/db/database.ts:35](<D:/Vibe Coding/SMBify EcoSystem/SMBify - lead.smbify.net/SMBify Lead OS/server/db/database.ts:35>).

**Recommended repair order**

1. Preserve the current workspace and databases; recover Git history. Remove the admin bypass, restrict local exposure, and close WebSocket/JWT/internal-network leaks.
2. Stop presenting fabricated audit results as verified; stop draft-creation steps from sending automatically.
3. Fix schema mismatches and production asset packaging. Add a smoke test that starts only an isolated test instance.
4. Consolidate campaign storage and the sending service, including suppression, credential decryption, tracking, retries, budgets and idempotency.
5. Repair tenant context in queues/public links/background work/backups, then complete OAuth and entitlement controls.
6. Expand integration coverage and improve bundle/module boundaries after the flows are correct.

**Scope and limits**

This review examined active code paths, configuration, migrations, selected scraper implementations and existing documentation. It is not a claim that every legacy file or every UI interaction has been tested. No real email was sent, no paid API/Google OAuth action was executed, and no production scraper was started. External provider reliability and current dependency-advisory status were not certified. Real application DB inspection was read-only.

Production application source was not fixed in this pass. Audit artifacts and disposable fixture data were added under scratch, this report was added under docs, and build outputs were regenerated for verification.
