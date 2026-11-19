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

## Phase 5: RAID Log (API + UI)

Status: complete. Plain default Mantine, matching the rest of the frontend (see `DESIGN.md`).

Built:

- Shared: `raidTypeSchema`, `raidStatusSchema`, `createRaidSchema`, `updateRaidSchema`, `raidListQuerySchema`, `RaidItemDto`, labels in `ENUM_LABELS`.
- Backend: `services/raidService.ts` (list with filters, create via `createRaidItem` and `nextSeq`, update, delete), `routes/modules.ts` (the router that Phases 6 to 8 extend), permissions `raid.create` (PM and team member) and `raid.manage` (PM only). `closed_at` follows status (set on close, cleared on reopen). Archived projects are read-only.
- Frontend: `RaidPage` at `/raid` (filters in the URL, open items by default with an "Include closed" toggle, severity badge, overdue flag, PM inline status change, edit and delete, anyone can add).
- Tests: `routes/raid.api.test.ts` (401, 403, codes, severity, validation, cross-project subproject rejected, close/reopen, filters, overdue).

Decisions where the plan was silent:

- Sorted open items first, then by severity (impact times likelihood, falling back to impact), then code.
- Team members cannot edit or delete items after submitting; the PM owns triage.

Not done: linking RAID dependencies to activities and the Portfolio open-high-RAID count already reads `raid_items`; no browser check of the form yet.

## Phase 6: User Story Mapping (API + UI)

Status: complete. Plain default Mantine.

Built:

- Shared: `packages/shared/src/stories.ts` (persona, journey step and story schemas, `StoryDto`, `StoryMapDto`), `storyStatusSchema` and `STORY_STATUS_LABELS`.
- Backend: `services/storyService.ts` (map read model, personas, backbone and steps, stories, Definition of Ready checklist and gate), routes added to `routes/modules.ts`, permissions `story.create` (PM and team member) and `story.manage` (PM only). Ticking Definition of Ready items reuses `checklist_check.write`.
- Gate: moving a story into a sprint, or from backlog or planning into in progress or completed, returns `422 dor_incomplete` with the missing labels. A PM can pass `overrideReason`, which writes a `gate_overrides` row (gate `dor`, entity `story`).
- Frontend: `/usm` map (subproject picker, backbone over steps, release lanes with MVP marked, per-cell "+ Story", unmapped stories listed below), story dialog (edit, Definition of Ready ticks, override flow), add step and add persona dialogs, rename and delete steps.
- Tests: `routes/story.api.test.ts` (401, 403, codes, ordering, validation, gate block, tick then allow, logged override, backlog changes not gated, step deletion keeps stories).

Decisions where the plan was silent:

- Team members can add stories and tick Definition of Ready items; only the PM shapes the map, edits stories and overrides.
- A story is placed on a leaf column only (a step, or a backbone activity that has no steps). Stories on a missing or non-leaf step show under "Not on the map yet".
- New stories go to the bottom of their step; vertical reordering by drag is not built (position is stored and editable through the API).

Not done: drag and drop, linking activities to stories from the activity drawer (the count of linked activities is shown), keyboard reordering.

## Phase 7: Kano Request Tracker (API + UI)

Status: complete. Plain default Mantine.

Built:

