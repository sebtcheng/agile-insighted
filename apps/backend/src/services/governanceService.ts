import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type {
  createChecklistTemplateSchema,
  createReleaseSchema,
  updateChecklistTemplateSchema,
  updateReleaseSchema,
} from "@myapp/shared";
import { db, type DbOrTx, type Tx } from "../db/client";
import {
  activities,
  activityDependencies,
  checklistChecks,
  checklistTemplates,
  gateOverrides,
  releases,
  sprintMemberCapacity,
  sprintScopeChanges,
  sprints,
  users,
} from "../db/schema";
import { conflict, forbidden, notFound, unprocessable } from "../errors";
import { can, type Actor } from "../permissions";

// ---------------------------------------------------------------- releases
export async function listReleases(projectId: string) {
  return db
    .select()
    .from(releases)
    .where(eq(releases.projectId, projectId))
    .orderBy(asc(releases.position), asc(releases.name));
}

export async function createRelease(projectId: string, input: z.infer<typeof createReleaseSchema>) {
  return db.transaction(async (tx) => {
    if (input.isMvp) await clearMvp(tx, projectId);
    const [last] = await tx
      .select({ position: releases.position })
      .from(releases)
      .where(eq(releases.projectId, projectId))
      .orderBy(desc(releases.position))
      .limit(1);
    const [row] = await tx
      .insert(releases)
      .values({
        projectId,
        name: input.name,
        targetDate: input.targetDate ?? null,
        isMvp: input.isMvp,
        position: (last?.position ?? -1) + 1,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return row;
  });
}

async function clearMvp(tx: Tx, projectId: string, exceptId?: string) {
  await tx
    .update(releases)
    .set({ isMvp: false })
    .where(
      and(
        eq(releases.projectId, projectId),
        eq(releases.isMvp, true),
        exceptId ? ne(releases.id, exceptId) : undefined,
      ),
    );
}

export async function updateRelease(id: string, patch: z.infer<typeof updateReleaseSchema>) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(releases)
      .where(eq(releases.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Release");
    // Exactly one MVP release per project: marking a new one moves the flag.
    if (patch.isMvp === true) await clearMvp(tx, current.projectId, id);
    const [row] = await tx
      .update(releases)
      .set({
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.targetDate === undefined ? {} : { targetDate: patch.targetDate }),
        ...(patch.position === undefined ? {} : { position: patch.position }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.isMvp === undefined ? {} : { isMvp: patch.isMvp }),
      })
      .where(eq(releases.id, id))
      .returning();
    if (!row) throw notFound("Release");
    return row;
  });
}

/** Deleting a release nulls release_id on its activities (composite FK, column-list SET NULL). */
export async function deleteRelease(id: string) {
  const res = await db.delete(releases).where(eq(releases.id, id)).returning({ id: releases.id });
  if (res.length === 0) throw notFound("Release");
}

// ---------------------------------------------------------------- sprint capacity and scope changes
export async function getSprintCapacity(sprintId: string) {
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  if (!sprint) throw notFound("Sprint");
  const assigned = db
    .select({ assigneeId: activities.assigneeId, n: sql<number>`count(*)::int`.as("n") })
    .from(activities)
    .where(and(eq(activities.sprintId, sprintId), ne(activities.status, "done")))
    .groupBy(activities.assigneeId)
    .as("assigned");
  const rows = await db
    .select({
      userId: users.id,
      fullName: users.fullName,
      capacityItems: sprintMemberCapacity.capacityItems,
      assignedItems: sql<number>`coalesce(${assigned.n}, 0)`,
    })
    .from(users)
    .leftJoin(
      sprintMemberCapacity,
      and(eq(sprintMemberCapacity.userId, users.id), eq(sprintMemberCapacity.sprintId, sprintId)),
    )
    .leftJoin(assigned, eq(assigned.assigneeId, users.id))
    .where(eq(users.isActive, true))
    .orderBy(asc(users.fullName));
  const teamCapacity = sprint.capacityItems;
  return {
    sprintId,
    teamCapacityItems: teamCapacity,
    members: rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      capacityItems: r.capacityItems,
      assignedItems: Number(r.assignedItems),
      overCapacity: r.capacityItems !== null && Number(r.assignedItems) > r.capacityItems,
    })),
  };
}

export async function setSprintCapacity(
  sprintId: string,
  members: Array<{ userId: string; capacityItems: number }>,
) {
  await db.transaction(async (tx) => {
    const [sprint] = await tx
      .select({ id: sprints.id })
      .from(sprints)
      .where(eq(sprints.id, sprintId))
      .limit(1);
    if (!sprint) throw notFound("Sprint");
    await tx.delete(sprintMemberCapacity).where(eq(sprintMemberCapacity.sprintId, sprintId));
    if (members.length > 0) {
      const unique = new Map(members.map((m) => [m.userId, m.capacityItems]));
      await tx
        .insert(sprintMemberCapacity)
        .values(
          [...unique].map(([userId, capacityItems]) => ({ sprintId, userId, capacityItems })),
        );
    }
  });
  return getSprintCapacity(sprintId);
}

