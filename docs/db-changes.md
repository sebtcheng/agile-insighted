# DB changes

1. Edit `apps/backend/src/db/schema.ts`.
2. `npm run db:generate -w @myapp/backend` (drizzle-kit creates the migration).
3. Rehearse on a local or scratch DB with realistic data volume. Check timing and locks.
4. Write the rollback plan (down SQL or restore step) and show it with the migration before applying to any shared DB.
5. Destructive steps (drop/rename/type change) use expand -> backfill -> contract across separate deploys.
6. Never run `drizzle-kit push` against a shared DB. Production is applied by the human, not the agent.
