# Rules: UI Standard Audit

This document defines the strict, non-negotiable operational rules and boundary constraints for executing the `ui-standard-audit` skill.

## Hard Rules

1. **Strict Read-Only Enforcement on Source Code**:
   - The audited repository is 100% read-only.
   - All generated output MUST be written exclusively to `<audited-repo>/ui-audit/` (`scan.json`, `scores.json`, and `ui-audit-report.md`).
   - Never edit source files, install packages, run database migrations, or make git commits in the audited repository.
2. **Evidence-Based Scoring Mandate**:
   - Never score from memory, assumptions, or subjective impression.
   - Any score below the maximum (`score < max`) without verifiable evidence (`path:line`) is strictly invalid.
   - Full scores (`score == max`) must also be verified against actual code declarations or screenshots.
3. **Deterministic Report Generation**:
   - All arithmetic totals, percentages, grade bands, and category subtotals are generated solely by `scripts/render_report.py`.
   - Never manually compute scores, edit scorecard figures, or modify report markdown numbers by hand.
4. **Presentation-Layer Recommendation Scope**:
   - Recommendations must be presentation-layer by default (tokens, CSS variables, utility classes, component props, container wrappers).
   - Any modification touching backend queries, database schemas, API routes, user permissions, form logic, or business state machines must be prefixed with `STRUCTURAL` in the `finding`, placed in a dedicated structural section, and never assigned `P0`.
5. **Stack Native Idioms**:
   - All recommendations must use the audited repo's existing UI ecosystem (e.g. Mantine theme configs, Tailwind color extensions, MUI theme palettes).
   - Do not recommend new packages or libraries. If an optional library would assist, provide the no-dependency native implementation first.
6. **In-Scope Boundary**:
   - Audits apply strictly to **dashboard, overview, analytics, list, table, and form-card** interfaces.
   - Authentication, login, signup, and reset screens are out of scope unless the user explicitly provides a separate login design standard.
7. **Respect Intentional Content Differences**:
   - Do not penalize a repository for displaying domain-specific data (e.g., geographic map dashboards, timeline logs). Critique only the shared design system (typography, color, cards, metrics, and tables).
8. **No Fake Evidence**:
   - Never generate simulated screenshots or fabricated code citations. If an element cannot be inspected or tested, record it under `unverified`.

## Known Failure Modes to Prevent

- **Pixel-for-Pixel Cloning Trap**: Do not force the reference screenshot's exact layout onto apps with different business content. Adapt the design system patterns (typography, color, cards, metrics) to the app's real information architecture.
- **Single-Screen Over-Generalization**: Avoid scoring entire categories from a single sub-screen. If a criterion applies to routes that were not audited, mark it under `unverified`.
- **Phantom Font Recommendations**: Do not recommend "set `font-family: 'Plus Jakarta Sans'`" without providing the specific installation mechanism (`@fontsource/plus-jakarta-sans`, Google Fonts link, or local font face).
- **Misapplying Red to Incomplete States**: Do not suggest red badges for standard pending or unsubmitted items. The approved standard uses neutral slate gray for pending states, and reserves red strictly for overdue or critical error states.
- **Theme Illusion vs Component Reality**: Avoid scoring solely from a clean theme configuration file if component files override the theme with inline hex styles or custom classes. Verify actual JSX usage.
- **Generic AI Trend Clichés**: Avoid recommending gradients, neon glows, glassmorphism, or floating emojis. The approved design direction is calm, civic, restrained, and trustworthy.
