# InsightED PM App: Phase Roadmap and Batching Guide

The full plan is too large for one agent run. It is split into four build phases (prompts 01 to 04 in this folder) plus later module phases. Each prompt is self-contained: paste one file into a fresh agent session in the repo, let it finish and verify, commit, then move on.

## Run order

```
Phase 1  Core platform            (run alone, first)
   |
Phase 2  Planning & governance    (run alone, needs Phase 1)
   |
   +--> Phase 3  Portfolio, Workload, Search   (needs Phase 1; independent of 4)
   +--> Phase 4  Module data layer             (needs Phases 1 and 2; independent of 3)
```

Phases 3 and 4 touch different tables and pages, so they can run **in parallel** (two agents on two branches/worktrees) or **batched into one prompt** by pasting both. If a single agent struggles, run them one after the other. Merge the migrations in order (3's trigram migration and 4's module migration do not conflict, but check the migration folder numbering after merging).

## What goes in each prompt

| Prompt                       | Batch                                 | Tables created                                                                                                                       | Pages / features                                                                                 | Why this size                                                                                           |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 01 Core platform             | Phase 1 only                          | users, sessions, projects, subprojects, sprints, activities, activity_events, tags, activity_tags, activity_comments                 | Auth, RBAC, Home, Projects area, activity drawer, user admin, `activityService`, conventions doc | Everything else depends on it; the permission map, event capture and composite-FK pattern must be right |
| 02 Planning & governance     | Phase 2 only                          | releases, sprint_member_capacity, sprint_scope_changes, activity_dependencies, checklist_templates, checklist_checks, gate_overrides | Sprint page, releases, dependencies, Definition of Done gate, one-in-one-out, settings           | Pure business rules on top of Phase 1; rules need focused tests                                         |
| 03 + 04 Scale and data layer | Phases 3 and 4 together (or parallel) | module tables (Phase 4) plus trigram index (Phase 3)                                                                                 | Portfolio, Workload, global search, perf checks (Phase 3); no UI for Phase 4                     | Phase 3 is read-only queries and pages; Phase 4 is schema only. Low risk of conflicts                   |

**Rule of thumb for batching:** batch work that touches different tables and different pages with no shared business rules. Never batch the foundation (Phase 1) with anything, and never batch two phases that both change the same service (`activityService`).

## Later phases (prompts to be written when you reach them)

| Phase | Module                              | Notes                                                                                                                                                                                 |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5     | RAID Log: API + UI                  | Simplest module. Team Members submit, PM approves/resolves. Link RAID dependencies to activities. Wire the open-high-RAID count on Portfolio.                                         |
| 6     | User Story Mapping: API + UI        | Backbone, personas, vertical ordering, release lines, Definition of Ready gate, activities linked to stories. Built before Kano and OST because both promote or convert into stories. |
| 7     | Kano Request Tracker: API + UI      | Categorize, WSJF/RICE scoring, decisions, promote into sprint/release/story.                                                                                                          |
| 8     | Opportunity Solution Tree: API + UI | Targeted opportunity, 3+ solutions warning, assumptions and tests, validation gate, convert solution to story.                                                                        |
| 9     | Insights                            | Flow metrics from `activity_events`, throughput and cycle-time percentiles, WIP, flow distribution, Monte Carlo forecast.                                                             |

## Shared rules for every phase

- Each phase must read `docs/CONVENTIONS.md` first (Phase 1 creates it) and keep `docs/PROGRESS.md` updated with what was built and any decisions.
- Each phase ends with lint, typecheck, build and tests green, then a short summary.
- Commit between phases so a bad run can be reverted cleanly.
- Do not let a phase edit a migration from an earlier phase; always add a new migration.
