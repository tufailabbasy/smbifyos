import express from "express";
import { getDb } from "../db/database.js";
import { v4 as uuidv4 } from "uuid";
import { generateGeoGridAudit } from "../modules/audits/geoGrid.js";
import { generateCompetitorBenchmark } from "../modules/audits/competitorBenchmark.js";
import { generateNapAudit } from "../modules/audits/napChecker.js";
import { generateReviewSentimentAnalysis } from "../modules/audits/reviewSentiment.js";
import { publicTenant } from "../utils/publicLinks.js";

export const publicRouter = express.Router();

function calculateLetterGrade(score: number | null): { grade: string; label: string; color: string; badgeCls: string } {
  if (score === null || score === undefined) {
    return { grade: "N/A", label: "Unscored", color: "#94a3b8", badgeCls: "bg-slate-100 text-slate-700 border-slate-300" };
  }
  if (score >= 90) return { grade: "A+", label: "Exceptional", color: "#10b981", badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-300" };
  if (score >= 80) return { grade: "A", label: "Good Health", color: "#22c55e", badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (score >= 70) return { grade: "B", label: "Moderate Opportunities", color: "#06b6d4", badgeCls: "bg-cyan-50 text-cyan-700 border-cyan-200" };
  if (score >= 60) return { grade: "C", label: "Needs Optimization", color: "#f59e0b", badgeCls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (score >= 45) return { grade: "D", label: "Significant Risk", color: "#f97316", badgeCls: "bg-orange-50 text-orange-700 border-orange-200" };
  return { grade: "F", label: "Critical Attention Required", color: "#ef4444", badgeCls: "bg-rose-50 text-rose-700 border-rose-200" };
}

// GET /public-api/pitch/:leadId
publicRouter.get("/pitch/:leadId", publicTenant("pitch", "leadId"), (req, res) => {
  try {
    const leadId = String(req.params.leadId);
    const db = getDb();
    
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as any;
    if (!lead) {
      return res.status(404).json({ error: "Pitch profile not found." });
    }

    // Pull Agency White-Label Branding from app_settings
    let agencySettings: any = null;
    try {
      agencySettings = db.prepare("SELECT * FROM app_settings LIMIT 1").get();
    } catch {}

    const agencyBranding = {
      agencyName: agencySettings?.agency_name || "SMBify OS",
      agencyEmail: agencySettings?.agency_email || "team@smbify.net",
      agencyPhone: agencySettings?.agency_phone || "",
      agencyLogoUrl: agencySettings?.agency_logo_url || "",
      defaultCity: agencySettings?.default_city || "",
    };

    // Try to find historical audits to compare progress over time
    const historicalAudits = db.prepare(`
      SELECT id, score, verdict, audit_type, created_at
      FROM audits 
      WHERE lead_id = ? 
         OR (target_name = ? AND target_name != '')
         OR (target_name = ? AND target_name != '')
      ORDER BY datetime(created_at) ASC 
    `).all(leadId, lead.website || "", lead.business_name || "") as any[];

    const latestAuditRow = historicalAudits.length > 0 ? historicalAudits[historicalAudits.length - 1] : null;

    let historyComparison = null;
    const scoredAudits = historicalAudits.filter((audit) => audit.score != null);
    if (scoredAudits.length > 1) {
      const firstAudit = scoredAudits[0];
      const currentAudit = scoredAudits[scoredAudits.length - 1];
      const initialScore = Number(firstAudit.score);
      const currentScore = Number(currentAudit.score);
      const scoreDelta = currentScore - initialScore;
      historyComparison = {
        initialScore,
        initialDate: firstAudit.created_at,
        currentScore,
        currentDate: currentAudit.created_at,
        scoreDelta,
        trend: scoreDelta > 0 ? "improved" : scoreDelta < 0 ? "declined" : "neutral",
        totalAudits: scoredAudits.length,
      };
    }

    const recommendations: Array<{
      title: string;
      description: string;
      whyItMatters: string;
      recommendedFix: string;
      severity: "critical" | "high" | "medium";
    }> = [];

    let auditScore: number | null = lead.last_website_audit_score || lead.last_gmb_audit_score || null;
    let auditVerdict = "";
    let auditSummary = "";
    let aiInsights = null;

    if (latestAuditRow) {
      // Reload full audit row if needed
      const fullAuditRow = db.prepare("SELECT * FROM audits WHERE id = ?").get(latestAuditRow.id) as any;
      auditScore = fullAuditRow.score ?? auditScore;
      auditVerdict = fullAuditRow.verdict || "";
      
      let auditData: any = {};
      try {
        if (fullAuditRow.data_json) {
          auditData = JSON.parse(fullAuditRow.data_json);
        }
      } catch (e) {
        console.error("Error parsing audit data_json in pitch API", e);
      }

      try {
        if (fullAuditRow.ai_insights_json) {
          aiInsights = JSON.parse(fullAuditRow.ai_insights_json);
        }
      } catch (e) {
        console.error("Error parsing audit ai_insights_json in pitch API", e);
      }

      auditSummary = auditData.summary || fullAuditRow.summary || "";

      // 1. Pull real issues from audit
      if (Array.isArray(auditData.issues) && auditData.issues.length > 0) {
        for (const issue of auditData.issues) {
          if (issue && typeof issue === "object") {
            const title = String(issue.title || issue.name || "").trim();
            const detail = String(issue.detail || issue.description || issue.reason || "").trim();
            const rawSev = String(issue.severity || "").toLowerCase();
            const severity: "critical" | "high" | "medium" = 
              rawSev === "high" || rawSev === "critical" || rawSev === "error" 
                ? "critical" 
                : rawSev === "medium" || rawSev === "warning" 
                ? "high" 
                : "medium";

            if (title) {
              recommendations.push({
                title,
                description: detail || `Technical issue detected during automated website and local authority analysis.`,
                whyItMatters: `Search engines demote listings with unresolved errors, directly reducing your discovery rate in local search results.`,
                recommendedFix: `Resolve the underlying technical parameters and re-index the affected URL structure.`,
                severity,
              });
            }
          } else if (typeof issue === "string" && issue.trim()) {
            recommendations.push({
              title: issue.trim(),
              description: `This issue was returned by the measured website audit.`,
              whyItMatters: `Review the cited page evidence and validate the effect in analytics or field data.`,
              recommendedFix: `Address the cited page assets or responsive-layout findings, then rerun the audit.`,
              severity: "high",
            });
          }
        }
      }

      // 2. Pull real recommendations if issues are few
      if (recommendations.length < 3 && Array.isArray(auditData.recommendations)) {
        for (const rec of auditData.recommendations) {
          const recText = typeof rec === "string" ? rec.trim() : typeof rec === "object" && rec?.title ? String(rec.title).trim() : "";
          if (recText && !recommendations.some(r => r.title.toLowerCase() === recText.toLowerCase())) {
            recommendations.push({
              title: recText,
              description: typeof rec === "object" && rec?.detail ? String(rec.detail).trim() : "Recommended action returned by the measured audit.",
              whyItMatters: "Its priority should be confirmed against the audit evidence, business goals, and analytics.",
              recommendedFix: "Implement the cited change and verify it in a follow-up audit.",
              severity: "high",
            });
          }
        }
      }
    }

    // Fallback: If no audit was ever run or audit had no issues, use intelligent gap analysis from lead properties
    if (recommendations.length === 0) {
      if (lead.gmb_claimed === 0) {
        recommendations.push({
          title: "Claim & Verify Google Maps Business Listing",
          description: "The available record indicates that the listing may be unclaimed. Confirm ownership status in Google, then verify the phone number, website, hours, services, and authorized managers.",
          whyItMatters: "Ownership verification enables the business to manage its public profile and respond to changes.",
          recommendedFix: "Submit direct postcard/video verification with Google and claim official owner rights.",
          severity: "critical"
        });
      }

      if (lead.gmb_profile_incomplete === 1 || !lead.phone) {
        recommendations.push({
          title: "Optimize Google Profile Categories & Contact Info",
          description: "The stored profile record is missing contact details or category information. Confirm these fields directly in the live Google Business Profile before reporting the issue.",
          whyItMatters: "Accurate categories and contact details help Google and customers understand the business; rankings require separate live measurement.",
          recommendedFix: "Confirm the most accurate primary category, add only relevant secondary categories, and verify contact details across attributed sources.",
          severity: "high"
        });
      }

      if (lead.gmb_rating && lead.gmb_rating < 4.5) {
        recommendations.push({
          title: `Improve Customer Rating (Currently ${lead.gmb_rating} Stars)`,
          description: "The stored rating is below the selected internal threshold. Review text and conversion analytics were not supplied, so customer behavior is not inferred.",
          whyItMatters: "Rating and review recency are useful profile signals, but their business impact should be measured with profile analytics.",
          recommendedFix: "Use a compliant post-service review request sequence and monitor authentic customer response trends.",
          severity: "high"
        });
      }

      if (lead.has_website === 0 || !lead.website) {
        recommendations.push({
          title: "Deploy Mobile-Friendly Conversion Landing Page",
          description: "No website is stored for this lead. Confirm the live profile before recommending a landing page.",
          whyItMatters: "A website can provide service, trust, and contact information that may not fit in a directory profile.",
          recommendedFix: "Launch a fast, conversion-focused mobile landing page with click-to-call and quote forms.",
          severity: "critical"
        });
      }

      if (recommendations.length === 0) {
        recommendations.push({
          title: "Run Live Profile and Website Verification",
          description: "No measured audit issue was available. Run a live profile and website audit before proposing photo or service changes.",
          whyItMatters: "Recommendations require evidence from the live profile and business analytics.",
          recommendedFix: "Run the live checks, attach source evidence, and create actions only for verified gaps.",
          severity: "medium"
        });
      }
    }

    const effectiveScore = auditScore ?? 0;
    const gradeInfo = calculateLetterGrade(auditScore);

    // Build Structured AI Executive Summary
    const top3Issues = recommendations.slice(0, 3);

    const executiveSummary = {
      headline: aiInsights?.headline || `Executive Digital Authority Summary for ${lead.business_name}`,
      grade: gradeInfo.grade,
      gradeLabel: gradeInfo.label,
      gradeColor: gradeInfo.color,
      overallHealth: aiInsights?.executiveSummary || 
        (auditScore == null
          ? `No completed measured audit is available for ${lead.business_name}. Rankings, traffic, and lead loss are not estimated.`
          : effectiveScore >= 80 
          ? `The completed audit found a solid technical and local-search foundation for ${lead.business_name}. The score reflects measured checks, not a ranking or revenue forecast.`
          : effectiveScore >= 60
          ? `The completed audit found several technical, content, or local-entity gaps for ${lead.business_name}. See the cited evidence before selecting fixes.`
          : `The completed audit found multiple high-priority implementation gaps for ${lead.business_name}. Traffic impact has not been inferred without analytics evidence.`),
      biggestProblem: top3Issues[0] 
        ? `${top3Issues[0].title}: ${top3Issues[0].description}`
        : "No verified primary issue is available until a measured audit is completed.",
      businessImpact: auditScore == null ? "Business impact has not been quantified because analytics, call tracking, and live rank evidence were not supplied." : "The measured audit identifies implementation gaps. Revenue or lead impact requires analytics and call-tracking evidence.",
      recommendedAction: top3Issues[0]
        ? `Execute the prioritized action plan starting with "${top3Issues[0].title}" and measure the result in analytics and call tracking.`
        : `Run a live website and business-profile audit before selecting an optimization plan.`,
    };

    // Generate Phase 2 Local SEO depth reports
    const targetKeyword = `${lead.niche || "Service"} in ${lead.city || "Area"}`;
    const geoGrid = generateGeoGridAudit({
      businessName: lead.business_name,
      keyword: targetKeyword,
      city: lead.city,
      state: lead.state,
      radiusMiles: 5,
      gridSize: 5,
      baseScore: effectiveScore,
    });

    const competitorBenchmark = generateCompetitorBenchmark({
      leadId: lead.id,
      businessName: lead.business_name,
      niche: lead.niche || "Local Business",
      city: lead.city || "Local Area",
      rating: lead.gmb_rating,
      reviewCount: lead.gmb_review_count,
      claimed: lead.gmb_claimed,
      websiteScore: auditScore,
    });

    const napReport = generateNapAudit({
      businessName: lead.business_name,
      city: lead.city,
      state: lead.state,
      phone: lead.phone,
      website: lead.website,
      baseScore: effectiveScore,
    });

    const reviewSentiment = generateReviewSentimentAnalysis({
      businessName: lead.business_name,
      niche: lead.niche,
      rating: lead.gmb_rating,
      reviewCount: lead.gmb_review_count,
    });

    res.json({
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        niche: lead.niche || "Local Business",
        city: lead.city,
        state: lead.state,
        gmb_rating: lead.gmb_rating,
        gmb_review_count: lead.gmb_review_count,
        gmb_claimed: lead.gmb_claimed,
        has_website: lead.has_website,
        website: lead.website
      },
      audit: {
        score: auditScore,
        verdict: auditVerdict || gradeInfo.label,
        summary: auditSummary || executiveSummary.overallHealth,
        grade: gradeInfo.grade,
        gradeLabel: gradeInfo.label,
        gradeColor: gradeInfo.color,
        aiInsights,
        createdAt: latestAuditRow?.created_at || new Date().toISOString(),
      },
      executiveSummary,
      letterGrade: gradeInfo,
      top3Issues,
      recommendations: recommendations.slice(0, 6),
      historyComparison,
      agencyBranding,
      geoGrid,
      competitorBenchmark,
      napReport,
      reviewSentiment,
    });
  } catch (error: any) {
    console.error("[public-api] Error fetching public pitch:", error);
    res.status(500).json({ error: "Failed to load pitch profile." });
  }
});

// POST /public-api/pitch/:leadId/accept
publicRouter.post("/pitch/:leadId/accept", publicTenant("pitch", "leadId"), (req, res) => {
  try {
    const leadId = String(req.params.leadId);
    const { name, phone, message, preferredTime } = req.body;
    const db = getDb();

    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as any;
    if (!lead) {
      return res.status(404).json({ error: "Lead profile not found." });
    }

    // Update status to negotiating/proposal_sent if it's new/contacted
    if (lead.status === "new" || lead.status === "contacted") {
      db.prepare("UPDATE leads SET status = 'negotiating', updated_at = datetime('now') WHERE id = ?").run(leadId);
    }

    // Insert an activity record for the client callback request
    const activityId = uuidv4();
    const activityMessage = `Pitch Portal Callback Request: ${name} requested a free audit consultation.`;
    const metadata = {
      client_name: name,
      client_phone: phone || lead.phone,
      client_message: message || "No message provided",
      preferred_time: preferredTime || "As soon as possible"
    };

    db.prepare(`
      INSERT INTO lead_activities (id, lead_id, activity_type, message, metadata_json, created_at)
      VALUES (?, ?, 'proposal_accepted', ?, ?, datetime('now'))
    `).run(activityId, leadId, activityMessage, JSON.stringify(metadata));

    res.json({ success: true, message: "Callback requested successfully! Our team will contact you shortly." });
  } catch (error: any) {
    console.error("[public-api] Error accepting pitch request:", error);
    res.status(500).json({ error: "Failed to register callback request." });
  }
});

// GET /public-api/portal/:clientId
publicRouter.get("/portal/:clientId", publicTenant("portal", "clientId"), (req, res) => {
  try {
    const clientId = String(req.params.clientId);
    const db = getDb();

    let client = db.prepare("SELECT * FROM seo_clients WHERE id = ?").get(clientId) as any;
    if (!client) {
      // Try resolving by business id
      client = db.prepare(`
        SELECT c.* 
        FROM seo_clients c
        JOIN client_businesses b ON b.client_id = c.id
        WHERE b.id = ?
        LIMIT 1
      `).get(clientId) as any;
    }

    if (!client) {
      return res.status(404).json({ error: "Client portal not found." });
    }

    // Pull Agency White-Label Branding
    let agencySettings: any = null;
    try {
      agencySettings = db.prepare("SELECT * FROM app_settings LIMIT 1").get();
    } catch {}

    const agencyBranding = {
      agencyName: agencySettings?.agency_name || "SMBify OS",
      agencyEmail: agencySettings?.agency_email || "team@smbify.net",
      agencyPhone: agencySettings?.agency_phone || "",
      agencyLogoUrl: agencySettings?.agency_logo_url || "",
      defaultCity: agencySettings?.default_city || "",
    };

    // Pull businesses
    const businesses = db.prepare("SELECT * FROM client_businesses WHERE client_id = ?").all(client.id) as any[];
    const primaryBiz = businesses[0] || {
      name: client.name,
      city: agencyBranding.defaultCity || "Local Area",
      state: "US",
      service_type: "SEO Client",
      website: "",
    };

    // Pull historical audits for this client / businesses
    const historicalAudits = db.prepare(`
      SELECT id, score, verdict, audit_type, target_name, data_json, created_at
      FROM audits
      WHERE client_id = ?
         OR (target_name = ? AND target_name != '')
      ORDER BY datetime(created_at) ASC
    `).all(client.id, client.name) as any[];

    const latestAuditRow = historicalAudits.length > 0 ? historicalAudits[historicalAudits.length - 1] : null;
    const measuredScore = latestAuditRow?.score == null ? null : Number(latestAuditRow.score);
    const effectiveScore = measuredScore ?? 0;
    const gradeInfo = calculateLetterGrade(measuredScore);

    let historyComparison = null;
    const scoredAudits = historicalAudits.filter((audit) => audit.score != null);
    if (scoredAudits.length > 1) {
      const firstAudit = scoredAudits[0];
      const currentAudit = scoredAudits[scoredAudits.length - 1];
      const initialScore = Number(firstAudit.score);
      const currentScore = Number(currentAudit.score);
      const scoreDelta = currentScore - initialScore;
      historyComparison = {
        initialScore,
        initialDate: firstAudit.created_at,
        currentScore,
        currentDate: currentAudit.created_at,
        scoreDelta,
        trend: scoreDelta > 0 ? "improved" : scoreDelta < 0 ? "declined" : "neutral",
        totalAudits: scoredAudits.length,
      };
    }

    // Pull tasks and deliverables
    let tasks: any[] = [];
    try {
      tasks = db.prepare(`
        SELECT id, title, description, status, priority, due_date, completed_at
        FROM seo_tasks
        WHERE client_id = ?
        ORDER BY status DESC, datetime(due_date) ASC
        LIMIT 10
      `).all(client.id) as any[];
    } catch {}

    // Generate live local reports
    const targetKeyword = `${primaryBiz.service_type || "Service"} in ${primaryBiz.city || "Area"}`;
    const geoGrid = generateGeoGridAudit({
      businessName: primaryBiz.name,
      keyword: targetKeyword,
      city: primaryBiz.city,
      state: primaryBiz.state,
      baseScore: effectiveScore,
    });

    const competitorBenchmark = generateCompetitorBenchmark({
      businessName: primaryBiz.name,
      niche: primaryBiz.service_type || "Local Business",
      city: primaryBiz.city || "Local Area",
      websiteScore: measuredScore,
    });

    const napReport = generateNapAudit({
      businessName: primaryBiz.name,
      city: primaryBiz.city,
      state: primaryBiz.state,
      phone: primaryBiz.contact_phone || client.contact_phone,
      website: primaryBiz.website,
      baseScore: effectiveScore,
    });

    const reviewSentiment = generateReviewSentimentAnalysis({
      businessName: primaryBiz.name,
      niche: primaryBiz.service_type,
      rating: null,
      reviewCount: null,
    });

    res.json({
      client: {
        id: client.id,
        name: client.name,
        primary_contact: client.primary_contact,
        contact_email: client.contact_email,
        contact_phone: client.contact_phone,
        lifecycle_stage: client.lifecycle_stage,
        monthly_budget_total: client.monthly_budget_total,
      },
      businesses,
      latestAudit: {
        score: measuredScore,
        verdict: latestAuditRow?.verdict || gradeInfo.label,
        grade: gradeInfo.grade,
        gradeLabel: gradeInfo.label,
        gradeColor: gradeInfo.color,
        createdAt: latestAuditRow?.created_at || new Date().toISOString(),
      },
      historyComparison,
      tasks,
      geoGrid,
      competitorBenchmark,
      napReport,
      reviewSentiment,
      agencyBranding,
    });
  } catch (error: any) {
    console.error("[public-api] Error fetching client portal:", error);
    res.status(500).json({ error: "Failed to load client portal." });
  }
});
