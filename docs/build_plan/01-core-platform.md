# Phase 1 of 4: Core Platform (InsightED PM App)

You are a coding agent in an empty (or near-empty) repository. Build the core platform of InsightED, an internal project-management web app used by about **7 people working across about 15 subprojects** under one umbrella project. Later phases add governance rules, portfolio views, and the four discovery modules (Opportunity Solution Tree, User Story Mapping, Kano Request Tracker, RAID Log), so design for them, but build **only what this prompt lists**.

## First deliverable: conventions doc

Before writing code, save the **Stack** and **PostgreSQL conventions** sections below, verbatim, as `docs/CONVENTIONS.md`, and create `docs/PROGRESS.md` (a running log). Create a short `AGENTS.md` at the repo root telling any agent to read `docs/CONVENTIONS.md` and `docs/PROGRESS.md` first and to add a new migration (never edit an earlier one). Later phases rely on these files.

## Stack (fixed)

- TypeScript (strict, no `any`). Node.js + Express API; React + Mantine frontend with the default Mantine theme (all styling decisions in one theme file so it can be restyled later).
- Monorepo: `/apps/web`, `/apps/api`, `/packages/shared` (types, zod schemas, enum labels).
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

## Schema for this phase

Enums: `user_role` (pm, team_member); `sprint_status` (planning, active, completed); `activity_status` (todo, in_progress, in_review, done); `activity_priority` (low, medium, high, urgent); `work_type` (feature, defect, risk, debt, enabler); `track` (discovery, delivery); `health` (on_track, at_risk, off_track); `activity_event_type` (status_changed, blocked, unblocked, sprint_changed, assigned).

- **users**: id, email, full_name, password_hash, role (default team_member), is_active (default true), created_at, updated_at. Unique index on `lower(email)`.
- **sessions**: token_hash (text PK, sha256 of the cookie token), user_id → users (cascade), expires_at, created_at. Indexes on user_id and expires_at; a daily cleanup deletes expired rows.
- **projects**: id, name, code, owner_id → users (restrict), `wip_limit_per_person` smallint (default 3, CHECK > 0), created_at, updated_at, archived_at. Unique index on `lower(code)`.
- **subprojects**: id, project_id → projects (cascade), `code` (e.g. `PRJ-01`), name, description, `lead_id` → users (nullable, set null), `health` (default on_track), `health_note` (nullable), created_at, updated_at, archived_at. Unique (project_id, code); unique (project_id, id); index on lead_id.
- **sprints**: id, project_id → projects (cascade), subproject_id (nullable; **default project-wide**, i.e. null, because the whole team shares one cadence), name, `goal` text (nullable; required by the API before a sprint can become active), `capacity_items` smallint (nullable), start_date, end_date, status (default planning), created_at, updated_at. CHECK end_date >= start_date. Unique (project_id, name); unique (project_id, id). **Partial unique** for at most one active sprint per scope: `(project_id, COALESCE(subproject_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status = 'active'`.
- **activities**: id, project_id, subproject_id (nullable), sprint_id (nullable), assignee_id → users (nullable, set null), created_by_id → users, title, description, status (default todo), priority (default medium), `work_type` (default feature), `track` (default delivery), percent_complete smallint (default 0), `is_blocked` boolean (default false), `blocked_reason` text (nullable), due_date (nullable), `started_at` (nullable; set when first leaving todo), completed_at (nullable), created_at, updated_at. Later phases add `release_id`, `user_story_id`, `ost_assumption_id` by migration; do not add them now.
  - Checks: `percent_complete BETWEEN 0 AND 100`; `status <> 'done' OR percent_complete = 100`; `(status = 'done') = (completed_at IS NOT NULL)`; `NOT is_blocked OR blocked_reason IS NOT NULL`; `status = 'todo' OR started_at IS NOT NULL`. Composite FKs for subproject and sprint.
  - Indexes: FK indexes on project_id, subproject_id, sprint_id, assignee_id; partial `(assignee_id, due_date) WHERE status <> 'done' AND due_date IS NOT NULL`; partial `(due_date) WHERE status <> 'done' AND due_date IS NOT NULL`; partial `(completed_at) WHERE completed_at IS NOT NULL`; partial `(assignee_id) WHERE status IN ('in_progress','in_review')`; partial `(subproject_id) WHERE is_blocked`.
- **activity_events**: id, activity_id → activities (cascade), event_type, from_value (nullable), to_value (nullable), note (nullable), actor_id → users (set null), occurred_at (default now). Indexes on (activity_id, occurred_at) and (event_type, occurred_at). Append-only; never updated or deleted by the app.
- **tags**: id, name, color_code (default '#64748B', CHECK `^#[0-9A-Fa-f]{6}$`); unique index on `lower(name)`. **activity_tags**: PK (activity_id, tag_id), both cascade, extra index (tag_id, activity_id).
- **activity_comments**: id, activity_id → activities (cascade), author_id → users (restrict), body (CHECK non-empty), created_at; index (activity_id, created_at).

## Roles and permissions

One permission map in the API, readable and unit-tested. 401 unauthenticated, 403 forbidden.

