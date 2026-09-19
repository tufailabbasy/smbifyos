import fs from "node:fs";
import path from "node:path";
import express from "express";
import { getDb, resolveDatabasePath } from "../db/database.js";
import { getAiSystemSummary } from "../modules/ai/providers.js";
import { encryptCredential, decryptCredential } from "../utils/encryption.js";
import { performDatabaseBackup, listBackups } from "../modules/backup/databaseBackup.js";

type AppSettingsRow = {
  agency_name: string; agency_email: string; agency_phone: string; business_address: string;
  default_city: string; default_state: string; agency_logo_url: string; timezone: string; brand_notes: string;
  agency_website: string; country: string; postal_code: string; tax_id: string; default_currency: string;
  invoice_prefix: string; payment_terms_days: number; invoice_footer: string; booking_url: string;
  google_client_id: string; google_client_secret: string; google_places_api_key: string | null;
  dataforseo_login: string | null; dataforseo_password: string | null; updated_at: string;
};

let cachedAppVersion = "";
const cleanText = (value: unknown) => String(value ?? "").trim();
const hasOwnValue = (record: unknown, key: string) => Boolean(record && typeof record === "object" && Object.prototype.hasOwnProperty.call(record, key));

function readAppVersion(): string {
  if (cachedAppVersion) return cachedAppVersion;
  try { const parsed = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as { version?: string }; cachedAppVersion = cleanText(parsed.version) || "0.1.0"; }
  catch { cachedAppVersion = cleanText(process.env.npm_package_version) || "0.1.0"; }
  return cachedAppVersion;
}

function emptySettings(): AppSettingsRow {
  return { agency_name: "", agency_email: "", agency_phone: "", business_address: "", default_city: "", default_state: "", agency_logo_url: "", timezone: "America/New_York", brand_notes: "", agency_website: "", country: "", postal_code: "", tax_id: "", default_currency: "USD", invoice_prefix: "INV", payment_terms_days: 15, invoice_footer: "", booking_url: "", google_client_id: "", google_client_secret: "", google_places_api_key: "", dataforseo_login: "", dataforseo_password: "", updated_at: new Date().toISOString() };
}

function readSettingsRow(): AppSettingsRow {
  const row = getDb().prepare(`SELECT agency_name, agency_email, agency_phone, business_address,
    default_city, default_state, agency_logo_url, timezone, brand_notes,
    agency_website, country, postal_code, tax_id, default_currency, invoice_prefix, payment_terms_days, invoice_footer, booking_url,
    google_client_id, google_client_secret, google_places_api_key, dataforseo_login, dataforseo_password, updated_at
    FROM app_settings WHERE id = 1`).get() as AppSettingsRow | undefined;
  if (!row) return emptySettings();
  return { ...row, google_client_secret: decryptCredential(row.google_client_secret), google_places_api_key: decryptCredential(row.google_places_api_key), dataforseo_password: decryptCredential(row.dataforseo_password) };
}

function profileResponse(settings: AppSettingsRow) {
  return {
    agencyName: settings.agency_name, agencyEmail: settings.agency_email, agencyPhone: settings.agency_phone,
    businessAddress: settings.business_address, defaultCity: settings.default_city, defaultState: settings.default_state,
    agencyLogoUrl: settings.agency_logo_url, timezone: settings.timezone, brandNotes: settings.brand_notes,
    agencyWebsite: settings.agency_website, country: settings.country, postalCode: settings.postal_code, taxId: settings.tax_id,
    defaultCurrency: settings.default_currency, invoicePrefix: settings.invoice_prefix,
    paymentTermsDays: settings.payment_terms_days, invoiceFooter: settings.invoice_footer, bookingUrl: settings.booking_url,
    googleClientId: settings.google_client_id, googleClientSecret: settings.google_client_secret,
    googlePlacesApiKey: settings.google_places_api_key || "", dataForSeoLogin: settings.dataforseo_login || "",
    dataForSeoPassword: settings.dataforseo_password || "", updatedAt: settings.updated_at,
  };
}

export const settingsRouter = express.Router();

settingsRouter.get("/", (_req, res) => {
  try {
    const db = getDb(); const settings = readSettingsRow(); const aiSummary = getAiSystemSummary();
    const count = (sql: string) => (db.prepare(sql).get() as { count: number }).count || 0;
    const port = Number(process.env.PORT || 5050);
    res.json({
      profile: profileResponse(settings),
      system: {
        appVersion: readAppVersion(), runtime: `Node ${process.version}`, apiUrl: `http://localhost:${port}`,
        smtpAccounts: count("SELECT COUNT(*) as count FROM smtp_accounts WHERE is_active = 1"),
        totalClients: count("SELECT COUNT(*) as count FROM seo_clients"), totalLeads: count("SELECT COUNT(*) as count FROM leads"),
        totalCampaigns: count("SELECT COUNT(*) as count FROM campaigns"),
        activeBusinesses: count("SELECT COUNT(*) as count FROM client_businesses WHERE LOWER(COALESCE(order_status, 'active')) NOT IN ('archived', 'cancelled', 'completed')"),
        timezone: settings.timezone, databasePath: resolveDatabasePath(), activeAiProviders: aiSummary.activeProviders,
        registeredAiProviders: aiSummary.providerCatalogSize, emailAiProvider: aiSummary.emailProvider,
        auditAiProvider: aiSummary.auditProvider, generalAiProvider: aiSummary.generalProvider,
      },
    });
  } catch (error) { console.error("Failed to load settings", error); res.status(500).json({ error: "Failed to load settings" }); }
});

