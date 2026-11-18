# UI design rules (any agent, any IDE)

For every UI task: use the Impeccable skill if installed (`/impeccable shape`, `critique`, `polish`). If this IDE cannot run it, use an installed fallback (ui-skill, frontend-design). If none exist, apply the rules below directly. Always read `PRODUCT.md` and `DESIGN.md` first and follow `docs/ui-design.md`.

Propose the design direction and wait for approval before applying it.

Avoid generic "AI template" design:
- No default purple/blue gradients, glassmorphism everywhere, or identical rounded card grids.
- No emoji as icons, no centered-everything hero layouts, no meaningless decorative blobs.
- No pure black on white or low-contrast gray text; check contrast (WCAG AA).
- Use a deliberate type scale and spacing scale from Mantine theme tokens, not arbitrary px values.
- One purposeful accent color; semantic colors only for status.
- Motion has a purpose (feedback, continuity), short durations, easing curves, and respects `prefers-reduced-motion`.
- Every screen defines loading, empty, error and success states, plus visible focus styles and keyboard support.
- Mobile-first and responsive; test narrow widths.
