import { getDb } from "../../db/database.js";
import { v4 as uuidv4 } from "uuid";

export function syncLegacyCampaigns(): number {
  const db = getDb();
  const rows = db.prepare("SELECT id,name,status,target_niche,target_city,sequence_json,created_at,updated_at FROM campaigns WHERE id NOT IN (SELECT COALESCE(legacy_campaign_id,'') FROM email_campaigns)").all() as any[];
  let synced = 0;
  for (const row of rows) {
    const sequences = JSON.parse(row.sequence_json || "[]");
    const first = Array.isArray(sequences) ? sequences[0] || {} : {};
    db.prepare(`INSERT INTO email_campaigns (id,name,description,niche,city,status,legacy_campaign_id,subject,body,body_html,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?, ?,?,?,?,?)`).run(
      uuidv4(), row.name || "Imported campaign", null, row.target_niche || null, row.target_city || null,
      ["completed","cancelled"].includes(String(row.status).toLowerCase()) ? "completed" : "draft", row.id,
      first.subject || null, first.body || null, first.body_html || null, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()
    );
    synced++;
  }
  return synced;
}
