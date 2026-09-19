import express from "express";
import { v4 as uuidv4 } from "uuid";
import { google } from "googleapis";
import { getDb, tenantLocalStorage } from "../db/database.js";
import { decryptCredential, encryptCredential } from "../utils/encryption.js";
import { publicToken, readPublicToken } from "../utils/publicLinks.js";

const router = express.Router();
export const googleCallbackRouter = express.Router();

/* ── Helpers ── */
function cleanText(v: unknown): string { return String(v ?? "").trim(); }

function getOAuthCredentials(): { clientId: string; clientSecret: string } {
  const db = getDb();
  const row = db.prepare(`SELECT google_client_id, google_client_secret FROM app_settings WHERE id = 1`).get() as any;
  return {
    clientId: row?.google_client_id || "",
    clientSecret: decryptCredential(row?.google_client_secret || ""),
  };
}

function getRedirectUri(req: express.Request): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers.host || "localhost:5050";
  return `${protocol}://${host}/api/google/callback`;
}

function createOAuth2Client(req: express.Request) {
  const { clientId, clientSecret } = getOAuthCredentials();
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri(req));
}

async function refreshTokenIfNeeded(tokenRow: any, req: express.Request): Promise<string> {
  if (!tokenRow?.access_token) throw new Error("No access token");

  // Check if token is expired (5 min buffer)
  if (tokenRow.token_expiry) {
    const expiry = new Date(tokenRow.token_expiry).getTime();
    if (Date.now() < expiry - 300_000) {
      return decryptCredential(tokenRow.access_token);
    }
  }

  // Refresh
  if (!tokenRow.refresh_token) throw new Error("No refresh token available");
  const client = createOAuth2Client(req);
  if (!client) throw new Error("OAuth not configured");

  client.setCredentials({ refresh_token: decryptCredential(tokenRow.refresh_token) });
  const { credentials } = await client.refreshAccessToken();

  const db = getDb();
  db.prepare(`UPDATE business_google_tokens SET access_token = ?, token_expiry = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(encryptCredential(credentials.access_token || ""), credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null, tokenRow.id);

  return credentials.access_token || decryptCredential(tokenRow.access_token);
}

/* ═══════════════════════════════════════════════
   CHECK CONFIG — is Google OAuth configured for a given client?
   ═══════════════════════════════════════════════ */
router.get("/status", (_req, res) => {
  try {
    const { clientId, clientSecret } = getOAuthCredentials();
    res.json({
      configured: Boolean(clientId && clientSecret),
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
    });
  } catch (err) {
    console.error("[google] GET /status", err);
    res.status(500).json({ error: "Failed to check status" });
  }
});

/* ═══════════════════════════════════════════════
   OAUTH FLOW — connect Google account per business
   ═══════════════════════════════════════════════ */

/* ── GET /connect?businessId=xxx&scopes=gsc,gmb ── */
router.get("/connect", (req, res) => {
  try {
    const businessId = cleanText(req.query.businessId);
    if (!businessId) return res.status(400).json({ error: "businessId is required" });

    const client = createOAuth2Client(req);
    if (!client) return res.status(400).json({ error: "Google OAuth not configured. Add Client ID and Secret in Settings." });

    const scopeParam = cleanText(req.query.scopes) || "gsc";
    const scopes: string[] = [
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    if (scopeParam.includes("gsc")) {
      scopes.push("https://www.googleapis.com/auth/webmasters.readonly");
    }
    // Note: GBP API requires business management scope
    // which needs API enablement in Google Cloud Console

    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state: JSON.stringify({ businessId, scopes: scopeParam, share: publicToken(req.user!.tenantId, "google_oauth", businessId, 10 / (24 * 60)) }),
    });

    res.json({ authUrl });
  } catch (err) {
    console.error("[google] GET /connect", err);
    res.status(500).json({ error: "Failed to generate auth URL" });
  }
});

/* ── GET /callback — OAuth2 callback ── */
googleCallbackRouter.get("/", (req, res, next) => {
  try {
    const state = JSON.parse(cleanText(req.query.state)) as { businessId: string; share: string };
    const scoped = readPublicToken(state.share, "google_oauth", state.businessId);
    if (!scoped) return res.status(400).send("Invalid or expired OAuth state");
    tenantLocalStorage.run(scoped, next);
  } catch { return res.status(400).send("Invalid OAuth state"); }
}, async (req, res) => {
  try {
    const code = cleanText(req.query.code);
    const stateStr = cleanText(req.query.state);
    if (!code || !stateStr) return res.status(400).send("Missing code or state");

    const state = JSON.parse(stateStr) as { businessId: string; scopes: string };
    const client = createOAuth2Client(req);
    if (!client) return res.status(400).send("OAuth not configured");

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email || "";

    const db = getDb();
    const businessId = state.businessId;

    // Check if token entry exists for this business
    const existing = db.prepare(`SELECT id FROM business_google_tokens WHERE business_id = ?`).get(businessId) as any;

    if (existing) {
      db.prepare(`UPDATE business_google_tokens SET
        google_email = ?, access_token = ?, refresh_token = ?,
        token_expiry = ?, scopes = ?,
        gsc_connected = CASE WHEN ? LIKE '%gsc%' THEN 1 ELSE gsc_connected END,
        updated_at = datetime('now')
        WHERE id = ?`)
        .run(email, encryptCredential(tokens.access_token || ""), encryptCredential(tokens.refresh_token || ""),
          tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          state.scopes, state.scopes, existing.id);
    } else {
      db.prepare(`INSERT INTO business_google_tokens
        (id, business_id, google_email, access_token, refresh_token, token_expiry, scopes, gsc_connected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuidv4(), businessId, email,
          encryptCredential(tokens.access_token || ""), encryptCredential(tokens.refresh_token || ""),
          tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          state.scopes,
          state.scopes.includes("gsc") ? 1 : 0);
    }

    // Log activity
    const biz = db.prepare(`SELECT client_id, name FROM client_businesses WHERE id = ?`).get(businessId) as any;
    db.prepare(`INSERT INTO seo_activity_log (id, client_id, business_id, action, detail) VALUES (?, ?, ?, 'google_connected', ?)`)
      .run(uuidv4(), biz?.client_id, businessId, `Google account ${email} connected (${state.scopes})`);

    // Redirect back to the business detail page
    const clientId = biz?.client_id || "";
    const clientBase = String(process.env.CLIENT_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
    res.redirect(`${clientBase}/seo/clients/${clientId}/businesses/${businessId}#connections`);
  } catch (err) {
    console.error("[google] GET /callback", err);
    res.status(500).send(`Google OAuth failed: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
});

/* ── GET /business/:businessId/token — get connection status ── */
router.get("/business/:businessId/token", (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT id, business_id, google_email, gsc_connected, gsc_site_url, gmb_connected, gmb_account_id, gmb_location_id, scopes, created_at, updated_at
      FROM business_google_tokens WHERE business_id = ?`).get(req.params.businessId);
    res.json(row || null);
  } catch (err) {
    console.error("[google] GET /business/:businessId/token", err);
    res.status(500).json({ error: "Failed to get token" });
  }
});

