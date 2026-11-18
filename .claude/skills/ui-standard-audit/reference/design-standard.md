# InsightED Schools Review Design Standard

This document is the single source of truth for the approved InsightED design language, derived directly from the canonical **Schools Review dashboard** reference screen (`assets/reference-schools-review.png`). When textual descriptions and the reference screenshot disagree, the screenshot is the visual source of truth.

## Table of Contents
1. [Design Direction & Philosophy](#1-design-direction--philosophy)
2. [Color Palette & Status Tokens](#2-color-palette--status-tokens)
3. [Typography Hierarchy](#3-typography-hierarchy)
4. [Cards and Surfaces](#4-cards-and-surfaces)
5. [Page Structure & Vertical Flow](#5-page-structure--vertical-flow)
6. [Summary Row (Hero, KPIs, Breakdown)](#6-summary-row-hero-kpis-breakdown)
7. [Filter Card & Controls](#7-filter-card--controls)
8. [Main Table Card & Grid Elements](#8-main-table-card--grid-elements)
9. [Applied UX Laws](#9-applied-ux-laws)
10. [Do and Don't Rules](#10-do-and-dont-rules)

---

## 1. Design Direction & Philosophy
- **"Calm Civic" Aesthetic**: Guided by Apple's Human Interface Guidelines (HIG) and civic enterprise principles. The UI is calm, restrained, trustworthy, legible, and respectful of the user's focus, strictly avoiding flashy "AI-look" gradients, glow effects, or frivolous widgets.
- **Target Desktop Profile**: Optimized primarily for desktop and laptop displays in regional, division, and school administrative offices. The baseline viewport standard is **1366px width** (expanding cleanly to 1440px and 1920px).
- **Empathy-Led Information Architecture**: The screen answers *"What needs my attention right now?"* before presenting exhaustive lists or raw data. High-level aggregates and actionable ratios appear first; details follow.

---

## 2. Color Palette & Status Tokens
- **Brand Identity**:
  - Core Brand Navy: `#0F4C8A` (primary buttons, active tabs, brand accents).
  - Philippine Heritage Accents: Red `#D4182F`, Gold/Yellow `#FFC629`.
  - Canvas / Page Background: Light blue civic tint `#E8EFF7` (creates soft contrast against white cards).
  - Card Surface: Pure white `#FFFFFF`.
  - Structural Borders: Hairline cool gray `#CBD5E1` or `#E2E8F0` (1px solid).
- **Text & Contrast Hierarchy**:
  - Primary Headings & Hero Numerals: Deep navy `#0B2A4A`. **No pure black (`#000000`) text.**
  - Body & Form Labels: Slate navy `#1E293B` or `#334155`.
  - Secondary Text / Meta Captions: Blue-gray `#4A5B70` or `#5B6B7F`.
  - Disabled / Muted Text: Slate `#94A3B8`.
- **Unified Status Tokens**:
  Status semantics are immutable and must match across Donut charts, KPI card icons, progress bars, and table badges:
  - **Submitted**: Emerald green (Border `#10B981`, Tint `#ECFDF5`, Solid `#059669`).
  - **For Revision**: Warm gold/yellow (Border `#FFC629`, Tint `#FEF9C3` or `#FFFBEB`, Dark amber text `#854D0E`).
  - **Not Yet Submitted / Pending**: Neutral slate gray (`#94A3B8`, Tint `#F1F5F9`, Text `#475569`).
  - **Overdue / Critical Error**: Civic Red (`#D4182F` or `#EF4444`). *Red is strictly reserved for overdue submissions and system errors, never for standard pending items.*

---

## 3. Typography Hierarchy
The design system employs 3 to 4 complementary font families with strictly delineated roles:

1. **Primary UI Font (Plus Jakarta Sans)**:
   - Used for all standard UI elements: body copy, card titles, form inputs, button text, table contents, and KPI metrics.
   - Must be explicitly imported via `@fontsource/plus-jakarta-sans`, Google Fonts link, or local font face.
2. **Page Title Font (Bold Civic Serif)**:
   - Reserved strictly for page title (`28px` to `32px`, bold, navy `#0B2A4A`) and italic scope subtitle (`15px` to `16px`, italic, blue-gray `#4A5B70`).
   - Serif must not appear inside cards, inputs, tables, or buttons.
3. **Numerals & Data Visualizations**:
   - Hero percentages and KPI numbers use ExtraBold weights (`700` or `800`) with **tabular lining figures** (`font-variant-numeric: tabular-nums`).
   - Unit symbols (such as `%` or `schools`) are rendered at 55% to 60% of the numeral size in muted navy.
4. **Monospace Restriction**:
   - Monospace font is prohibited in form fields, filter dropdowns, table cells, or normal labels. Monospace is permitted only for system hashes, code, or technical identifiers.
5. **Legibility Thresholds**:
   - Primary body text: `14px` or `15px`.
   - Secondary text and meta lines: Minimum `12px`. **No text may be rendered below 11px.**
   - Table headers: `11px` to `12px`, uppercase, tracking `0.05em`, muted slate. Sentence case everywhere else.

---

## 4. Cards and Surfaces
- **Card Styling**:
  - Background: `#FFFFFF`.
  - Border: 1px solid `#CBD5E1` (or `#E2E8F0`).
  - Border Radius: Uniform rounded corners between `12px` and `16px` (standard `rounded-xl`).
  - Drop Shadow: Subtle civic elevation (`0 1px 3px rgba(15, 76, 138, 0.06), 0 4px 6px -2px rgba(15, 76, 138, 0.04)`).
  - Internal Padding: Generous and balanced (`16px` to `24px`).
- **Surface Uniformity**:
  - The filter card, donut card, KPI cards, breakdown card, and table card all share this exact card specification.
  - The page title and subtitle sit directly on the light-blue page canvas, not inside a header card container.

---

## 5. Page Structure & Vertical Flow
The layout follows a clean, predictable 4-tier vertical structure:
1. **Tier 1: Page Header**: Title ("Schools Review") and italic scope description ("Division of Sample City") sitting bare on the canvas.
2. **Tier 2: Unified Filter Card**: Single white container housing global search, cascading geographic dropdowns, Reset, and secondary Export actions.
3. **Tier 3: Summary Metric Row**: A 3-column equal-height card grid (Overall Submission Donut, 3-card KPI Stack, Distribution Breakdown).
4. **Tier 4: Main Data Table Card**: Comprehensive tabular list with column filters, sorting, status badges, and action links.

---

## 6. Summary Row (Hero, KPIs, Breakdown)
Positioned directly between the filter bar and data table, configured as a 3-part grid with equal vertical height:

1. **Left: Hero Donut Card (Overall Submission Rate)**:
   - Header with card title ("Overall Submission Rate") and right-aligned count badge ("24 schools").
   - Large central donut chart (`200px` to `260px` diameter, thick circular ring, wide inner hole).
   - Centered inside the hole: Large bold percentage (`41.7%`) with smaller `%` unit, and label ("Submitted").
   - Bottom caption reinforcing ratio ("10 of 24 schools submitted").
2. **Center: Stacked KPI Cards**:
   - Three equal-width horizontal stat cards stacked vertically with consistent gap (`10px` to `12px`).
   - Each card contains:
     - Left: Circular icon container with soft status tint and icon (check for submitted, clock for revision, minus/cross for not yet).
     - Middle: Semibold category title, large bold numeral, and percentage of total (`10 (41.7% of schools)`).
     - Right: Subtle hover chevron/link ("View list →").
     - **Interactivity**: The entire card is clickable and immediately filters the main table.
3. **Right: Breakdown Card (Distribution by District)**:
   - Header with title ("Distribution by District"), right-aligned entity count, and compact inline legend.
   - Horizontal stacked progress bars for each sub-unit (district/office), segmented into green, yellow, and gray chunks matching status ratios.
   - Right-side progress text ("5 of 12 submitted") next to each bar.

---

## 7. Filter Card & Controls
- Single card container spanning the full width of the dashboard.
- Labels placed above inputs (`12px`, semibold, dark slate).
- Inputs feature rounded borders (`6px` to `8px`), comfortable height (`38px` to `42px`), and subtle focus rings.
- Role-restricted / locked fields display a small padlock icon (`🔒`) with a slightly muted background fill.
- Action Buttons:
  - **Reset**: Ghost button with subtle gray text and counter-clockwise refresh icon.
  - **Export CSV**: High-prominence secondary outlined button in brand navy (`#0F4C8A`) with download tray icon.
  - Avoid clashing primary buttons in the filter bar that compete with main workflow actions.

---

## 8. Main Table Card & Grid Elements
- **Card Header**:
  - Small tinted icon tile (e.g., school building icon in soft blue circle), card title ("Schools"), and italic helper subtitle ("Open a school to review its profile, personnel and sections.").
- **Table Structure**:
  - Background: Pure white card with soft light-blue header band (`#F0F6FC` or `#EBF3FA`).
  - Headers: Uppercase, tracking `0.05em`, muted gray-blue text (`#475569`), with sort carets and column filter funnel triggers.
  - **No always-visible search input row** across table columns; filter menus open on demand.
  - Column 1: Primary entity link in brand navy (`#0F4C8A`), semibold weight.
  - Secondary Columns (IDs, Counts): Tabular numerals, muted gray.
  - Status Column: Pill badge with colored dot (green for Submitted, yellow for Revision, gray for Not Yet).
  - Trailing Action: Right-aligned text link ("Review →") in brand navy.
  - Empty Values: Represented with a clean em-dash ("—"), never left blank or showing `null`/`undefined`.
  - Dividers & Hover: Fine hairline dividers (`#F1F5F9`) and soft hover row highlight (`#F8FAFC`).
  - Footer: Sticky pagination bar displaying "Showing x of y schools" with pagination buttons.

---

## 9. Applied UX Laws
1. **Fitts's Law**: Frequently clicked actions (KPI cards, row action links) have generous touch targets.
2. **Hick's Law**: Cascading filters reduce cognitive load by organizing large geographic trees into ordered dropdowns.
3. **Jakob's Law**: Tables, sort headers, and breadcrumbs follow standard web ergonomics that users already understand.
4. **Miller's Law**: Information is chunked into distinct visual containers (3 KPIs, 1 table, 1 filter group).
5. **Law of Proximity**: Related controls (search input and its label) are tightly grouped.
6. **Law of Similarity**: All entities in the same state share identical status colors across chart, badge, and card.
7. **Common Region**: Cards with distinct borders and backgrounds establish unmistakable boundary groupings.
8. **Von Restorff Effect**: The single outlined navy "Export CSV" and green "Submitted" indicators stand out naturally.
9. **Occam's Razor**: Interfaces omit redundant borders, nested cards, and unnecessary gradients.
10. **Pareto Principle**: 80% of daily user actions (check overall completion, view unsubmitted) are addressed in the top summary row.
11. **Doherty Threshold**: Interactive feedback (card clicks, sort changes) reacts instantaneously.
12. **Goal-Gradient Effect**: The central completion donut visualizes progress toward 100% submission.
13. **Aesthetic-Usability Effect**: Clean, calm, civic typography builds organizational trust and reduces user fatigue.
14. **Peak-End Rule**: Final status states and transmittals are rewarded with clear green badges and success indicators.
15. **Tesler's Law (Conservation of Complexity)**: Inherent administrative complexity is handled behind clean filter pickers.

---

## 10. Do and Don't Rules
- **DO**:
  - Keep status colors 100% consistent across every chart, progress bar, and badge.
  - Use sentence case for all titles, buttons, and labels (uppercase is reserved for table headers).
  - Use tabular lining figures for all numbers and percentages.
  - Display "—" for any empty or missing data values.
  - Provide clear loading skeletons and empty states for every data-fetching view.
- **DON'T**:
  - DO NOT use pure black (`#000000`) for text.
  - DO NOT use red for "Not yet submitted" or "Pending" items; red is strictly for overdue or errors.
  - DO NOT use monospace fonts inside input boxes, filter pickers, or standard table columns.
  - DO NOT duplicate identical metrics across multiple cards.
  - DO NOT place the main page title inside a white card surface; keep it on the canvas background.
  - DO NOT leave massive empty white spaces or dead areas inside cards.
  - DO NOT render text smaller than 11px.
