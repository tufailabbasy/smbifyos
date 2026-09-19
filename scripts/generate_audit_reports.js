import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

const outputDir = "C:/Users/myPC/.gemini/antigravity/brain/c5f1aafe-72f7-457b-8942-5cef095ea387";

async function generateReports() {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log("Generating XLSX Audit Tracker...");
    // 1. Generate XLSX Tracker
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["ID", "Category", "Issue Description", "Severity", "Current Status", "Notes/Action Plan"],
      ["SEO-01", "Technical SEO", "Title tag is 80 characters (exceeds recommended 60 max).", "High", "Pending", "Rewrite title tag: 'Top Local Citation Submission & Listing Services'"],
      ["SEO-02", "Technical SEO", "Meta description is 278 characters (exceeds recommended 160 max).", "High", "Pending", "Rewrite meta description to under 160 characters to prevent search snippet truncation."],
      ["SEO-03", "Technical SEO", "11 out of 55 images are missing alt tags.", "Medium", "Pending", "Scan site images and add descriptive Alt tags for search indexing."],
      ["SEO-04", "Technical SEO", "Page load speed is 4.02 seconds (target is <2.5s).", "High", "Pending", "De-bloat unused JS/CSS assets and compress media elements."],
      ["VIS-01", "Visual & UX", "Floating Special Offer widget on the left overlaps hero text and layout.", "High", "Pending", "Remove float banner. Re-integrate as a clean exit popup or native page block."],
      ["VIS-02", "Visual & UX", "Description text has low color contrast against dark chalkboard hero background.", "Medium", "Pending", "Update text color to a lighter white/slate-200 or add a subtle text drop-shadow."],
      ["VIS-03", "Visual & UX", "Broken / infinite loading image placeholders under 'Partners & Clients We Serve'.", "Critical", "Pending", "Fix local image sources or hide the section until assets are loaded."],
      ["CRO-01", "Conversion Rate", "Main Call to Action button uses friction-heavy text 'Contact For All Details'.", "High", "Pending", "Change button text to high-intent CTAs: 'Order Citation Packages' or 'View Plans & Pricing'."],
      ["CRO-02", "Conversion Rate", "No immediate social proof or trust badges visible in the hero above the fold.", "Medium", "Pending", "Add rating icons (e.g. Google, Trustpilot) right below the main CTA button."]
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Audit Tracker");
    const xlsxPath = path.join(outputDir, "toplocalcitations_audit_tracker.xlsx");
    XLSX.writeFile(wb, xlsxPath);
    console.log(`[SUCCESS] XLSX Tracker saved at: ${xlsxPath}`);

    // 2. Generate DOCX Audit Report
    console.log("Generating DOCX Client Audit Report...");
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "WEBSITE AUDIT & OPTIMIZATION REPORT",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: "Prepared for: toplocalcitations.com",
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Date of Audit: ${new Date().toLocaleDateString()} | Auditor: SMBify OS`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: "1. EXECUTIVE SUMMARY",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: "This document outlines the visual, technical, and conversion rate optimization (CRO) audit of toplocalcitations.com. While the website provides essential local citation and listing services, several critical technical SEO errors and visual design bugs are currently limiting search engine crawlability and customer conversions. Implementing the recommendations inside this report will boost domain rankings and direct checkout rates.",
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: "2. TECHNICAL SEO AUDIT RESULTS",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: "Our automated crawling systems identified the following technical shortcomings:",
          }),
          new Paragraph({
            text: "• Title Tag Length: 80 characters (Maximum recommended limit is 60 characters). Google will truncate your title in search results, reducing brand credibility.",
          }),
          new Paragraph({
            text: "• Meta Description: 278 characters (Maximum recommended limit is 160 characters). Leads to truncation and lower click-through rates.",
          }),
          new Paragraph({
            text: "• Missing Image Alt Tags: 11 of 55 images on the homepage lack descriptive alternative text, preventing search engines from indexing them.",
          }),
          new Paragraph({
            text: "• Page Speed: Load time was measured at 4.02 seconds. Mobile visitor bounce rates double when load times exceed 2.5 seconds.",
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: "3. VISUAL & USER EXPERIENCE (UX) ISSUES",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: "A visual inspection of the full-page layout revealed three distinct design deficiencies:",
          }),
          new Paragraph({
            text: "• Hero Widget Overlap: The floating 'Special Offer' card on the left side of the page overlaps with the primary text container. This indicates a responsiveness bug and looks cluttered.",
          }),
          new Paragraph({
            text: "• Low Text Contrast: The white description text in the hero section overlay has insufficient contrast against the dark chalkboard background graphic, causing eye strain.",
          }),
          new Paragraph({
            text: "• Broken Client Logos: In the 'Business & Technology Partners' section, the client logo grid displays loading spinners/broken image icons. This immediately hurts credibility for new visitors.",
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: "4. CONVERSION RATE OPTIMIZATION (CRO)",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: "To turn website visitors into paying citation clients, we recommend resolving these gaps:",
          }),
          new Paragraph({
            text: "• Friction-Heavy CTA: The main button text is 'Contact For All Details' which routes users away to a form. We suggest replacing it with high-intent checkout buttons like 'Order Packages Now'.",
          }),
          new Paragraph({
            text: "• Missing Proof Indicators: Add client review badges (e.g. Trustpilot/Google Reviews) immediately below the main header section.",
          }),
          new Paragraph({ text: "\n" }),

          new Paragraph({
            text: "5. ACTIONABLE 3-STEP ROADMAP",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: "1. Optimize Title & Meta: Shorten titles/descriptions to fit Google search limits.",
          }),
          new Paragraph({
            text: "2. Fix Spacing & Logos: Remove the overlapping floating widget and fix the broken partner logo icons.",
          }),
          new Paragraph({
            text: "3. Compress Images: Clean and compress homepage images to reduce speed load times below 2.5s.",
          }),
          new Paragraph({ text: "\n" }),
          new Paragraph({
            text: "Authorized Signature: _______________________    Date: ______________",
          }),
        ]
      }]
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const docxPath = path.join(outputDir, "toplocalcitations_audit_report.docx");
    fs.writeFileSync(docxPath, docxBuffer);
    console.log(`[SUCCESS] DOCX Report saved at: ${docxPath}`);

    console.log("All audit reports successfully generated!");

  } catch (err) {
    console.error("Report generation failed:", err);
  }
}

generateReports();
