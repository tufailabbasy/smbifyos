import assert from "node:assert/strict";
import test from "node:test";
import { parseLeadCommand } from "./commandParser.js";

test("parses a local-business acquisition instruction into a safe workflow", () => {
  const plan = parseLeadCommand("Find 40 plumbers in Austin, TX rated between 3.5 and 4.6 with fewer than 100 reviews, then email them.");
  assert.equal(plan.niche, "Plumbers");
  assert.equal(plan.city, "Austin");
  assert.equal(plan.state, "TX");
  assert.equal(plan.maxLeads, 40);
  assert.equal(plan.filters.minRating, 3.5);
  assert.equal(plan.filters.maxRating, 4.6);
  assert.equal(plan.filters.maxReviews, 100);
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.steps.at(-1)?.type, "create_campaign");
});

test("caps lead volume and never creates an automatic send step", () => {
  const plan = parseLeadCommand("Find 999 roofers in Miami, FL without a website and send outreach.");
  assert.equal(plan.maxLeads, 200);
  assert.equal(plan.filters.websitePreference, "missing");
  assert.ok(!plan.steps.some((step) => step.type === "send_campaign"));
});
