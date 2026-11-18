# myapp

TypeScript monorepo: Express API + React/Mantine UI, PostgreSQL via Drizzle. Single source of truth for all coding agents (Claude Code, Antigravity). Keep this file short; detail lives in nested files and `docs/`.

## Layout

- `apps/backend` (@myapp/backend): Express API. See `apps/backend/CLAUDE.md`
- `apps/frontend` (@myapp/frontend): React + Mantine UI. See `apps/frontend/CLAUDE.md`
- `packages/shared` (@myapp/shared): zod schemas and API types used by both sides
- `docs/`: `db-changes.md`, `architecture.md`, `skills.md`, `ui-design.md`
- `PRODUCT.md` + `DESIGN.md`: product context and design language (read before any UI work)

Frontend and backend never import each other. They share only `@myapp/shared`.

## Stack

TypeScript + Node.js end to end. Express, React + Mantine, TanStack Query, zod, Drizzle (`schema.ts` is the DB source of truth, drizzle-kit migrations), PostgreSQL behind PgBouncer, Redis + BullMQ for buffered writes, pino logging with request IDs, Helmet + express-rate-limit, Vitest, Playwright. Quality tooling: oxlint (fast first pass), ESLint + typescript-eslint (type-aware, React hooks), Prettier, gitleaks, npm audit. Deploy: nginx + PM2 on a Linux VM. Python only for VM tooling, never the app backend.

## Commands

- `npm ci` install
- `npm run lint` (oxlint then ESLint), `npm run typecheck`, `npm run format:check`, `npm run build`, `npm test`
- `npm run ci` runs the full gate locally; GitHub Actions runs the same steps (`.github/workflows/ci.yml`)
- `npm run dev -w @myapp/backend` / `npm run dev -w @myapp/frontend`
- `npm run db:generate -w @myapp/backend` generate a migration

## Hard rules

1. Never print, log, or commit secrets from `.env` files. Use `.env.example` for shape only.
2. Every schema change is generated with drizzle-kit, rehearsed on a local or scratch database with realistic data, and shown with a rollback plan before it goes to any shared database. Details: `docs/db-changes.md`.
3. Run the `ci-gate` skill before saying work is done.
4. Never touch the production DB or the VM without asking first.

## Conventions

- Validate every request body, query and response with zod schemas from `@myapp/shared`.
- No `any`; strict TS. Prefer small modules over large files.
- Errors: throw typed errors, handle in one Express error middleware; never leak stack traces to clients.
- Every log line is structured pino with the request ID.
- Writes that must survive bursts go through the BullMQ queue, not directly to Postgres.

## UI work

Every UI task (new or changed screens, components, styling, motion) uses the Impeccable skill: read PRODUCT.md and DESIGN.md, `/impeccable shape` before building, `/impeccable critique` then `polish` before done. If the IDE can't run Impeccable, use the fallback ladder in `docs/ui-design.md`; with no skill at all, follow `.agents/rules/ui-design.md`. Propose the design direction and wait for approval before applying.

## Skills

Run on demand, not in a fixed order. Catalog in `docs/skills.md`.
