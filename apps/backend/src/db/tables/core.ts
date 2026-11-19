import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
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
import { createdAt, pk, updatedAt } from "./columns";
import { health, sprintStatus, userRole } from "./enums";

/** Users, sessions, projects, members, subprojects, sprints, module base columns and code sequences. */

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("projects_code_lower_uq").on(sql`lower(${t.code})`),
    index("projects_owner_id_idx").on(t.ownerId),
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

// ---------------------------------------------------------------- Phase 4: module data layer
// Composite same-project FKs for subproject_id / sprint_id / release_id on these tables are added in
// the hand-written migration, named <table>_project_<column>_fk.

export const moduleBase = () => ({
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
