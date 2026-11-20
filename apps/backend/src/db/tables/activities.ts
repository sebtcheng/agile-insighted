import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, pk, updatedAt } from "./columns";
import { projects, users } from "./core";
import { activityEventType, activityPriority, activityStatus, track, workType } from "./enums";
import { userStories } from "./stories";

/** Activities and their events, tags and comments. */

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
    pmApproval: text("pm_approval").$type<"PENDING" | "APPROVED">().notNull().default("PENDING"),
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
