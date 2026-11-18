# Progress log

Running log of what each build phase delivered and the decisions made. Newest last.

## Phase 1: Core platform

Status: backend complete and tested; frontend not started (waiting for design direction approval, see below).

Built:

- Monorepo wiring: `@myapp/shared` (zod schemas, enums, API types, shipped as TypeScript source), `@myapp/backend`.
- Schema and migrations for users, sessions, projects, subprojects, sprints, activities, activity_events, tags, activity_tags, activity_comments, with every CHECK, partial index and composite same-project FK from the plan. Migrations: `0000_functions`, `0001_core_tables`, `0002_core_integrity` (see README).
- `activityService` is the only writer of status, blocked flag, sprint and assignee; events are written in the same transaction; an injected `now` lets the seed write realistic history.
- One permission map (`src/permissions.ts`), sessions in an HttpOnly SameSite=Lax cookie, argon2 hashing, one error middleware with constraint-to-4xx translation, keyset pagination for activity lists.
- Home read model (`GET /api/home`) with Monday weeks in `Asia/Manila`.
- `npm run db:seed` (7 users, 15 subprojects, 3 sprints, 64 activities with events, comments, tags; passwords from env).
- Tests: permission map per write endpoint (401 and 403), Home bucketing, activityService rules, database-level constraint rejections, error shape.

Decisions where the plan was silent:

- Kept the existing scaffold layout (`apps/backend`, `apps/frontend`, `@myapp/*`) instead of the plan's `apps/api` / `apps/web`.
- Local DB is PostgreSQL 18 (`uuidv7()` native), database `myapp_dev`, role `myapp`. CI uses PostgreSQL 16, so migration `0000` creates a `uuidv7()` fallback only when the server lacks one.
- Upgraded `drizzle-orm` to 0.45.x and `zod` to 4.x because `npm audit` reported high-severity advisories on the older versions; the CI audit gate needs zero highs.
- Home: open items due before this week stay pinned to "This Week" with an overdue flag so late work does not disappear. A done item shows only if completed this week, in the bucket of its due date.
- Tests share the developer database but create uniquely tagged fixtures and delete them afterwards, so seed data is never wiped.
- A team member who moves progress to 100 does not auto-complete the activity; `done` is an explicit status.
- Ignored `.claude/`, `.agents/`, `.agent/` in oxlint, ESLint and Prettier: they hold vendored third-party skills that fail `--deny-warnings`.
- `.env.example` was not updated (reading it was blocked in this session); it must list `DATABASE_URL`, `SESSION_SECRET`, `TZ`, `APP_TIMEZONE`, `SEED_PM_PASSWORD`, `SEED_MEMBER_PASSWORD`, `SEED_MEMBER_COUNT`.

Not done yet:

- Frontend (login, sidebar, Home, Projects area, activity drawer, settings). `AGENTS.md` requires proposing a design direction with Impeccable and waiting for approval first; `PRODUCT.md` and `DESIGN.md` are still empty templates.
- Playwright manual check (team member updates own activity only; PM creates a sprint with a goal).

Notes for Phase 2: extend `activityService.update` for the DoD gate and one-in-one-out (it is the single choke point); `assertProjectWritable` is where archived checks live; releases add a third composite FK pattern following `0002_core_integrity.sql`.

## Phase 2: Planning and governance (backend)

Status: backend complete and tested; the Sprint page, Releases UI, Home changes, drawer additions and Settings screens are not built (waiting for design approval).

Built:

- Migrations `0003_governance_tables` (generated) and `0004_governance_integrity` (hand-written: composite `(project_id, release_id)` FK with column-list `SET NULL`, `releases` updated_at trigger).
- Tables: releases (one MVP per project), sprint_member_capacity, sprint_scope_changes, activity_dependencies, checklist_templates, checklist_checks, gate_overrides; `activities.release_id`.
- Rules, all inside `activityService` / `governanceService`: Definition of Done gate (`422 dod_incomplete` listing the missing items; PM override with reason writes a `gate_overrides` row and an event note), one-in-one-out for active sprints (`409 scope_change_required`; a trade writes `sprint_scope_changes` and returns the removed item to the backlog with a `sprint_changed` event; a PM override writes `gate_overrides`), dependency self/cycle rejection (recursive CTE in the same transaction), derived `waitingOnDependency` on every activity DTO.
- Routes for releases, capacity, scope changes, dependencies, checklist templates and checks, gate overrides (PM read-only list).
- Home read model now also returns `upcomingReleases` and an `atRisk` flag on rows (blocked or waiting) for the Next Week risk surfacing.
- Seed: 3 releases, default DoR/DoD checklists, per-member capacities, 10 dependencies (one chain of three), two traded scope changes and one override, partial checklists on in-review items, full checklists on done items. `SEED_RESET=1` truncates all tables first (non-production only).

