export type CampaignPersonalizationMode = "ai" | "fallback";

export function summarizePersonalizationByLeadIds(
  modeByLeadId: Record<string, CampaignPersonalizationMode>,
  leadIds: string[]
): { aiGenerated: number; fallback: number } {
  let aiGenerated = 0;
  let fallback = 0;

  const uniqueLeadIds = new Set(leadIds);
  for (const leadId of uniqueLeadIds) {
    const mode = modeByLeadId[leadId];
    if (mode === "ai") {
      aiGenerated += 1;
    } else if (mode === "fallback") {
      fallback += 1;
    }
  }

  return {
    aiGenerated,
    fallback,
  };
}

export function deriveAppendedLeadIds(
  matchedLeadIds: string[],
  duplicateLeadIds: string[]
): string[] {
  const duplicateSet = new Set(duplicateLeadIds);
  const appendedLeadIds = matchedLeadIds.filter((leadId) => !duplicateSet.has(leadId));
  return Array.from(new Set(appendedLeadIds));
}
