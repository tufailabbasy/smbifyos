# Lovable Import Prompt — LocalRank OS

Paste this prompt into Lovable to import and clone the LocalRank OS repository and prepare deployable frontend/backend artifacts.

---

**Repository**: https://github.com/tufailabbasy/localrank (branch: `main`)

**Project name**: LocalRank OS

**Goal**: Clone and recreate this repo as a deployable full‑stack app (frontend + backend + Postgres) inside Lovable. Produce a working prototype preview (frontend + backend) and provide deploy artifacts/instructions if Lovable cannot host both services in a single app.

**Quick summary of structure & commands**:
- Frontend: `client` — Vite + React + TypeScript
  - Dev: `cd client && npm install && npm run dev`
  - Build: `cd client && npm run build` → static output at `client/dist`
  - Public assets: `client/public`
- Backend: `server` — Node + TypeScript (entry `server/index.ts`)
  - Dev: `cd server && npm install && npm run dev`
  - Build/run: transpile TypeScript then run `node build/index.js` (or use provided start scripts)
  - API routes located under `server/routes`
- Database:
  - Postgres required. Migrations live in `db/migrations` (SQL files).
  - Migration command example: `psql "$DATABASE_URL" -f db/migrations/001_init.sql` (or run all `*.sql`).
  - Env var: `DATABASE_URL` (Postgres connection string)
- Shared code: `shared/` contains common models/utilities used by both sides.

**Required environment variables (placeholders)**:
- `DATABASE_URL` = postgres://user:pass@host:port/dbname
- `PORT` = 3000
- `JWT_SECRET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (if email features used)
- `NODE_ENV=production`

**Steps Lovable should perform**:
1. Clone the repo from the GitHub URL above.
2. Install dependencies for both `client` and `server`.
3. Provision or accept a Postgres connection and run migrations in `db/migrations`.
4. Build the frontend and serve it as a static site in Lovable (ensure SPA routing: unknown paths redirect to `index.html`).
5. Build and start the backend service; expose HTTP endpoints and set CORS to allow the frontend origin.
6. Wire environment variables/secrets via Lovable secrets panel or prompt the user to provide them.
7. Validate preview URLs: frontend preview loads; frontend can call backend API endpoints; run a sample import flow using the `Import Leads` page.

**If Lovable cannot run both services**:
- Create two deployable artifacts and clear instructions:
  - Frontend: static build ready for Vercel/Netlify. Include SPA redirect (`_redirects` or rewrites) if needed.
  - Backend: Docker image + Procfile/start command for Render/Railway/Fly. Include example env vars.
- Provide a minimal `Dockerfile` for backend:
  ```Dockerfile
  FROM node:18-alpine
  WORKDIR /app
  COPY server/package*.json ./
  RUN npm ci --production
  COPY server/ .
  RUN npm run build
  CMD ["node","build/index.js"]
  ```
- Provide a minimal `Dockerfile` for frontend (optional) or instructions to serve `client/dist` via Netlify/Vercel.

**Verification tests**:
- `cd client && npm ci && npm run build` completes successfully.
- `cd server && npm ci && npm run build` (or compile) completes successfully.
- Run migrations against `DATABASE_URL` without errors.
- Start server and confirm `/api/health` or main endpoint responds 200.
- From frontend preview, perform an import flow on `Import Leads` page (`client/src/pages/ImportLeadsPage.tsx`) and confirm backend responses.

**Developer notes for Lovable**:
- Preserve repository structure and commit small helper scripts or Dockerfiles to a new branch `lovable-import` if modifications are needed.
- Do not commit secrets; use Lovable's secret storage.
- If external services or keys are required, prompt the user to input them securely.

**Deliverables**:
- Preview URL(s): frontend and backend (API base).
- A `lovable-import` branch (optional) with any build/start tweaks, `Dockerfile`(s), or `Procfile` added.
- A README in Lovable workspace explaining how to rebuild, run migrations, and deploy externally.

---

If you want, I can also add a `lovable-import` branch to this repository with the `Dockerfile` and a `Procfile` for the backend plus an SPA redirect file for the frontend; tell me to proceed and I'll create the files and push the changes (or prepare a patch here).
