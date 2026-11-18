# Phase 3 of 4: Portfolio, Workload and Search (InsightED PM App)

Phases 1 and 2 are built and committed. First read `AGENTS.md`, `docs/CONVENTIONS.md` and `docs/PROGRESS.md` and follow the conventions exactly. This phase makes the app usable for **7 people across about 15 subprojects**: a portfolio view, a workload view, global search, and proof that the queries are fast. It is read-only: **no new business tables and no changes to existing rules**. Add new migrations only. (This phase is independent of Phase 4, which creates the module tables; if Phase 4 has not been merged, keep the RAID count as described below.)

## Schema changes (migration only)

- Custom SQL migration: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and GIN trigram indexes on `activities.title`, `subprojects.name` and `users.full_name`. Plus any extra index the plans in the Definition of Done show is needed (justify each in `docs/db-notes.md`).

## Features

### Portfolio page (all users)

One row per subproject: code, name, lead, **health** (PM-editable inline with note), active sprint (or none), counts of open / blocked / waiting-on-dependency / overdue activities, % done (done / total non-archived), next upcoming release, and **open high-severity RAID items**. Sortable and filterable (health, lead, has blockers); filters in the URL. Clicking a row opens that subproject's activity list. Compute server-side in one or two grouped queries (no N+1). For the RAID count, implement a function `countOpenHighRaidBySubproject()` that returns zeros until the RAID table exists, and leave a clear TODO for the RAID phase to wire it.

### Workload page (all users)

One row per active person across **all** subprojects: in-progress count vs `projects.wip_limit_per_person` (highlight over-limit), items due this week, blocked items, items waiting on dependencies, and for the active sprint **assigned items vs their `sprint_member_capacity`** (highlight over-capacity). Clicking a person expands their items grouped by subproject. This page shows load and capacity only. It must not rank people or show any output score.

### Global search

A header search box (keyboard shortcut `/`) with debounced typeahead across activity titles, subproject codes and names, and people, using trigram similarity. Results are grouped by type, limited (about 8 per group), respect permissions, and link to the item (activity opens its drawer). Handle empty and very short queries.

### Usability for 15 subprojects

- Every list and table's filters (subproject, assignee, status, sprint, release, tag, blocked, work type) persist in the URL so views can be bookmarked and shared.
- A "My subprojects" quick filter (subprojects the user leads or has assigned work in).
- Home's "group by subproject" toggle remembers its state per user (in the URL or localStorage, not the DB).

## API

Add read models `GET /api/portfolio`, `GET /api/workload`, `GET /api/search?q=`. Consistent error shape; validate query params with zod; keyset pagination where a list can exceed a few hundred rows.

## Seed and performance data

- Expand `db:seed` to about 150 activities across all 15 subprojects with realistic spread (statuses, priorities, work types, both tracks, blocked, cross-subproject dependencies, a few overloaded people) and `activity_events` history for completed items (realistic timestamps, including blocked intervals).
- Add `npm run db:seed:perf`: about 50,000 activities across the 7 users and 15 subprojects with matching events (local only; refuse to run if `NODE_ENV=production`).

## Constraints

- No new business rules, no module tables or UI, no Insights/forecasting, no per-person scoring.
- No new dependencies without a one-line README justification.

## Definition of done

1. Fresh DB migrates; seed, perf seed and `npm run dev` work; lint, typecheck, build pass.
2. Tests cover: portfolio counts against seeded data (open, blocked, overdue, % done); workload WIP and capacity flags; search matching, ranking order, permission filtering and short/empty queries; filter-to-URL round trips.
3. `EXPLAIN (ANALYZE, BUFFERS)` for the Home query (both roles), the Portfolio query, the Workload query and the search queries on the **perf seed** show index scans with no sequential scan on `activities`. Paste the plans and a short explanation of each index into `docs/db-notes.md`. If a plan is poor, fix the query or add a justified index, then re-run.
4. Typical page loads on the perf seed stay under 300 ms server time for Portfolio and Workload (record measured numbers in `docs/db-notes.md`).
5. `docs/PROGRESS.md` updated.
6. Manual check: Portfolio shows all 15 subprojects with correct counts; Workload flags the overloaded seeded person; search finds an activity by a partial word and opens its drawer.
7. Finish with a short summary and decisions made where this prompt was silent.
