<!-- agent-brain:begin frontend-rules -->
# Frontend Agent Rules ({{packageScope}}/frontend)

Covers `{{frontendDir}}` (React, Mantine UI, TanStack Query, Vite).

## Conventions

- Feature-Sliced Design: adhere strictly to layers `app` > `pages` > `widgets` > `features` > `entities` > `shared`.
- Slice isolation: slices on the same layer must never import from each other.
- Public API contract: import only from slice index (`@/features/[slice]`), never deep internals (`@/features/[slice]/ui/...`).
- Server state: manage async data with TanStack Query; keep UI components focused on presentation and user interaction.
- UI design tasks: use the Impeccable skill for UI design tasks, or an equivalent design review where the IDE cannot run it.
- Responsive design: utilize Mantine theme tokens, breakpoints, and ergonomic styling utilities; avoid hardcoded magic pixels.
- Forms & validation: use Mantine form hooks combined with Zod schemas from `{{sharedDir}}`.
- Tests: write component and hook tests with Vitest and Testing Library co-located with slices.
<!-- agent-brain:end frontend-rules -->