settingsRouter.patch("/", (req, res) => {
  try {
    const current = readSettingsRow();
    const text = (apiKey: string, dbKey: keyof AppSettingsRow) => hasOwnValue(req.body, apiKey) ? cleanText(req.body?.[apiKey]) : String(current[dbKey] ?? "");
    const next: AppSettingsRow = {
      agency_name: text("agencyName", "agency_name"), agency_email: text("agencyEmail", "agency_email"), agency_phone: text("agencyPhone", "agency_phone"),
      business_address: text("businessAddress", "business_address"), default_city: text("defaultCity", "default_city"), default_state: text("defaultState", "default_state"),
      agency_logo_url: text("agencyLogoUrl", "agency_logo_url"), timezone: text("timezone", "timezone") || "America/New_York", brand_notes: text("brandNotes", "brand_notes"),
      agency_website: text("agencyWebsite", "agency_website"), country: text("country", "country"), postal_code: text("postalCode", "postal_code"), tax_id: text("taxId", "tax_id"),
      default_currency: (text("defaultCurrency", "default_currency") || "USD").toUpperCase(), invoice_prefix: (text("invoicePrefix", "invoice_prefix") || "INV").toUpperCase(),
      payment_terms_days: hasOwnValue(req.body, "paymentTermsDays") ? Math.max(0, Math.min(365, Number(req.body?.paymentTermsDays) || 0)) : current.payment_terms_days,
      invoice_footer: text("invoiceFooter", "invoice_footer"), booking_url: text("bookingUrl", "booking_url"), google_client_id: text("googleClientId", "google_client_id"),
      google_client_secret: hasOwnValue(req.body, "googleClientSecret") ? cleanText(req.body?.googleClientSecret) : current.google_client_secret,
      google_places_api_key: hasOwnValue(req.body, "googlePlacesApiKey") ? cleanText(req.body?.googlePlacesApiKey) : current.google_places_api_key,
      dataforseo_login: hasOwnValue(req.body, "dataForSeoLogin") ? cleanText(req.body?.dataForSeoLogin) : current.dataforseo_login,
      dataforseo_password: hasOwnValue(req.body, "dataForSeoPassword") ? cleanText(req.body?.dataForSeoPassword) : current.dataforseo_password,
      updated_at: new Date().toISOString(),
    };
    getDb().prepare(`INSERT INTO app_settings (
      id, agency_name, agency_email, agency_phone, business_address, default_city, default_state, agency_logo_url, timezone, brand_notes,
      agency_website, country, postal_code, tax_id, default_currency, invoice_prefix, payment_terms_days, invoice_footer, booking_url,
      google_client_id, google_client_secret, google_places_api_key, dataforseo_login, dataforseo_password, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET agency_name=excluded.agency_name, agency_email=excluded.agency_email, agency_phone=excluded.agency_phone,
      business_address=excluded.business_address, default_city=excluded.default_city, default_state=excluded.default_state,
      agency_logo_url=excluded.agency_logo_url, timezone=excluded.timezone, brand_notes=excluded.brand_notes,
      agency_website=excluded.agency_website, country=excluded.country, postal_code=excluded.postal_code, tax_id=excluded.tax_id,
      default_currency=excluded.default_currency, invoice_prefix=excluded.invoice_prefix, payment_terms_days=excluded.payment_terms_days,
      invoice_footer=excluded.invoice_footer, booking_url=excluded.booking_url, google_client_id=excluded.google_client_id, google_client_secret=excluded.google_client_secret,
      google_places_api_key=excluded.google_places_api_key, dataforseo_login=excluded.dataforseo_login,
      dataforseo_password=excluded.dataforseo_password, updated_at=excluded.updated_at`).run(
      next.agency_name, next.agency_email, next.agency_phone, next.business_address, next.default_city, next.default_state,
      next.agency_logo_url, next.timezone, next.brand_notes, next.agency_website, next.country, next.postal_code, next.tax_id,
      next.default_currency, next.invoice_prefix, next.payment_terms_days, next.invoice_footer, next.booking_url, next.google_client_id,
      encryptCredential(next.google_client_secret), encryptCredential(next.google_places_api_key), next.dataforseo_login,
      encryptCredential(next.dataforseo_password), next.updated_at
    );
    res.json(profileResponse(next));
  } catch (error) { console.error("Failed to save settings", error); res.status(500).json({ error: "Failed to save settings" }); }
});

settingsRouter.get("/backups", (_req, res) => { try { res.json({ items: listBackups() }); } catch (error) { console.error("Failed to list backups", error); res.status(500).json({ error: "Failed to list backups" }); } });
settingsRouter.post("/backup", (_req, res) => { try { const result = performDatabaseBackup(); if (!result.success) { res.status(500).json({ error: result.error || "Database backup failed" }); return; } res.json(result); } catch (error) { console.error("Failed to trigger backup", error); res.status(500).json({ error: "Failed to trigger database backup" }); } });
