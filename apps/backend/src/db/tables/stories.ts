import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, pk, updatedAt } from "./columns";
import { moduleBase, projects, users } from "./core";
import { storyStatus, workType } from "./enums";

/** Legacy User Story Mapping (personas, journey steps, user stories, action steps). */

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
