<!-- agent-brain:begin architecture-rules -->
# Architecture Rules & Boundary Contracts

## 1. Backend: Vertical Slice Architecture (VSA)

Backend code resides in `{{backendDir}}`. Features are organized into vertical slices under `src/features/[slice]/`.

### Colocation within a slice:
- `route.ts`: HTTP route definitions and endpoint wiring.
- `handler.ts`: Request controller and response serialization.
- `schema.ts`: Request/response validation schemas (Zod).
- `repository.ts`: Data access queries (Drizzle ORM).
- `[slice].spec.ts`: Unit and integration test specs.
- `index.ts`: The explicit public API for the slice.

### Platform and Kernel Folders:
- `src/db/`: Database connection pool, Drizzle client, migrations config, and `schema.ts` (the central DB schema).
- `src/platform/`: Core middleware (authentication, logging, rate limiting, error formatting).

### Boundary Rules:
- Slices on the same layer must never reach directly into another slice's internal files.
- If slice A must communicate with slice B, it must import strictly through slice B's public `index.ts` API or dispatch an internal event.
- Features may import from `db/`, `platform/`, and `{{sharedDir}}`. Platform and DB modules must never depend on feature slices.

## 2. Frontend: Feature-Sliced Design (FSD)

Frontend code resides in `{{frontendDir}}`. Architecture strictly follows Feature-Sliced Design.

### Layer Hierarchy (top to bottom):
1. `app`: Application initialization, global styles, providers, router configuration.
2. `pages`: Routing views assembled from widgets and features.
3. `widgets`: Self-contained UI blocks composed of features and entities.
4. `features`: User interaction flows carrying business value (e.g., auth-by-email, edit-profile).
5. `entities`: Business domain concepts (e.g., user, product, order).
6. `shared`: Reusable UI components, utilities, API clients, and shared libraries.

### Directional Dependency Rule:
- A layer may only import from layers strictly below it in the hierarchy:
  `app` -> `pages` -> `widgets` -> `features` -> `entities` -> `shared`.
- Slices on the same layer must never import each other (e.g., a feature cannot import another feature; an entity cannot import another entity).
- Cross-slice interaction on the same layer must be orchestrated by the layer above it.

### Public API Enforcement:
- Every slice must define an `index.ts` exposing its public interface.
- External files must import solely from the slice index (e.g., `@/entities/user`), never from nested paths (e.g., `@/entities/user/ui/card`).

## 3. Shared Package

- `{{sharedDir}}`: Shared contracts, Zod schemas, domain types, and pure deterministic utilities used by both backend and frontend.
- Must not depend on backend or frontend frameworks.
<!-- agent-brain:end architecture-rules -->
