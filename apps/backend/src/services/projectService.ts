import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type {
  CreateProjectInput,
  CreateSprintInput,
  CreateSubprojectInput,
  UpdateProjectInput,
  UpdateSprintInput,
  UpdateSubprojectInput,
} from "@myapp/shared";
import { db } from "../db/client";
import { projects, sprints, subprojects } from "../db/schema";
import { conflict, notFound, unprocessable } from "../errors";

// ---- projects
export async function listProjects() {
  return db.select().from(projects).orderBy(asc(projects.name));
}

export async function getProject(id: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) throw notFound("Project");
  return row;
}

export async function createProject(ownerId: string, input: CreateProjectInput) {
  const [row] = await db
    .insert(projects)
    .values({
      name: input.name,
      code: input.code,
      ownerId,
      wipLimitPerPerson: input.wipLimitPerPerson,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function updateProject(id: string, patch: UpdateProjectInput) {
  const set: Partial<typeof projects.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.wipLimitPerPerson !== undefined) set.wipLimitPerPerson = patch.wipLimitPerPerson;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  const [row] =
    Object.keys(set).length > 0
      ? await db.update(projects).set(set).where(eq(projects.id, id)).returning()
      : await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) throw notFound("Project");
  return row;
}

async function assertProjectOpen(projectId: string) {
  const project = await getProject(projectId);
  if (project.archivedAt) throw conflict("This project is archived and read-only");
  return project;
}

// ---- subprojects
export async function listSubprojects(projectId: string, includeArchived = false) {
  return db
    .select()
    .from(subprojects)
    .where(
      includeArchived
        ? eq(subprojects.projectId, projectId)
        : and(eq(subprojects.projectId, projectId), isNull(subprojects.archivedAt)),
    )
    .orderBy(asc(subprojects.code));
}

export async function createSubproject(projectId: string, input: CreateSubprojectInput) {
  await assertProjectOpen(projectId);
  const [row] = await db
    .insert(subprojects)
    .values({
      projectId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      leadId: input.leadId ?? null,
      health: input.health,
      healthNote: input.healthNote ?? null,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function updateSubproject(id: string, patch: UpdateSubprojectInput) {
  const set: Partial<typeof subprojects.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.leadId !== undefined) set.leadId = patch.leadId;
  if (patch.health !== undefined) set.health = patch.health;
  if (patch.healthNote !== undefined) set.healthNote = patch.healthNote;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  const [row] =
    Object.keys(set).length > 0
      ? await db.update(subprojects).set(set).where(eq(subprojects.id, id)).returning()
      : await db.select().from(subprojects).where(eq(subprojects.id, id)).limit(1);
  if (!row) throw notFound("Subproject");
  return row;
}

// ---- sprints
export async function listSprints(projectId: string) {
  return db
    .select()
    .from(sprints)
    .where(eq(sprints.projectId, projectId))
    .orderBy(desc(sprints.startDate));
}

const hasGoal = (goal: string | null | undefined): boolean =>
  Boolean(goal && goal.trim().length > 0);

export async function createSprint(projectId: string, input: CreateSprintInput) {
  await assertProjectOpen(projectId);
  if (input.status === "active" && !hasGoal(input.goal)) {
    throw unprocessable("A sprint needs a goal before it can become active");
  }
  const [row] = await db
    .insert(sprints)
    .values({
      projectId,
      subprojectId: input.subprojectId ?? null,
      name: input.name,
      goal: input.goal?.trim() || null,
      capacityItems: input.capacityItems ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function updateSprint(id: string, patch: UpdateSprintInput) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(sprints)
      .where(eq(sprints.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Sprint");
    await assertProjectOpen(current.projectId);
    const goal = patch.goal === undefined ? current.goal : patch.goal?.trim() || null;
    const status = patch.status ?? current.status;
    if (status === "active" && !hasGoal(goal)) {
      throw unprocessable("A sprint needs a goal before it can become active");
    }
    const [row] = await tx
      .update(sprints)
      .set({
        goal,
        status,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.capacityItems === undefined ? {} : { capacityItems: patch.capacityItems }),
        ...(patch.startDate === undefined ? {} : { startDate: patch.startDate }),
        ...(patch.endDate === undefined ? {} : { endDate: patch.endDate }),
      })
      .where(eq(sprints.id, id))
      .returning();
    if (!row) throw notFound("Sprint");
    return row;
  });
}
