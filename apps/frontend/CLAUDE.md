# Frontend (@myapp/frontend)

- React + Mantine only for UI. Use Mantine components and theme tokens; no ad-hoc CSS colors or fonts.
- Server state via TanStack Query; no fetch in components, use hooks in `src/api`.
- Types and zod schemas come from `@myapp/shared`; never redefine API types.
- Every screen handles loading, empty, error and success states.
- Forms: Mantine form + zod resolver using the shared schema.
- Accessibility: labels on inputs, keyboard reachable.
- Tests: Vitest for logic, Playwright for critical flows and failure paths.
- For ANY UI task follow `docs/ui-design.md`: read `PRODUCT.md`/`DESIGN.md`, use Impeccable (`shape` -> build -> `critique` -> `polish`), propose direction and wait for approval. Keep the Mantine theme in sync with `DESIGN.md`.
