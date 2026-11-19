import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import type {
  CreateProjectInput,
  CreateSprintInput,
  CreateSubprojectInput,
  UpdateProjectInput,
  UpdateSprintInput,
  UpdateSubprojectInput,
} from "@myapp/shared";
import { db } from "../db/client";
import { activities, projectMembers, projects, sprints, subprojects, users } from "../db/schema";
import { conflict, notFound, unprocessable } from "../errors";
import { nextSeq } from "./seq";
import { scopeCondition, type ProjectScope } from "./visibilityService";

// ---- projects
type ProjectRow = typeof projects.$inferSelect;
export type ProjectWithTeam = ProjectRow & {
  ownerName: string | null;
  members: Array<{ id: string; fullName: string }>;
  memberIds: string[];
};

/** Attaches the owner's name and the member list to project rows in two queries total. */
async function withTeam(rows: ProjectRow[]): Promise<ProjectWithTeam[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);
  const [owners, memberRows] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(
        inArray(
          users.id,
          rows.map((p) => p.ownerId),
        ),
      ),
    db
      .select({ projectId: projectMembers.projectId, id: users.id, fullName: users.fullName })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(inArray(projectMembers.projectId, ids))
      .orderBy(asc(users.fullName)),
  ]);
  const ownerName = new Map(owners.map((o) => [o.id, o.fullName]));
  const byProject = new Map<string, Array<{ id: string; fullName: string }>>();
  for (const m of memberRows) {
    const list = byProject.get(m.projectId) ?? [];
    list.push({ id: m.id, fullName: m.fullName });
    byProject.set(m.projectId, list);
  }
  return rows.map((p) => {
    const members = byProject.get(p.id) ?? [];
    return {
      ...p,
      ownerName: ownerName.get(p.ownerId) ?? null,
      members,
      memberIds: members.map((m) => m.id),
    };
  });
}

/** Lists the projects the actor may see (all of them for a PM). */
export async function listProjects(scope: ProjectScope = null): Promise<ProjectWithTeam[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(scopeCondition(projects.id, scope))
    .orderBy(asc(projects.name));
  return withTeam(rows);
}

export async function getProject(id: string): Promise<ProjectWithTeam> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) throw notFound("Project");
  const [full] = await withTeam([row]);
  if (!full) throw notFound("Project");
  return full;
}

/** Owner and every member must be existing, active users. */
async function assertPeople(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const found = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(inArray(users.id, unique));
  if (found.length !== unique.length) throw notFound("Team member");
  if (found.some((u) => !u.isActive)) throw unprocessable("That team member is inactive");
}

/** Replaces the member rows for a project inside the caller's transaction. */
async function syncMembers(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
  memberIds: string[],
) {
  await tx.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
  const unique = [...new Set(memberIds)];
  if (unique.length > 0) {
    await tx.insert(projectMembers).values(unique.map((userId) => ({ projectId, userId })));
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** PROJ-01, PROJ-02, ... from a database sequence: concurrent creates each get a distinct number (gaps are fine). */
async function nextProjectCode(): Promise<string> {
  const res = await db.execute(sql`select nextval('project_code_seq')::int as n`);
  const n = Number((res.rows[0] as { n: number } | undefined)?.n);
  if (!Number.isInteger(n)) throw new Error("project code sequence returned no value");
  return `PROJ-${pad2(n)}`;
}

/** `creatorId` is the default owner when the input names none. */
export async function createProject(creatorId: string, input: CreateProjectInput) {
  const ownerId = input.ownerId ?? creatorId;
  await assertPeople([ownerId, ...input.memberIds]);
  const code = await nextProjectCode();
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projects)
      .values({ name: input.name, code, ownerId })
      .returning({ id: projects.id });
    if (!row) throw new Error("insert returned no row");
    await syncMembers(tx, row.id, input.memberIds);
    return row.id;
  });
  return getProject(id);
}

export async function updateProject(id: string, patch: UpdateProjectInput) {
  await assertPeople([...(patch.ownerId ? [patch.ownerId] : []), ...(patch.memberIds ?? [])]);
  const set: Partial<typeof projects.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  await db.transaction(async (tx) => {
    const [row] =
      Object.keys(set).length > 0
        ? await tx
            .update(projects)
            .set(set)
            .where(eq(projects.id, id))
            .returning({ id: projects.id })
        : await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1);
    if (!row) throw notFound("Project");
    if (patch.memberIds !== undefined) await syncMembers(tx, id, patch.memberIds);
  });
  return getProject(id);
}

