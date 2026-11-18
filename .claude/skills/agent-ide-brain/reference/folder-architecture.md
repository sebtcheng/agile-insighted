# Folder Architecture: VSA & Feature-Sliced Design

A detailed guide to the monorepo directory structure, layer boundaries, and directional dependencies.

## 1. Backend: Vertical Slice Architecture (VSA)

Traditional horizontal layered architecture divides code by technical concern:
- `controllers/`
- `services/`
- `models/`
- `repositories/`

This forces an AI agent to ingest multiple unrelated folders whenever adding or modifying an endpoint, scattering context across dozens of files.

### The Vertical Slice Model
In VSA, every business capability is organized into a cohesive, self-contained slice under `apps/backend/src/features/[slice]/`:

```
apps/backend/src/features/auth/
├── route.ts         # Endpoint declarations & HTTP transport
├── handler.ts       # Controller logic & response mapping
├── schema.ts        # Request/response Zod validation schemas
├── repository.ts    # Drizzle queries & database access
├── auth.spec.ts     # Unit & integration tests for this slice
└── index.ts         # Explicit public API export
```

### Shared Kernel & Platform Modules:
- `apps/backend/src/db/`: Database connection pool, Drizzle instance, migrations, and `schema.ts`.
- `apps/backend/src/platform/`: Universal middleware (logging, authentication, rate limiting, error handlers).

### Dependency Rules:
1. Slices on the same layer must never import from each other's internals.
2. The only permitted cross-slice interaction is through the explicit public API (`index.ts`) of the target slice, or via decoupled domain events.
3. Feature slices may depend on `db/`, `platform/`, and `packages/shared`. Platform and DB modules must never depend on feature slices.

---

## 2. Frontend: Feature-Sliced Design (FSD)

Frontend code under `apps/frontend/src/` follows the strict layer hierarchy of Feature-Sliced Design (FSD):

```
apps/frontend/src/
├── app/         # App initialization, providers, routing, global styles
├── pages/       # Route-level views assembled from widgets & features
├── widgets/     # Autonomous UI blocks (Header, Sidebar, Feed)
├── features/    # User interactions carrying business value (AuthByEmail, SearchFilter)
├── entities/    # Core business models (User, Post, Comment)
└── shared/      # Framework-agnostic UI kits, utilities, API client
```

### Layer Dependency Matrix:
Imports are strictly unidirectional downwards:
- `app` can import from `pages`, `widgets`, `features`, `entities`, `shared`.
- `pages` can import from `widgets`, `features`, `entities`, `shared`.
- `widgets` can import from `features`, `entities`, `shared`.
- `features` can import from `entities`, `shared`.
- `entities` can import from `shared`.
- `shared` can import from external libraries, but no FSD layers above it.

### Slice Isolation:
- Slices on the same layer (e.g. `features/search` and `features/auth`, or `entities/user` and `entities/post`) **must never import each other**.
- Composition of multiple features or entities must occur in the layer above (e.g. within a `widget` or `page`).
- Slices must export their public interface via `index.ts`. External imports must use `@/features/[slice]`, never `@/features/[slice]/ui/internal.tsx`.

---

## 3. Enforcement via Linting Tooling

- In TypeScript monorepos, these architectural rules are deterministically enforced using `eslint-plugin-boundaries` and `@feature-sliced/steiger`.
- Violations are reported during the `npm.cmd run lint` gate. The agent receives exact line numbers and boundary rules, enabling autonomous correction.

*(Note on Other Ecosystems: In .NET or Java backends, equivalent architectural fitness functions are enforced using NetArchTest or ArchUnit test suites. For this TypeScript monorepo, ESLint and Steiger serve as the primary enforcement engines).*
