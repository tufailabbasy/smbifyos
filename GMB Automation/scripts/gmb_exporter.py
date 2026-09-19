import os
import json
import argparse
from openpyxl import Workbook
from openpyxl.styles import Font as XlFont, Alignment as XlAlignment, PatternFill as XlPatternFill, Border as XlBorder, Side as XlSide
from openpyxl.utils import get_column_letter
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def parse_args():
    parser = argparse.ArgumentParser(description="Export GMB optimization data to consolidated XLSX and DOCX master files.")
    parser.add_argument("--json-file", required=True, help="Path to the JSON file containing business data")
    parser.add_argument("--output-dir", default="businesses", help="Base directory for exporting business folders")
    return parser.parse_args()

def setup_excel_styles(ws):
    # Professional slate blue header style
    header_fill = XlPatternFill(start_color="365F91", end_color="365F91", fill_type="solid")
    header_font = XlFont(name="Calibri", size=11, bold=True, color="FFFFFF")
    
    # Border styles
    thin_border = XlBorder(
        left=XlSide(style='thin', color='D9D9D9'),
        right=XlSide(style='thin', color='D9D9D9'),
        top=XlSide(style='thin', color='D9D9D9'),
        bottom=XlSide(style='thin', color='D9D9D9')
    )
    
    # Alignments
    header_align = XlAlignment(horizontal='center', vertical='center', wrap_text=True)
    
    # Style the headers
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_align
        cell.border = thin_border
    
    ws.row_dimensions[1].height = 25

def autofit_columns(ws, max_widths=None):
    if not max_widths:
        max_widths = {}
    
    thin_border = XlBorder(
        left=XlSide(style='thin', color='E0E0E0'),
        right=XlSide(style='thin', color='E0E0E0'),
        top=XlSide(style='thin', color='E0E0E0'),
        bottom=XlSide(style='thin', color='E0E0E0')
    )
    
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            # Add thin borders to all data cells
            if cell.row > 1:
                cell.border = thin_border
                cell.alignment = XlAlignment(vertical='top', wrap_text=True)
                cell.font = XlFont(name="Calibri", size=11)
            
            val_str = str(cell.value or '')
            if len(val_str) > max_len:
                max_len = len(val_str)
        
        # Set column width with some padding
        limit = max_widths.get(col_letter, 50)  # Default limit to 50 chars wide for readability
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 10), limit)

def create_data_entry_xlsx(data, dest_path):
    wb = Workbook()
    
    # Sheet 1: Services & Categories
    ws1 = wb.active
    ws1.title = "Services & Categories"
    ws1.append(["Primary/Secondary Category", "Service Name", "Service Description (250-300 chars)"])
    for svc in data.get("services", []):
        ws1.append([
            svc.get("category", ""),
            svc.get("name", ""),
            svc.get("description", "")
        ])
    setup_excel_styles(ws1)
    autofit_columns(ws1, {"A": 30, "B": 30, "C": 70})
    
    # Sheet 2: High Intent Keywords
    ws2 = wb.create_sheet(title="High Intent Keywords")
    ws2.append(["Keyword", "Search Intent", "Suggested Action / Usage"])
    for kw in data.get("high_intent_keywords", []):
        ws2.append([
            kw.get("keyword", ""),
            kw.get("intent", ""),
            kw.get("action", "")
        ])
    setup_excel_styles(ws2)
    autofit_columns(ws2, {"A": 35, "B": 20, "C": 55})
    
    # Sheet 3: Products
    ws3 = wb.create_sheet(title="Products")
    ws3.append(["Product Name", "Matched Service", "Detailed Product Description", "Ultra-Realistic Image Prompt"])
    for prod in data.get("products", []):
        ws3.append([
            prod.get("name", ""),
            prod.get("matched_service", ""),
            prod.get("description", ""),
            prod.get("image_prompt", "")
        ])
    setup_excel_styles(ws3)
    autofit_columns(ws3, {"A": 30, "B": 30, "C": 60, "D": 80})
    
    # Sheet 4: Storefront Photo Prompts
    ws4 = wb.create_sheet(title="Storefront Photo Prompts")
    ws4.append(["Prompt ID", "Storefront / Brand Image Prompt (iPhone Style)"])
    photo_prompts = data.get("photo_prompts", {}).get("storefront", [])
    for idx, prompt in enumerate(photo_prompts, 1):
        ws4.append([f"P{idx:02d}", prompt])
    setup_excel_styles(ws4)
    autofit_columns(ws4, {"A": 15, "B": 95})
    
    # Sheet 5: Service Areas
    ws5 = wb.create_sheet(title="Service Areas")
    ws5.append(["Service Area / City Name", "Est. Proximity / Targeting Priority", "Optimization Recommendation"])
    for area in data.get("service_areas", []):
        ws5.append([
            area.get("name", ""),
            area.get("proximity", ""),
            area.get("recommendation", "")
        ])
    setup_excel_styles(ws5)
    autofit_columns(ws5, {"A": 30, "B": 30, "C": 60})
    
    wb.save(dest_path)

