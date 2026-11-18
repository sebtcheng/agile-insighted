# Phase 4 of 4: Module Data Layer (InsightED PM App)

Phases 1 and 2 are built and committed. First read `AGENTS.md`, `docs/CONVENTIONS.md` and `docs/PROGRESS.md` and follow the conventions exactly. This phase builds **only the PostgreSQL data layer** for the four discovery modules: Opportunity Solution Tree, User Story Mapping, Kano Request Tracker and RAID Log. **No API endpoints and no UI for the modules** (the sidebar keeps its "Coming soon" pages); later phases build those. Add new migrations only; never edit earlier ones. This phase is independent of Phase 3.

The tables mirror the team's reference spreadsheets (OST: OST Code, Subproject, Target Business Outcome, Customer Opportunity, Potential Solution, Riskiest Assumption, Validation Test, Validation Status. Story Map: Story ID, Subproject, User Persona, User Journey Step, Granular Task / User Story, MVP Status, Sprint Target, Complexity SP, Status. Kano: Request ID, Subproject, Request Description, Requester, Kano Category, Prioritization Score, Action Decision. RAID: RAID ID, Subproject, Item Type, Description, Impact, Mitigating Action Step, Owner, Status, Target Date).

## Common to all module tables

`id`, `project_id`, `created_by_id` → users, `created_at`, `updated_at` (trigger), and the composite-FK pattern for `subproject_id` / `sprint_id` / `release_id` (same-project integrity, column-list `SET NULL`). Every FK column indexed.

**Human-readable codes**: `code_counters` (project_id → projects cascade; scope CHECK IN 'ost','usm','req','raid'; last_value integer; PK (project_id, scope)). Each coded row stores `seq` (unique per project) assigned in the same transaction with `INSERT ... ON CONFLICT DO UPDATE SET last_value = code_counters.last_value + 1 RETURNING last_value`, plus a **generated stored** `code` (`OST-` / `USM-` / `RAID-` with 2-digit padding, `REQ-` with 3-digit padding). Implement a reusable `nextSeq(tx, projectId, scope)` helper. Codes are never reused or edited.

## New enums

`validation_status` (planned, in_progress, validated, invalidated); `assumption_category` (desirability, viability, usability, feasibility); `story_status` (backlog, planning, in_progress, completed); `kano_category` (must_be, performance, attractive, indifferent, reverse; UI labels Must-Have, Performance Optimizer, Delighter, Indifferent, Reverse); `kano_decision` (approve_mvp, prioritize_sprint, schedule_release, research_spike, deprioritize); `raid_type` (risk, assumption, issue, dependency); `raid_status` (open, in_progress, mitigated, closed).

## Opportunity Solution Tree

- **ost_outcomes**: subproject_id (nullable), title, description, `metric_name`, `baseline_value` numeric, `target_value` numeric, `target_date` (all nullable).
- **ost_opportunities**: outcome_id → ost_outcomes (cascade), parent_opportunity_id → ost_opportunities (nullable, cascade), title (customer pain point), description, `evidence` text, `is_targeted` boolean (default false). **Partial unique** `(outcome_id) WHERE is_targeted` so only one opportunity per outcome is targeted at a time.
- **ost_solutions**: opportunity_id → ost_opportunities (cascade), `seq` + `code` (`OST-02`), title, `validation_status` (default planned; a **denormalized roll-up** of its assumptions, maintained in the same transaction as any assumption change: validated only when the riskiest assumption is validated, invalidated if it is invalidated; implement the roll-up function and test it), owner_id → users (nullable, set null), converted_story_id → user_stories (nullable, set null). Unique (project_id, seq).
- **ost_assumptions**: solution_id → ost_solutions (cascade), statement, `category`, `is_riskiest` boolean (default false; **partial unique** `(solution_id) WHERE is_riskiest`), validation_test (the next action), validation_status (default planned), result_notes, position.
- Rules for later phases (record in `docs/PROGRESS.md`, do not build): a targeted opportunity should have 3+ contrasting solutions (UI warning); a solution converts to a story only when `validated` (PM override logged in `gate_overrides`).

## User Story Mapping

