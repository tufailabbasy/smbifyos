import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAppendedLeadIds,
  summarizePersonalizationByLeadIds,
  type CampaignPersonalizationMode,
} from "./personalizationCounters.js";

test("summarizePersonalizationByLeadIds counts unique lead IDs only", () => {
  const modeByLeadId: Record<string, CampaignPersonalizationMode> = {
    leadA: "fallback",
    leadB: "ai",
    leadC: "fallback",
  };

  const counts = summarizePersonalizationByLeadIds(modeByLeadId, ["leadA", "leadA", "leadB", "missingLead"]);

  assert.deepEqual(counts, {
    aiGenerated: 1,
    fallback: 1,
  });
});

test("deriveAppendedLeadIds removes duplicates and duplicateLeadIds", () => {
  const appendedLeadIds = deriveAppendedLeadIds(
    ["lead1", "lead2", "lead3", "lead1"],
    ["lead2"]
  );

  assert.deepEqual(appendedLeadIds, ["lead1", "lead3"]);
});

test("append counter flow uses only appended lead IDs", () => {
  const modeByLeadId: Record<string, CampaignPersonalizationMode> = {
    lead1: "fallback",
    lead2: "fallback",
    lead3: "ai",
  };

  const appendedLeadIds = deriveAppendedLeadIds(["lead1", "lead2", "lead3"], ["lead2"]);
  const counts = summarizePersonalizationByLeadIds(modeByLeadId, appendedLeadIds);

  assert.deepEqual(counts, {
    aiGenerated: 1,
    fallback: 1,
  });
});
