export type AuditIssue = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type GmbAuditInput = {
  businessName: string;
  city?: string;
  state?: string;
  website?: string;
  gmbUrl?: string;
  gmbClaimed?: boolean | null;
  gmbRating?: number | null;
  gmbReviewCount?: number | null;
  gmbProfileIncomplete?: boolean | null;
  citationsFound?: boolean | null;
  phone?: string;
  email?: string;
};

export type GmbAuditResult = {
  score: number;
  verdict: "Strong" | "Needs Work" | "Urgent";
  summary: string;
  issues: AuditIssue[];
  wins: string[];
  recommendations: string[];
  signals: {
    claimed: boolean | null;
    rating: number | null;
    reviewCount: number | null;
    hasWebsite: boolean;
    profileIncomplete: boolean;
    citationsFound: boolean;
    hasContactSignals: boolean;
  };
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function pushRecommendation(target: string[], value: string): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

export function runGmbAudit(input: GmbAuditInput): GmbAuditResult {
  const issues: AuditIssue[] = [];
  const wins: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  const claimed = input.gmbClaimed ?? null;
  const rating = typeof input.gmbRating === "number" ? input.gmbRating : null;
  const reviewCount = typeof input.gmbReviewCount === "number" ? input.gmbReviewCount : null;
  const hasGmbUrl = Boolean(cleanText(input.gmbUrl));
  const hasWebsite = Boolean(cleanText(input.website));
  const profileIncomplete = Boolean(input.gmbProfileIncomplete);
  const citationsFound = Boolean(input.citationsFound);
  const hasContactSignals = Boolean(cleanText(input.phone) || cleanText(input.email));

  if (claimed === false) {
    score -= 24;
    issues.push({
      severity: "high",
      title: "Listing ownership is not secured",
      detail: "The profile looks unclaimed, which limits control over edits, responses, and optimization.",
    });
    pushRecommendation(recommendations, "Claim or verify the Google Business Profile before running paid or outreach campaigns.");
  } else if (claimed === true) {
    wins.push("Profile appears to be claimed and controllable.");
  } else {
    score -= 8;
    issues.push({
      severity: "medium",
      title: "Ownership status is unknown",
      detail: "The audit could not confirm whether the listing is actively claimed.",
    });
    pushRecommendation(recommendations, "Verify GBP ownership manually so follow-up recommendations can be prioritized correctly.");
  }

  if (rating === null) {
    score -= 8;
    issues.push({
      severity: "medium",
      title: "Rating signal is missing",
      detail: "The profile does not expose a reliable rating signal in the current data.",
    });
    pushRecommendation(recommendations, "Confirm the live listing rating and benchmark it against top local competitors.");
  } else if (rating < 4) {
    score -= 20;
    issues.push({
      severity: "high",
      title: "Review rating is below trust range",
      detail: `Current rating is ${rating.toFixed(1)}, which is weak for local conversion and map-pack confidence.`,
    });
    pushRecommendation(recommendations, "Prioritize review generation and review-response cleanup to move the rating above 4.3 quickly.");
  } else if (rating < 4.3) {
    score -= 12;
    issues.push({
      severity: "medium",
      title: "Rating is acceptable but not competitive",
      detail: `Current rating is ${rating.toFixed(1)} and may still lose clicks to stronger listings nearby.`,
    });
    pushRecommendation(recommendations, "Add a review acquisition loop so the average rating can move into a stronger local range.");
  } else if (rating < 4.5) {
    score -= 6;
    issues.push({
      severity: "low",
      title: "Rating is good but below the 2026 trust sweet spot",
      detail: `Current rating is ${rating.toFixed(1)}. Many local buyers now expect 4.5+ in crowded categories.`,
    });
    pushRecommendation(recommendations, "Sustain review quality and service recovery to move from 4.3-4.4 into a 4.5+ band.");
  } else {
    wins.push(`Rating is strong at ${rating.toFixed(1)} and aligns with current local trust expectations.`);
  }

  if (reviewCount === null) {
    score -= 6;
    issues.push({
      severity: "low",
      title: "Review volume is unknown",
      detail: "The listing data did not expose a review count.",
    });
  } else if (reviewCount < 10) {
    score -= 18;
    issues.push({
      severity: "high",
      title: "Review count is critically low",
      detail: `${reviewCount} reviews is generally too low for stable local trust in 2026.`,
    });
    pushRecommendation(recommendations, "Launch an always-on review request process until the profile crosses at least 20 authentic reviews.");
  } else if (reviewCount < 20) {
    score -= 12;
    issues.push({
      severity: "medium",
      title: "Review depth is below modern baseline",
      detail: `${reviewCount} reviews gives some trust, but many consumers now expect 20+ reviews before choosing a business.`,
    });
    pushRecommendation(recommendations, "Increase review collection cadence and monitor review recency every month.");
  } else if (reviewCount < 50) {
    score -= 5;
    issues.push({
      severity: "low",
      title: "Review profile is decent but can be deepened",
      detail: `${reviewCount} reviews is workable, but stronger categories typically sustain broader proof volume.`,
    });
    pushRecommendation(recommendations, "Maintain steady review requests so profile growth stays consistent quarter over quarter.");
  } else {
    wins.push(`Review volume is strong at ${reviewCount} reviews.`);
  }

  if (profileIncomplete) {
    score -= 14;
    issues.push({
      severity: "high",
      title: "Profile looks incomplete",
      detail: "Important profile fields or trust elements appear to be missing or weak.",
    });
    pushRecommendation(recommendations, "Complete every core GBP field, services list, business description, imagery, and service area setup.");
  } else {
    wins.push("No obvious incomplete-profile flag was found in the stored data.");
  }

  if (!citationsFound) {
    score -= 12;
    issues.push({
      severity: "medium",
      title: "Citation footprint looks weak",
      detail: "The audit did not find a reliable citation signal for the business.",
    });
    pushRecommendation(recommendations, "Strengthen core local citations and keep NAP data consistent across Google, Apple Maps, Yelp, and BBB directories.");
  } else {
    wins.push("Citation signal exists, which supports local trust and entity alignment.");
  }

  if (!hasGmbUrl) {
    score -= 6;
    issues.push({
      severity: "low",
      title: "Direct profile URL is missing",
      detail: "The audit input did not include the live GBP URL, which weakens verification and handoff quality.",
    });
    pushRecommendation(recommendations, "Store the direct Google Business Profile URL so audits, reporting, and ops checks stay traceable.");
  } else {
    wins.push("Direct GBP URL is available for verification and ops workflows.");
  }

  if (!hasWebsite) {
    score -= 12;
    issues.push({
      severity: "high",
      title: "No website connected",
      detail: "Without a solid site or landing page, the listing has fewer conversion and local relevance signals.",
    });
    pushRecommendation(recommendations, "Attach a focused local landing page or main website URL to the listing.");
  } else {
    wins.push("A website is connected to the listing.");
  }

  const hasPhone = Boolean(cleanText(input.phone));
  if (!hasPhone) {
    score -= 8;
    issues.push({
      severity: "medium",
      title: "Phone number is missing on Google Business Profile",
      detail: "No phone number is listed on the profile, which prevents customers from calling your business directly from search results.",
    });
    pushRecommendation(recommendations, "Add a primary phone number to your Google Business Profile to capture direct phone calls.");
  } else {
    wins.push("A phone number is listed on your Google Business Profile.");
  }

  if (cleanText(input.city) || cleanText(input.state)) {
    wins.push(`Location context is set for ${[cleanText(input.city), cleanText(input.state)].filter(Boolean).join(", ")}.`);
  }

  if ((reviewCount ?? 0) < 20 || (rating ?? 0) < 4.5) {
    pushRecommendation(
      recommendations,
      "Use a weekly review operations rhythm: request fresh reviews continuously and reply to every review quickly with personalized responses."
    );
  }

  score = Math.max(0, Math.min(100, score));

  const verdict: GmbAuditResult["verdict"] = score >= 82 ? "Strong" : score >= 60 ? "Needs Work" : "Urgent";
  const summary =
    verdict === "Strong"
      ? "The listing has a workable local foundation with a few targeted improvements left."
      : verdict === "Needs Work"
        ? "The listing can compete, but several weak trust or completeness signals are holding it back."
        : "The listing has major trust or visibility gaps and should be stabilized before aggressive growth pushes.";

  return {
    score,
    verdict,
    summary,
    issues,
    wins,
    recommendations,
    signals: {
      claimed,
      rating,
      reviewCount,
      hasWebsite,
      profileIncomplete,
      citationsFound,
      hasContactSignals,
    },
  };
}