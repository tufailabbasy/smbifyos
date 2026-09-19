export type OutreachReadiness = "pending" | "ready" | "review" | "skip";

export type AuditSnapshot = {
  status: string;
  score: number | null;
  verdict: string;
  summary: string;
};

export function evaluateOutreachReadiness(input: {
  hasPhone: boolean;
  hasEmail: boolean;
  hasWebsite: boolean;
  hasGmbSignals: boolean;
  websiteAudit?: AuditSnapshot | null;
  gmbAudit?: AuditSnapshot | null;
}): { readiness: OutreachReadiness; reason: string } {
  const contactReady = input.hasPhone || input.hasEmail;
  const websiteCompleted = input.websiteAudit?.status === "completed";
  const gmbCompleted = input.gmbAudit?.status === "completed";
  const completedAudits = [websiteCompleted, gmbCompleted].filter(Boolean).length;

  if (!completedAudits) {
    return {
      readiness: "pending",
      reason: "No staged audits have been completed yet.",
    };
  }

  let weaknessPoints = 0;
  let strengthPoints = 0;

  for (const audit of [input.websiteAudit, input.gmbAudit]) {
    if (!audit || audit.status !== "completed" || typeof audit.score !== "number") {
      continue;
    }

    if (audit.score < 60) {
      weaknessPoints += 2;
    } else if (audit.score < 78) {
      weaknessPoints += 1;
    } else if (audit.score >= 88) {
      strengthPoints += 1;
    }
  }

  if (!contactReady && !input.hasWebsite && !input.hasGmbSignals) {
    return {
      readiness: "skip",
      reason: "Missing both outreach contact signals and auditable business assets.",
    };
  }

  if (strengthPoints >= completedAudits && weaknessPoints === 0) {
    return {
      readiness: "skip",
      reason: "Presence already looks strong, so audit evidence does not justify priority outreach.",
    };
  }

  if (contactReady && weaknessPoints >= 2) {
    return {
      readiness: "ready",
      reason: "Clear weaknesses were found and the business is reachable for outreach.",
    };
  }

  if (!contactReady && weaknessPoints >= 2) {
    return {
      readiness: "review",
      reason: "Meaningful issues were found, but direct contact signals are still weak.",
    };
  }

  if (contactReady) {
    return {
      readiness: "review",
      reason: "Some audit evidence exists, but the case for outreach is still mixed.",
    };
  }

  return {
    readiness: "skip",
    reason: "Audit evidence is limited and reachability remains weak.",
  };
}