# Helper functions for styling python-docx
def set_cell_background(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    for child in list(tcPr):
        if child.tag.endswith('shd'):
            tcPr.remove(child)
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    for child in list(tcPr):
        if child.tag.endswith('tcMar'):
            tcPr.remove(child)
    tcMar = OxmlElement('w:tcMar')
    for margin_name, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        m = OxmlElement(f'w:{margin_name}')
        m.set(qn('w:w'), str(val))
        m.set(qn('w:type'), 'dxa')
        tcMar.append(m)
    tcPr.append(tcMar)

def set_cell_borders(cell, top=None, bottom=None, left=None, right=None):
    tcPr = cell._tc.get_or_add_tcPr()
    for child in list(tcPr):
        if child.tag.endswith('tcBorders'):
            tcPr.remove(child)
    tcBorders = OxmlElement('w:tcBorders')
    for name, style in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        if style:
            b = OxmlElement(f'w:{name}')
            b.set(qn('w:val'), style.get('val', 'single'))
            b.set(qn('w:sz'), str(style.get('sz', 4)))
            b.set(qn('w:space'), '0')
            b.set(qn('w:color'), style.get('color', 'D9D9D9'))
            tcBorders.append(b)
    tcPr.append(tcBorders)

def set_font(run, name="Arial", size_pt=10.5, bold=False, italic=False, color_rgb=None):
    run.font.name = name
    if size_pt:
        run.font.size = Pt(size_pt)
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic
    if color_rgb:
        run.font.color.rgb = color_rgb

def set_table_col_widths(table, col_widths):
    for i, width in enumerate(col_widths):
        for cell in table.columns[i].cells:
            cell.width = Inches(width)

def create_master_report_docx(data, dest_path):
    doc = Document()
    
    # Page setup - 1 inch margins all sides
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)
        
    audit_data = data.get("gmb_audit", {})
    comp_data = data.get("competition_analysis", {})
    
    # 1. Title Block (Table 0) - 1x1 table
    table_title = doc.add_table(rows=1, cols=1)
    table_title.autofit = False
    cell_title = table_title.rows[0].cells[0]
    cell_title.width = Inches(6.5)
    set_cell_background(cell_title, "0E2A47")
    set_cell_margins(cell_title, top=200, bottom=200, left=150, right=150)
    
    p_t1 = cell_title.paragraphs[0]
    p_t1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_t1 = p_t1.add_run("GOOGLE BUSINESS PROFILE AUDIT")
    set_font(r_t1, name="Arial", size_pt=9, bold=True, color_rgb=RGBColor(224, 164, 54))
    
    p_t2 = cell_title.add_paragraph()
    p_t2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_t2.paragraph_format.space_before = Pt(4)
    r_t2 = p_t2.add_run(f"{data.get('business_name', 'My Business')}\nLocal SEO & Profile Health Report")
    set_font(r_t2, name="Arial", size_pt=13, bold=True, color_rgb=RGBColor(255, 255, 255))
    
    # Space after title
    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    
    # 2. Business Details (Table 1) - 6x2 table
    address = data.get("address", audit_data.get("address", "Not Provided"))
    phone = data.get("phone", audit_data.get("phone", "Not Provided"))
    primary_cat = data.get("categories", ["Business Service"])[0]
    rating = audit_data.get("current_rating", "3.5★")
    reviews_count = audit_data.get("total_reviews", "125")
    health_score = audit_data.get("health_score", "42%")
    
    table_details = doc.add_table(rows=6, cols=2)
    table_details.autofit = False
    set_table_col_widths(table_details, [2.0, 4.5])
    
    # Convert health score numeric for condition
    try:
        score_val = int(health_score.replace("%", "").split("/")[0].strip())
    except:
        score_val = 50
    health_status = "Needs Urgent Work" if score_val < 70 else "Optimized"
    
    details_rows = [
        ("Business Name", data.get("business_name", "")),
        ("Address", address),
        ("Phone", phone),
        ("Category", f"{primary_cat} — " + ", ".join(data.get("categories", [])[1:])),
        ("Current Rating", f"{rating}  ·  {reviews_count} reviews"),
        ("Profile Health Score", f"{health_score}  —  {health_status}")
    ]
    
    border_style = {"val": "single", "sz": 4, "color": "D9D9D9"}
    for r_idx, (label, val) in enumerate(details_rows):
        row = table_details.rows[r_idx]
        c0, c1 = row.cells[0], row.cells[1]
        
        set_cell_margins(c0, top=100, bottom=100, left=150, right=150)
        set_cell_margins(c1, top=100, bottom=100, left=150, right=150)
        set_cell_background(c0, "F4F6F9")
        set_cell_borders(c0, top=border_style, bottom=border_style, left=border_style, right=border_style)
        set_cell_borders(c1, top=border_style, bottom=border_style, left=border_style, right=border_style)
        
        p0 = c0.paragraphs[0]
        r0 = p0.add_run(label)
        set_font(r0, name="Arial", size_pt=9.5, bold=True, color_rgb=RGBColor(14, 42, 71))
        
        p1 = c1.paragraphs[0]
        r1 = p1.add_run(val)
        if label == "Profile Health Score" and score_val < 70:
            set_font(r1, name="Arial", size_pt=9.5, bold=True, color_rgb=RGBColor(192, 57, 43))
        else:
            set_font(r1, name="Arial", size_pt=9.5, color_rgb=RGBColor(43, 55, 66))
            
    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    
    # 3. KPI Metrics Bar (Table 2) - 1x4 table
    # Process detailed issues count
    detailed_issues = audit_data.get("detailed_issues", [])
    if not detailed_issues:
        # Build detailed issues list from simple issues array if new fields aren't present
        simple_issues = audit_data.get("issues", [])
        simple_suggestions = audit_data.get("suggestions", [])
        for i_idx, issue_text in enumerate(simple_issues):
            sug_text = simple_suggestions[i_idx] if i_idx < len(simple_suggestions) else "Implement GMB optimization best practices to resolve this issue."
            priority = "HIGH"
            if "review" in issue_text.lower() or "rating" in issue_text.lower():
                priority = "CRITICAL"
            elif "description" in issue_text.lower() or "social" in issue_text.lower() or "website" in issue_text.lower():
                priority = "MEDIUM"
            
            detailed_issues.append({
                "title": issue_text.split(" (")[0] if " (" in issue_text else issue_text,
                "priority": priority,
                "problem": f"The profile suffers from: {issue_text}.",
                "impact": "This issue limits search visibility and customer trust, reducing call volume.",
                "recommendation_quote": "Optimal search visibility starts with a complete and fully active listing.",
                "recommendation_text": f"Address this by following the suggestion: {sug_text}",
                "suggested_actions": [sug_text]
            })
            
    total_issues = len(detailed_issues)
    critical_issues = sum(1 for i in detailed_issues if i.get("priority", "HIGH") == "CRITICAL")
    
    table_kpi = doc.add_table(rows=1, cols=4)
    table_kpi.autofit = False
    set_table_col_widths(table_kpi, [1.625, 1.625, 1.625, 1.625])
    
    try:
        rating_val = float(rating.replace("★", "").strip())
    except:
        rating_val = 3.5
        
    rating_color = RGBColor(192, 57, 43) if rating_val < 4.0 else RGBColor(46, 125, 79)
    
    kpis = [
        (f"{rating}", "CURRENT RATING", rating_color),
        (f"{reviews_count}", "TOTAL REVIEWS", RGBColor(14, 42, 71)),
        (f"{critical_issues}", "CRITICAL ISSUE" + ("S" if critical_issues != 1 else ""), RGBColor(192, 57, 43)),
        (f"{total_issues}", "ISSUES FOUND", RGBColor(200, 85, 27))
    ]
    
    kpi_border = {"val": "single", "sz": 4, "color": "D9D9D9"}
    for c_idx, (num, lbl, color) in enumerate(kpis):
        cell = table_kpi.rows[0].cells[c_idx]
        set_cell_background(cell, "F4F6F9")
        set_cell_margins(cell, top=120, bottom=120, left=100, right=100)
        set_cell_borders(cell, top=kpi_border, bottom=kpi_border, left=kpi_border, right=kpi_border)
        
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_num = p.add_run(f"{num}\n")
        set_font(r_num, name="Arial", size_pt=17, bold=True, color_rgb=color)
        
        r_lbl = p.add_run(lbl)
        set_font(r_lbl, name="Arial", size_pt=8, bold=True, color_rgb=RGBColor(92, 107, 122))
        
    doc.add_paragraph().paragraph_format.space_after = Pt(16)
    
    # 4. Executive Summary
    p_es_hdr = doc.add_paragraph()
    r_es_emoji = p_es_hdr.add_run("📋  ")
    set_font(r_es_emoji, name="Arial", size_pt=11, color_rgb=RGBColor(14, 42, 71))
    r_es_title = p_es_hdr.add_run("EXECUTIVE SUMMARY")
    set_font(r_es_title, name="Arial", size_pt=9, bold=True, color_rgb=RGBColor(14, 42, 71))
    p_es_hdr.paragraph_format.space_after = Pt(4)
    
    p_es_body = doc.add_paragraph()
    r_es_body = p_es_body.add_run(audit_data.get("summary", "Summary of GMB profile health."))
    set_font(r_es_body, name="Arial", size_pt=10.5, color_rgb=RGBColor(43, 55, 66))
    p_es_body.paragraph_format.line_spacing = 1.15
    p_es_body.paragraph_format.space_after = Pt(20)
    
    # 5. Section 1: Issues, Impact & Recommendations
    p_s1_hdr = doc.add_paragraph()
    r_s1_num = p_s1_hdr.add_run("01  ")
    set_font(r_s1_num, name="Arial", size_pt=13, bold=True, color_rgb=RGBColor(224, 164, 54))
    r_s1_title = p_s1_hdr.add_run("Issues, Impact & Recommendations")
    set_font(r_s1_title, name="Arial", size_pt=13, bold=True, color_rgb=RGBColor(14, 42, 71))
    p_s1_hdr.paragraph_format.space_after = Pt(16)
    
    for idx, issue in enumerate(detailed_issues, 1):
        title_str = issue.get("title", f"Issue {idx}")
        priority = issue.get("priority", "HIGH").upper()
        problem = issue.get("problem", "")
        impact = issue.get("impact", "")
        recommendation_quote = issue.get("recommendation_quote", "")
        recommendation_text = issue.get("recommendation_text", "")
        suggested_actions = issue.get("suggested_actions", [])
        
        prio_color = RGBColor(192, 57, 43) if priority == "CRITICAL" else (RGBColor(200, 85, 27) if priority == "HIGH" else RGBColor(176, 125, 23))
        
        # 1. Issue Header
        p_issue_hdr = doc.add_paragraph()
        r_issue_num = p_issue_hdr.add_run(f"Issue {idx}.  ")
        set_font(r_issue_num, name="Arial", size_pt=11.5, bold=True, color_rgb=RGBColor(176, 125, 23))
        r_issue_title = p_issue_hdr.add_run(title_str)
        set_font(r_issue_title, name="Arial", size_pt=11.5, bold=True, color_rgb=RGBColor(14, 42, 71))
        p_issue_hdr.paragraph_format.space_after = Pt(2)
        
        # 2. Priority Badge
        p_prio = doc.add_paragraph()
        r_prio_dot = p_prio.add_run("●  ")
        set_font(r_prio_dot, name="Arial", size_pt=9, color_rgb=prio_color)
        r_prio_text = p_prio.add_run(f"{priority} PRIORITY")
        set_font(r_prio_text, name="Arial", size_pt=8, bold=True, color_rgb=prio_color)
        p_prio.paragraph_format.space_after = Pt(8)
        
        # 3. The Issue Section
        p_iss_lbl = doc.add_paragraph()
        r_iss_emoji = p_iss_lbl.add_run("⚠  ")
        set_font(r_iss_emoji, name="Arial", size_pt=9, color_rgb=prio_color)
        r_iss_lbl = p_iss_lbl.add_run("THE ISSUE")
        set_font(r_iss_lbl, name="Arial", size_pt=8.5, bold=True, color_rgb=prio_color)
        p_iss_lbl.paragraph_format.space_after = Pt(2)
        
        p_iss_text = doc.add_paragraph()
        r_iss_text = p_iss_text.add_run(problem)
        set_font(r_iss_text, name="Arial", size_pt=10.5, color_rgb=RGBColor(43, 55, 66))
        p_iss_text.paragraph_format.line_spacing = 1.15
        p_iss_text.paragraph_format.space_after = Pt(10)
        
        # 4. Why it Matters Section
        p_mat_lbl = doc.add_paragraph()
        r_mat_emoji = p_mat_lbl.add_run("📉  ")
        set_font(r_mat_emoji, name="Arial", size_pt=9, color_rgb=RGBColor(200, 85, 27))
        r_mat_lbl = p_mat_lbl.add_run("WHY IT MATTERS")
        set_font(r_mat_lbl, name="Arial", size_pt=8.5, bold=True, color_rgb=RGBColor(200, 85, 27))
        p_mat_lbl.paragraph_format.space_after = Pt(2)
        
        p_mat_text = doc.add_paragraph()
        r_mat_text = p_mat_text.add_run(impact)
        set_font(r_mat_text, name="Arial", size_pt=10.5, color_rgb=RGBColor(43, 55, 66))
        p_mat_text.paragraph_format.line_spacing = 1.15
        p_mat_text.paragraph_format.space_after = Pt(10)
        
        # 5. Evidence Section
        p_ev_lbl = doc.add_paragraph()
        r_ev_emoji = p_ev_lbl.add_run("📷  ")
        set_font(r_ev_emoji, name="Arial", size_pt=8, color_rgb=RGBColor(92, 107, 122))
        r_ev_lbl = p_ev_lbl.add_run("Evidence from the live profile")
        set_font(r_ev_lbl, name="Arial", size_pt=8.5, italic=True, color_rgb=RGBColor(92, 107, 122))
        p_ev_lbl.paragraph_format.space_after = Pt(2)
        
        p_ev_space = doc.add_paragraph()
        r_ev_space = p_ev_space.add_run("[Screenshot Evidence Placement]")
        set_font(r_ev_space, name="Arial", size_pt=9.5, italic=True, color_rgb=RGBColor(150, 150, 150))
        p_ev_space.paragraph_format.space_after = Pt(10)
        
        # 6. Recommendation Section
        p_rec_lbl = doc.add_paragraph()
        r_rec_emoji = p_rec_lbl.add_run("💡  ")
        set_font(r_rec_emoji, name="Arial", size_pt=8, color_rgb=RGBColor(46, 125, 79))
        r_rec_lbl = p_rec_lbl.add_run("RECOMMENDATION")
        set_font(r_rec_lbl, name="Arial", size_pt=8.5, bold=True, color_rgb=RGBColor(46, 125, 79))
        p_rec_lbl.paragraph_format.space_after = Pt(2)
        
        if recommendation_quote:
            p_quote = doc.add_paragraph()
            r_quote = p_quote.add_run(f"“{recommendation_quote.strip('“”')}”")
            set_font(r_quote, name="Arial", size_pt=11, bold=True, italic=True, color_rgb=RGBColor(14, 42, 71))
            p_quote.paragraph_format.space_after = Pt(4)
            
        p_rec_text = doc.add_paragraph()
        r_rec_text = p_rec_text.add_run(recommendation_text)
        set_font(r_rec_text, name="Arial", size_pt=10.5, color_rgb=RGBColor(43, 55, 66))
        p_rec_text.paragraph_format.line_spacing = 1.15
        p_rec_text.paragraph_format.space_after = Pt(10)
        
        # 7. Suggested Actions Section
        p_act_lbl = doc.add_paragraph()
        r_act_emoji = p_act_lbl.add_run("✓  ")
        set_font(r_act_emoji, name="Arial", size_pt=9, color_rgb=RGBColor(14, 42, 71))
        r_act_lbl = p_act_lbl.add_run("SUGGESTED ACTIONS")
        set_font(r_act_lbl, name="Arial", size_pt=8.5, bold=True, color_rgb=RGBColor(14, 42, 71))
        p_act_lbl.paragraph_format.space_after = Pt(4)
        
        for action in suggested_actions:
            p_bullet = doc.add_paragraph(style='List Paragraph')
            p_bullet.paragraph_format.space_after = Pt(4)
            r_bullet = p_bullet.add_run(action)
            set_font(r_bullet, name="Arial", size_pt=10.5, color_rgb=RGBColor(43, 55, 66))
            
        doc.add_paragraph().paragraph_format.space_after = Pt(16)
        
    doc.add_paragraph().paragraph_format.space_after = Pt(12)
    
    # 6. Section 2: Prioritized 30-Day Action Plan
    p_s2_hdr = doc.add_paragraph()
    r_s2_num = p_s2_hdr.add_run("02  ")
    set_font(r_s2_num, name="Arial", size_pt=13, bold=True, color_rgb=RGBColor(224, 164, 54))
    r_s2_title = p_s2_hdr.add_run("Prioritized 30-Day Action Plan")
    set_font(r_s2_title, name="Arial", size_pt=13, bold=True, color_rgb=RGBColor(14, 42, 71))
    p_s2_hdr.paragraph_format.space_after = Pt(8)
    
    p_s2_desc = doc.add_paragraph()
    r_s2_desc = p_s2_desc.add_run("Highest-impact fixes first, in the order they should be tackled.")
    set_font(r_s2_desc, name="Arial", size_pt=10.5, color_rgb=RGBColor(43, 55, 66))
    p_s2_desc.paragraph_format.space_after = Pt(12)
    
    # Process Phased Action Plan
    phased_action_plan = data.get("phased_action_plan", [])
    if not phased_action_plan:
        phased_action_plan = [
            {"num": "1", "phase": "Reputation Recovery Week 1–2", "details": "Respond to every negative review with a professional, resolution-focused reply, then launch an automated review-request system for happy tenants and owners. Protects the brand and starts lifting the rating immediately."},
            {"num": "2", "phase": "Profile Optimization Week 2–3", "details": "Rewrite the business description with local keywords and a CTA, fully populate the Services section, and begin weekly Google Posts switching the profile from static to active."},
            {"num": "3", "phase": "Fresh Content & Social Week 3–4", "details": "Upload current photos (exterior, interior, team, signage) and create + link Facebook, YouTube and LinkedIn with matching NAP to strengthen freshness and cross-platform trust."},
            {"num": "4", "phase": "Ongoing Management Monthly", "details": "Maintain weekly posts, monthly photos, 24–48 hr review replies, and send a monthly performance report tracking rating, calls, direction requests and visibility."}
        ]
        
    table_plan = doc.add_table(rows=1, cols=3)
    table_plan.autofit = False
    set_table_col_widths(table_plan, [0.5, 2.0, 4.0])
    
    hdr_row = table_plan.rows[0]
    plan_hdr_cols = ["#", "PHASE", "WHAT HAPPENS"]
    for c_idx, text in enumerate(plan_hdr_cols):
        cell = hdr_row.cells[c_idx]
        set_cell_background(cell, "0E2A47")
        set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
        p = cell.paragraphs[0]
        r = p.add_run(text)
        if text == "#":
            set_font(r, name="Arial", size_pt=9.5, bold=True, color_rgb=RGBColor(224, 164, 54))
        else:
            set_font(r, name="Arial", size_pt=9.5, bold=True, color_rgb=RGBColor(255, 255, 255))
            
    plan_border = {"val": "single", "sz": 4, "color": "D9D9D9"}
    for phase_item in phased_action_plan:
        row = table_plan.add_row()
        c0 = row.cells[0]
        c1 = row.cells[1]
        c2 = row.cells[2]
        
        set_cell_margins(c0, top=100, bottom=100, left=120, right=120)
        set_cell_margins(c1, top=100, bottom=100, left=120, right=120)
        set_cell_margins(c2, top=100, bottom=100, left=120, right=120)
        
        set_cell_borders(c0, top=plan_border, bottom=plan_border, left=plan_border, right=plan_border)
        set_cell_borders(c1, top=plan_border, bottom=plan_border, left=plan_border, right=plan_border)
        set_cell_borders(c2, top=plan_border, bottom=plan_border, left=plan_border, right=plan_border)
        
        p0 = c0.paragraphs[0]
        r0 = p0.add_run(str(phase_item.get("num", "")))
        set_font(r0, name="Arial", size_pt=9.5, bold=True, color_rgb=RGBColor(14, 42, 71))
        p0.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        p1 = c1.paragraphs[0]
        r1 = p1.add_run(phase_item.get("phase", ""))
        set_font(r1, name="Arial", size_pt=9.5, bold=True, color_rgb=RGBColor(14, 42, 71))
        
        p2 = c2.paragraphs[0]
        r2 = p2.add_run(phase_item.get("details", ""))
        set_font(r2, name="Arial", size_pt=9.5, color_rgb=RGBColor(43, 55, 66))
        p2.paragraph_format.line_spacing = 1.15
        
    doc.add_paragraph().paragraph_format.space_after = Pt(20)
    
    # 7. Footer CTA Block (Table 4) - 1x1 table
    table_cta = doc.add_table(rows=1, cols=1)
    table_cta.autofit = False
    cell_cta = table_cta.rows[0].cells[0]
    cell_cta.width = Inches(6.5)
    set_cell_background(cell_cta, "0E2A47")
    set_cell_margins(cell_cta, top=150, bottom=150, left=150, right=150)
    
    p_cta = cell_cta.paragraphs[0]
    p_cta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_cta = p_cta.add_run(
        "Ready to fix this profile & win more local clients? I can implement every recommendation in this report and turn this Google Business Profile into a consistent source of calls and leads.\n"
        "Prepared by Local SEO & Google Business Profile Consultant"
    )
    set_font(r_cta, name="Arial", size_pt=10, bold=False, color_rgb=RGBColor(255, 255, 255))
    
    doc.save(dest_path)

