import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  activities,
  gateOverrides,
  projectMembers,
  projects,
  sprints,
  subprojects,
  users,
} from "../db/schema";
import type { Actor } from "../permissions";
import { hashPassword } from "../services/authService";

export const TEST_PASSWORD = "Test-password-123";
let cachedHash: string | null = null;

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

/**
 * Creates an isolated project with a PM and two team members. Everything is tagged with a random
 * suffix and removed in cleanup(), so tests can share the developer database without wiping seed data.
 */
export async function createFixture() {
  const tag = randomUUID().slice(0, 8);
  cachedHash ??= await hashPassword(TEST_PASSWORD);
  const [pm, m1, m2] = await db
    .insert(users)
    .values([
      { email: `pm-${tag}@test.local`, fullName: "Test PM", role: "pm", passwordHash: cachedHash },
      {
        email: `m1-${tag}@test.local`,
        fullName: "Test Member One",
        role: "team_member",
        passwordHash: cachedHash,
      },
      {
        email: `m2-${tag}@test.local`,
        fullName: "Test Member Two",
        role: "team_member",
        passwordHash: cachedHash,
      },
    ])
    .returning();
  if (!pm || !m1 || !m2) throw new Error("fixture users missing");

  const [project, otherProject] = await db
    .insert(projects)
    .values([
      { name: `Project ${tag}`, code: `T${tag}`, ownerId: pm.id },
      { name: `Other ${tag}`, code: `O${tag}`, ownerId: pm.id },
    ])
    .returning();
  if (!project || !otherProject) throw new Error("fixture projects missing");
  // Both team members are on `project` only; `otherProject` is the project they must not see.
  await db.insert(projectMembers).values([
    { projectId: project.id, userId: m1.id },
    { projectId: project.id, userId: m2.id },
  ]);

  const [subA, subB, otherSub] = await db
    .insert(subprojects)
    .values([
      { projectId: project.id, code: "SUB-A", name: "Sub A" },
      { projectId: project.id, code: "SUB-B", name: "Sub B" },
      { projectId: otherProject.id, code: "OTH-A", name: "Other A" },
    ])
    .returning();
  if (!subA || !subB || !otherSub) throw new Error("fixture subprojects missing");

  const [sprint, otherSprint] = await db
    .insert(sprints)
    .values([
      {
        projectId: project.id,
        name: "S1",
        goal: "Goal",
        startDate: "2026-01-05",
        endDate: "2026-01-18",
      },
      {
        projectId: otherProject.id,
        name: "S1",
        goal: "Goal",
        startDate: "2026-01-05",
        endDate: "2026-01-18",
      },
    ])
    .returning();
  if (!sprint || !otherSprint) throw new Error("fixture sprints missing");

  const actor = (u: typeof pm): Actor => ({ id: u.id, role: u.role, fullName: u.fullName });

  return {
    tag,
    pm,
    m1,
    m2,
    pmActor: actor(pm),
    m1Actor: actor(m1),
    m2Actor: actor(m2),
    project,
    otherProject,
    subA,
    subB,
    otherSub,
    sprint,
    otherSprint,
    password: TEST_PASSWORD,
    async cleanup() {
      const ids = [project.id, otherProject.id];
      await db.delete(gateOverrides).where(inArray(gateOverrides.userId, [pm.id, m1.id, m2.id]));
      await db.delete(activities).where(inArray(activities.projectId, ids));
      await db.delete(projects).where(inArray(projects.id, ids));
      await db.delete(users).where(inArray(users.id, [pm.id, m1.id, m2.id]));
    },
  };
}

/** Insert an activity straight into the table, bypassing activityService (for DB-constraint tests). */
export async function rawActivity(
  projectId: string,
  createdById: string,
  overrides: Partial<typeof activities.$inferInsert> = {},
) {
  const [row] = await db
    .insert(activities)
    .values({ projectId, createdById, title: "Raw activity", ...overrides })
    .returning();
  if (!row) throw new Error("raw activity insert failed");
  return row;
}

export async function setProjectArchived(projectId: string, archived: boolean) {
  await db
    .update(projects)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(projects.id, projectId));
}
