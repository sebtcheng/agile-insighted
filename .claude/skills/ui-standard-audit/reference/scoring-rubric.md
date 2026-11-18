# Scoring Rubric: Schools Review Design Standard

This rubric establishes objective, reproducible scoring criteria for auditing any web application UI against the approved Schools Review design standard (`reference/design-standard.md`).

Every criterion is scored on a three-tier scale:
- **Full**: Full points awarded. The requirement is satisfied across all examined in-scope screens without notable deviations.
- **Partial (~50%)**: Approximately half points awarded. Requirement is partially met, implemented inconsistently, or displays minor non-compliance.
- **Zero**: Zero points. The requirement is missing, unhandled, or directly contradicted by the implementation.
- **N/A**: Marked `na: true` only if the project genuinely has no applicable UI surface (e.g. no tabular data anywhere in the product).

## Table of Contents
- [Category A: Typography (15 pts)](#category-a-typography-15-pts)
- [Category B: Color (15 pts)](#category-b-color-15-pts)
- [Category C: Cards and Surfaces (10 pts)](#category-c-cards-and-surfaces-10-pts)
- [Category D: Layout and Hierarchy (15 pts)](#category-d-layout-and-hierarchy-15-pts)
- [Category E: KPI and Data Visualization (15 pts)](#category-e-kpi-and-data-visualization-15-pts)
- [Category F: Tables (15 pts)](#category-f-tables-15-pts)
- [Category G: Filters and Controls (5 pts)](#category-g-filters-and-controls-5-pts)
- [Category H: UX Laws and Accessibility (10 pts)](#category-h-ux-laws-and-accessibility-10-pts)
- [How to Score](#how-to-score)

---

### Category A: Typography (15 pts)

#### A1. Plus Jakarta Sans Adoption & Loading (Max: 4 pts)
- **Full (4 pts)**: Plus Jakarta Sans is configured as the primary UI font across body, labels, inputs, tables, and buttons, and is verified loaded via `@fontsource`, Google Fonts `<link>`, or `@font-face`.
- **Partial (2 pts)**: Configured in CSS/theme but font package/link is missing, OR used in parts of the app while system fallbacks/other sans fonts dominate main surfaces.
- **Zero (0 pts)**: A different font family (e.g. Arial, Roboto, Inter, Segoe UI) is used as primary font with no Plus Jakarta Sans integration.

#### A2. Serif Role Reservation & Monospace Isolation (Max: 3 pts)
- **Full (3 pts)**: Serif is strictly reserved for page titles and subtitles; no more than 4 total font families exist; inputs, selects, filters, and standard tables use sans-serif only with zero monospace.
- **Partial (1.5 pts)**: Serif is used appropriately for titles, but monospace appears in filter inputs, form fields, or standard table cells.
- **Zero (0 pts)**: Serif used inappropriately for body/card contents, or font families exceed 4 without clear hierarchy.

#### A3. Hero & KPI Numerals Styling (Max: 3 pts)
- **Full (3 pts)**: KPI and hero figures use ExtraBold/Bold weights with tabular lining figures (`tabular-nums`); unit characters (`%`, `schools`) are rendered noticeably smaller (~55-60%) and muted.
- **Partial (1.5 pts)**: Numbers are bold, but lack tabular figures (causing layout jitter), or unit symbols are identical in size and weight to the primary numeral.
- **Zero (0 pts)**: Figures use normal font weights, lack proportional sizing, or are styled identically to regular prose text.

#### A4. Secondary Text Sizing & Minimum Contrast (Max: 3 pts)
- **Full (3 pts)**: All secondary text, subtitles, and captions are at least 12px; no rendered text is below 11px; muted text maintains at least 4.5:1 WCAG AA contrast.
- **Partial (1.5 pts)**: Isolated captions or meta text drop below 12px (e.g. 10.5px or 11px) with acceptable contrast, or contrast is slightly washed out.
- **Zero (0 pts)**: Frequent text below 11px, or ultra-faint gray text failing basic legibility standards.

#### A5. Typographic Scale & Header Casing (Max: 2 pts)
- **Full (2 pts)**: Clear hierarchy from Page Title (~28-32px) -> Card Title (~14-16px) -> Body (~14px) -> Captions (~12px); uppercase text is strictly limited to table header labels; sentence case is used everywhere else.
- **Partial (1 pt)**: Typographic hierarchy is mostly clear, but all-caps is overused on buttons, card titles, or badges.
- **Zero (0 pts)**: Unstructured font sizes with inconsistent casing, arbitrary heading tags, or chaotic size jumps.

---

### Category B: Color (15 pts)

#### B1. Brand Palette & Canvas Tint (Max: 4 pts)
- **Full (4 pts)**: Uses brand navy (`#0F4C8A`), red (`#D4182F`), and yellow (`#FFC629`) accents; page background is a distinct light-blue tint (`#E8EFF7`); cards are white with cool gray borders.
- **Partial (2 pts)**: Uses brand blue/navy, but page canvas is pure white or stark gray instead of the calm civic light-blue tint.
- **Zero (0 pts)**: Canvas uses non-standard themes (e.g. purple, dark slate, saturated green, or arbitrary corporate templates).

#### B2. Status Color Consistency & Single Definition (Max: 4 pts)
- **Full (4 pts)**: Status colors (Submitted = Green, For Revision = Amber/Yellow, Not Yet = Slate Gray) are identical across donut charts, KPI cards, stacked bars, and table badges, and defined in a single centralized token file.
- **Partial (2 pts)**: Status colors are mostly consistent, but defined independently across multiple component files with slight hex divergence.
- **Zero (0 pts)**: Conflicting status hues across screens (e.g. blue for submitted in one place, orange in another), or scattered arbitrary colors.

#### B3. Token/Variable Architecture & Pure Black Elimination (Max: 3 pts)
- **Full (3 pts)**: Colors are consumed via CSS custom properties or theme tokens (e.g. Mantine theme / Tailwind tokens); zero instances of pure black (`#000`, `#000000`, `rgb(0,0,0)`) text.
- **Partial (1.5 pts)**: Mostly tokenized, but several component files contain hardcoded hex codes, or minor instances of pure black text exist.
- **Zero (0 pts)**: Entire codebase relies on scattered raw hex literals with widespread pure black typography.

#### B4. Status Hue Integrity & Red Semantic Reservation (Max: 2 pts)
- **Full (2 pts)**: No muddy/brown off-palette hues for status badges; Red is strictly reserved for overdue submissions and critical error states, never for standard pending/not-yet-submitted items.
- **Partial (1 pt)**: Clean status palette, but red is occasionally assigned to standard pending or neutral incomplete states.
- **Zero (0 pts)**: Brown/orange/neon hues used arbitrarily for standard statuses, or red dominates normal pending lists.

#### B5. WCAG AA Contrast Compliance (Max: 2 pts)
- **Full (2 pts)**: All text elements, status chips, and interactive buttons achieve at least 4.5:1 contrast against their respective backgrounds (3:1 for large text).
- **Partial (1 pt)**: Only 1-2 low-contrast edge cases identified (e.g. light yellow badge text with white background).
- **Zero (0 pts)**: Widespread unreadable low-contrast text combinations throughout the UI.

---

### Category C: Cards and Surfaces (10 pts)

#### C1. Card Geometry, Borders & Elevation (Max: 4 pts)
- **Full (4 pts)**: All dashboard containers use uniform 12-16px rounded corners, 1px solid cool gray border (`#CBD5E1`), subtle soft shadow, and pure white background.
- **Partial (2 pts)**: Cards are white with borders, but corner radiuses vary widely (e.g. mixing 4px, 8px, and 24px) or shadows are harsh.
- **Zero (0 pts)**: Heavy drop shadows, missing borders, borderless floating boxes, or inconsistent container backgrounds.

#### C2. Information Grouping, Equal Heights & Padding (Max: 3 pts)
- **Full (3 pts)**: Logically related items are consolidated into single cards; cards sitting in the same horizontal row have identical heights; uniform 16-24px internal padding.
- **Partial (1.5 pts)**: Clean cards, but row items exhibit mismatched vertical heights or inconsistent inner padding.
- **Zero (0 pts)**: Fragmented visual boxes, chaotic padding, and ragged misaligned container heights.

#### C3. Bare Page Header & Unified Filter Card (Max: 3 pts)
- **Full (3 pts)**: Page title and scope subtitle sit directly on the light-blue canvas (not enclosed in a card); all filter controls are consolidated into a single dedicated white card.
- **Partial (1.5 pts)**: Header sits correctly on background, but filter inputs are scattered across multiple detached cards or toolbars.
- **Zero (0 pts)**: Entire header is boxed into an unnecessary card banner, or filters float without a container card.

---

### Category D: Layout and Hierarchy (15 pts)

#### D1. Summary-First 3-Part Metric Row (Max: 5 pts)
- **Full (5 pts)**: Dashboard opens with a unified summary row placed directly above the main table: Hero Metric Donut (Left) -> Stacked KPIs (Center) -> Breakdown Visual (Right).
- **Partial (2.5 pts)**: Metrics appear before the table, but layout order is jumbled, or one of the key modules is detached or missing.
- **Zero (0 pts)**: Main table immediately dominates the screen with no aggregate metrics row, or metrics are buried at the bottom.

#### D2. Grid Alignment & Responsive Graceful Wrap (Max: 4 pts)
- **Full (4 pts)**: Consistent grid gutters (16-24px), flush edges, and seamless column wrapping when resized below 1280px without horizontal scroll or broken cards.
- **Partial (2 pts)**: Clean desktop grid, but displays minor horizontal clipping or awkward wrapping between 1024px and 1280px.
- **Zero (0 pts)**: Broken grid layout, overlapping elements, misaligned margins, or forced horizontal scrolling on standard laptop displays.

#### D3. Table Proximity to Fold & Dead Space Elimination (Max: 3 pts)
- **Full (3 pts)**: Main data table header is visible above or immediately at the standard viewport fold (800-900px height); cards have zero large empty voids or dead zones.
- **Partial (1.5 pts)**: Table requires moderate scrolling to reach due to overly tall summary cards, but card internal space is utilized reasonably.
- **Zero (0 pts)**: Table pushed miles below the fold by massive empty whitespace cards, oversized charts, or bloated spacers.

#### D4. Clear Civic Page Header & Scope Context (Max: 3 pts)
- **Full (3 pts)**: Prominent page title in navy bold text paired with an italicized administrative scope subtitle (e.g. Division/Region/Office), immediately orienting the user.
- **Partial (1.5 pts)**: Page title exists, but administrative scope/context subtitle is omitted or ambiguous.
- **Zero (0 pts)**: Missing page header, or generic generic unlabeled dashboard screen.

---

### Category E: KPI and Data Visualization (15 pts)

#### E1. Structured Interactive KPI Cards (Max: 4 pts)
- **Full (4 pts)**: KPI cards feature a tinted circular icon badge, semibold title, large numeral with percentage breakdown in parentheses, "View list →" affordance, and the whole card is clickable to filter table records.
- **Partial (2 pts)**: KPI cards have numbers and titles, but lack interactive filtering, icon circles, or percentage breakdowns.
- **Zero (0 pts)**: Plain text numbers without containers, or raw stat boxes lacking labels and interaction.

#### E2. Centered Metric Donut Chart (Max: 4 pts)
- **Full (4 pts)**: Large donut chart (200-260px) with thick ring and wide central hole displaying bold centered percentage, smaller unit text, label, and bottom contextual ratio caption ("X of Y submitted").
- **Partial (2 pts)**: Donut chart present, but ring is thin/wireframe, central percentage is missing, or bottom ratio caption is omitted.
- **Zero (0 pts)**: Pie chart with no central hole, tiny illegible legend-dependent ring, or no aggregate circular visual.

#### E3. Segmented Breakdown Progress Bars (Max: 4 pts)
- **Full (4 pts)**: Breakdown card shows horizontal progress bars divided into colored status segments matching standard status tokens, accompanied by a compact legend and "X of Y submitted" labels.
- **Partial (2 pts)**: Progress bars exist, but show only a single progress color without segment breakdown by status, or lack ratio text.
- **Zero (0 pts)**: Bare raw tables or bulleted lists in place of visual progress bars.

#### E4. Metric Consistency & Mathematical Reconciliation (Max: 3 pts)
- **Full (3 pts)**: All metrics reconcile 100% across donut percentages, KPI numbers, breakdown segments, and table counts; rounding sums cleanly to totals.
- **Partial (1.5 pts)**: Numbers generally align, but minor rounding discrepancies or 1-count off mismatches exist between charts and tables.
- **Zero (0 pts)**: Severe contradictions between dashboard totals, charts, and table row counts.

---

### Category F: Tables (15 pts)

#### F1. Table Header Styling & On-Demand Column Filters (Max: 4 pts)
- **Full (4 pts)**: Headers styled in small uppercase muted text on a light-blue header band with sort carets and column filter triggers; **no always-visible filter input row** cluttering the grid.
- **Partial (2 pts)**: Clean header styling, but per-column search inputs are permanently visible as a full row of inputs across every column.
- **Zero (0 pts)**: Plain unstyled HTML table headers, missing sort affordances, or chaotic header alignments.

#### F2. Soft Status Badges with Colored Dots (Max: 3 pts)
- **Full (3 pts)**: Status values rendered as soft pill badges with a matching colored indicator dot, utilizing standard status token colors and dark legible text.
- **Partial (1.5 pts)**: Badges used, but lack colored indicator dots, or use harsh heavy backgrounds with white text.
- **Zero (0 pts)**: Raw status text strings without badges, or wildly inconsistent badge styling.

#### F3. Column Hierarchy & Row Action Links (Max: 3 pts)
- **Full (3 pts)**: Primary entity column is styled as a prominent brand blue link; secondary columns use muted text with tabular figures; trailing action link ("Review →"); soft hover row highlight.
- **Partial (1.5 pts)**: Good column styling, but row action links or hover highlights are missing.
- **Zero (0 pts)**: Flat text table with no visual hierarchy, no hover feedback, and no row actions.

#### F4. Hairline Dividers, Comfortable Row Density & Null Handling (Max: 3 pts)
- **Full (3 pts)**: Clean 1px hairline row dividers, comfortable row padding (44-52px height), redundant repeated columns hidden, and missing/null values consistently rendered as "—".
- **Partial (1.5 pts)**: Row dividers and height are good, but blank cells are left empty or display raw `null`/`undefined`/`#N/A`.
- **Zero (0 pts)**: Dense cramped rows, heavy black border grids, or messy null data presentation.

#### F5. Sticky Headers & Pagination Metadata (Max: 2 pts)
- **Full (2 pts)**: Sticky header bar on vertical scroll, accompanied by clear pagination displaying "Showing X of Y items" with consistent date formats (`MMM D, YYYY`).
- **Partial (1 pt)**: Pagination exists, but table header is not sticky, or date formats vary arbitrarily across rows.
- **Zero (0 pts)**: Unpaginated table dumping hundreds of rows, or zero records count indicator.

---

### Category G: Filters and Controls (5 pts)

#### G1. Filter Card Architecture & Input Styling (Max: 3 pts)
- **Full (3 pts)**: All filters live in one dedicated card with labels placed above inputs, rounded borders (6-8px), solid slim borders in the UI font; role-restricted fields clearly display a lock icon and muted fill.
- **Partial (1.5 pts)**: Single filter card used, but labels are inline or placeholder-only, or locked fields lack visual indicator icons.
- **Zero (0 pts)**: Floating disjointed filter fields, unstyled inputs, or missing field labels.

#### G2. Control Hierarchy & Reset/Export Affordances (Max: 2 pts)
- **Full (2 pts)**: Clear action hierarchy featuring a ghost button for "Reset" and a single prominent outlined navy button for "Export CSV"; enabled and disabled button states are immediately distinguishable.
- **Partial (1 pt)**: Reset and export actions exist, but use identical buttons or competing solid bright primary colors.
- **Zero (0 pts)**: Missing reset/export capabilities, or unclear interactive states.

---

### Category H: UX Laws and Accessibility (10 pts)

#### H1. Touch Targets, Action Grouping & Ergonomics (Max: 3 pts)
- **Full (3 pts)**: Buttons and clickable elements maintain minimum 40px touch targets (Fitts); related actions are grouped logically (Hick); layout adheres to standard web expectations (Jakob).
- **Partial (1.5 pts)**: Ergonomics generally solid, but a few small buttons or close-clustered icon actions fall below 36px touch targets.
- **Zero (0 pts)**: Cramped, microscopic click areas or bizarre unexpected navigation paradigms.

#### H2. Feedback States: Loading, Empty & Error (Max: 3 pts)
- **Full (3 pts)**: Dedicated skeleton loaders matching card shapes during loading; friendly, illustrated empty states with recovery suggestions; clean non-disruptive error banners.
- **Partial (1.5 pts)**: Loading spinners present, but lack layout skeletons; empty states show bare text ("No data") without guidance.
- **Zero (0 pts)**: UI freezes with blank white screens on load, crashes on error, or shows broken tables on empty queries.

#### H3. Keyboard Navigation & ARIA Icon Labels (Max: 2 pts)
- **Full (2 pts)**: Visible keyboard focus ring (`:focus-visible`) on all interactive controls; all icon-only buttons carry explicit `aria-label` attributes; standard tabindex flow.
- **Partial (1 pt)**: Focus rings exist, but some icon buttons lack `aria-label` attributes.
- **Zero (0 pts)**: `outline: none` removes focus indicators with no replacement, and icon buttons are completely unlabeled for screen readers.

#### H4. 1366px Laptop Width Stability (Max: 2 pts)
- **Full (2 pts)**: Screen layout displays without horizontal overflow, cut-off cards, or text collisions when tested at 1366x768px laptop resolution.
- **Partial (1 pt)**: Mostly functional at 1366px, but minor padding crunch or text truncation occurs in tighter cards.
- **Zero (0 pts)**: Severe horizontal scrollbar triggered or elements smash into each other at 1366px.

---

## How to Score
1. Audit each criterion independently using `scan.json` and code inspection (plus screenshots when available).
2. Award **Full**, **Partial (~50%)**, or **Zero** points based on the exact definitions above. Half-point increments (`0.5`) are permitted.
3. Every deduction (`score < max`) MUST cite at least one concrete piece of evidence (`path:line` or screenshot name) and specify an actionable recommendation.
4. Mark a criterion `na: true` ONLY when the audited repository has no such UI feature anywhere in its scope. Provide an explanation in `finding`.
