# Phase 2 of 4: Planning and Governance (InsightED PM App)

Phase 1 is built and committed. First read `AGENTS.md`, `docs/CONVENTIONS.md` and `docs/PROGRESS.md` and follow the conventions exactly. This phase adds the planning and governance layer on top of the core platform: releases, sprint capacity, dependencies, the one-in-one-out rule, and the Definition of Done gate. **Do not edit earlier migrations; add new ones.** Do not build anything not listed here.

## New enums

`release_status` (planned, released); `checklist_kind` (ready, done); `gate` (dor, dod, validation, scope_change).

## Schema changes

- **releases**: id, project_id → projects (cascade), name (e.g. "v1.0 MVP", "v1.1"), target_date (nullable), position integer, status (default planned), `is_mvp` boolean (default false), created_at, updated_at. Unique (project_id, name); unique (project_id, id); **partial unique** `(project_id) WHERE is_mvp` (one MVP release per project).
- **activities**: add `release_id` (nullable) with a composite FK `(project_id, release_id) → releases (project_id, id)` using `ON DELETE SET NULL (release_id)`, plus an index.
- **sprint_member_capacity**: sprint_id → sprints (cascade), user_id → users (cascade), capacity_items smallint (CHECK >= 0); PK (sprint_id, user_id); index on user_id.
- **sprint_scope_changes**: id, sprint_id → sprints (cascade), added_activity_id → activities (cascade), removed_activity_id → activities (nullable, set null), reason (CHECK non-empty), requested_by_id → users, approved_by_id → users (nullable), created_at. CHECK added_activity_id <> removed_activity_id. Index on sprint_id.
- **activity_dependencies**: blocked_activity_id → activities (cascade), blocking_activity_id → activities (cascade); PK (blocked_activity_id, blocking_activity_id); CHECK they differ; extra index on blocking_activity_id. Dependencies may cross subprojects (the main reason it exists).
- **checklist_templates**: id, project_id → projects (cascade), kind, label (CHECK non-empty), position, is_active (default true); index (project_id, kind, position). Definition of Ready applies to stories (later phase); Definition of Done applies to activities.
- **checklist_checks** (this phase supports activities only): id, template_id → checklist_templates (cascade), activity_id → activities (cascade, NOT NULL for now), checked_by_id → users, checked_at; unique (activity_id, template_id). Phase 4 extends it to stories.
- **gate_overrides**: id, gate, entity_type (text: 'story','activity','solution'), entity_id uuid, reason (CHECK non-empty), user_id → users, created_at. Append-only audit log, deliberately polymorphic with no FK; index (entity_type, entity_id).

## Roles (additions)

- **PM**: manage releases, checklist templates, sprint capacity (team and per member), WIP limit; approve scope-change trades; override gates (always with a reason); add/remove any dependency.
- **Team Member**: tick Definition-of-Done items on **their own** activities; add/remove a dependency on an activity they are assigned to. Read-only for releases, capacity and templates.

## Business rules (all inside the service layer; DB constraints are the backstop)

- **Definition of Done gate**: an activity cannot move to `done` until every active `done` checklist template item is checked for it. A PM may override with a reason, which writes a `gate_overrides` row (gate = dod) and an `activity_events` note.
- **One-in, one-out**: once a sprint is `active`, adding an activity to it requires either naming an activity to remove (writes `sprint_scope_changes`; the removed activity returns to the backlog with `sprint_id = null` and a `sprint_changed` event) or a PM override with a reason (writes `gate_overrides`, gate = scope_change). Adding to `planning` sprints is unrestricted. Never silently add work to an active sprint.
- **Dependencies**: the API rejects self-dependency and cycles (check by walking the graph in the same transaction). An activity with any unfinished blocking dependency is displayed as **"waiting on dependency"** even when `is_blocked` is false (derived, not stored).
- **Releases**: exactly one MVP release per project; deleting a release nulls it on activities; marking a release `released` is PM-only.
- Moving an activity between sprints, assignees or status keeps writing `activity_events` through `activityService`.

## Frontend

- **Sprint page**: goal, dates, status, team capacity and per-member capacity vs assigned items, the sprint's activities, and the scope-change log. Adding to an active sprint opens the one-in-one-out dialog (pick the item to remove, give a reason; PM sees an override option).
- **Releases**: PM can create/edit/reorder releases and mark one as MVP, on the Projects area. Activities can be assigned to a release.
- **Home changes**: "This Month" also lists upcoming releases (name, target date); "Next Week" surfaces items that are blocked or waiting on dependencies as proactive risk; rows show the "waiting on dependency" indicator.
- **Activity drawer additions**: dependencies (add/remove, searchable across subprojects, each shown with its status), the Definition-of-Done checklist, and the DoD gate error with a PM override flow.
- **Settings (PM)**: DoR/DoD checklist templates (add, reorder, deactivate), WIP limit, releases.
- Loading, empty and error states; zod-validated forms; filters in the URL.

## API

Extend `/api` with: releases, sprint capacity, sprint scope changes, activity dependencies, checklist templates and checks, and gate overrides (read-only list for PM). Same error shape and constraint translation as Phase 1.

## Seed additions

Three releases (`v1.0 MVP` with `is_mvp`, `v1.1`, `v1.2`) with activities assigned; per-member capacities on the active sprint; about 10 dependencies (several across subprojects, one chain of three); a couple of scope-change entries and one override; default checklists. DoR items: persona and value stated, acceptance criteria in Given/When/Then, wireframes attached, dependencies resolved, right-sized for one sprint. DoD items: code peer-reviewed, automated tests passing in CI, no high-priority defects, accessibility checked against WCAG, documentation updated, validated in staging by the product owner. Some done activities with all DoD items checked, some in review with partial checks.

## Constraints

- Do not build: Portfolio, Workload, search, any module table or UI, story-level checklists, Insights, attachments, notifications.
- No individual scoring or ranking. No new dependencies without a one-line README justification.

## Definition of done

1. A fresh DB migrates from zero; seed and `npm run dev` work; lint, typecheck, build pass.
2. Tests cover: permission map for every new endpoint; DoD gate with and without override; one-in-one-out (rejected without trade, accepted with trade, accepted with override, unrestricted in planning sprints); dependency cycle and self-dependency rejection; derived waiting-on-dependency; events written for sprint changes; and database-level rejection of a second MVP release, cross-project release references, a negative capacity, and an empty override reason.
3. `docs/PROGRESS.md` updated; `docs/CONVENTIONS.md` amended only if a convention genuinely changed.
4. Manual check: as a team member, you cannot mark an activity done until its DoD items are ticked; as the PM, adding work to the active sprint forces a trade-off, and an override is recorded.
5. Finish with a short summary, decisions made where this prompt was silent, and notes for Phases 3 and 4.
