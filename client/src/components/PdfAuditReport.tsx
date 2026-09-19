import { jsPDF, GState } from "jspdf";
import "jspdf-autotable";
import { getPdfBranding } from "../lib/pdfBranding";
import type {
  SeoAudit,
  WebsiteAuditResult,
  GmbAuditResult,
  WebsiteAuditCategory,
  WebsiteAuditModule,
  WebsiteAuditEvidenceHighlight,
  WebsiteAuditTopPage,
} from "../lib/api";

/* ═══════════════════════════════════════════════════════
   BRAND PALETTE — Rich, bold colors inspired by
   the reference HTML report style
   ═══════════════════════════════════════════════════════ */
const BRAND   = { r: 94,  g: 106, b: 210 }; // #5e6ad2
const BRAND_L = { r: 129, g: 140, b: 248 }; // lighter brand
const NAVY    = { r: 13,  g: 27,  b: 42  }; // #0d1b1a — deep dark
const DARK    = { r: 26,  g: 26,  b: 46  }; // #1a1a2e — headings
const SLATE7  = { r: 55,  g: 65,  b: 81  }; // #374151 — body text
const SLATE5  = { r: 100, g: 116, b: 139 }; // #64748b — captions
const SLATE4  = { r: 148, g: 163, b: 184 };
const SLATE2  = { r: 226, g: 232, b: 240 };
const WHITE   = { r: 255, g: 255, b: 255 };

const RED     = { r: 239, g: 68,  b: 68  };
const RED_BG  = { r: 255, g: 245, b: 245 };
const AMBER   = { r: 245, g: 158, b: 11  };
const AMBER_BG= { r: 255, g: 251, b: 235 };
const GREEN   = { r: 34,  g: 197, b: 94  };
const GREEN_BG= { r: 240, g: 253, b: 244 };
const BLUE    = { r: 59,  g: 130, b: 246 };
const BLUE_BG = { r: 239, g: 246, b: 255 };

/* ── Helpers ────────────────────────────────────────── */
const PW = 210;
const M  = 18;
const CW = PW - M * 2;

function scoreColor(s: number) { return s >= 78 ? GREEN : s >= 56 ? AMBER : RED; }
function sevColor(s: string)   { return s === "high" ? RED : s === "medium" ? AMBER : BLUE; }
function sevBg(s: string)      { return s === "high" ? RED_BG : s === "medium" ? AMBER_BG : BLUE_BG; }
function sevLabel(s: string)   { return s === "high" ? "CRITICAL" : s === "medium" ? "HIGH" : "IMPROVEMENT"; }

function ensure(doc: jsPDF, needed: number, y: number): number {
  if (y + needed > doc.internal.pageSize.getHeight() - 22) { doc.addPage(); return 24; }
  return y;
}