export async function listScopeChanges(sprintId: string) {
  return db
    .select()
    .from(sprintScopeChanges)
    .where(eq(sprintScopeChanges.sprintId, sprintId))
    .orderBy(desc(sprintScopeChanges.createdAt), desc(sprintScopeChanges.id));
}

// ---------------------------------------------------------------- gate overrides
export async function recordOverride(
  tx: DbOrTx,
  input: {
    gate: "dor" | "dod" | "validation" | "scope_change";
    entityType: "story" | "activity" | "solution";
    entityId: string;
    reason: string;
    userId: string;
  },
) {
  await tx.insert(gateOverrides).values(input);
}

export async function listOverrides(filter: { entityType?: string; entityId?: string } = {}) {
  return db
    .select()
    .from(gateOverrides)
    .where(
      and(
        filter.entityType ? eq(gateOverrides.entityType, filter.entityType) : undefined,
        filter.entityId ? eq(gateOverrides.entityId, filter.entityId) : undefined,
      ),
    )
    .orderBy(desc(gateOverrides.createdAt), desc(gateOverrides.id))
    .limit(500);
}

// ---------------------------------------------------------------- dependencies
export type DependencyRow = {
  activityId: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  subprojectCode: string | null;
  assigneeName: string | null;
};

async function loadPair(tx: DbOrTx, blockedId: string, blockingId: string) {
  const rows = await tx
    .select({
      id: activities.id,
      projectId: activities.projectId,
      assigneeId: activities.assigneeId,
    })
    .from(activities)
    .where(inArray(activities.id, [blockedId, blockingId]))
    .orderBy(asc(activities.id))
    .for("update");
  const blocked = rows.find((r) => r.id === blockedId);
  const blocking = rows.find((r) => r.id === blockingId);
  if (!blocked || !blocking) throw notFound("Activity");
  return { blocked, blocking };
}

function mayEditDependency(actor: Actor, assignees: Array<string | null>): boolean {
  return can(actor, "activity.edit_any") || assignees.includes(actor.id);
}

export async function listDependencies(activityId: string) {
  const [exists] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);
  if (!exists) throw notFound("Activity");
  const base = (idCol: AnyPgColumn, whereCol: AnyPgColumn) =>
    db
      .select({
        activityId: activities.id,
        title: activities.title,
        status: activities.status,
        subprojectCode: sql<
          string | null
        >`(SELECT code FROM subprojects s WHERE s.id = ${activities.subprojectId})`,
        assigneeName: sql<
          string | null
        >`(SELECT full_name FROM users u WHERE u.id = ${activities.assigneeId})`,
      })
      .from(activityDependencies)
      .innerJoin(activities, eq(activities.id, idCol))
      .where(eq(whereCol, activityId))
      .orderBy(asc(activities.title));
  const [waitingOn, blocks] = await Promise.all([
    base(activityDependencies.blockingActivityId, activityDependencies.blockedActivityId),
    base(activityDependencies.blockedActivityId, activityDependencies.blockingActivityId),
  ]);
  return { waitingOn: waitingOn as DependencyRow[], blocks: blocks as DependencyRow[] };
}

/** "blocked waits on blocking". Rejects self-dependency and cycles by walking the graph in the same transaction. */
export async function addDependency(actor: Actor, blockedId: string, blockingId: string) {
  if (blockedId === blockingId) throw unprocessable("An activity cannot depend on itself");
  await db.transaction(async (tx) => {
    const { blocked, blocking } = await loadPair(tx, blockedId, blockingId);
    if (!mayEditDependency(actor, [blocked.assigneeId, blocking.assigneeId])) {
      throw forbidden("You can only change dependencies on activities assigned to you");
    }
    if (blocked.projectId !== blocking.projectId) {
      throw unprocessable("Dependencies must be between activities in the same project");
    }
    // Is `blocked` already (transitively) a prerequisite of `blocking`? Then this edge would close a loop.
    const cycle = await tx.execute(sql`
      WITH RECURSIVE chain(id) AS (
        SELECT blocking_activity_id FROM activity_dependencies WHERE blocked_activity_id = ${blockingId}
        UNION
        SELECT d.blocking_activity_id FROM activity_dependencies d JOIN chain c ON d.blocked_activity_id = c.id
      )
      SELECT 1 AS found FROM chain WHERE id = ${blockedId} LIMIT 1`);
    if (cycle.rows.length > 0) throw unprocessable("That dependency would create a cycle");
    await tx
      .insert(activityDependencies)
      .values({ blockedActivityId: blockedId, blockingActivityId: blockingId })
      .onConflictDoNothing();
  });
}

