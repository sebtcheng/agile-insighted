# Backend (@myapp/backend)

- Structure: `src/routes` (thin) -> `src/services` (logic) -> `src/db` (Drizzle queries). Routes never call Drizzle directly.
- `src/db/schema.ts` is the DB source of truth. Change it, then run `npm run db:generate`; never hand-edit generated SQL without telling me.
- Schema changes follow `docs/db-changes.md` (rehearse locally, show rollback plan first).
- Connect to Postgres through PgBouncer (transaction pooling): no session-level state, no `SET`, no advisory locks across statements. Keep pool sizes small.
- Use `inArray`/joins, not query-per-row loops. Select only needed columns. Add indexes for new filters/joins.
- Middleware order: request ID -> pino-http -> Helmet -> rate limit -> body parser -> routes -> error handler.
- Queue producers/workers live in `src/queue`; workers are idempotent.
- Tests: Vitest + supertest for routes; swap auth/lock middleware for test doubles in integration tests.