/* ── Section header with colored icon box ── */
function sectionHead(doc: jsPDF, title: string, emoji: string, iconBg: { r: number; g: number; b: number }, y: number): number {
  y = ensure(doc, 18, y);
  // Icon box
  doc.setFillColor(iconBg.r, iconBg.g, iconBg.b);
  doc.roundedRect(M, y, 11, 11, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(emoji, M + 5.5, y + 7.5, { align: "center" });
  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(title, M + 16, y + 8.5);
  // Line
  const tw = doc.getTextWidth(title);
  doc.setDrawColor(SLATE2.r, SLATE2.g, SLATE2.b);
  doc.setLineWidth(0.4);
  doc.line(M + 19 + tw, y + 6.5, M + CW, y + 6.5);
  return y + 18;
}

/* ═══════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════ */
export async function generateAuditPdf(audit: SeoAudit): Promise<void> {
  const branding = await getPdfBranding(true);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pH = doc.internal.pageSize.getHeight();

  const result = audit.result as WebsiteAuditResult | GmbAuditResult;
  const isAdv = "auditVersion" in result && result.auditVersion === "advanced";
  const categories: WebsiteAuditCategory[] = (isAdv && "categories" in result ? result.categories : undefined) ?? [];
  const modules: WebsiteAuditModule[] = (isAdv && "modules" in result ? result.modules : undefined) ?? [];
  const evidence: WebsiteAuditEvidenceHighlight[] = (isAdv && "evidenceHighlights" in result ? result.evidenceHighlights : undefined) ?? [];
  const roadmap: string[] = (isAdv && "priorityRoadmap" in result ? result.priorityRoadmap : undefined) ?? [];
  const topPages: WebsiteAuditTopPage[] = (isAdv && "topPages" in result ? result.topPages : undefined) ?? [];
  const score = audit.score ?? 0;
  const sc = scoreColor(score);
  const highCount = result.issues.filter((i: any) => i.severity === "high").length;
  const medCount  = result.issues.filter((i: any) => i.severity === "medium").length;
  const lowCount  = result.issues.filter((i: any) => i.severity === "low").length;
  const passCount = (modules.filter(m => m.status === "pass").length) + (result.wins?.length || 0);

  /* ═══════════════════════════════════════════════════
     COVER SECTION — Agency header strip + audit hero
     Agency branding at top, audit target clearly separated
     ═══════════════════════════════════════════════════ */

  /* ── 1. Agency branding strip (top 18mm) ── */
  const agencyBarH = 18;
  doc.setFillColor(WHITE.r, WHITE.g, WHITE.b);
  doc.rect(0, 0, PW, agencyBarH, "F");
  // Subtle bottom border
  doc.setDrawColor(SLATE2.r, SLATE2.g, SLATE2.b);
  doc.setLineWidth(0.3);
  doc.line(0, agencyBarH, PW, agencyBarH);

  let agencyX = M;
  if (branding.logoDataUrl) {
    try {
      const ls = 12;
      const fmt = branding.logoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(branding.logoDataUrl, fmt, M, 3, ls, ls, undefined, "FAST");
      agencyX = M + ls + 4;
    } catch { /* skip */ }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(branding.agencyName, agencyX, 11);
  // "Prepared by" label on the right side
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(SLATE5.r, SLATE5.g, SLATE5.b);
  doc.text("Prepared by", PW - M, 8, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text(branding.agencyName, PW - M, 13, { align: "right" });

  /* ── 2. Audit hero (dark gradient, about the TARGET) ── */
  const coverTop = agencyBarH;
  const coverH = 92;

  // Dark gradient background
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, coverTop, PW, coverH, "F");
  // Subtle glow circles
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setGState(new GState({ opacity: 0.06 }));
  doc.rect(0, coverTop, PW, coverH, "F");
  doc.setGState(new GState({ opacity: 0.04 }));
  doc.circle(PW - 20, coverTop + 15, 55, "F");
  doc.circle(30, coverTop + coverH - 10, 40, "F");
  doc.setGState(new GState({ opacity: 1 }));

  // Brand accent line at bottom
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, coverTop + coverH, PW, 3, "F");

  // --- Badge ---
  const badgeText = audit.audit_type === "gmb" ? "GMB LISTING AUDIT REPORT" : "WEBSITE AUDIT REPORT";
  doc.setFillColor(255, 255, 255);
  doc.setGState(new GState({ opacity: 0.15 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const badgeW = doc.getTextWidth(badgeText) + 16;
  doc.roundedRect(M, coverTop + 10, badgeW, 9, 4, 4, "F");
  doc.setGState(new GState({ opacity: 1 }));
  doc.setTextColor(BRAND_L.r, BRAND_L.g, BRAND_L.b);
  doc.text(badgeText, M + 8, coverTop + 16);

  // --- Audit Target Details (wrapped cleanly to avoid overlap) ---
  const maxHeroTextWidth = 115; // mm (PW is 210, M is 18, score ring left edge is at 144)

  doc.setFont("helvetica", "bold");
  const targetLabel = audit.target_name || "Audit Report";
  const nameFontSize = targetLabel.length > 25 ? 18 : 22;
  doc.setFontSize(nameFontSize);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  const targetLines = doc.splitTextToSize(targetLabel, maxHeroTextWidth) as string[];
  
  let currentY = coverTop + 27;
  targetLines.forEach((line) => {
    doc.text(line, M, currentY);
    currentY += (nameFontSize === 22 ? 8.5 : 7.0);
  });

  // --- Target URL ---
  const targetUrl = ("metrics" in result && result.metrics?.normalizedUrl) || "";
  if (targetUrl) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(SLATE4.r, SLATE4.g, SLATE4.b);
    
    // Clean up UTM and tracking query parameters for display
    let cleanUrl = targetUrl;
    try {
      const urlObj = new URL(targetUrl);
      const paramsToRemove = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
      paramsToRemove.forEach(p => urlObj.searchParams.delete(p));
      cleanUrl = urlObj.toString();
      if (urlObj.pathname === "/" && !urlObj.search) {
        cleanUrl = cleanUrl.replace(/\/$/, "");
      }
    } catch {
      if (cleanUrl.includes("?utm_")) {
        cleanUrl = cleanUrl.split("?")[0];
      }
    }

    const urlLines = doc.splitTextToSize(cleanUrl, maxHeroTextWidth) as string[];
    urlLines.forEach((line) => {
      doc.text(line, M, currentY);
      currentY += 4.5;
    });
    currentY += 1.5;
  }

  // --- Date ---
  if (audit.created_at) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(SLATE4.r, SLATE4.g, SLATE4.b);
    const dateStr = `Audit Date: ${new Date(audit.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
    doc.text(dateStr, M, currentY);
  }

  // --- Meta stats row ---
  const statItems = [
    { num: String(highCount), lbl: "ERRORS" },
    { num: String(medCount), lbl: "WARNINGS" },
    { num: String(lowCount), lbl: "IMPROVEMENTS" },
    { num: String(passCount), lbl: "PASSED" },
  ];
  const statGap = 32;
  const statY = coverTop + 60;
  statItems.forEach((item, i) => {
    const sx = M + i * statGap;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(BRAND_L.r, BRAND_L.g, BRAND_L.b);
    doc.text(item.num, sx, statY);
    doc.setFontSize(7);
    doc.setTextColor(SLATE4.r, SLATE4.g, SLATE4.b);
    doc.text(item.lbl, sx, statY + 6);
  });

  // --- Score (right side, prominent) ---
  const scoreX = PW - M - 22;
  const scoreY = coverTop + 38;

  // Glow behind score
  doc.setFillColor(sc.r, sc.g, sc.b);
  doc.setGState(new GState({ opacity: 0.12 }));
  doc.circle(scoreX, scoreY, 26, "F");
  doc.setGState(new GState({ opacity: 1 }));

  // Score ring
  doc.setDrawColor(255, 255, 255);
  doc.setGState(new GState({ opacity: 0.1 }));
  doc.setLineWidth(5);
  doc.circle(scoreX, scoreY, 20, "S");
  doc.setGState(new GState({ opacity: 1 }));
  // Active arc
  const pct = Math.min(score / 100, 1);
  const arcAngle = pct * 2 * Math.PI;
  const arcSteps = Math.max(60, Math.round(pct * 120));
  const arcStart = -Math.PI / 2;
  doc.setDrawColor(sc.r, sc.g, sc.b);
  doc.setLineWidth(5);
  for (let i = 0; i < arcSteps; i++) {
    const a1 = arcStart + (i / arcSteps) * arcAngle;
    const a2 = arcStart + ((i + 1) / arcSteps) * arcAngle;
    doc.line(scoreX + 20 * Math.cos(a1), scoreY + 20 * Math.sin(a1), scoreX + 20 * Math.cos(a2), scoreY + 20 * Math.sin(a2));
  }

  // Score number (BIG, WHITE)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.text(String(score), scoreX, scoreY + 5, { align: "center" });
  doc.setFontSize(10);
  doc.setTextColor(SLATE4.r, SLATE4.g, SLATE4.b);
  doc.text("/100", scoreX, scoreY + 13, { align: "center" });

  // Verdict badge
  if (audit.verdict) {
    doc.setFillColor(sc.r, sc.g, sc.b);
    const vt = audit.verdict.toUpperCase();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const vw = doc.getTextWidth(vt) + 14;
    doc.roundedRect(scoreX - vw / 2, scoreY + 18, vw, 9, 4, 4, "F");
    doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    doc.text(vt, scoreX, scoreY + 24, { align: "center" });
  }

  let y = coverTop + coverH + 12;

  /* ═══════ SCORE SUMMARY BOX ═══════ */
  if (result.summary) {
    y = ensure(doc, 32, y);
    // Dark gradient box (like reference score-box)
    doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    const sumLines = doc.splitTextToSize(result.summary, CW - 20);
    const boxH = Math.max(24, 12 + sumLines.length * 5);
    doc.roundedRect(M, y, CW, boxH, 5, 5, "F");
    // Accent left bar
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.roundedRect(M + 3, y + 5, 2.5, boxH - 10, 1.25, 1.25, "F");
    // Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(200, 210, 230);
    doc.text(sumLines, M + 12, y + 10);
    y += boxH + 10;
  }

  /* ═══════ CATEGORY SCORES ═══════ */
  if (categories.length > 0) {
    y = sectionHead(doc, "Category Scores", "S", BLUE_BG, y);
    for (const cat of categories) {
      y = ensure(doc, 22, y);
      const col = scoreColor(cat.score);
      // Card
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(M, y, CW, 20, 4, 4, "F");
      doc.setDrawColor(SLATE2.r, SLATE2.g, SLATE2.b);
      doc.setLineWidth(0.3);
      doc.roundedRect(M, y, CW, 20, 4, 4, "S");
      // Score pill
      doc.setFillColor(col.r, col.g, col.b);
      doc.roundedRect(M + 4, y + 4, 22, 12, 5, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
      doc.text(String(cat.score), M + 15, y + 12.5, { align: "center" });
      // Label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(cat.label, M + 30, y + 10);
      // Progress bar
      doc.setFillColor(SLATE2.r, SLATE2.g, SLATE2.b);
      doc.roundedRect(M + 30, y + 14, 44, 2.5, 1.25, 1.25, "F");
      doc.setFillColor(col.r, col.g, col.b);
      doc.roundedRect(M + 30, y + 14, Math.max(1, 44 * (cat.score / 100)), 2.5, 1.25, 1.25, "F");
      // Summary
      if (cat.summary) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(SLATE5.r, SLATE5.g, SLATE5.b);
        const st = doc.splitTextToSize(cat.summary, CW - 82);
        doc.text(st[0] || "", M + 78, y + 10);
        if (st[1]) doc.text(st[1], M + 78, y + 15);
      }
      y += 24;
    }
    y += 6;
  }

  /* ═══════ KEY ISSUES — Color-coded cards with left border ═══════ */
  if (result.issues.length > 0) {
    y = sectionHead(doc, "Issues Found", "!", { r: 254, g: 226, b: 226 }, y);
    result.issues.forEach((issue, idx) => {
      y = ensure(doc, 28, y);
      const bg = sevBg(issue.severity);
      const col = sevColor(issue.severity);
      const titleLines = doc.splitTextToSize(issue.title, CW - 50);
      const detailLines = doc.splitTextToSize(issue.detail, CW - 20);
      const cardH = 14 + titleLines.length * 5 + detailLines.length * 4.5;

      // Card background
      doc.setFillColor(bg.r, bg.g, bg.b);
      doc.roundedRect(M, y, CW, cardH, 4, 4, "F");
      // Left border (4px like reference)
      doc.setFillColor(col.r, col.g, col.b);
      doc.roundedRect(M, y, 4, cardH, 2, 2, "F");

      // Severity tag badge
      const tagText = sevLabel(issue.severity);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      const tagW = doc.getTextWidth(tagText) + 10;
      // Tag bg
      const tagBgMap: Record<string, { r: number; g: number; b: number }> = {
        high: { r: 254, g: 226, b: 226 },
        medium: { r: 254, g: 243, b: 199 },
        low: { r: 219, g: 234, b: 254 },
      };
      const tagTextMap: Record<string, { r: number; g: number; b: number }> = {
        high: { r: 185, g: 28, b: 28 },
        medium: { r: 146, g: 64, b: 14 },
        low: { r: 30, g: 64, b: 175 },
      };
      const tBg = tagBgMap[issue.severity] || tagBgMap.low;
      const tTx = tagTextMap[issue.severity] || tagTextMap.low;
      doc.setFillColor(tBg.r, tBg.g, tBg.b);
      doc.roundedRect(M + 10, y + 4, tagW, 7, 3, 3, "F");
      doc.setTextColor(tTx.r, tTx.g, tTx.b);
      doc.text(tagText, M + 10 + 5, y + 9);

      // Issue number + title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(`${idx + 1}. ${titleLines[0]}`, M + 10 + tagW + 4, y + 9);
      if (titleLines[1]) {
        doc.text(titleLines[1], M + 10, y + 14);
      }

      // Detail
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(SLATE7.r, SLATE7.g, SLATE7.b);
      const detY = y + 10 + titleLines.length * 5;
      doc.text(detailLines, M + 10, detY);

      y += cardH + 5;
    });
    y += 4;
  }

  /* ═══════ KEY METRICS GRID ═══════ */
  if ("metrics" in result && result.metrics) {
    const m = result.metrics as any;
    const items: Array<{ label: string; value: string }> = [
      { label: "Pages Crawled", value: String(m.pagesCrawled ?? 1) },
      { label: "Avg Word Count", value: String(m.averageWordCount ?? m.wordCount ?? "-") },
      { label: "HTTPS", value: m.usesHttps ? "Yes" : "No" },
      { label: "Schema", value: m.pagesWithSchema != null ? `${Math.round((m.pagesWithSchema / Math.max(1, m.pagesCrawled ?? 1)) * 100)}%` : m.hasSchema ? "Yes" : "No" },
      { label: "Broken Pages", value: String(m.brokenPages ?? 0) },
      { label: "Avg Response", value: m.averageResponseTimeMs ? `${m.averageResponseTimeMs}ms` : "-" },
      { label: "Missing Alt", value: String(m.imagesWithoutAlt ?? 0) },
      { label: "Internal Links", value: String(m.internalLinks ?? "-") },
      { label: "Robots.txt", value: m.hasRobotsTxt != null ? (m.hasRobotsTxt ? "Yes" : "No") : "-" },
      { label: "Sitemap", value: m.hasSitemapXml != null ? (m.hasSitemapXml ? "Yes" : "No") : "-" },
    ].filter(it => it.value !== "-");

    if (items.length > 0) {
      y = sectionHead(doc, "Key Metrics", "#", BLUE_BG, y);
      const cols = 5;
      const colW = (CW - (cols - 1) * 3) / cols;
      for (let i = 0; i < items.length; i++) {
        const col = i % cols;
        if (i > 0 && col === 0) y += 24;
        y = ensure(doc, 24, y);
        const mx = M + col * (colW + 3);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(mx, y, colW, 20, 3, 3, "F");
        doc.setDrawColor(SLATE2.r, SLATE2.g, SLATE2.b);
        doc.setLineWidth(0.25);
        doc.roundedRect(mx, y, colW, 20, 3, 3, "S");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(SLATE5.r, SLATE5.g, SLATE5.b);
        doc.text(items[i].label.toUpperCase(), mx + 3, y + 7);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        doc.text(items[i].value, mx + 3, y + 16);
      }
      y += 28;
    }
  }

  /* ═══════ EVIDENCE HIGHLIGHTS ═══════ */
  if (evidence.length > 0) {
    y = sectionHead(doc, "Evidence Highlights", "E", GREEN_BG, y);
    const cols = 4;
    const colW = (CW - (cols - 1) * 3) / cols;
    for (let i = 0; i < evidence.length; i++) {
      const col = i % cols;
      if (i > 0 && col === 0) y += 28;
      y = ensure(doc, 28, y);
      const ex = M + col * (colW + 3);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(ex, y, colW, 24, 3, 3, "F");
      doc.setDrawColor(SLATE2.r, SLATE2.g, SLATE2.b);
      doc.setLineWidth(0.25);
      doc.roundedRect(ex, y, colW, 24, 3, 3, "S");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(SLATE5.r, SLATE5.g, SLATE5.b);
      doc.text(evidence[i].label.toUpperCase(), ex + 4, y + 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(String(evidence[i].value), ex + 4, y + 18);
    }
    y += 32;
  }

  /* ═══════ AUDIT CHECKS TABLE ═══════ */
  if (modules.length > 0) {
    y = sectionHead(doc, "Audit Checks", "C", AMBER_BG, y);
    // Table header
    y = ensure(doc, 14, y);
    doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    doc.roundedRect(M, y, CW, 10, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    doc.text("STATUS", M + 5, y + 7);
    doc.text("MODULE", M + 30, y + 7);
    doc.text("DETAIL", M + 90, y + 7);
    y += 12;

    modules.forEach((mod, i) => {
      y = ensure(doc, 14, y);
      const rowBg = i % 2 === 0 ? { r: 248, g: 250, b: 252 } : WHITE;
      doc.setFillColor(rowBg.r, rowBg.g, rowBg.b);
      doc.rect(M, y, CW, 10, "F");

      // Status badge
      const statusCol = mod.status === "pass" ? GREEN : mod.status === "warning" ? AMBER : RED;
      const statusBg = mod.status === "pass" ? GREEN_BG : mod.status === "warning" ? AMBER_BG : RED_BG;
      const statusText = mod.status.toUpperCase();
      doc.setFillColor(statusBg.r, statusBg.g, statusBg.b);
      doc.roundedRect(M + 3, y + 2, 22, 6, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(statusCol.r, statusCol.g, statusCol.b);
      doc.text(statusText, M + 14, y + 6.5, { align: "center" });

      // Module name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(mod.label, M + 30, y + 7);

      // Detail (truncated)
      if (mod.detail) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(SLATE7.r, SLATE7.g, SLATE7.b);
        const dt = doc.splitTextToSize(mod.detail, CW - 92);
        doc.text(dt[0] || "", M + 90, y + 7);
      }

      // Separator
      doc.setDrawColor(SLATE2.r, SLATE2.g, SLATE2.b);
      doc.setLineWidth(0.15);
      doc.line(M, y + 10, M + CW, y + 10);
      y += 11;
    });
    y += 6;
  }

  /* ═══════ PRIORITY RECOMMENDATIONS ═══════ */
  if (result.recommendations.length > 0) {
    y = sectionHead(doc, "Priority Recommendations", "F", BLUE_BG, y);
    result.recommendations.forEach((rec, i) => {
      y = ensure(doc, 16, y);
      // Number circle
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.circle(M + 6, y + 5, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
      doc.text(String(i + 1), M + 6, y + 7.5, { align: "center" });
      // Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(SLATE7.r, SLATE7.g, SLATE7.b);
      const rl = doc.splitTextToSize(rec, CW - 22);
      doc.text(rl, M + 16, y + 7);
      y += 4 + rl.length * 5 + 5;
    });
    y += 4;
  }

  /* ═══════ WHAT IS WORKING — Green cards ═══════ */
  if (result.wins && result.wins.length > 0) {
    y = sectionHead(doc, "What Is Already Working", "W", GREEN_BG, y);
    for (const w of result.wins) {
      y = ensure(doc, 16, y);
      const wl = doc.splitTextToSize(w, CW - 22);
      const wH = 8 + wl.length * 5;
      // Green card
      doc.setFillColor(GREEN_BG.r, GREEN_BG.g, GREEN_BG.b);
      doc.roundedRect(M, y, CW, wH, 3, 3, "F");
      doc.setFillColor(GREEN.r, GREEN.g, GREEN.b);
      doc.roundedRect(M, y, 3, wH, 1.5, 1.5, "F");
      // Checkmark
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(GREEN.r, GREEN.g, GREEN.b);
      doc.text("\u2713", M + 8, y + 6);
      // Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(SLATE7.r, SLATE7.g, SLATE7.b);
      doc.text(wl, M + 16, y + 6);
      y += wH + 3;
    }
    y += 4;
  }

  /* ═══════ PRIORITY ROADMAP ═══════ */
  if (roadmap.length > 0) {
    y = sectionHead(doc, "Action Roadmap", "R", AMBER_BG, y);
    // Gradient box like reference tips-box
    const roadmapH = 10 + roadmap.length * 16;
    y = ensure(doc, roadmapH, y);
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(M, y, CW, roadmapH, 5, 5, "F");
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.5);
    doc.roundedRect(M, y, CW, roadmapH, 5, 5, "S");

    let ry = y + 8;
    roadmap.forEach((step, i) => {
      // Number circle
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.circle(M + 10, ry + 3, 4.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
      doc.text(String(i + 1), M + 10, ry + 5.5, { align: "center" });
      // Text
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(SLATE7.r, SLATE7.g, SLATE7.b);
      const sl = doc.splitTextToSize(step, CW - 30);
      doc.text(sl[0] || "", M + 20, ry + 5);
      // Separator
      if (i < roadmap.length - 1) {
        doc.setDrawColor(220, 230, 240);
        doc.setLineWidth(0.2);
        doc.line(M + 20, ry + 10, M + CW - 6, ry + 10);
      }
      ry += 14;
    });
    y += roadmapH + 8;
  }

  /* ═══════ TOP PROBLEM PAGES ═══════ */
  if (topPages.length > 0) {
    y = sectionHead(doc, "Top Problem Pages", "P", RED_BG, y);
    for (const page of topPages) {
      y = ensure(doc, 26, y);
      const urlLines = doc.splitTextToSize(page.url, CW - 14);
      const sumLines = doc.splitTextToSize(page.summary, CW - 14);
      const cardH = 16 + urlLines.length * 4 + sumLines.length * 4;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(M, y, CW, cardH, 4, 4, "F");
      doc.setDrawColor(SLATE2.r, SLATE2.g, SLATE2.b);
      doc.setLineWidth(0.3);
      doc.roundedRect(M, y, CW, cardH, 4, 4, "S");
      // URL
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(urlLines, M + 6, y + 8);
      // Meta
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(SLATE5.r, SLATE5.g, SLATE5.b);
      doc.text(`${page.pageRole}  \u2022  Depth ${page.depth}  \u2022  Issue Weight ${page.issueWeight}`, M + 6, y + 8 + urlLines.length * 4 + 3);
      // Summary
      doc.setFontSize(8.5);
      doc.setTextColor(SLATE7.r, SLATE7.g, SLATE7.b);
      doc.text(sumLines, M + 6, y + 8 + urlLines.length * 4 + 8);
      y += cardH + 4;
    }
  }

  /* ═══════ FOOTER — Dark, branded, on every page ═══════ */
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // Dark footer bar
    doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    doc.rect(0, pH - 16, PW, 16, "F");
    // Brand accent line
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(0, pH - 16, PW, 1, "F");
    // Footer text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(BRAND_L.r, BRAND_L.g, BRAND_L.b);
    doc.text(branding.agencyName, M, pH - 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(SLATE4.r, SLATE4.g, SLATE4.b);
    doc.text(`\u2022  ${audit.target_name}  \u2022  Confidential`, M + doc.getTextWidth(branding.agencyName) + 3, pH - 7);
    doc.text(`Page ${p} of ${totalPages}`, PW - M, pH - 7, { align: "right" });
    // Small logo in footer center
    if (branding.logoDataUrl) {
      try {
        const fmt = branding.logoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
        doc.addImage(branding.logoDataUrl, fmt, PW / 2 - 4, pH - 14, 8, 8, undefined, "FAST");
      } catch { /* skip */ }
    }
  }

  /* ═══════ SAVE ═══════ */
  const fileSlug = audit.target_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  doc.save(`${fileSlug}-audit-report.pdf`);
}
