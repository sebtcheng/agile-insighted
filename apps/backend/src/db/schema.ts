import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  KANO_CATEGORIES,
  RAID_STATUSES,
  RAID_TYPES,
  STORY_STATUSES,
  VALIDATION_STATUSES,
  CHECKLIST_KINDS,
  GATES,
  OVERRIDE_ENTITY_TYPES,
  RELEASE_STATUSES,
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_PRIORITIES,
  ACTIVITY_STATUSES,
  HEALTHS,
  SPRINT_STATUSES,
  TRACKS,
  USER_ROLES,
  WORK_TYPES,
} from "@myapp/shared";

/*
 * Source of truth for the database. Drizzle cannot express the composite
 * same-project foreign keys with column-list ON DELETE SET NULL, the updated_at
 * triggers or the uuidv7() fallback; those live in the hand-written migration
 * next to the generated one (see apps/backend/README.md).
 */

const pk = () =>
  uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const userRole = pgEnum("user_role", USER_ROLES);
export const sprintStatus = pgEnum("sprint_status", SPRINT_STATUSES);
export const activityStatus = pgEnum("activity_status", ACTIVITY_STATUSES);
export const activityPriority = pgEnum("activity_priority", ACTIVITY_PRIORITIES);
export const workType = pgEnum("work_type", WORK_TYPES);
export const track = pgEnum("track", TRACKS);
export const health = pgEnum("health", HEALTHS);
export const activityEventType = pgEnum("activity_event_type", ACTIVITY_EVENT_TYPES);

export const releaseStatus = pgEnum("release_status", RELEASE_STATUSES);
export const checklistKind = pgEnum("checklist_kind", CHECKLIST_KINDS);
export const gate = pgEnum("gate", GATES);
export const validationStatus = pgEnum("validation_status", VALIDATION_STATUSES);
export const storyStatus = pgEnum("story_status", STORY_STATUSES);
export const kanoCategory = pgEnum("kano_category", KANO_CATEGORIES);
export const raidType = pgEnum("raid_type", RAID_TYPES);
export const raidStatus = pgEnum("raid_status", RAID_STATUSES);

