import { chromium } from "playwright";
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";

async function runAudit() {
  const url = process.argv[2];
  const screenshotPath = process.argv[3];

  if (!url || !screenshotPath) {
    console.error("Usage: node run_website_audit.js <url> <screenshotPath>");
    process.exit(1);
  }

  console.log(`[Auditor] Starting audit for: ${url}`);
  console.log(`[Auditor] Screenshot will be saved to: ${screenshotPath}`);

  let browser;
  try {
    const startTime = Date.now();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });
    
    const page = await context.newPage();
    
    // Set timeout of 20 seconds
    page.setDefaultTimeout(20000);
    
    console.log("[Auditor] Navigating to page...");
    const response = await page.goto(url, { waitUntil: "networkidle" });
    const loadTimeMs = Date.now() - startTime;
    const statusCode = response ? response.status() : null;
    const isHttps = url.toLowerCase().startsWith("https");

    console.log("[Auditor] Capturing screenshot...");
    // Ensure parent directory exists
    const dir = path.dirname(screenshotPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("[Auditor] Screenshot saved successfully.");

    console.log("[Auditor] Extracting page content...");
    const html = await page.content();
    const $ = cheerio.load(html);

    // 1. Technical SEO Metadata
    const title = $("title").text().trim() || "";
    const metaDescription = $('meta[name="description"]').attr("content")?.trim() || "";
    const hasViewport = $('meta[name="viewport"]').length > 0;
    const hasCanonical = $('link[rel="canonical"]').length > 0;

    // 2. Headings Analysis
    const h1s = [];
    $("h1").each((_, el) => {
      const txt = $(el).text().trim();
      if (txt) h1s.push(txt);
    });
    const h2Count = $("h2").length;
    const h3Count = $("h3").length;

    // 3. Page Metrics
    const pageText = $("body").text() || "";
    const wordCount = pageText.split(/\s+/).filter(Boolean).length;
    
    // Alt tags check
    let totalImages = 0;
    let missingAltCount = 0;
    $("img").each((_, el) => {
      totalImages++;
      const alt = $(el).attr("alt");
      if (!alt || !alt.trim()) {
        missingAltCount++;
      }
    });

    // 4. E-E-A-T and Conversion (CTA) Signals
    const pageHtmlLower = html.toLowerCase();
    const hasSchema = pageHtmlLower.includes('application/ld+json');
    const hasSSL = isHttps;
    
    // Check for CTA buttons/links
    const ctas = [];
    $("a, button").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      const href = $(el).attr("href") || "";
      if (
        text.includes("book") || 
        text.includes("schedule") || 
        text.includes("call") || 
        text.includes("quote") || 
        text.includes("contact") || 
        text.includes("estimate") || 
        text.includes("appointment")
      ) {
        ctas.push({ text: $(el).text().trim(), href });
      }
    });

    // Check for Trust Indicators
    const trustSignals = [];
    if (pageHtmlLower.includes("testimonial") || pageHtmlLower.includes("reviews") || pageHtmlLower.includes("what our clients say")) {
      trustSignals.push("Testimonials/Reviews segment detected");
    }
    if (pageHtmlLower.includes("guarantee") || pageHtmlLower.includes("warranty")) {
      trustSignals.push("Service guarantee/warranty mentions found");
    }
    if (pageHtmlLower.includes("license") || pageHtmlLower.includes("certified") || pageHtmlLower.includes("insured")) {
      trustSignals.push("Licensing/Insurance/Bonding credentials mentioned");
    }

    // 5. Contact Info Extraction (Regex)
    const phoneRegex = /\b(?:\+?1[-.● ]?)?\(?([0-9]{3})\)?[-.● ]?([0-9]{3})[-.● ]?([0-9]{4})\b/g;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

    const phones = Array.from(new Set(pageText.match(phoneRegex) || [])).slice(0, 3);
    const emails = Array.from(new Set(pageText.match(emailRegex) || [])).slice(0, 3);

    // 6. Assemble Audit Results
    const auditResults = {
      url,
      statusCode,
      loadTimeMs,
      technical: {
        ssl: hasSSL,
        title,
        titleLength: title.length,
        metaDescription,
        metaDescriptionLength: metaDescription.length,
        hasViewport,
        hasCanonical,
        hasSchema,
        wordCount,
        images: {
          total: totalImages,
          missingAlt: missingAltCount
        }
      },
      structure: {
        h1Count: h1s.length,
        h1s,
        h2Count,
        h3Count
      },
      conversion: {
        hasCTA: ctas.length > 0,
        ctas: ctas.slice(0, 5),
        trustSignals
      },
      contact: {
        phones,
        emails
      }
    };

    console.log("AUDIT_SUCCESS");
    console.log(JSON.stringify(auditResults, null, 2));

  } catch (error) {
    console.error("AUDIT_FAILED:", error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runAudit();
