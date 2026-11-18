<!-- agent-brain:begin backend-rules -->
# Backend Agent Rules ({{packageScope}}/backend)

Covers `{{backendDir}}` (Express, Drizzle ORM, PostgreSQL, Redis).

## Conventions

- Vertical Slice Architecture: co-locate route, handler, schema, repository, and tests under `src/features/[slice]/`.
- Public API contract: every slice exports only through its `index.ts`. Slices never reach into other slice internals.
- Edge validation: validate all incoming requests with Zod schemas at the router boundary.
- Database source of truth: `src/db/schema.ts` is the single source of truth.
- Migrations: generate with drizzle-kit; rehearse on local DB with realistic data; write rollback plan in `docs/db-changes.md` before any shared DB.
- Structured logging: use Pino logger with incoming `requestId` on every log entry.
- Background jobs: BullMQ on Redis for queue workers; do not wire queue workers directly into HTTP response loops.
- Error handling: use typed application errors with predictable HTTP status codes; never leak raw DB errors.
- Tests: write unit and integration specs co-located with slices (`*.spec.ts`); run targeted slice tests for Tier 1.
<!-- agent-brain:end backend-rules -->