/* ── DELETE /business/:businessId/disconnect — revoke ── */
router.delete("/business/:businessId/disconnect", (req, res) => {
  try {
    const db = getDb();
    db.prepare(`DELETE FROM business_google_tokens WHERE business_id = ?`).run(req.params.businessId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[google] DELETE disconnect", err);
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

/* ═══════════════════════════════════════════════
   GSC — Search Console Data Sync
   ═══════════════════════════════════════════════ */

/* ── GET /gsc/:businessId/sites — list verified sites ── */
router.get("/gsc/:businessId/sites", async (req, res) => {
  try {
    const db = getDb();
    const tokenRow = db.prepare(`SELECT * FROM business_google_tokens WHERE business_id = ?`).get(req.params.businessId) as any;
    if (!tokenRow) return res.status(400).json({ error: "Google not connected for this business" });

    const accessToken = await refreshTokenIfNeeded(tokenRow, req);
    const client = createOAuth2Client(req);
    if (!client) return res.status(400).json({ error: "OAuth not configured" });
    client.setCredentials({ access_token: accessToken });

    const webmasters = google.webmasters({ version: "v3", auth: client });
    const sitesRes = await webmasters.sites.list();
    const sites = (sitesRes.data.siteEntry || []).map((s: any) => ({
      siteUrl: s.siteUrl,
      permissionLevel: s.permissionLevel,
    }));

    res.json(sites);
  } catch (err) {
    console.error("[google] GET /gsc/sites", err);
    res.status(500).json({ error: `Failed to list sites: ${err instanceof Error ? err.message : ""}` });
  }
});

/* ── POST /gsc/:businessId/select-site — set which GSC site to track ── */
router.post("/gsc/:businessId/select-site", (req, res) => {
  try {
    const db = getDb();
    const siteUrl = cleanText(req.body.siteUrl);
    if (!siteUrl) return res.status(400).json({ error: "siteUrl is required" });

    db.prepare(`UPDATE business_google_tokens SET gsc_site_url = ?, gsc_connected = 1, updated_at = datetime('now') WHERE business_id = ?`)
      .run(siteUrl, req.params.businessId);

    res.json({ ok: true, siteUrl });
  } catch (err) {
    console.error("[google] POST /gsc/select-site", err);
    res.status(500).json({ error: "Failed to select site" });
  }
});

/* ── POST /gsc/:businessId/sync — pull GSC data (last 30 days) ── */
router.post("/gsc/:businessId/sync", async (req, res) => {
  try {
    const db = getDb();
    const { businessId } = req.params;
    const tokenRow = db.prepare(`SELECT * FROM business_google_tokens WHERE business_id = ?`).get(businessId) as any;
    if (!tokenRow?.gsc_site_url) return res.status(400).json({ error: "No GSC site selected" });

    const accessToken = await refreshTokenIfNeeded(tokenRow, req);
    const client = createOAuth2Client(req);
    if (!client) return res.status(400).json({ error: "OAuth not configured" });
    client.setCredentials({ access_token: accessToken });

    const webmasters = google.webmasters({ version: "v3", auth: client });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // 1. Overall performance (by date)
    const perfRes = await webmasters.searchanalytics.query({
      siteUrl: tokenRow.gsc_site_url,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ["date"],
        rowLimit: 31,
      },
    });

    let perfInserted = 0;
    for (const row of perfRes.data.rows || []) {
      const date = row.keys?.[0] || "";
      const existing = db.prepare(`SELECT id FROM gsc_performance WHERE business_id = ? AND date = ?`).get(businessId, date);
      if (existing) {
        db.prepare(`UPDATE gsc_performance SET clicks = ?, impressions = ?, ctr = ?, avg_position = ? WHERE business_id = ? AND date = ?`)
          .run(row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0, businessId, date);
      } else {
        db.prepare(`INSERT INTO gsc_performance (id, client_id, business_id, date, clicks, impressions, ctr, avg_position) VALUES (?, '', ?, ?, ?, ?, ?, ?)`)
          .run(uuidv4(), businessId, date, row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0);
      }
      perfInserted++;
    }

    // 2. Top keywords (by query)
    const kwRes = await webmasters.searchanalytics.query({
      siteUrl: tokenRow.gsc_site_url,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ["query"],
        rowLimit: 100,
      },
    });

    let kwInserted = 0;
    for (const row of kwRes.data.rows || []) {
      const keyword = row.keys?.[0] || "";
      const dateKey = fmt(endDate);
      const existing = db.prepare(`SELECT id FROM gsc_keywords WHERE business_id = ? AND keyword = ? AND date = ?`).get(businessId, keyword, dateKey);
      if (existing) {
        db.prepare(`UPDATE gsc_keywords SET clicks = ?, impressions = ?, ctr = ?, avg_position = ? WHERE business_id = ? AND keyword = ? AND date = ?`)
          .run(row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0, businessId, keyword, dateKey);
      } else {
        db.prepare(`INSERT INTO gsc_keywords (id, client_id, business_id, keyword, date, clicks, impressions, ctr, avg_position) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?)`)
          .run(uuidv4(), businessId, keyword, dateKey, row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0);
      }
      kwInserted++;
    }

    // Update last synced
    db.prepare(`UPDATE business_google_tokens SET updated_at = datetime('now') WHERE business_id = ?`).run(businessId);

    // Log activity
    const biz = db.prepare(`SELECT client_id FROM client_businesses WHERE id = ?`).get(businessId) as any;
    db.prepare(`INSERT INTO seo_activity_log (id, client_id, business_id, action, detail) VALUES (?, ?, ?, 'gsc_synced', ?)`)
      .run(uuidv4(), biz?.client_id, businessId, `Synced ${perfInserted} days performance + ${kwInserted} keywords from GSC`);

    res.json({ perfInserted, kwInserted });
  } catch (err) {
    console.error("[google] POST /gsc/sync", err);
    res.status(500).json({ error: `GSC sync failed: ${err instanceof Error ? err.message : ""}` });
  }
});

/* ── GET /gsc/:businessId/performance — get stored performance data ── */
router.get("/gsc/:businessId/performance", (req, res) => {
  try {
    const db = getDb();
    const days = Number(req.query.days) || 30;
    const rows = db.prepare(`SELECT * FROM gsc_performance WHERE business_id = ? ORDER BY date DESC LIMIT ?`).all(req.params.businessId, days);
    res.json(rows);
  } catch (err) {
    console.error("[google] GET /gsc/performance", err);
    res.status(500).json({ error: "Failed to fetch performance" });
  }
});

/* ── GET /gsc/:businessId/keywords — get stored keyword data ── */
router.get("/gsc/:businessId/keywords", (req, res) => {
  try {
    const db = getDb();
    const limit = Number(req.query.limit) || 50;
    const rows = db.prepare(`SELECT * FROM gsc_keywords WHERE business_id = ? ORDER BY clicks DESC, impressions DESC LIMIT ?`).all(req.params.businessId, limit);
    res.json(rows);
  } catch (err) {
    console.error("[google] GET /gsc/keywords", err);
    res.status(500).json({ error: "Failed to fetch keywords" });
  }
});

export { router as googleIntegrationRouter };