- **personas**: subproject_id (nullable), name (unique per project, case-insensitive), description.
- **journey_steps**: subproject_id (NOT NULL), `parent_step_id` → journey_steps (nullable, cascade; null = backbone activity, set = step under it), name, position integer; unique (subproject_id, parent_step_id, name) with `NULLS NOT DISTINCT` (PG 15+); index (subproject_id, position).
- **user_stories**: subproject_id (NOT NULL), `seq` + `code` (`USM-01`), persona_id → personas (nullable, set null), journey_step_id → journey_steps (nullable, set null), story text ("As a ..., I want ..., so that ..."), `acceptance_criteria` text (Given/When/Then), `work_type` (reuse enum), `release_id` (nullable; the UI's MVP status is `release.is_mvp`), sprint_id (nullable; the "Sprint Target"), story_points smallint (nullable, `CHECK IN (1,2,3,5,8,13,21)`; optional, team-level only), status (default backlog), position integer (vertical order within the step, most necessary first). Unique (project_id, seq). Indexes on persona_id, journey_step_id, sprint_id, release_id, (subproject_id, status).

## Kano Request Tracker

- **kano_requests**: subproject_id (nullable), `seq` + `code` (`REQ-101`), description, requester_name, requester_role (nullable), kano_category (**nullable** until evaluated), decision (nullable until decided), target_sprint_id (nullable), target_release_id (nullable), promoted_story_id → user_stories (nullable, set null).
  - **Computed scores, not typed**: WSJF inputs `wsjf_business_value`, `wsjf_time_criticality`, `wsjf_risk_reduction`, `wsjf_job_size` (nullable smallint, `CHECK IN (1,2,3,5,8,13,20)`) and `wsjf_score numeric(6,2)` **generated stored** as `(business_value + time_criticality + risk_reduction)::numeric / job_size`. Optional RICE inputs `rice_reach` integer (>= 0), `rice_impact` numeric (`CHECK IN (0.25,0.5,1,2,3)`), `rice_confidence` smallint (0 to 100), `rice_effort` numeric (> 0), and `rice_score` generated stored as `reach * impact * (confidence / 100.0) / effort`. Do not add MoSCoW.
  - Unique (project_id, seq). Indexes on subproject_id, kano_category, decision, `(project_id, wsjf_score DESC NULLS LAST)`.

## RAID Log

- **raid_items**: subproject_id (nullable), `seq` + `code` (`RAID-01`), item_type, description, impact smallint (`CHECK BETWEEN 1 AND 3`; 3 High, 2 Medium, 1 Low), likelihood smallint (nullable, same range), `severity_score` smallint **generated stored** as `impact * likelihood` (null when likelihood is null), mitigating_action, owner_id → users (nullable, set null), raised_by_id → users, status (default open), target_date date (nullable), closed_at timestamptz (nullable). Unique (project_id, seq). Indexes on subproject_id, owner_id, **partial** `(target_date) WHERE status <> 'closed'`, and (item_type, status).

## Changes to earlier tables (new migration)

- **activities**: add `user_story_id` → user_stories (nullable, set null) and `ost_assumption_id` → ost_assumptions (nullable, set null), both with indexes (the second links a discovery activity to the assumption it tests).
- **checklist_checks** (from Phase 2): add `story_id` → user_stories (nullable, cascade); make `activity_id` nullable; add `CHECK (num_nonnulls(story_id, activity_id) = 1)`; replace the unique constraint with partial unique indexes on (story_id, template_id) and (activity_id, template_id). Existing rows must remain valid.

## Seed additions

Extend `db:seed` (module rows must go through `nextSeq` and the normal transaction paths): at least 8 rows each for OST (with outcomes, opportunities, solutions and several assumptions of different categories), personas, journey steps (backbone and steps), user stories, Kano requests (all categories and decisions, some with WSJF and RICE inputs, some unevaluated) and RAID items (all types and statuses, with likelihood on some). Spread across the 15 subprojects, domain-realistic. Examples: OST outcome "Reduce course dropouts in first 4 weeks by 20%" → opportunity "Students feel overwhelmed by multi-portal navigation" → solution "Unified onboarding checklist with real-time milestone telemetry"; story "As a teacher, I want to view a real-time engagement indicator for my class so that I can identify disengaged students during lectures" (5 SP, in the MVP release, Sprint 3); Kano request "Export engagement data to CSV with student anonymization" (Must-Have, Approve for MVP); RAID risk "Student privacy concerns regarding continuous telemetry tracking" (impact High, Mitigated). Link a few activities to stories and assumptions.

## Constraints

- No module API endpoints, no module UI, no Insights, no change to Phase 1 and 2 business rules.
- No new dependencies without a one-line README justification.

## Definition of done

1. A fresh DB migrates from zero and an existing Phase 2 database migrates forward without data loss; seed works; lint, typecheck, build pass.
2. Database-level tests prove the constraints reject bad data: a second targeted opportunity per outcome; a second riskiest assumption per solution; a cross-project subproject/sprint/release reference on any module table; story points outside the allowed set; WSJF input outside the allowed set or zero job size; RICE confidence above 100; impact or likelihood outside 1 to 3; a second `checklist_checks` row for the same item; a checklist check with both or neither of story and activity. Also prove the generated columns (`code`, `wsjf_score`, `rice_score`, `severity_score`) compute correctly including the null cases, and that 20 parallel inserts per module produce unique, gap-tolerant `seq` values.
3. The OST validation roll-up function has unit tests (riskiest validated, invalidated, none set).
4. `docs/db-notes.md` gains a table-by-table summary of the module tables' constraints and indexes and why each exists; `docs/PROGRESS.md` lists what the module phases (RAID, Story Map, Kano, OST) will build on.
5. Finish with a short summary and decisions made where this prompt was silent.