export const users = pgTable(
  "users",
  {
    id: pk(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("team_member"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: pk(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    wipLimitPerPerson: smallint("wip_limit_per_person").notNull().default(3),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("projects_code_lower_uq").on(sql`lower(${t.code})`),
    index("projects_owner_id_idx").on(t.ownerId),
    check("projects_wip_limit_positive", sql`${t.wipLimitPerPerson} > 0`),
  ],
);

/** Team members assigned to a project. The owner lives on projects.owner_id and sees the project too. */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_id_idx").on(t.userId),
  ],
);

export const subprojects = pgTable(
  "subprojects",
  {
    id: pk(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    leadId: uuid("lead_id").references(() => users.id, { onDelete: "set null" }),
    health: health("health").notNull().default("on_track"),
    healthNote: text("health_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    unique("subprojects_project_code_uq").on(t.projectId, t.code),
    unique("subprojects_project_id_id_uq").on(t.projectId, t.id),
    index("subprojects_lead_id_idx").on(t.leadId),
  ],
);

// Composite FK (project_id, subproject_id) is added in the hand-written migration.
export const sprints = pgTable(
  "sprints",
  {
    id: pk(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    subprojectId: uuid("subproject_id"),
    name: text("name").notNull(),
    goal: text("goal"),
    capacityItems: smallint("capacity_items"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    status: sprintStatus("status").notNull().default("planning"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("sprints_project_name_uq").on(t.projectId, t.name),
    unique("sprints_project_id_id_uq").on(t.projectId, t.id),
    index("sprints_subproject_id_idx").on(t.subprojectId),
    check("sprints_dates_ordered", sql`${t.endDate} >= ${t.startDate}`),
    uniqueIndex("sprints_one_active_per_scope")
      .on(
        t.projectId,
        sql`coalesce(${t.subprojectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.status} = 'active'`),
  ],
);

// Composite FKs (project_id, subproject_id) and (project_id, sprint_id) are in the hand-written migration.
export const activities = pgTable(
  "activities",
  {
    id: pk(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    subprojectId: uuid("subproject_id"),
    sprintId: uuid("sprint_id"),
    // Composite FK (project_id, release_id) is added in the Phase 2 hand-written migration.
    releaseId: uuid("release_id"),
    // Phase 4: link an activity to the story it delivers.
    userStoryId: uuid("user_story_id").references(() => userStories.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    status: activityStatus("status").notNull().default("todo"),
    priority: activityPriority("priority").notNull().default("medium"),
    workType: workType("work_type").notNull().default("feature"),
    track: track("track").notNull().default("delivery"),
    percentComplete: smallint("percent_complete").notNull().default(0),
    isBlocked: boolean("is_blocked").notNull().default(false),
    blockedReason: text("blocked_reason"),
    dueDate: date("due_date", { mode: "string" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("activities_project_id_idx").on(t.projectId),
    index("activities_subproject_id_idx").on(t.subprojectId),
    index("activities_sprint_id_idx").on(t.sprintId),
    index("activities_release_id_idx").on(t.releaseId),
    index("activities_user_story_id_idx").on(t.userStoryId),
    index("activities_assignee_id_idx").on(t.assigneeId),
    index("activities_created_by_id_idx").on(t.createdById),
    index("activities_assignee_due_open_idx")
      .on(t.assigneeId, t.dueDate)
      .where(sql`${t.status} <> 'done' AND ${t.dueDate} IS NOT NULL`),
    index("activities_due_open_idx")
      .on(t.dueDate)
      .where(sql`${t.status} <> 'done' AND ${t.dueDate} IS NOT NULL`),
    index("activities_completed_at_idx")
      .on(t.completedAt)
      .where(sql`${t.completedAt} IS NOT NULL`),
    index("activities_assignee_wip_idx")
      .on(t.assigneeId)
      .where(sql`${t.status} IN ('in_progress','in_review')`),
    index("activities_subproject_blocked_idx")
      .on(t.subprojectId)
      .where(sql`${t.isBlocked}`),
    index("activities_project_created_idx").on(t.projectId, t.createdAt, t.id),
    check("activities_percent_range", sql`${t.percentComplete} BETWEEN 0 AND 100`),
    check("activities_done_is_100", sql`${t.status} <> 'done' OR ${t.percentComplete} = 100`),
    check(
      "activities_done_has_completed_at",
      sql`(${t.status} = 'done') = (${t.completedAt} IS NOT NULL)`,
    ),
    check(
      "activities_blocked_has_reason",
      sql`NOT ${t.isBlocked} OR ${t.blockedReason} IS NOT NULL`,
    ),
    check("activities_started_after_todo", sql`${t.status} = 'todo' OR ${t.startedAt} IS NOT NULL`),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: pk(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    eventType: activityEventType("event_type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    note: text("note"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_events_activity_idx").on(t.activityId, t.occurredAt),
    index("activity_events_type_idx").on(t.eventType, t.occurredAt),
    index("activity_events_actor_id_idx").on(t.actorId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: pk(),
    name: text("name").notNull(),
    colorCode: text("color_code").notNull().default("#64748B"),
  },
  (t) => [
    uniqueIndex("tags_name_lower_uq").on(sql`lower(${t.name})`),
    check("tags_color_hex", sql`${t.colorCode} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const activityTags = pgTable(
  "activity_tags",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.tagId] }),
    index("activity_tags_tag_idx").on(t.tagId, t.activityId),
  ],
);

export const activityComments = pgTable(
  "activity_comments",
  {
    id: pk(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_comments_activity_idx").on(t.activityId, t.createdAt),
    index("activity_comments_author_id_idx").on(t.authorId),
    check("activity_comments_body_not_empty", sql`char_length(btrim(${t.body})) > 0`),
  ],
);

// ---------------------------------------------------------------- Phase 2: planning and governance

export const releases = pgTable(
  "releases",
  {
    id: pk(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetDate: date("target_date", { mode: "string" }),
    position: integer("position").notNull().default(0),
    status: releaseStatus("status").notNull().default("planned"),
    isMvp: boolean("is_mvp").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("releases_project_name_uq").on(t.projectId, t.name),
    unique("releases_project_id_id_uq").on(t.projectId, t.id),
    uniqueIndex("releases_one_mvp_per_project")
      .on(t.projectId)
      .where(sql`${t.isMvp}`),
    index("releases_project_position_idx").on(t.projectId, t.position),
  ],
);

export const sprintMemberCapacity = pgTable(
  "sprint_member_capacity",
  {
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    capacityItems: smallint("capacity_items").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sprintId, t.userId] }),
    index("sprint_member_capacity_user_idx").on(t.userId),
    check("sprint_member_capacity_nonneg", sql`${t.capacityItems} >= 0`),
  ],
);

export const sprintScopeChanges = pgTable(
  "sprint_scope_changes",
  {
    id: pk(),
    sprintId: uuid("sprint_id")
      .notNull()
      .references(() => sprints.id, { onDelete: "cascade" }),
    addedActivityId: uuid("added_activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    removedActivityId: uuid("removed_activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    requestedById: uuid("requested_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedById: uuid("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("sprint_scope_changes_sprint_idx").on(t.sprintId),
    index("sprint_scope_changes_added_idx").on(t.addedActivityId),
    index("sprint_scope_changes_removed_idx").on(t.removedActivityId),
    index("sprint_scope_changes_requested_by_idx").on(t.requestedById),
    index("sprint_scope_changes_approved_by_idx").on(t.approvedById),
    check("sprint_scope_changes_reason_not_empty", sql`char_length(btrim(${t.reason})) > 0`),
    check(
      "sprint_scope_changes_distinct",
      sql`${t.removedActivityId} IS NULL OR ${t.addedActivityId} <> ${t.removedActivityId}`,
    ),
  ],
);

export const activityDependencies = pgTable(
  "activity_dependencies",
  {
    blockedActivityId: uuid("blocked_activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    blockingActivityId: uuid("blocking_activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.blockedActivityId, t.blockingActivityId] }),
    index("activity_dependencies_blocking_idx").on(t.blockingActivityId),
    check("activity_dependencies_distinct", sql`${t.blockedActivityId} <> ${t.blockingActivityId}`),
  ],
);

export const checklistTemplates = pgTable(
  "checklist_templates",
  {
    id: pk(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: checklistKind("kind").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("checklist_templates_project_kind_pos_idx").on(t.projectId, t.kind, t.position),
    check("checklist_templates_label_not_empty", sql`char_length(btrim(${t.label})) > 0`),
  ],
);

// A check targets either an activity (Definition of Done) or a user story (Definition of Ready).
export const checklistChecks = pgTable(
  "checklist_checks",
  {
    id: pk(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => checklistTemplates.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "cascade" }),
    storyId: uuid("story_id").references(() => userStories.id, { onDelete: "cascade" }),
    checkedById: uuid("checked_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A check belongs to exactly one of a story or an activity (Definition of Ready vs Done).
    check("checklist_checks_one_target", sql`num_nonnulls(${t.storyId}, ${t.activityId}) = 1`),
    uniqueIndex("checklist_checks_activity_template_uq")
      .on(t.activityId, t.templateId)
      .where(sql`${t.activityId} IS NOT NULL`),
    uniqueIndex("checklist_checks_story_template_uq")
      .on(t.storyId, t.templateId)
      .where(sql`${t.storyId} IS NOT NULL`),
    index("checklist_checks_activity_idx").on(t.activityId),
    index("checklist_checks_story_idx").on(t.storyId),
    index("checklist_checks_template_idx").on(t.templateId),
    index("checklist_checks_checked_by_idx").on(t.checkedById),
  ],
);

/** Append-only audit log. Deliberately polymorphic: no FK on entity_id. */
export const gateOverrides = pgTable(
  "gate_overrides",
  {
    id: pk(),
    gate: gate("gate").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    reason: text("reason").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("gate_overrides_entity_idx").on(t.entityType, t.entityId),
    index("gate_overrides_user_idx").on(t.userId),
    check("gate_overrides_reason_not_empty", sql`char_length(btrim(${t.reason})) > 0`),
    check(
      "gate_overrides_entity_type",
      sql`${t.entityType} IN (${sql.raw(OVERRIDE_ENTITY_TYPES.map((v) => `'${v}'`).join(", "))})`,
    ),
  ],
);

// ---------------------------------------------------------------- Phase 4: module data layer
// Composite same-project FKs for subproject_id / sprint_id / release_id on these tables are added in
// the hand-written migration, named <table>_project_<column>_fk.

const moduleBase = () => ({
  id: pk(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Source of the global project codes (PROJ-01, PROJ-02, ...). Read with nextval in projectService. */
export const projectCodeSeq = pgSequence("project_code_seq");

/** Per-project sequence source for human-readable codes. See nextSeq() in services/seq.ts. */
export const codeCounters = pgTable(
  "code_counters",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.scope] }),
    check("code_counters_scope", sql`${t.scope} IN ('ost', 'usm', 'req', 'raid', 'sub')`),
    check("code_counters_last_value_nonneg", sql`${t.lastValue} >= 0`),
  ],
);

// ---- Opportunity Solution Tree
export const ostOutcomes = pgTable(
  "ost_outcomes",
  {
    ...moduleBase(),
    title: text("title").notNull(),
    description: text("description"),
    targetDate: date("target_date", { mode: "string" }),
  },
  (t) => [
    index("ost_outcomes_project_id_idx").on(t.projectId),
    index("ost_outcomes_created_by_idx").on(t.createdById),
    check("ost_outcomes_title_not_empty", sql`char_length(btrim(${t.title})) > 0`),
  ],
);

export const ostOpportunities = pgTable(
  "ost_opportunities",
  {
    ...moduleBase(),
    outcomeId: uuid("outcome_id")
      .notNull()
      .references(() => ostOutcomes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    isTargeted: boolean("is_targeted").notNull().default(false),
  },
  (t) => [
    index("ost_opportunities_project_id_idx").on(t.projectId),
    index("ost_opportunities_outcome_id_idx").on(t.outcomeId),
    index("ost_opportunities_created_by_idx").on(t.createdById),
    uniqueIndex("ost_opportunities_one_targeted_per_outcome")
      .on(t.outcomeId)
      .where(sql`${t.isTargeted}`),
    check("ost_opportunities_title_not_empty", sql`char_length(btrim(${t.title})) > 0`),
  ],
);

export const ostSolutions = pgTable(
  "ost_solutions",
  {
    ...moduleBase(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => ostOpportunities.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    code: text("code")
      .notNull()
      .generatedAlwaysAs(
        sql`'OST-' || repeat('0', greatest(2 - length(seq::text), 0)) || seq::text`,
      ),
    title: text("title").notNull(),
    // The solution is the action: planned until the PM marks it validated.
    validationStatus: validationStatus("validation_status").notNull().default("planned"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    targetDate: date("target_date", { mode: "string" }),
    convertedStoryId: uuid("converted_story_id").references((): AnyPgColumn => userStories.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("ost_solutions_project_seq_uq").on(t.projectId, t.seq),
    index("ost_solutions_project_id_idx").on(t.projectId),
    index("ost_solutions_opportunity_idx").on(t.opportunityId),
    index("ost_solutions_owner_idx").on(t.ownerId),
    index("ost_solutions_converted_story_idx").on(t.convertedStoryId),
    index("ost_solutions_created_by_idx").on(t.createdById),
    check("ost_solutions_seq_positive", sql`${t.seq} > 0`),
    check("ost_solutions_title_not_empty", sql`char_length(btrim(${t.title})) > 0`),
  ],
);

// ---- User Story Mapping
export const personas = pgTable(
  "personas",
  {
    ...moduleBase(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => [
    uniqueIndex("personas_project_name_lower_uq").on(t.projectId, sql`lower(${t.name})`),
    index("personas_created_by_idx").on(t.createdById),
    check("personas_name_not_empty", sql`char_length(btrim(${t.name})) > 0`),
  ],
);

export const journeySteps = pgTable(
  "journey_steps",
  {
    ...moduleBase(),
    // null = backbone activity; set = a step under that backbone activity.
    parentStepId: uuid("parent_step_id").references((): AnyPgColumn => journeySteps.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    unique("journey_steps_scope_name_uq")
      .on(t.projectId, t.parentStepId, t.name)
      .nullsNotDistinct(),
    index("journey_steps_project_position_idx").on(t.projectId, t.position),
    index("journey_steps_parent_idx").on(t.parentStepId),
    index("journey_steps_created_by_idx").on(t.createdById),
    check("journey_steps_name_not_empty", sql`char_length(btrim(${t.name})) > 0`),
  ],
);

export const userStories = pgTable(
  "user_stories",
  {
    ...moduleBase(),
    seq: integer("seq").notNull(),
    code: text("code")
      .notNull()
      .generatedAlwaysAs(
        sql`'USM-' || repeat('0', greatest(2 - length(seq::text), 0)) || seq::text`,
      ),
    personaId: uuid("persona_id").references(() => personas.id, { onDelete: "set null" }),
    journeyStepId: uuid("journey_step_id").references(() => journeySteps.id, {
      onDelete: "set null",
    }),
    story: text("story").notNull(),
    acceptanceCriteria: text("acceptance_criteria"),
    workType: workType("work_type").notNull().default("feature"),
    // The UI's "MVP status" is release.is_mvp; "Sprint Target" is sprint_id.
    releaseId: uuid("release_id"),
    sprintId: uuid("sprint_id"),
    storyPoints: smallint("story_points"),
    status: storyStatus("status").notNull().default("backlog"),
    position: integer("position").notNull().default(0),
    // Person responsible; same shape as kano_requests.responsible_id.
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "set null" }),
    targetDate: date("target_date", { mode: "string" }),
  },
  (t) => [
    unique("user_stories_project_seq_uq").on(t.projectId, t.seq),
    index("user_stories_responsible_idx").on(t.responsibleId),
    index("user_stories_project_status_idx").on(t.projectId, t.status),
    index("user_stories_persona_idx").on(t.personaId),
    index("user_stories_journey_step_idx").on(t.journeyStepId),
    index("user_stories_sprint_idx").on(t.sprintId),
    index("user_stories_release_idx").on(t.releaseId),
    index("user_stories_created_by_idx").on(t.createdById),
    check("user_stories_seq_positive", sql`${t.seq} > 0`),
    check("user_stories_story_not_empty", sql`char_length(btrim(${t.story})) > 0`),
    check(
      "user_stories_points_allowed",
      sql`${t.storyPoints} IS NULL OR ${t.storyPoints} IN (1, 2, 3, 5, 8, 13, 21)`,
    ),
  ],
);

// Per-story action steps (what will be done, by whom, by when), mirroring raid_mitigating_actions and
// kano_request_specs. The table keeps its original name (it began as Definition of Ready criteria) so the upgrade
// is additive; a story with steps can only be marked completed when every step is done.
export const storyActionSteps = pgTable(
  "story_dor_items",
  {
    id: pk(),
    storyId: uuid("story_id")
      .notNull()
      .references(() => userStories.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Nullable in the DB so rows created before these columns existed stay valid; the API requires them on write.
    targetDate: date("target_date", { mode: "string" }),
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("story_dor_items_story_idx").on(t.storyId, t.sortOrder),
    index("story_dor_items_responsible_idx").on(t.responsibleId),
    check("story_dor_items_label_not_empty", sql`char_length(btrim(${t.label})) > 0`),
    check(
      "story_dor_items_completed_at_matches",
      sql`${t.isCompleted} = (${t.completedAt} IS NOT NULL)`,
    ),
  ],
);

export const userStoriesRelations = relations(userStories, ({ one, many }) => ({
  actionSteps: many(storyActionSteps),
  project: one(projects, { fields: [userStories.projectId], references: [projects.id] }),
  responsible: one(users, { fields: [userStories.responsibleId], references: [users.id] }),
}));
export const storyActionStepsRelations = relations(storyActionSteps, ({ one }) => ({
  story: one(userStories, { fields: [storyActionSteps.storyId], references: [userStories.id] }),
  responsible: one(users, { fields: [storyActionSteps.responsibleId], references: [users.id] }),
}));

// ---- User Story Mapping v2: Project -> persona -> ordered steps -> feature checklist.
// The legacy personas / journey_steps / user_stories / releases tables stay in place, unused by this flow.
export const usmPersonas = pgTable(
  "usm_personas",
  {
    ...moduleBase(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("usm_personas_project_sort_idx").on(t.projectId, t.sortOrder),
    uniqueIndex("usm_personas_project_name_lower_uq").on(t.projectId, sql`lower(${t.name})`),
    unique("usm_personas_id_project_uq").on(t.id, t.projectId),
    check("usm_personas_name_not_empty", sql`char_length(btrim(${t.name})) > 0`),
  ],
);

export const usmSteps = pgTable(
  "usm_steps",
  {
    ...moduleBase(),
    personaId: uuid("persona_id")
      .notNull()
      .references(() => usmPersonas.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("usm_steps_project_idx").on(t.projectId),
    index("usm_steps_persona_idx").on(t.personaId),
    index("usm_steps_project_persona_sort_idx").on(t.projectId, t.personaId, t.sortOrder),
    unique("usm_steps_id_project_uq").on(t.id, t.projectId),
    check("usm_steps_title_not_empty", sql`char_length(btrim(${t.title})) > 0`),
  ],
);

export const usmStepFeatures = pgTable(
  "usm_step_features",
  {
    id: pk(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => usmSteps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Same shapes as kano_request_specs.responsible_id / target_date.
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "set null" }),
    targetDate: date("target_date", { mode: "string" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("usm_step_features_project_idx").on(t.projectId),
    index("usm_step_features_step_sort_idx").on(t.stepId, t.sortOrder),
    index("usm_step_features_responsible_idx").on(t.responsibleId),
    // The feature's project must equal its step's project (enforced by a composite FK in the migration).
    check("usm_step_features_title_not_empty", sql`char_length(btrim(${t.title})) > 0`),
    check(
      "usm_step_features_completed_at_matches",
      sql`${t.isCompleted} = (${t.completedAt} IS NOT NULL)`,
    ),
  ],
);

// ---- Kano Request Tracker
export const kanoRequests = pgTable(
  "kano_requests",
  {
    ...moduleBase(),
    seq: integer("seq").notNull(),
    code: text("code")
      .notNull()
      .generatedAlwaysAs(
        sql`'REQ-' || repeat('0', greatest(3 - length(seq::text), 0)) || seq::text`,
      ),
    revisionRequest: text("revision_request").notNull(),
    kanoCategory: kanoCategory("kano_category"),
    targetDate: date("target_date", { mode: "string" }),
    // Person responsible; same shape as raid_items.owner_id.
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    unique("kano_requests_project_seq_uq").on(t.projectId, t.seq),
    index("kano_requests_project_id_idx").on(t.projectId),
    index("kano_requests_category_idx").on(t.kanoCategory),
    index("kano_requests_responsible_idx").on(t.responsibleId),
    index("kano_requests_created_by_idx").on(t.createdById),
    check("kano_requests_seq_positive", sql`${t.seq} > 0`),
    check(
      "kano_requests_revision_request_not_empty",
      sql`char_length(btrim(${t.revisionRequest})) > 0`,
    ),
  ],
);

// One-to-many checklist of revision specs. A request is complete only when every spec is done.
export const kanoRequestSpecs = pgTable(
  "kano_request_specs",
  {
    id: pk(),
    kanoRequestId: uuid("kano_request_id")
      .notNull()
      .references(() => kanoRequests.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    // Per-spec tagging. Same shapes as kano_requests.target_date / responsible_id (the request-level date is deprecated).
    targetDate: date("target_date", { mode: "string" }),
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("kano_request_specs_request_idx").on(t.kanoRequestId, t.sortOrder),
    index("kano_request_specs_responsible_idx").on(t.responsibleId),
    check("kano_request_specs_label_not_empty", sql`char_length(btrim(${t.label})) > 0`),
    check(
      "kano_request_specs_completed_at_matches",
      sql`${t.isCompleted} = (${t.completedAt} IS NOT NULL)`,
    ),
  ],
);

// ---- RAID Log
export const raidItems = pgTable(
  "raid_items",
  {
    ...moduleBase(),
    seq: integer("seq").notNull(),
    code: text("code")
      .notNull()
      .generatedAlwaysAs(
        sql`'RAID-' || repeat('0', greatest(2 - length(seq::text), 0)) || seq::text`,
      ),
    itemType: raidType("item_type").notNull(),
    description: text("description").notNull(),
    impact: smallint("impact").notNull(),
    likelihood: smallint("likelihood"),
    // impact * likelihood; null while likelihood is unknown.
    severityScore: smallint("severity_score").generatedAlwaysAs(sql`impact * likelihood`),
    mitigatingAction: text("mitigating_action"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    raisedById: uuid("raised_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: raidStatus("status").notNull().default("open"),
    targetDate: date("target_date", { mode: "string" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    unique("raid_items_project_seq_uq").on(t.projectId, t.seq),
    index("raid_items_project_id_idx").on(t.projectId),
    index("raid_items_owner_idx").on(t.ownerId),
    index("raid_items_raised_by_idx").on(t.raisedById),
    index("raid_items_created_by_idx").on(t.createdById),
    index("raid_items_open_target_idx")
      .on(t.targetDate)
      .where(sql`${t.status} <> 'closed'`),
    index("raid_items_type_status_idx").on(t.itemType, t.status),
    check("raid_items_seq_positive", sql`${t.seq} > 0`),
    check("raid_items_description_not_empty", sql`char_length(btrim(${t.description})) > 0`),
    check("raid_items_impact_range", sql`${t.impact} BETWEEN 1 AND 3`),
    check(
      "raid_items_likelihood_range",
      sql`${t.likelihood} IS NULL OR ${t.likelihood} BETWEEN 1 AND 3`,
    ),
  ],
);

// One-to-many checklist of mitigating actions. Replaces raid_items.mitigating_action, which stays
// in place (deprecated, no longer written) until a later contract migration drops it.
export const raidMitigatingActions = pgTable(
  "raid_mitigating_actions",
  {
    id: pk(),
    raidItemId: uuid("raid_item_id")
      .notNull()
      .references(() => raidItems.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Nullable in the DB so rows created before this column existed stay valid; the API requires it on write.
    targetDate: date("target_date", { mode: "string" }),
    // Staff responsible. Nullable like raid_items.owner_id (set null on user delete); the API requires it on write.
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("raid_mitigating_actions_raid_item_idx").on(t.raidItemId, t.sortOrder),
    index("raid_mitigating_actions_responsible_idx").on(t.responsibleId),
    check(
      "raid_mitigating_actions_description_not_empty",
      sql`char_length(btrim(${t.description})) > 0`,
    ),
    check(
      "raid_mitigating_actions_completed_at_matches",
      sql`${t.isCompleted} = (${t.completedAt} IS NOT NULL)`,
    ),
  ],
);