- Shared: `packages/shared/src/kano.ts` (create, update, list and promote schemas, `KanoDto`, decision labels, RICE impact scale).
- Backend: `services/kanoService.ts`, routes in `routes/modules.ts`, permissions `kano.create` (PM and team member) and `kano.manage` (PM only). WSJF and RICE scores are never accepted from the client: the database generated columns compute them from the inputs, and an incomplete input set leaves the score null. Lists sort by WSJF (default), RICE or code, with unscored requests last.
- Promotion: `POST /api/kano/:id/promote` creates a backlog user story (next `USM` code, the request's subproject and target release, the request text unless overridden, bottom of the chosen step) and links it through `promoted_story_id`. A request is promoted once (409 after), and needs a subproject (422).
- Frontend: `/kano` (filters for category, decision, subproject and "not evaluated yet", sort, anyone can submit, PM "Evaluate" dialog with category, decision, targets, WSJF and RICE inputs, promote and delete).
- Tests: `routes/kano.api.test.ts`.

Decisions where the plan was silent:

- Promotion does not move the story into a sprint, so the Definition of Ready gate still applies when the PM does that on the story map. The request's target sprint is only recorded.
- Deleting a promoted request keeps the story.

Not done: promote into a chosen journey step from the UI (the API accepts `journeyStepId`), and a bulk categorize view.

## Phase 8: Opportunity Solution Tree (API + UI)

Status: complete. Plain default Mantine. All four discovery modules now have screens; the "Coming soon" page is removed.

Built:

- Shared: `packages/shared/src/ost.ts` (outcome, opportunity, solution, assumption and convert schemas, `OstTreeDto`, labels, `MIN_SOLUTIONS_PER_TARGET`).
- Backend: `services/ostService.ts`, routes in `routes/modules.ts`, permissions `ost.manage` (PM) and `ost.contribute` (PM and team member). `GET /api/projects/:id/ost` returns the whole tree as four flat lists. Targeting an opportunity clears the previous target for its outcome; flagging a riskiest assumption moves the flag; every assumption change recalculates the solution's validation status in the same transaction.
- Roles: team members add assumptions and record validation status, test and results; only the PM changes statements, categories, the riskiest flag, structure, and converts solutions.
- Conversion: `POST /api/ost/solutions/:id/convert` creates a backlog story (next `USM` code, chosen subproject) and links it. An unvalidated solution returns `422 validation_incomplete`; a PM can pass `overrideReason`, which writes a `gate_overrides` row (gate `validation`, entity `solution`). A solution converts once.
- Frontend: `/ost` (outcome cards with metric line, nested opportunities, targeted badge, a warning when a targeted opportunity has fewer than three solutions, solution rows, a dialog for assumptions with the convert-to-story flow and override). Shared `QuickModal` for the small forms.
- Tests: `routes/ost.api.test.ts`.

Decisions where the plan was silent:

- The "3+ solutions" rule is a warning only, never a block.
- A converted story lands unmapped at the top of the backlog until the PM places it on a journey step.
- Deleting a converted solution keeps its story.

Not done: dragging opportunities to re-parent them, a tree diagram view, and linking discovery activities to assumptions from the activity drawer.

## Gap closing and Phase 9: Insights

Status: complete. Plain default Mantine; charts are hand-written SVG (no chart library added).

Gaps closed:

- Activities can link to a user story and to the assumption they test: `userStoryId` and `ostAssumptionId` on create and update, returned on every activity DTO, validated to the activity's own project (422 otherwise), editable by a PM in the activity drawer. The story map already showed the linked count.
- Kano promotion lets the PM pick the journey step for the new story.
- Story map: PMs reorder stories inside a cell with up and down buttons (positions are rewritten 0..n-1 so earlier ties resolve).
- README: `npm run dev` runs both servers; `concurrently` is justified in "Dependencies worth a note".
- Browser-checked: RAID add form (created and removed a test row), Insights, plus the module pages from the earlier phases.

Phase 9, Insights (`/insights`, `GET /api/insights`):

- `services/insightsService.ts` computes, from `activities` only: weekly throughput (zeros filled in, current week flagged partial), cycle time percentiles (50, 85, 95) and average from `started_at` to `completed_at`, current WIP with blocked count, the five oldest items in progress, and the mix of completed work by type. Weeks run Monday to Sunday in `APP_TIMEZONE`.
- `services/forecast.ts` is a pure Monte Carlo: it draws whole weeks of past throughput with replacement, 5,000 runs, seeded so the numbers do not jitter between loads. It reports weeks to finish the open items at 50, 85 and 95% confidence, and items done in 2, 4 and 8 weeks (the 85% figure is the 15th percentile of outcomes). It only uses complete weeks, needs at least four, and says why when it cannot forecast.
- Team-level only: no per-person grouping, no ranking (a build-plan rule). Aggregated over all activities or one subproject.
- Tests: `services/forecast.test.ts` (percentiles, determinism, exact results for constant throughput, confidence ordering, empty history) and `routes/insights.api.test.ts` (throughput weeks, cycle time, WIP and aging, flow split, forecast, subproject scoping, validation).

Decisions where the plan was silent:

- Forecast dates count forward from the time the numbers were generated (`generatedAt`), not from the browser clock.
- Open items for the forecast means every activity that is not done, including backlog items with no sprint.
- The weekly bucket is grouped by ordinal in SQL because the timezone is a bind parameter.

Not done: Playwright is still not installed (it needs a browser download), a per-sprint burndown, and an Impeccable design pass (waiting for design direction approval, see `DESIGN.md`).
