import { jsPDF } from "jspdf";
import type { StagedLeadAuditPreview, StagedScrapedLead } from "./api";
import { drawFramedPdfLogo, getPdfBranding } from "./pdfBranding";

type LeadAuditPdfOptions = {
  lead: StagedScrapedLead;
  websiteAudit?: StagedLeadAuditPreview | null;
  gmbAudit?: StagedLeadAuditPreview | null;
  reportVariant: "auto" | "custom";
  customTitle?: string;
  customNotes?: string;
};

type RichBulletItem = {
  text: string;
  severity?: "high" | "medium" | "low";
  type: "issue" | "win" | "recommendation";
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeWebsite(value: string): string {
  const text = cleanText(value);
  if (!text) return "";

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return text;
  }
}

function slugify(value: string): string {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "lead";
}

// Programmatic icons to prevent WinAnsi Encoding issues in jsPDF
function drawCheckmark(doc: jsPDF, x: number, y: number): void {
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.setLineWidth(1.6);
  doc.line(x, y + 4.5, x + 2.5, y + 7);
  doc.line(x + 2.5, y + 7, x + 7.5, y + 1.5);
}

function drawWarning(doc: jsPDF, x: number, y: number, severity: string): void {
  const isHigh = severity === "high";
  if (isHigh) {
    doc.setFillColor(254, 226, 226); // red-100 bg
    doc.setDrawColor(239, 68, 68);   // red-500 border
  } else {
    doc.setFillColor(254, 243, 199); // amber-100 bg
    doc.setDrawColor(245, 158, 11);   // amber-500 border
  }
  
  doc.setLineWidth(0.85);
  doc.circle(x + 4, y + 4, 4.5, "FD");
  
  // Exclamation mark
  doc.setDrawColor(isHigh ? 185 : 146, isHigh ? 28 : 64, isHigh ? 28 : 14);
  doc.setLineWidth(1.2);
  doc.line(x + 4, y + 2, x + 4, y + 4.8);
  doc.line(x + 4, y + 6.3, x + 4, y + 6.5);
}

function drawInfo(doc: jsPDF, x: number, y: number): void {
  doc.setFillColor(219, 234, 254); // blue-100 bg
  doc.setDrawColor(59, 130, 246);   // blue-500 border
  doc.setLineWidth(0.85);
  doc.circle(x + 4, y + 4, 4.5, "FD");
  
  doc.setDrawColor(30, 64, 175); // dark blue
  doc.setLineWidth(1.2);
  doc.line(x + 4, y + 3, x + 4, y + 6);
  doc.circle(x + 4, y + 1.8, 0.4, "F");
}

function drawMapsPin(doc: jsPDF, x: number, y: number): void {
  doc.setFillColor(234, 67, 53); // Google Red
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.5);
  
  // Pin head
  doc.circle(x + 4, y + 3.5, 3.5, "FD");
  
  // Pin bottom point
  doc.triangle(x + 1.3, y + 5.5, x + 6.7, y + 5.5, x + 4, y + 9.5, "FD");
  
  // Pin center white hole
  doc.setFillColor(255, 255, 255);
  doc.circle(x + 4, y + 3.5, 1.2, "F");
}

function drawGlobe(doc: jsPDF, x: number, y: number): void {
  doc.setDrawColor(3, 105, 161); // sky-700
  doc.setLineWidth(1.2);
  doc.circle(x + 4, y + 4.5, 4.5, "S");
  doc.line(x - 0.5, y + 4.5, x + 8.5, y + 4.5); // Equator
  doc.line(x + 4, y, x + 4, y + 9); // Meridian
}

