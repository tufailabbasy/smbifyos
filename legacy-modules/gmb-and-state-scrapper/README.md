# Scraper Engine Bundle

This folder is a reusable snapshot from BizFinder Pro for future Local OS integration.

## Included
- `server/` : backend engine, registry scrapers, GMB scraper, routes, modules, current data, exports.
- `client/` : current front-end pages/components for the registry and GMB scraper flows.
- `src/` : root Vite entry files that still exist in the project snapshot.
- Root launcher/config files: `package.json`, `pnpm-lock.yaml`, `.env`, `Start BizFinder Pro.bat`, `Restart BizFinder Pro.bat`, `vite.config.js`, `index.html`, `style.css`.
- `LOCAL_SEO_AGENCY_OS_AGENT_PROMPT.md` : the Local OS planning prompt copied with the bundle.

## Key Data Inside `server/`
- `server/data/gmb-photo-downloads/` : downloaded GMB images.
- `server/data/gmb-photo-jobs/` : saved GMB job histories.
- `server/data/gmb-rank-tracker/` : saved rank snapshots.
- `server/data/raw_*.json` and `server/data/results_*.json` : registry-state raw/results data.
- `server/output/` : exported CSVs and photo ZIPs.
- `server/scrapers/` : registry state scraper files.
- `server/modules/gmb-photo-scraper.js` : main GMB scraper engine.

## Snapshot Counts
- GMB downloaded image files: 168
- Export files in `server/output`: 28
- Registry scraper files in `server/scrapers`: 19

## Intentionally Excluded
- `.git`
- `node_modules`
- launcher/install log files
- old merge backup folder

Bundle created from source: `D:\Vibe Coding\BizFinder Pro`
Bundle location: `D:\Vibe Coding\scraper-engine`
