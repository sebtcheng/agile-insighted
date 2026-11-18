# Conventions (InsightED PM App)

Read this before every phase. Layout note: this repo uses `apps/backend` (API), `apps/frontend` (web) and `packages/shared` under the `@myapp/*` scope, not the `apps/api` / `apps/web` names used in the build-plan prompts.

## Stack (fixed)

- TypeScript (strict, no `any`). Node.js + Express API; React + Mantine frontend with the default Mantine theme (all styling decisions in one theme file so it can be restyled later).
- Monorepo: `/apps/frontend`, `/apps/backend`, `/packages/shared` (types, zod schemas, enum labels).
- PostgreSQL 16+ with **Drizzle ORM**; the Drizzle TypeScript schema is the source of truth. Migrations via drizzle-kit (`generate` + `migrate`); never `drizzle-kit push` outside a throwaway local DB. Where Drizzle cannot express something (composite FK with column-list `SET NULL`, generated columns, partial indexes, triggers, extensions), add a hand-written SQL migration in the same folder and note it in the README.
- Email + password auth, server-side sessions in an HttpOnly, SameSite=Lax, Secure-in-production cookie. Hash passwords with argon2. zod validation on every request.
- Safe behind PgBouncer transaction pooling: no session-level state, no session advisory locks, no temp tables across statements.
- Internal single-tenant tool: no multi-tenancy, billing, SSO, email, notifications, real-time sync, or file attachments.

## PostgreSQL conventions (apply to every table, in every phase)

- **Primary keys**: UUIDv7 (time-ordered). Use `uuidv7()` as the default if the server is PG 18+ (check `SELECT version()`); otherwise generate v7 ids in the app. Never `gen_random_uuid()`.
- **Types**: `text` instead of `varchar(n)` (add `CHECK (char_length(col) <= n)` where a limit matters); `timestamptz` for instants; `date` for calendar dates; `smallint` for small bounded numbers; native enums for closed value sets (add values only via additive migration).
- **Constraints in the database, not only the API**: `NOT NULL` by default, `CHECK` for ranges and state rules, unique indexes for business keys, explicit `ON DELETE` on every foreign key.
- **Index every foreign key column**; prefer **partial indexes** for hot filtered queries.
- **Case-insensitive uniqueness** (emails, codes, names) via a unique index on `lower(col)`; normalize in the app too.
- **`updated_at`** maintained by a shared `set_updated_at()` trigger (custom SQL migration).
- **Same-project integrity via composite foreign keys**: give `subprojects` and `sprints` (and later `releases`) a `UNIQUE (project_id, id)`; tables carrying `project_id` plus `subproject_id`/`sprint_id` reference them as `FOREIGN KEY (project_id, subproject_id) REFERENCES subprojects (project_id, id)`, with `ON DELETE SET NULL (subproject_id)` (PG 15+ column-list form) so only the optional column is nulled.
- **Event capture in the same transaction**: every change to an activity's status, blocked flag, sprint or assignee writes an `activity_events` row in the same transaction via one service function (`activityService.update`). No other code path may update those columns.
- **Connection safety**: pooled `pg` client with explicit max size, `statement_timeout` 15s and `idle_in_transaction_session_timeout` 30s per connection, `application_name` set; migrations use a short `lock_timeout`. Keyset pagination (not OFFSET) for activity lists.
- **Human-readable codes** for module rows (later phases): integer `seq` unique per project from a `code_counters` row inside the same transaction, plus a generated stored `code` column.