Decisions where the plan was silent:

- Overrides: one `overrideReason` field covers both gates, PM only. Trades use `removeActivityId` + `tradeReason`. A trade's `approved_by` is set when a PM makes it.
- Team members cannot change an activity's sprint at all (not in their editable fields), so the trade flow is effectively PM-only.
- A team member may add or remove a dependency when assigned to either end of it. Dependencies must stay inside one project.
- Marking a release as MVP moves the flag from the previous MVP release instead of failing.
- `gate_overrides` is append-only by convention only; no database trigger blocks UPDATE/DELETE, so test cleanup can remove its own rows.
- Creating an activity directly as `done` also goes through the DoD gate.

Notes for Phase 4: `checklist_checks.activity_id` is still NOT NULL with a plain unique constraint; Phase 4's migration changes both. `gate_overrides.entity_type` already allows `story` and `solution`.

## Phase 4: Module data layer

Status: complete (database only, no API, no UI, as specified).

Built:

- Migrations `0005_module_tables` (generated) and `0006_module_integrity` (hand-written: composite same-project FKs and `updated_at` triggers). Applied forward onto a database that already held Phase 2 data without loss.
- Tables: code_counters, ost_outcomes, ost_opportunities, ost_solutions, ost_assumptions, personas, journey_steps, user_stories, kano_requests, raid_items; `activities.user_story_id` and `activities.ost_assumption_id`; `checklist_checks` now targets an activity or a story.
- `nextSeq(tx, projectId, scope)` in `services/seq.ts`; `services/moduleService.ts` holds the create/update helpers and the OST validation roll-up (`computeSolutionValidation`, `recalcSolutionValidation`).
- Seed (`seedModules.ts`): 8 OST chains with assumptions of several categories and states, 8 personas, 24 journey steps (backbone and steps), 12 stories, 12 Kano requests (all categories and decisions, some with WSJF and RICE, some unevaluated), 12 RAID items; a few activities linked to stories and assumptions; Definition of Ready ticks on two stories.
- Tests (`moduleService.test.ts`): every database-level rejection from the plan, generated columns including null cases, 20 parallel inserts per module with unique seq, gap tolerance, roll-up unit and database tests.

Decisions where the plan was silent:

- Roll-up: with no riskiest assumption the solution stays `planned`; otherwise it mirrors the riskiest assumption's status (so `in_progress` and `planned` pass through too).
- NOT NULL subproject links (journey_steps, user_stories) use `ON DELETE RESTRICT` because column-list `SET NULL` would violate NOT NULL.
- `REQ` codes start at `REQ-001` (3-digit pad); the plan's `REQ-101` was an example.
- `ost_solutions` has no subproject of its own; it inherits one through opportunity and outcome.
- Raw inserts with hand-picked `seq` can collide with `nextSeq`; use the helpers (tests that must pick a seq use a different project).

What the module phases (RAID, Story Map, Kano, OST) build on:

- RAID: wire `countOpenHighRaidBySubproject()` for Portfolio to `raid_items` (open or in progress, impact 3, or severity score >= 6).
- Story Map: Definition of Ready gate on `checklist_checks.story_id` with `gate_overrides` (gate `dor`), backbone/step ordering by `position`, release lines from `release_id`.
- Kano: promotion into sprint, release or story via `promoted_story_id`; ranking by `wsjf_score`.
- OST: 3+ solutions warning on a targeted opportunity; validation gate before converting a solution to a story.

## Phase 3: Portfolio, Workload and search (backend)