- **Project Manager**: create/edit/archive projects and subprojects (incl. lead and health); create/edit sprints and goals; create, edit, assign, reassign, delete any activity; manage tags; create users and set roles.
- **Team Member**: view everything; on **their own assigned activities** edit status and percent_complete and set/clear `is_blocked` with a reason; comment on any visible activity. Nothing else.

## Business rules (service layer, DB constraints as backstop)

- All activity writes go through `activityService`: sets `started_at` on first leaving todo, `completed_at` on done (and 100%), clears them when reopened, writes `activity_events` in the same transaction, rejects cross-project subproject/sprint, rejects writes to archived projects/subprojects.
- A sprint cannot become `active` without a non-empty goal.
- Moving an activity to `in_progress` over the per-person WIP limit is allowed but returns a visible warning.

## Frontend

- **Sidebar**: Home, Portfolio, Workload, Projects, Opportunity Solution Tree, User Story Mapping, Kano Request Tracker, RAID Log. Portfolio, Workload and the four modules are "Coming soon" pages in this phase. User name, role and sign-out at the bottom.
- **Login** and protected routes. List filters live in the URL query string.
- **Home**: header with the active sprint's **goal**, days left, and the user's **WIP vs limit**. Sections **This Week**, **Next Week**, **This Month**, bucketed by `due_date`, weeks starting **Monday**, timezone `Asia/Manila` (configurable). "This Month" shows remaining items due this month not already in the first two buckets. Items with no due date do not appear. Done items appear only if `completed_at` is in the current week (struck through). Row: title, subproject code and name, assignee, priority badge, work-type badge, due date, status, progress bar from `percent_complete`, overdue flag, blocked indicator. Team Member sees own activities; PM sees all with assignee and subproject filters and a "group by subproject" toggle. Team Members update status, percent_complete and blocked state inline on their own items.
- **Projects area**: list projects; project page with subprojects, sprints and activities (filters: subproject, status, assignee, sprint, tag, blocked, work type; keyset pagination). PM-only create/edit/archive controls.
- **Activity drawer**: details, comments, blocked toggle with reason, read-only event timeline.
- **Settings (PM)**: user management.
- Loading, empty and error states everywhere; forms use the shared zod schemas.

## API

JSON REST under `/api` for auth, users, projects, subprojects, sprints, activities (incl. events), tags, comments, and the `home` read model (computed server-side for the signed-in user). Consistent errors `{ error: { code, message, details? } }`. Translate DB constraint violations into 409/422 with clear messages, never 500.

## Seed data (`npm run db:seed`)

7 users (1 PM, 6 team members; passwords from env, never hard-coded; counts configurable). Project **"Student Success Platform"** with 15 subprojects: `PRJ-01 Student Engagement Analytics`, `PRJ-02 Adaptive Learning Paths`, `PRJ-03 Early Warning Intervention System`, `PRJ-04 Automated Formative Feedback`, `PRJ-05 Educator Command Center`, `PRJ-06 Parent-Guardian Portal`, `PRJ-07 LMS Interoperability & LTI 1.3`, `PRJ-08 Competency Assessment Hub`, `PRJ-09 Mobile Student Companion`, `PRJ-10 District Executive Reporting`, `PRJ-11 Accessibility & Universal Design`, `PRJ-12 Teacher Professional Development`, `PRJ-13 Content Authoring Studio`, `PRJ-14 Notifications & Messaging`, `PRJ-15 Institutional Data Lake & API` (PRJ-11 to PRJ-14 names are placeholders), each with a lead and varied health. One active project-wide sprint with a goal, plus one completed and one planning sprint. About 60 activities spread across subprojects, the three Home buckets, all statuses, priorities, work types and both tracks; some blocked; one person over the WIP limit. Seeding must use `activityService` so events exist.

## Constraints

- Do not build: releases, capacity tables, dependencies, checklists, scope-change rules, Portfolio/Workload pages, search, any module table or UI, Insights.
- Do not rank or score individuals by output.
- No secrets in the repo; provide `.env.example` (DATABASE_URL, SESSION_SECRET, TZ, seed passwords). No raw SQL string concatenation. No dependencies beyond the stack; justify each non-obvious one in the README.

## Definition of done

1. `npm install`, migrate, seed and `npm run dev` bring everything up from the README alone; a fresh DB migrates cleanly from zero.
2. Lint, typecheck, build pass with zero errors.
3. Tests cover: the permission map per write endpoint; Home bucketing (Monday week start, month boundaries, no due date, done-this-week); `activityService` rules (timestamps, events written in the same transaction, archived read-only, sprint goal required, blocked requires reason); and database-level rejection of: cross-project subproject/sprint references, `done` with percent < 100, bad percent, blocked without reason, a second active sprint in the same scope, duplicate project codes differing only by case.
4. `docs/CONVENTIONS.md`, `docs/PROGRESS.md` and `AGENTS.md` exist and are accurate.
5. Manual check: as a team member you can update only your own activity and set a blocker; as the PM you can create a sprint with a goal and see everything on Home with filters.
6. Finish with a short summary, decisions made where this prompt was silent, and anything Phase 2 must know.
