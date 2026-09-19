---
name: gmb-optimizer
description: Optimize Google My Business (GMB) profiles by dynamically generating custom categories, services, products, storefront photo prompts, GMB audits, high-intent keywords, and localized competitor analysis based on user inputs (screenshots, Local Falcon reports, competitor chats), exporting them into professional XLSX/DOCX files.
---

# Google My Business (GMB) Optimization Workflow

Use this skill when the user wants to optimize a new Google My Business (GMB) profile. The user may provide varied inputs:
- Screenshots of the GMB dashboard
- Local Falcon reports or service area names (including PDF reports or screenshots)
- Competitor chat transcripts (from Claude, ChatGPT, Gemini, etc.)
- Raw text descriptions or business details

Your task is to analyze these inputs, perform localized real-time competitor research on the top 10 competitors, dynamically generate unique optimization content, and export them into exactly **two master files** in a subfolder under `businesses/`.

## 1. Input Processing & Analysis

Upon receiving a request to optimize a GMB listing, verify if the following inputs are available:
- **Business Details:** Name, primary service, location, or dashboard screenshot.
- **Service Area Info:** Local Falcon screenshots/reports (PDF, PNG, or text) or target cities/zip codes.
- **Competitor Info:** Competitor search chat transcripts or competitor links.

If any inputs are missing, ask the user to provide them, but proceed with whatever data is available.

---

## 2. Content Generation Guidelines

Ensure all generated content is 100% custom and unique to the business. Do not use generic placeholders.

### A. Real-Time Localized Competitor Research (Top 10 Competitors)
- Using your web search tool (`search_web`), perform a localized search simulating a Google Maps / Local Pack search for the business's niche and target location (e.g., "plumber in New York site:google.com/maps" or "hvac contractor brooklyn local pack").
- Identify the **top 10 actual ranking competitors** in real-time.
- Perform a deep audit of these top 10 competitors:
  - Extract ratings and review counts.
  - Analyze their categories, descriptions, or visible strengths.
  - Document their **winning points** (why they rank in the Local Pack).
  - Outline a **counter-strategy** (actionable suggestions for our business to outrank them).

### B. Master Catalog Merging
- Merge ALL relevant categories, services, and products from these top 10 competitors into a single master optimization list.
- **Scale:** Suggest a comprehensive list of services (20-30+ services) and products (10-15+ products) to maximize keyword coverage.
- **Service Descriptions:** Write a unique description for **each** service.
  - **Constraint:** Must be exactly **250 to 300 characters** (including spaces). Do not exceed 300 characters. Keep it compelling and rich in local service keywords.

### C. GMB Health Audit & Checklist Table
- Audit the target business's current details and dashboard screenshots.
- Assign an overall **Health Score** (e.g., 55% or 80%) based on completeness and optimization.
- List all identified **issues** and **suggestions** (using 📊, ⚠️, 💡 icons).
- Generate a progress-tracking checklist table with Task ID, GMB Section, Action Required, Priority, and Status.

### D. Top 100 to 500 Commercial High-Intent Keywords
- Generate a comprehensive list of **minimum 100 to maximum 500 localized high-intent keywords** (based on niche and location).
- For each keyword, determine its Search Intent (e.g., Transactional, Commercial) and provide a Suggested Action.

### E. 20 Compliant Service Areas
- Identify **exactly 20 nearest service areas** (neighborhoods, suburbs, adjacent cities) that are compliant with Google's guidelines (typically within a 2-hour driving distance of the business base).
- For each, provide an estimated distance/proximity and optimization advice.

### F. Storefront & Exterior Brand Photo Prompts (10-15 Photos)
- Generate a list of 10 to 15 unique photo prompts for storefront/exterior shots.
- **Style:** Ultra-realistic, shot on a modern iPhone/smartphone camera.

---

## 3. File Export & Setup

Once you have generated all the content, follow these exact technical steps to create the business folder and files:

### Step 1: Create a Structured JSON Payload
Write a temporary JSON file containing the structured data.
Save it to a temporary path, e.g., `C:\Users\myPC\.gemini\antigravity\brain\<conversation-id>\scratch\temp_gmb_data.json`.

```json
{
  "business_name": "Business Name",
  "categories": ["Primary Category", "Secondary Category"],
  "services": [
    {
      "category": "Category Name",
      "name": "Service Name",
      "description": "Unique description (250-300 characters)."
    }
  ],
  "high_intent_keywords": [
    {
      "keyword": "plumber near me",
      "intent": "Transactional",
      "action": "Add to primary business description and website homepage"
    }
  ],
  "products": [
    {
      "name": "Product Name",
      "matched_service": "Service Name",
      "description": "Product description matching GMB guidelines.",
      "image_prompt": "Ultra-realistic iPhone photo prompt..."
    }
  ],
  "service_areas": [
    {
      "name": "Oakley, CA",
      "proximity": "Nearby (5 miles)",
      "recommendation": "Target in Google Posts and add to service area list"
    }
  ],
  "competition_analysis": {
    "summary": "Strategic overview...",
    "table": [
      {
        "competitor_name": "Name",
        "rating": "4.8",
        "reviews": "150",
        "strengths": "Strengths details...",
        "weaknesses": "Weaknesses details..."
      }
    ],
    "detailed_profiles": [
      {
        "competitor_name": "Name",
        "winning_points": "Detailed reasons why they rank in Local Pack...",
        "counter_strategy": "Actionable steps we should take to beat them..."
      }
    ]
  },
  "gmb_audit": {
    "health_score": "75%",
    "summary": "Executive summary of GMB audit...",
    "issues": [
      "Issue 1...",
      "Issue 2..."
    ],
    "suggestions": [
      "Suggestion 1...",
      "Suggestion 2..."
    ]
  },
  "photo_prompts": {
    "storefront": [
      "Ultra-realistic iPhone photo prompt 1...",
      "Ultra-realistic iPhone photo prompt 2..."
    ]
  }
}
```

### Step 2: Execute the Exporter Script
Run the Python script using the local virtual environment:
```bash
.venv\Scripts\python scripts/gmb_exporter.py --json-file "C:\Users\myPC\.gemini\antigravity\brain\<conversation-id>\scratch\temp_gmb_data.json"
```

The script will automatically:
1. Create a safe subfolder under `businesses/` (e.g., `businesses/business_name_with_underscores/`).
2. Generate `GMB_Optimization_Master_Report.docx` (Word doc - Health Audit, Checklist, Competitors)
3. Generate `GMB_Optimization_Data_Entry.xlsx` (Excel - Sheet 1: Services, Sheet 2: Keywords, Sheet 3: Products, Sheet 4: Photo Prompts, Sheet 5: Service Areas)

### Step 3: Present the Results
Report back to the user with the links to the generated files:
- [GMB_Optimization_Master_Report.docx](file:///d:/Vibe%20Coding/GMB%20Automation/businesses/safe_name/GMB_Optimization_Master_Report.docx)
- [GMB_Optimization_Data_Entry.xlsx](file:///d:/Vibe%20Coding/GMB%20Automation/businesses/safe_name/GMB_Optimization_Data_Entry.xlsx)
