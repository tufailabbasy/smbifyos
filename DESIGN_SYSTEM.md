# SMBify OS — Design System & Visual Language Guide

**Version:** 1.0.0  
**Design Philosophy:** Clean, precise, data-dense, modern SaaS aesthetic inspired by Linear and Stripe Dashboards. High contrast, crisp typography, consistent spacing, and zero toy placeholders or raw emoji functional icons.

---

## 1. Color Palette

### 1.1 Brand Primary (Indigo Slate)
- **Brand Primary:** #5e6ad2 (bg-indigo-600 / hover:bg-indigo-700 / ctive:bg-indigo-800)
- **Brand Light / Tint:** #eef2ff (bg-indigo-50 / border-indigo-100)
- **Brand Focus Ring:** ocus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500

### 1.2 Neutral Scale (Slate Gray)
- **App Background:** #f8fafc (bg-slate-50)
- **Card Background:** #ffffff (bg-white)
- **Card Border:** #e2e8f0 (border-slate-200)
- **Divider / Subtle Border:** #f1f5f9 (border-slate-100)
- **Text Primary (Headings):** #0f172a (text-slate-900, ont-bold / ont-semibold)
- **Text Secondary (Body/Labels):** #334155 (text-slate-700)
- **Text Muted (Captions/Mubtext):** #64748b (text-slate-500)
- **Text Disabled:** #94a3b8 (text-slate-400)

### 1.3 Semantic Colors
- **Success (Green):**
  - Text: text-emerald-700 | Badge: bg-emerald-50 text-emerald-700 border-emerald-200
  - Solid: bg-emerald-600 hover:bg-emerald-500
- **Warning / At Risk (Amber):**
  - Text: text-amber-700 | Badge: bg-amber-50 text-amber-700 border-amber-200
  - Solid: bg-amber-500
- **Danger / Overdue (Rose/Red):**
  - Text: text-rose-700 | Badge: bg-rose-50 text-rose-700 border-rose-200
  - Solid: bg-rose-600 hover:bg-rose-500
- **Info / Neutral (Blue/Slate):**
  - Text: text-sky-700 | Badge: bg-sky-50 text-sky-700 border-sky-200

---

## 2. Typography Scale (Inter / System Sans)

| Level | Tailwind Class | Font Size | Weight | Line Height | Usage |
|---|---|---|---|---|---|
| **Page Title** | text-2xl font-bold tracking-tight text-slate-900 | 24px | 700 | 1.25 | Primary page headers |
| **Section Title** | text-lg font-semibold text-slate-900 | 18px | 600 | 1.3 | Card headers, modal titles |
| **Subsection / Card** | text-sm font-semibold text-slate-800 | 14px | 600 | 1.4 | Table headers, card subheadings |
| **Body Text** | text-sm font-normal text-slate-600 | 14px | 400 | 1.5 | General descriptions & content |
| **Small / Helper** | text-xs font-normal text-slate-500 | 12px | 400 | 1.4 | Secondary notes, timestamps |
| **Badge / Tag** | text-xs font-medium tracking-wide | 12px | 500 | 1.0 | Status pills, category chips |
| **Overline Label** | text-[11px] font-bold uppercase tracking-wider text-slate-400 | 11px | 700 | 1.0 | Metric tile labels, section tags |

---

## 3. Spacing & Rhythm (8px Grid)

- **Page Container:** max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6
- **Card Padding:** p-5 sm:p-6 (compact cards: p-4)
- **Card Spacing / Grid:** gap-4 sm:gap-6
- **Button Padding:** 
  - Standard: px-4 py-2 text-sm font-medium
  - Small / Table: px-3 py-1.5 text-xs font-medium
  - Large / Hero: px-5 py-2.5 text-sm font-semibold

---

## 4. Elevation, Radii & Depth

- **Card Border Radius:** ounded-xl (12px)
- **Button / Input Border Radius:** ounded-lg (8px)
- **Modal Border Radius:** ounded-2xl (16px)
- **Card Shadow:** shadow-sm border border-slate-200 bg-white
- **Floating / Modal Shadow:** shadow-xl border border-slate-200/80 bg-white

---

## 5. UI Elements & Icon Rules

1. **Zero Text Emojis as Functional Icons:** All actions, navigation tabs, metrics, and badges use clean SVG icons with matching h-4 w-4 or h-5 w-5 dimensions.
2. **Real Metric Icons:** Stat cards feature dedicated SVG glyphs (Briefcase for Clients, Globe for Sites, Users for Team, Clock for Overdue) instead of single-letter circle badges.
3. **Intentional Empty States:** Every empty list or table features an SVG illustration/icon, clear explanation, and primary action button.