/** Projects with their subprojects in two queries total (no per-project lookups). */
export async function listProjectsWithSubprojects(
  includeArchived = false,
  scope: ProjectScope = null,
) {
  const projectRows = await listProjects(scope);
  if (projectRows.length === 0) return [];
  const subs = await db
    .select({ ...getTableColumns(subprojects), leadName: users.fullName })
    .from(subprojects)
    .leftJoin(users, eq(users.id, subprojects.leadId))
    .where(
      includeArchived
        ? inArray(
            subprojects.projectId,
            projectRows.map((p) => p.id),
          )
        : and(
            inArray(
              subprojects.projectId,
              projectRows.map((p) => p.id),
            ),
            isNull(subprojects.archivedAt),
          ),
    )
    .orderBy(asc(subprojects.code));
  const byProject = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = byProject.get(s.projectId);
    if (list) list.push(s);
    else byProject.set(s.projectId, [s]);
  }
  return projectRows.map((p) => ({ ...p, subprojects: byProject.get(p.id) ?? [] }));
}

export async function deleteProject(id: string) {
  await getProject(id);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subprojects)
    .where(eq(subprojects.projectId, id));
  if (n > 0) throw conflict("Remove this project's subprojects first, or archive the project");
  const [{ m } = { m: 0 }] = await db
    .select({ m: sql<number>`count(*)::int` })
    .from(activities)
    .where(eq(activities.projectId, id));
  if (m > 0) throw conflict("This project has activities; archive it instead of deleting");
  await db.delete(projects).where(eq(projects.id, id));
}

/** Refuses when any module row still points at the subproject, so nothing is silently unlinked. */
export async function deleteSubproject(id: string) {
  const [row] = await db.select().from(subprojects).where(eq(subprojects.id, id)).limit(1);
  if (!row) throw notFound("Subproject");
  const refs = await Promise.all(
    [activities, sprints].map(async (t) => {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(t)
        .where(eq(t.subprojectId, id));
      return r?.n ?? 0;
    }),
  );
  if (refs.some((n) => n > 0))
    throw conflict("This subproject is in use by activities or other modules; archive it instead");
  await db.delete(subprojects).where(eq(subprojects.id, id));
}

async function assertProjectOpen(projectId: string) {
  const project = await getProject(projectId);
  if (project.archivedAt) throw conflict("This project is archived and read-only");
  return project;
}

// ---- subprojects
export async function listSubprojects(projectId: string, includeArchived = false) {
  return db
    .select({ ...getTableColumns(subprojects), leadName: users.fullName })
    .from(subprojects)
    .leftJoin(users, eq(users.id, subprojects.leadId))
    .where(
      includeArchived
        ? eq(subprojects.projectId, projectId)
        : and(eq(subprojects.projectId, projectId), isNull(subprojects.archivedAt)),
    )
    .orderBy(asc(subprojects.code));
}

/** The assigned team member must exist and be active; null leaves the subproject unassigned. */
async function assertLead(leadId: string | null | undefined) {
  if (!leadId) return;
  const [u] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.id, leadId))
    .limit(1);
  if (!u) throw notFound("Team member");
  if (!u.isActive) throw unprocessable("That team member is inactive");
}

export async function createSubproject(projectId: string, input: CreateSubprojectInput) {
  await assertProjectOpen(projectId);
  await assertLead(input.leadId);
  // The counter upsert row-locks per project, so parallel creates queue up and never share a number.
  return db.transaction(async (tx) => {
    const seq = await nextSeq(tx, projectId, "sub");
    const [row] = await tx
      .insert(subprojects)
      .values({
        projectId,
        code: `PRJ-${pad2(seq)}`,
        name: input.name,
        description: input.description ?? null,
        leadId: input.leadId ?? null,
        health: input.health,
        healthNote: input.healthNote ?? null,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

export async function updateSubproject(id: string, patch: UpdateSubprojectInput) {
  await assertLead(patch.leadId);
  // `code` is system-generated and never part of the patch (the schema strips it).
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
