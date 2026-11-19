# DESIGN

Design language for this app. Source of truth for UI tokens; mirror it in the Mantine theme (`apps/frontend/src/theme.ts`).

## Palette and themes (InsightED v2)

- Tokens live in `apps/frontend/src/styles/tokens.css`; the Mantine theme (`theme.ts`) mirrors them: custom `brand` indigo palette (primary `#4F46E5`), 6px default radius.
- Light is the default after sign-in. Dark (obsidian `#050814` base) is opt-in from the account menu (Light / Dark / System) and is stored by Mantine in the browser; tokens switch under `:root[data-mantine-color-scheme="dark"]`.
- Accents: indigo `#4F46E5` and cyan `#06B6D4` (dual accent line, nav active marker). Radii 6px / 4px / pill; shadows `sm` and `md`; motion 120ms UI and 240ms layout.
- The login page is always dark and uses its own scoped `.login-stage` styles (aurora, glass card, border beam); those effects are not used inside the app.

## Typography

- Fonts are role tokens in `tokens.css`: title `--font-serif` (Bricolage Grotesque, despite the name), headings/controls `--font-display` and body `--font-body` (Geist), identifiers `--font-mono` (Geist Mono). `theme.ts` reads the same variables, so changing the four values (and the Google Fonts link in `index.html`) restyles the whole app.
- To compare against the previous set, set `data-fonts="classic"` on `<html>` (Source Serif 4, Plus Jakarta Sans, Public Sans, IBM Plex Mono).
- Contrast of scale is the style: display titles are large, heavy and tight (`--fs-display`, -0.03em tracking); headings are 700 with slight negative tracking; body is 15px/1.55; labels, table headers and badges are 11px uppercase, +0.09em tracking; identifiers and numbers use the mono face or tabular numerals.
- Scale tokens (`--fs-*`, `--track-*`) live in `tokens.css` and are mirrored in Mantine `fontSizes` and `headings`. Secondary text uses `--text-secondary`.

## Earlier direction: plain Mantine

- Default Mantine 7 theme and default fonts. All styling decisions live in `apps/frontend/src/theme.ts` so the app can be restyled later without touching screens.
- Plus Jakarta Sans (carried over from other InsightED projects) is **not applied yet**; adopt it when a real design direction is approved.
- Semantic colors are defined once in `theme.ts` and reused by every badge: status (todo gray, in progress blue, in review grape, done green), priority (low gray, medium blue, high orange, urgent red), health (on track green, at risk yellow, off track red), sprint (planning gray, active blue, completed green).
- Component patterns: tables inside `Table.ScrollContainer`; forms with Mantine form plus the shared zod schema; modals for create and edit; a right-hand drawer for an activity (`?activity=<id>`); every screen shows loading, error and empty states through `QueryState`.
- Accessibility baseline: labels on inputs, `aria-label` on inline controls, keyboard-reachable, sort state exposed with `aria-sort`.

No Impeccable shape/critique/polish pass has been run. Run `/impeccable teach` to replace this section when a design direction is chosen.
