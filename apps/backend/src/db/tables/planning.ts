import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { OVERRIDE_ENTITY_TYPES } from "@myapp/shared";
import { activities } from "./activities";
import { createdAt, pk, updatedAt } from "./columns";
import { projects, sprints, users } from "./core";
import { checklistKind, gate, releaseStatus } from "./enums";
import { userStories } from "./stories";

/** Phase 2 planning and governance: releases, capacity, scope changes, dependencies, checklists, overrides. */

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
