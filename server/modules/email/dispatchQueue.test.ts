import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { claimNextDispatch, enqueueCampaignDispatches } from "./dispatchQueue.js";
import { isValidEmail, personalize } from "./delivery.js";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE leads(id TEXT PRIMARY KEY,email TEXT,status TEXT,business_name TEXT);
    CREATE TABLE email_suppression(id TEXT PRIMARY KEY,email TEXT UNIQUE);
    CREATE TABLE email_sequences(id TEXT PRIMARY KEY,steps_json TEXT,is_active INTEGER);
    CREATE TABLE email_campaigns(id TEXT PRIMARY KEY,sequence_id TEXT,delay_seconds INTEGER,status TEXT,subject TEXT,body TEXT,body_html TEXT,scheduled_at TEXT,started_at TEXT,updated_at TEXT);
    CREATE TABLE email_dispatch_jobs(
      id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,lead_id TEXT NOT NULL,recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,body TEXT NOT NULL,body_html TEXT,smtp_account_id TEXT,sequence_id TEXT,
      sequence_number INTEGER NOT NULL DEFAULT 1,scheduled_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,claimed_at TEXT,sent_at TEXT,error_message TEXT,tracking_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(campaign_id,lead_id,sequence_number)
    );
  `);
  return db;
}

test("email validation and personalization handle supported fields", () => {
  assert.equal(isValidEmail("owner@example.com"), true);
  assert.equal(isValidEmail("owner.example.com"), false);
  assert.equal(personalize("Hi {{business_name}} in {city}", { business_name: "Acme", city: "Miami" }), "Hi Acme in Miami");
});

test("campaign enqueue deduplicates leads and excludes suppressed recipients", () => {
  const db = database();
  db.prepare("INSERT INTO email_campaigns(id,delay_seconds,status) VALUES('c1',0,'draft')").run();
  db.prepare("INSERT INTO leads(id,email,status,business_name) VALUES('l1','one@example.com','new','One'),('l2','two@example.com','new','Two')").run();
  db.prepare("INSERT INTO email_suppression(id,email) VALUES('s1','two@example.com')").run();
  const first = enqueueCampaignDispatches(db, { campaignId: "c1", leadIds: ["l1", "l1", "l2"], subject: "Hello", body: "Body", delaySeconds: 0 });
  assert.deepEqual(first, { queued: 1, skipped: 1 });
  const second = enqueueCampaignDispatches(db, { campaignId: "c1", leadIds: ["l1"], subject: "Hello", body: "Body", delaySeconds: 0 });
  assert.deepEqual(second, { queued: 0, skipped: 0 });
  assert.equal((db.prepare("SELECT COUNT(*) count FROM email_dispatch_jobs").get() as any).count, 1);
});

test("dispatch claim is atomic and increments attempts", () => {
  const db = database();
  db.prepare("INSERT INTO email_campaigns(id,delay_seconds,status) VALUES('c1',0,'draft')").run();
  db.prepare("INSERT INTO leads(id,email,status,business_name) VALUES('l1','one@example.com','new','One')").run();
  enqueueCampaignDispatches(db, { campaignId: "c1", leadIds: ["l1"], subject: "Hello", body: "Body", delaySeconds: 0 });
  const job = claimNextDispatch(db);
  assert.ok(job);
  assert.equal(job.status, "processing");
  assert.equal(job.attempt_count, 1);
  assert.equal(claimNextDispatch(db), null);
});