export async function removeDependency(actor: Actor, blockedId: string, blockingId: string) {
  await db.transaction(async (tx) => {
    const { blocked, blocking } = await loadPair(tx, blockedId, blockingId);
    if (!mayEditDependency(actor, [blocked.assigneeId, blocking.assigneeId])) {
      throw forbidden("You can only change dependencies on activities assigned to you");
    }
    await tx
      .delete(activityDependencies)
      .where(
        and(
          eq(activityDependencies.blockedActivityId, blockedId),
          eq(activityDependencies.blockingActivityId, blockingId),
        ),
      );
  });
}

/** Ids (from the given list) that wait on at least one unfinished blocking activity. Derived, never stored. */
export async function waitingOnDependency(tx: DbOrTx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx
    .select({ id: activityDependencies.blockedActivityId })
    .from(activityDependencies)
    .innerJoin(activities, eq(activities.id, activityDependencies.blockingActivityId))
    .where(and(inArray(activityDependencies.blockedActivityId, ids), ne(activities.status, "done")))
    .groupBy(activityDependencies.blockedActivityId);
  return new Set(rows.map((r) => r.id));
}

// ---------------------------------------------------------------- checklists
export async function listTemplates(projectId: string) {
  return db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.projectId, projectId))
    .orderBy(
      asc(checklistTemplates.kind),
      asc(checklistTemplates.position),
      asc(checklistTemplates.id),
    );
}

export async function createTemplate(
  projectId: string,
  input: z.infer<typeof createChecklistTemplateSchema>,
) {
  const [last] = await db
    .select({ position: checklistTemplates.position })
    .from(checklistTemplates)
    .where(
      and(eq(checklistTemplates.projectId, projectId), eq(checklistTemplates.kind, input.kind)),
    )
    .orderBy(desc(checklistTemplates.position))
    .limit(1);
  const [row] = await db
    .insert(checklistTemplates)
    .values({
      projectId,
      kind: input.kind,
      label: input.label,
      position: (last?.position ?? -1) + 1,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return row;
}

export async function updateTemplate(
  id: string,
  patch: z.infer<typeof updateChecklistTemplateSchema>,
) {
  const set: Partial<typeof checklistTemplates.$inferInsert> = {};
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.position !== undefined) set.position = patch.position;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const [row] =
    Object.keys(set).length > 0
      ? await db
          .update(checklistTemplates)
          .set(set)
          .where(eq(checklistTemplates.id, id))
          .returning()
      : await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id)).limit(1);
  if (!row) throw notFound("Checklist item");
  return row;
}

/** Active Definition-of-Done items for an activity's project, with whether each is checked. */
export async function activityChecklist(tx: DbOrTx, activityId: string) {
  const [act] = await tx
    .select({ projectId: activities.projectId })
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);
  if (!act) throw notFound("Activity");
  const rows = await tx
    .select({
      templateId: checklistTemplates.id,
      label: checklistTemplates.label,
      position: checklistTemplates.position,
      checkedAt: checklistChecks.checkedAt,
      checkedById: checklistChecks.checkedById,
    })
    .from(checklistTemplates)
    .leftJoin(
      checklistChecks,
      and(
        eq(checklistChecks.templateId, checklistTemplates.id),
        eq(checklistChecks.activityId, activityId),
      ),
    )
    .where(
      and(
        eq(checklistTemplates.projectId, act.projectId),
        eq(checklistTemplates.kind, "done"),
        eq(checklistTemplates.isActive, true),
      ),
    )
    .orderBy(asc(checklistTemplates.position), asc(checklistTemplates.id));
  return rows.map((r) => ({ ...r, checked: r.checkedAt !== null }));
}

/** Active Definition-of-Done templates for a project, in display order. */
export async function getActivityChecklistTemplates(projectId: string) {
  return db
    .select()
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.projectId, projectId),
        eq(checklistTemplates.kind, "done"),
        eq(checklistTemplates.isActive, true),
      ),
    )
    .orderBy(asc(checklistTemplates.position), asc(checklistTemplates.id));
}

export const getActivityChecklist = (activityId: string) => activityChecklist(db, activityId);

/** Team members tick items only on their own activities; a PM can tick on any. */
export async function setChecklistCheck(
  actor: Actor,
  activityId: string,
  templateId: string,
  checked: boolean,
) {
  await db.transaction(async (tx) => {
    const [act] = await tx
      .select({ assigneeId: activities.assigneeId, projectId: activities.projectId })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);
    if (!act) throw notFound("Activity");
    if (!can(actor, "activity.edit_any") && act.assigneeId !== actor.id) {
      throw forbidden("You can only tick checklist items on your own activities");
    }
    const [tpl] = await tx
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.id, templateId))
      .limit(1);
    if (!tpl || tpl.projectId !== act.projectId || tpl.kind !== "done")
      throw notFound("Checklist item");
    if (!tpl.isActive) throw conflict("That checklist item is no longer active");
    if (checked) {
      await tx
        .insert(checklistChecks)
        .values({ templateId, activityId, checkedById: actor.id })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(checklistChecks)
        .where(
          and(
            eq(checklistChecks.templateId, templateId),
            eq(checklistChecks.activityId, activityId),
          ),
        );
    }
  });
  return activityChecklist(db, activityId);
}