def main():
    args = parse_args()
    
    if not os.path.exists(args.json_file):
        print(f"Error: JSON file not found at {args.json_file}")
        return
        
    with open(args.json_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    business_name = data.get("business_name", "").strip()
    if not business_name:
        print("Error: 'business_name' is missing or empty in JSON data.")
        return
        
    # Create clean directory name
    safe_name = "".join([c if c.isalnum() or c in (" ", "_", "-") else "" for c in business_name]).strip()
    safe_name = safe_name.replace(" ", "_")
    
    business_dir = os.path.join(args.output_dir, safe_name)
    os.makedirs(business_dir, exist_ok=True)
    
    print(f"Exporting GMB optimization files for '{business_name}' to '{business_dir}'...")
    
    # 1. Excel Workbook - Master Data Entry (5 sheets)
    create_data_entry_xlsx(data, os.path.join(business_dir, "GMB_Optimization_Data_Entry.xlsx"))
    print("- Saved: GMB_Optimization_Data_Entry.xlsx (Services, Keywords, Products, Photo Prompts, Service Areas)")
    
    # 2. Word Document - Master Audit & Strategy Report (Highly Stylized, New Cover Page, KPI metric boxes, phased action plans)
    create_master_report_docx(data, os.path.join(business_dir, "GMB_Optimization_Master_Report.docx"))
    print("- Saved: GMB_Optimization_Master_Report.docx (Audit, Checklist, Competitors)")
    
    print("\nAll files generated successfully!")

if __name__ == "__main__":
    main()
