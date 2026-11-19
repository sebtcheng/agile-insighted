# Index coverage (database `agile_local`, read-only catalog queries)

Schema file: `../../../Users/user/AppData/Local/Temp/schema.backup.ts` (32 tables, 105 declared indexes). Live: 144 indexes on 33 tables. Stats reset: never/unknown.
Largest tables (live rows): tags=54, code_counters=6, projects=6, users=5, ost_solutions=5.

## Missing-index candidates (column used at a query site, no live index leads with it)

| table | column | used in | live rows | priority | sites |
|---|---|---|---|---|---|
| tags | name | orderBy | 54 | low (small table) | apps/backend/src/services/activityQueries.ts:159 |
| sprints | name | where-eq | 0 | low (small table) | apps/backend/src/db/seed.ts:244 |

## Foreign keys without a supporting index (live)

| table | constraint | columns | live rows |
|---|---|---|---|
| usm_step_features | usm_step_features_project_step_fk | step_id, project_id | 4 |
| usm_personas | usm_personas_created_by_id_users_id_fk | created_by_id | 2 |
| usm_steps | usm_steps_created_by_id_users_id_fk | created_by_id | 2 |
| usm_steps | usm_steps_project_persona_fk | persona_id, project_id | 2 |
| user_stories | user_stories_project_sprint_fk | project_id, sprint_id | 1 |
| user_stories | user_stories_project_release_fk | project_id, release_id | 1 |
| sprints | sprints_project_subproject_fk | project_id, subproject_id | 0 |
| activities | activities_project_subproject_fk | project_id, subproject_id | 0 |
| activities | activities_project_sprint_fk | project_id, sprint_id | 0 |
| activities | activities_project_release_fk | project_id, release_id | 0 |

## Drift: declared in schema.ts but missing live

_none_

## Drift: live but not declared in schema.ts

| table | index | columns |
|---|---|---|
| activities | activities_title_trgm_idx | title |
| subprojects | subprojects_name_trgm_idx | name |
| subprojects | subprojects_code_trgm_idx | code |
| users | users_full_name_trgm_idx | full_name |

## Unused indexes (idx_scan = 0, not unique/primary)

| table | index | columns | size | table rows |
|---|---|---|---|---|
| users | users_full_name_trgm_idx | full_name | 0.0 MB | 5 |
| journey_steps | journey_steps_project_position_idx | project_id, position | 0.0 MB | 4 |
| raid_mitigating_actions | raid_mitigating_actions_responsible_idx | responsible_id | 0.0 MB | 3 |
| kano_request_specs | kano_request_specs_responsible_idx | responsible_id | 0.0 MB | 2 |
| usm_steps | usm_steps_project_idx | project_id | 0.0 MB | 2 |
| kano_requests | kano_requests_project_id_idx | project_id | 0.0 MB | 1 |
| kano_requests | kano_requests_category_idx | kano_category | 0.0 MB | 1 |
| raid_items | raid_items_open_target_idx | target_date | 0.0 MB | 1 |
| raid_items | raid_items_type_status_idx | item_type, status | 0.0 MB | 1 |
| checklist_checks | checklist_checks_story_idx | story_id | 0.0 MB | 1 |
| kano_requests | kano_requests_responsible_idx | responsible_id | 0.0 MB | 1 |
| user_stories | user_stories_responsible_idx | responsible_id | 0.0 MB | 1 |
| user_stories | user_stories_project_status_idx | project_id, status | 0.0 MB | 1 |
| activities | activities_assignee_due_open_idx | assignee_id, due_date | 0.0 MB | 0 |
| activities | activities_due_open_idx | due_date | 0.0 MB | 0 |
| activities | activities_completed_at_idx | completed_at | 0.0 MB | 0 |
| activities | activities_subproject_blocked_idx | subproject_id | 0.0 MB | 0 |
| activity_events | activity_events_type_idx | event_type, occurred_at | 0.0 MB | 0 |
| activity_tags | activity_tags_tag_idx | tag_id, activity_id | 0.0 MB | 0 |
| activities | activities_release_id_idx | release_id | 0.0 MB | 0 |
| activities | activities_title_trgm_idx | title | 0.1 MB | 0 |
| subprojects | subprojects_name_trgm_idx | name | 0.0 MB | 0 |
| subprojects | subprojects_code_trgm_idx | code | 0.0 MB | 0 |

## Duplicate or redundant indexes

| table | index | overlaps with | columns | kind |
|---|---|---|---|---|
| activities | activities_project_id_idx | activities_project_created_idx | project_id ⊂ project_id, created_at, id | redundant (prefix of another index) |
| kano_requests | kano_requests_project_id_idx | kano_requests_project_seq_uq | project_id ⊂ project_id, seq | redundant (prefix of another index) |
| ost_solutions | ost_solutions_project_id_idx | ost_solutions_project_seq_uq | project_id ⊂ project_id, seq | redundant (prefix of another index) |
| raid_items | raid_items_project_id_idx | raid_items_project_seq_uq | project_id ⊂ project_id, seq | redundant (prefix of another index) |
| usm_steps | usm_steps_project_idx | usm_steps_project_persona_sort_idx | project_id ⊂ project_id, persona_id, sort_order | redundant (prefix of another index) |

## Tables with high sequential scan counts (>= 100 scans and >= 10000 rows)

_none_

_Counts are cumulative since the stats reset and reflect whatever workload ran on this local DB, not production traffic. Confirm any suspect with `explain-query.mjs` before reporting it as Verified._