export async function downloadLeadAuditPdf(options: LeadAuditPdfOptions): Promise<void> {
  const { lead, websiteAudit = null, gmbAudit = null, reportVariant, customTitle, customNotes } = options;

  const branding = await getPdfBranding();
  const agencyName = cleanText(branding.agencyName) || "SMBify OS";

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const marginY = 42;
  const contentWidth = pageWidth - marginX * 2;
  let y = marginY;

  const generatedAt = new Date();

  function ensureSpace(lines = 1, lineHeight = 14): void {
    if (y + lines * lineHeight > pageHeight - 40) {
      doc.addPage();
      y = marginY;
    }
  }

  function writeLine(text: string, config?: { size?: number; bold?: boolean; color?: [number, number, number] }): void {
    const size = config?.size ?? 11;
    const bold = Boolean(config?.bold);
    const color = config?.color ?? [15, 23, 42];

    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);

    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = Math.max(12, size + 2);

    ensureSpace(lines.length, lineHeight);
    for (const line of lines) {
      doc.text(line, marginX, y);
      y += lineHeight;
    }
  }

  function writeGap(size = 8): void {
    y += size;
  }

  function writeWebsiteSectionHeading(text: string): void {
    writeGap(8);
    ensureSpace(2, 24);
    
    // Draw Globe Icon
    drawGlobe(doc, marginX, y + 2);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(3, 105, 161); // Sky Blue
    doc.text(text, marginX + 14, y + 10);
    y += 16;
    
    doc.setFillColor(3, 105, 161);
    doc.rect(marginX, y, contentWidth, 2, "F");
    y += 10;
  }

  function writeGmbSectionHeading(text: string): void {
    writeGap(8);
    ensureSpace(2, 24);
    
    // Draw Maps Pin Icon
    drawMapsPin(doc, marginX, y + 2);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(66, 133, 244); // Google Blue
    doc.text(text, marginX + 14, y + 10);
    y += 16;
    
    // Draw Google signature 4-color strip
    const stripWidth = contentWidth;
    const stripHeight = 2;
    const chunkWidth = stripWidth / 4;
    const colors = [
      [66, 133, 244],  // Blue
      [234, 67, 53],   // Red
      [251, 188, 5],   // Yellow
      [52, 168, 83]    // Green
    ];
    for (let i = 0; i < 4; i++) {
      const c = colors[i];
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(marginX + i * chunkWidth, y, chunkWidth, stripHeight, "F");
    }
    y += stripHeight + 8;
  }

  function writeRichBullets(items: RichBulletItem[]): void {
    const paddingX = 14;
    
    for (const item of items) {
      const size = 9.5;
      const lineHeight = size + 3;
      
      const indentX = marginX + paddingX;
      const textWidth = contentWidth - paddingX;
      const lines = doc.splitTextToSize(item.text, textWidth);
      
      ensureSpace(lines.length, lineHeight);
      
      const iconY = y - 7.5;
      if (item.type === "issue") {
        drawWarning(doc, marginX, iconY, item.severity || "medium");
      } else if (item.type === "win") {
        drawCheckmark(doc, marginX, iconY);
      } else {
        drawInfo(doc, marginX, iconY);
      }
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      
      if (item.type === "issue") {
        if (item.severity === "high") {
          doc.setTextColor(153, 27, 27); // dark red
        } else if (item.severity === "medium") {
          doc.setTextColor(146, 64, 14); // dark orange
        } else {
          doc.setTextColor(71, 85, 105); // slate-600
        }
      } else if (item.type === "win") {
        doc.setTextColor(6, 95, 70); // dark green
      } else {
        doc.setTextColor(30, 41, 59); // slate-800
      }
      
      for (const line of lines) {
        doc.text(line, indentX, y);
        y += lineHeight;
      }
      
      writeGap(3);
    }
  }

  function drawCardBox(title: string, contentLines: string[]): void {
    ensureSpace(contentLines.length + 3, 14);
    const boxY = y;
    const boxHeight = (contentLines.length + 1) * 14 + 14;
    
    doc.setFillColor(248, 250, 252); // slate-50 bg
    doc.setDrawColor(226, 232, 240); // slate-200 border
    doc.setLineWidth(1);
    doc.roundedRect(marginX, boxY, contentWidth, boxHeight, 6, 6, "FD");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(title, marginX + 14, boxY + 18);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, boxY + 24, marginX + contentWidth, boxY + 24);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85); // slate-700
    let textY = boxY + 38;
    for (const line of contentLines) {
      doc.text(line, marginX + 14, textY);
      textY += 14;
    }
    
    y = boxY + boxHeight + 12;
  }

  function renderAuditData(audit: StagedLeadAuditPreview): void {
    ensureSpace(6, 14);
    const boxY = y;
    const textWidth = contentWidth - 28;
    const summaryText = cleanText(audit.summary) || "No summary available.";
    const summaryLines = doc.splitTextToSize(`Executive Summary: ${summaryText}`, textWidth);
    
    const totalLinesCount = 3 + summaryLines.length;
    const boxHeight = totalLinesCount * 14 + 16;
    
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.roundedRect(marginX, boxY, contentWidth, boxHeight, 6, 6, "FD");
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    
    let textY = boxY + 16;
    doc.text(`Audit Status:  ${cleanText(audit.status) || "not_run"}`, marginX + 14, textY);
    textY += 14;
    
    doc.setFont("helvetica", "bold");
    doc.text(`Performance Score:  ${typeof audit.score === "number" ? `${audit.score}/100` : "--"}`, marginX + 14, textY);
    doc.setFont("helvetica", "normal");
    textY += 14;
    
    doc.text(`Overall Verdict:  ${cleanText(audit.verdict) || "--"}`, marginX + 14, textY);
    textY += 14;
    
    for (const line of summaryLines) {
      doc.text(line, marginX + 14, textY);
      textY += 14;
    }
    
    y = boxY + boxHeight + 12;

    const result = (audit.result || {}) as Record<string, unknown>;
    
    const rawIssues = Array.isArray(result.issues) ? result.issues : [];
    const richIssues: RichBulletItem[] = rawIssues.map((item: any) => {
      const severity = String(item?.severity || "medium").toLowerCase() as "high" | "medium" | "low";
      const title = cleanText(item?.title || item?.label);
      const detail = cleanText(item?.detail || item?.summary || item?.description);
      const text = [title, detail].filter(Boolean).join(": ");
      return { text, severity, type: "issue" };
    });
    
    const rawWins = Array.isArray(result.wins) ? result.wins : [];
    const richWins: RichBulletItem[] = rawWins.map((item: any) => {
      let text = "";
      if (typeof item === "string") {
        text = cleanText(item);
      } else {
        const title = cleanText(item?.title || item?.label);
        const detail = cleanText(item?.detail || item?.summary || item?.description);
        text = [title, detail].filter(Boolean).join(": ");
      }
      return { text, type: "win" };
    });
    
    const rawRecs = Array.isArray(result.recommendations) ? result.recommendations : [];
    const richRecs: RichBulletItem[] = rawRecs.map((item: any) => {
      let text = "";
      if (typeof item === "string") {
        text = cleanText(item);
      } else {
        const title = cleanText(item?.title || item?.label);
        const detail = cleanText(item?.detail || item?.summary || item?.description);
        text = [title, detail].filter(Boolean).join(": ");
      }
      return { text, type: "recommendation" };
    });

    if (richIssues.length > 0) {
      writeLine("Key Issues Detected", { size: 10.5, bold: true, color: [15, 23, 42] });
      writeGap(4);
      writeRichBullets(richIssues);
      writeGap(6);
    }

    if (richWins.length > 0) {
      writeLine("Wins & Optimized Areas", { size: 10.5, bold: true, color: [15, 23, 42] });
      writeGap(4);
      writeRichBullets(richWins);
      writeGap(6);
    }

    if (richRecs.length > 0) {
      writeLine("Actionable Recommendations", { size: 10.5, bold: true, color: [15, 23, 42] });
      writeGap(4);
      writeRichBullets(richRecs);
      writeGap(6);
    }
  }

  const website = normalizeWebsite(lead.website || "");
  const title =
    cleanText(customTitle) || `${cleanText(lead.business_name) || "Lead"} - Local SEO Audit Report`;

  // Draw Header Section
  doc.setFillColor(15, 23, 42); // slate-900 bg
  doc.rect(0, 0, pageWidth, 102, "F");

  // Top header accent line (Google-themed)
  const headerAccentWidth = pageWidth / 4;
  const headerColors = [
    [66, 133, 244],  // Blue
    [234, 67, 53],   // Red
    [251, 188, 5],   // Yellow
    [52, 168, 83]    // Green
  ];
  for (let i = 0; i < 4; i++) {
    const c = headerColors[i];
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(i * headerAccentWidth, 0, headerAccentWidth, 4, "F");
  }

  let headerTextX = marginX;
  if (drawFramedPdfLogo(doc, branding.logoDataUrl, marginX, 34, 34)) {
    headerTextX = marginX + 48;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(agencyName, headerTextX, 48);
  doc.setFontSize(18);
  doc.text(title, headerTextX, 68);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Report type: ${reportVariant === "custom" ? "Custom Report" : "Auto Report"}`, headerTextX, 84);
  doc.text(`Generated: ${generatedAt.toLocaleString()}`, headerTextX, 98);

  y = 118;

  // Draw Business Info Card
  const profileLines = [
    `Business Name:  ${cleanText(lead.business_name) || "--"}`,
    `Website:              ${website || "--"}`,
    `Phone:                 ${cleanText(lead.phone) || "--"}`,
    `Email:                  ${cleanText(lead.email) || "--"}`,
    `Location:             ${[cleanText(lead.city), cleanText(lead.state)].filter(Boolean).join(", ") || "--"}`,
    `Lead Source:       ${cleanText(lead.source) || "--"}`,
    `Audit Status:       ${cleanText(lead.audit_readiness) || "pending"}${lead.audit_readiness_reason ? ` (${cleanText(lead.audit_readiness_reason)})` : ""}`
  ];
  drawCardBox("Business Information", profileLines);

  // Render Website Audit Section
  if (websiteAudit) {
    writeWebsiteSectionHeading("Website Audit & Health Assessment");
    renderAuditData(websiteAudit);
  } else {
    writeWebsiteSectionHeading("Website Audit & Health Assessment");
    writeLine("Website audit data is not available.", { size: 10, color: [71, 85, 105] });
    writeGap(8);
  }

  // Render GMB Audit Section
  if (gmbAudit) {
    writeGmbSectionHeading("Google Business Profile (GMB) Audit");
    renderAuditData(gmbAudit);
  } else {
    writeGmbSectionHeading("Google Business Profile (GMB) Audit");
    writeLine("Google Business Profile audit data is not available.", { size: 10, color: [71, 85, 105] });
    writeGap(8);
  }

  if (cleanText(customNotes)) {
    writeWebsiteSectionHeading("Custom Notes");
    writeLine(cleanText(customNotes), { size: 10, color: [30, 41, 59] });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${agencyName} audit report | Page ${page}/${pageCount}`,
      marginX,
      pageHeight - 18
    );
  }

  const leadSlug = slugify(lead.business_name || lead.website || "lead");
  const suffix = reportVariant === "custom" ? "custom" : "auto";
  doc.save(`${leadSlug}-${suffix}-audit-report.pdf`);
}
