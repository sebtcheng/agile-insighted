# DESIGN

Design language for this app. Source of truth for UI tokens; mirror it in the Mantine theme (`apps/frontend/src/theme.ts`).

## Current direction: plain Mantine (decided for now)

- Default Mantine 7 theme and default fonts. All styling decisions live in `apps/frontend/src/theme.ts` so the app can be restyled later without touching screens.
- Plus Jakarta Sans (carried over from other InsightED projects) is **not applied yet**; adopt it when a real design direction is approved.
- Semantic colors are defined once in `theme.ts` and reused by every badge: status (todo gray, in progress blue, in review grape, done green), priority (low gray, medium blue, high orange, urgent red), health (on track green, at risk yellow, off track red), sprint (planning gray, active blue, completed green).
- Component patterns: tables inside `Table.ScrollContainer`; forms with Mantine form plus the shared zod schema; modals for create and edit; a right-hand drawer for an activity (`?activity=<id>`); every screen shows loading, error and empty states through `QueryState`.
- Accessibility baseline: labels on inputs, `aria-label` on inline controls, keyboard-reachable, sort state exposed with `aria-sort`.

No Impeccable shape/critique/polish pass has been run. Run `/impeccable teach` to replace this section when a design direction is chosen.