Status: backend, perf seed, plans and tests complete; the Portfolio and Workload pages, header search box, "My subprojects" filter UI, URL-persisted filters and Home's group-by toggle memory are frontend work and not built (waiting for design approval). The filter-to-URL round-trip tests therefore do not exist yet.

Built:

- Migration `0007_search_trigram` (pg_trgm and four GIN trigram indexes).
- `GET /api/portfolio` (filters health, leadId, hasBlockers, mine; sorts), `GET /api/workload` (+ `/workload/:id/items` grouped by subproject), `GET /api/search?q=`; zod-validated query params; all read-only.
- `npm run db:seed:perf -w @myapp/backend` (50,000 activities with events and dependencies; refuses production and non-local hosts; `PERF_RESET=1` removes its rows, `PERF_COUNT=0` with reset only removes) and `npm run db:explain -w @myapp/backend` (writes `docs/db-plans.md`).
- Measured on the perf seed: Home 41 to 79 ms, Portfolio 57 ms, Workload 28 ms, search 60 to 80 ms; no sequential scan on `activities` in any plan. Details and decisions: `docs/db-notes.md`.
- Tests (`readModels.test.ts`): portfolio counts against known data, next-release logic, filters, sorting, archived hiding; workload WIP and capacity flags, waiting counts, no ranking fields; search matching, ranking, limits, empty and short queries, wildcard escaping, archived hiding; auth and validation on the new endpoints.

Decisions where the plan was silent: see `docs/db-notes.md` (Home lookback and row cap with a `truncated` flag, shared waiting CTE, RAID count wired for real, alphabetical workload order, optional `projectId` on workload to scope WIP limit and sprint).

Left for the frontend: URL-persisted filters on every list, the "My subprojects" quick filter (API supports `mine=true`), Home group-by toggle in URL or localStorage, global search box with `/` shortcut and debounce.

## Frontend (Phases 1 to 3), plain Mantine

Status: built and checked by hand in the browser (PM and team member), typecheck, lint and build clean. Design direction: plain default Mantine, chosen by the project owner for now (see `DESIGN.md`).

Built:

- Vite + React + Mantine 7 + TanStack Query + React Router 7; all server access in `apps/frontend/src/api/hooks.ts`, all styling decisions in `src/theme.ts`.
- Login and protected routes; sidebar (Home, Portfolio, Workload, Projects, four "Coming soon" modules, Settings for PMs); user name, role and sign-out at the bottom; header search (`/` focuses it, debounced, grouped results, activity results open the drawer).
- Home: sprint goal, days left, WIP vs limit, This Week / Next Week / This Month, upcoming releases, "risk coming up" banner for blocked or waiting items, inline status and progress edits on your own items, PM filters, group-by-subproject toggle remembered per user in localStorage (URL overrides it), a banner when the row cap truncates.
- Projects: list, project page with Activities (filters in the URL, keyset "Load more"), Subprojects (PM create, edit, archive, health), Sprints, Releases (PM create, reorder, make MVP, mark released, delete). Sprint page: goal, status, capacity vs assigned, activities, add-to-sprint with the one-in-one-out dialog, scope-change log.
- Activity drawer: details (PM full edit, assignee limited edit), blocked toggle with reason, Definition of Done checklist, dependencies (cross-subproject search), comments, history timeline; the DoD gate and the sprint trade turn into guided flows with a PM override.
- Portfolio (sortable, filters in the URL, "My subprojects", PM inline health and note), Workload (WIP and capacity flags, expandable items by subproject, no ranking), Settings (users, checklist templates, WIP limit and archive, override log).
- Filter-to-URL round trips are covered by unit tests in `src/lib/filters.test.ts`.

Verified by hand in the browser: login redirect, Home render, Portfolio and Workload data, activity drawer, the Definition of Done gate showing the four missing items and the PM override panel, `/` search with a partial word, team member view (no PM filters, own work only, Settings blocked).

Not verified in the browser: creating and editing forms (project, subproject, sprint, release, user), the one-in-one-out dialog and the checklist tick flow (covered by backend tests only), mobile layout, and Playwright flows (not installed).

Decisions: search results for a subproject open the project's activity list filtered to it; "current project" is the oldest open project unless the page is opened directly; the Settings and Releases screens operate on that project.
