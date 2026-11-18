import { and, count, eq } from "drizzle-orm";
import type {
  ActivityDto,
  ActivityEventType,
  ActivityUpdateResult,
  CreateActivityInput,
  UpdateActivityInput,
} from "@myapp/shared";
import { db, type DbOrTx, type Tx } from "../db/client";
import {
  activities,
  activityEvents,
  activityTags,
  checklistTemplates,
  projects,
  sprintScopeChanges,
  sprints,
  subprojects,
  users,
} from "../db/schema";
import { AppError, conflict, forbidden, notFound, unprocessable } from "../errors";
import { can, canEditActivityFields, type Actor } from "../permissions";
import { activityChecklist, recordOverride, waitingOnDependency } from "./governanceService";

type ActivityRow = typeof activities.$inferSelect;

export type ServiceContext = {
  actor: Actor;
  /** Injected clock; the seed uses it to write realistic history. Defaults to now. */
  now?: Date;
};

type EventDraft = {
  eventType: ActivityEventType;
  fromValue: string | null;
  toValue: string | null;
  note?: string;
};

type Governance = { removeActivityId?: string; tradeReason?: string; overrideReason?: string };

/**
 * activityService is the ONLY code path allowed to write an activity's status, blocked flag,
 * sprint or assignee. Each change writes an activity_events row in the same transaction.
 * It also enforces the Definition of Done gate and the one-in-one-out rule for active sprints.
 */

async function assertProjectWritable(
  tx: DbOrTx,
  projectId: string,
  subprojectId: string | null,
  sprintId: string | null,
) {
  const [project] = await tx
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw notFound("Project");
  if (project.archivedAt) throw conflict("This project is archived and read-only");

  if (subprojectId) {
    const [sub] = await tx
      .select({ projectId: subprojects.projectId, archivedAt: subprojects.archivedAt })
      .from(subprojects)
      .where(eq(subprojects.id, subprojectId))
      .limit(1);
    if (!sub) throw notFound("Subproject");
    if (sub.projectId !== projectId)
      throw unprocessable("That subproject belongs to a different project");
    if (sub.archivedAt) throw conflict("That subproject is archived and read-only");
  }
  if (sprintId) {
    const [sprint] = await tx
      .select({ projectId: sprints.projectId })
      .from(sprints)
      .where(eq(sprints.id, sprintId))
      .limit(1);
    if (!sprint) throw notFound("Sprint");
    if (sprint.projectId !== projectId)
      throw unprocessable("That sprint belongs to a different project");
  }
}

/** Counts in-progress work after the write, so call it inside the same transaction. */
async function wipWarning(tx: DbOrTx, assigneeId: string | null, projectId: string) {
  if (!assigneeId) return [];
  const [project] = await tx
    .select({ limit: projects.wipLimitPerPerson })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const [row] = await tx
    .select({ n: count() })
    .from(activities)
    .where(and(eq(activities.assigneeId, assigneeId), eq(activities.status, "in_progress")));
  const inProgress = row?.n ?? 0;
  if (project && inProgress > project.limit) {
    return [`Over the WIP limit: ${inProgress} in progress, limit is ${project.limit}`];
  }
  return [];
}

async function writeEvents(
  tx: DbOrTx,
  activityId: string,
  actorId: string,
  at: Date,
  events: EventDraft[],
) {
  if (events.length === 0) return;
  await tx.insert(activityEvents).values(
    events.map((e) => ({
      activityId,
      eventType: e.eventType,
      fromValue: e.fromValue,
      toValue: e.toValue,
      note: e.note ?? null,
      actorId,
      occurredAt: at,
    })),
  );
}

export async function toDto(tx: DbOrTx, id: string): Promise<ActivityDto> {
  const [row] = await tx
    .select({
      a: activities,
      subCode: subprojects.code,
      subName: subprojects.name,
      assigneeName: users.fullName,
    })
    .from(activities)
    .leftJoin(subprojects, eq(subprojects.id, activities.subprojectId))
    .leftJoin(users, eq(users.id, activities.assigneeId))
    .where(eq(activities.id, id))
    .limit(1);
  if (!row) throw notFound("Activity");
  const waiting = await waitingOnDependency(tx, [id]);
  return rowToDto(row.a, row.subCode, row.subName, row.assigneeName, waiting.has(id));
}

export function rowToDto(
  a: ActivityRow,
  subCode: string | null,
  subName: string | null,
  assigneeName: string | null,
  waiting: boolean,
): ActivityDto {
  return {
    id: a.id,
    projectId: a.projectId,
    subprojectId: a.subprojectId,
    subprojectCode: subCode,
    subprojectName: subName,
    sprintId: a.sprintId,
    releaseId: a.releaseId,
    assigneeId: a.assigneeId,
    assigneeName,
    waitingOnDependency: waiting,
    title: a.title,
    description: a.description,
    status: a.status,
    priority: a.priority,
    workType: a.workType,
    track: a.track,
    percentComplete: a.percentComplete,
    isBlocked: a.isBlocked,
    blockedReason: a.blockedReason,
    dueDate: a.dueDate,
    startedAt: a.startedAt?.toISOString() ?? null,
    completedAt: a.completedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

async function setTags(tx: DbOrTx, activityId: string, tagIds: string[]) {
  await tx.delete(activityTags).where(eq(activityTags.activityId, activityId));
  if (tagIds.length > 0) {
    await tx
      .insert(activityTags)
      .values([...new Set(tagIds)].map((tagId) => ({ activityId, tagId })));
  }
}

/**
 * Definition of Done gate. Returns the override reason to record when a PM overrides, or null when
 * every active "done" checklist item is checked. Throws dod_incomplete otherwise.
 */
async function enforceDod(
  tx: DbOrTx,
  actor: Actor,
  activityId: string | null,
  projectId: string,
  overrideReason: string | undefined,
): Promise<string | null> {
  const missing = activityId
    ? (await activityChecklist(tx, activityId)).filter((c) => !c.checked).map((c) => c.label)
    : (
        await tx
          .select({ label: checklistTemplates.label })
          .from(checklistTemplates)
          .where(
            and(
              eq(checklistTemplates.projectId, projectId),
              eq(checklistTemplates.kind, "done"),
              eq(checklistTemplates.isActive, true),
            ),
          )
      ).map((r) => r.label);
  if (missing.length === 0) return null;
  if (overrideReason) {
    if (!can(actor, "activity.edit_any"))
      throw forbidden("Only a PM can override the Definition of Done");
    return overrideReason;
  }
  throw new AppError(
    422,
    "dod_incomplete",
    "Every Definition of Done item must be checked before an activity can be done",
    { missing },
  );
}

/**
 * One in, one out: once a sprint is active, adding an activity needs a named trade (writes
 * sprint_scope_changes) or a PM override with a reason (writes gate_overrides). Adding to a
 * planning or completed sprint is unrestricted.
 */
async function enforceScopeGate(
  tx: Tx,
  ctx: ServiceContext,
  now: Date,
  args: { activityId: string; targetSprintId: string } & Governance,
) {
  const [sprint] = await tx
    .select({ status: sprints.status })
    .from(sprints)
    .where(eq(sprints.id, args.targetSprintId))
    .limit(1);
  if (!sprint) throw notFound("Sprint");
  if (sprint.status !== "active") return;

  if (args.removeActivityId) {
    if (args.removeActivityId === args.activityId) {
      throw unprocessable("An activity cannot be traded for itself");
    }
    if (!args.tradeReason) throw unprocessable("Give a reason for the trade");
    const [removed] = await tx
      .select()
      .from(activities)
      .where(eq(activities.id, args.removeActivityId))
      .for("update")
      .limit(1);
    if (!removed) throw notFound("Activity to remove");
    if (removed.sprintId !== args.targetSprintId) {
      throw unprocessable("The activity to remove is not in that sprint");
    }
    if (removed.status === "done") throw unprocessable("Pick an unfinished activity to remove");
    await tx
      .update(activities)
      .set({ sprintId: null, ...(ctx.now ? { updatedAt: now } : {}) })
      .where(eq(activities.id, removed.id));
    await writeEvents(tx, removed.id, ctx.actor.id, now, [
      {
        eventType: "sprint_changed",
        fromValue: args.targetSprintId,
        toValue: null,
        note: "Traded out of the active sprint",
      },
    ]);
    await tx.insert(sprintScopeChanges).values({
      sprintId: args.targetSprintId,
      addedActivityId: args.activityId,
      removedActivityId: removed.id,
      reason: args.tradeReason,
      requestedById: ctx.actor.id,
      approvedById: can(ctx.actor, "activity.edit_any") ? ctx.actor.id : null,
      createdAt: now,
    });
    return;
  }
  if (args.overrideReason) {
    if (!can(ctx.actor, "activity.edit_any"))
      throw forbidden("Only a PM can override the sprint scope rule");
    await recordOverride(tx, {
      gate: "scope_change",
      entityType: "activity",
      entityId: args.activityId,
      reason: args.overrideReason,
      userId: ctx.actor.id,
    });
    return;
  }
  throw new AppError(
    409,
    "scope_change_required",
    "This sprint is active. Name an activity to remove, or ask a PM to override.",
  );
}

export async function create(
  ctx: ServiceContext,
  projectId: string,
  input: CreateActivityInput,
  tx?: Tx,
): Promise<ActivityUpdateResult> {
  if (ctx.actor.role !== "pm") throw forbidden();
  const run = async (t: Tx): Promise<ActivityUpdateResult> => {
    const now = ctx.now ?? new Date();
    const subprojectId = input.subprojectId ?? null;
    const sprintId = input.sprintId ?? null;
    const assigneeId = input.assigneeId ?? null;
    await assertProjectWritable(t, projectId, subprojectId, sprintId);

    const done = input.status === "done";
    const dodOverride = done
      ? await enforceDod(t, ctx.actor, null, projectId, input.overrideReason)
      : null;
    const percent = done ? 100 : input.percentComplete;
    const [row] = await t
      .insert(activities)
      .values({
        projectId,
        subprojectId,
        sprintId,
        releaseId: input.releaseId ?? null,
        assigneeId,
        createdById: ctx.actor.id,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        workType: input.workType,
        track: input.track,
        percentComplete: percent,
        dueDate: input.dueDate ?? null,
        startedAt: input.status === "todo" ? null : now,
        completedAt: done ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: activities.id });
    if (!row) throw new Error("insert returned no row");

    if (sprintId) {
      await enforceScopeGate(t, ctx, now, {
        activityId: row.id,
        targetSprintId: sprintId,
        ...input,
      });
    }
    if (dodOverride) {
      await recordOverride(t, {
        gate: "dod",
        entityType: "activity",
        entityId: row.id,
        reason: dodOverride,
        userId: ctx.actor.id,
      });
    }

    const events: EventDraft[] = [];
    if (input.status !== "todo") {
      events.push({
        eventType: "status_changed",
        fromValue: null,
        toValue: input.status,
        note: dodOverride ? `Definition of Done overridden: ${dodOverride}` : undefined,
      });
    }
    if (sprintId) events.push({ eventType: "sprint_changed", fromValue: null, toValue: sprintId });
    if (assigneeId) events.push({ eventType: "assigned", fromValue: null, toValue: assigneeId });
    await writeEvents(t, row.id, ctx.actor.id, now, events);
    if (input.tagIds?.length) await setTags(t, row.id, input.tagIds);

    const warnings =
      input.status === "in_progress" ? await wipWarning(t, assigneeId, projectId) : [];
    return { activity: await toDto(t, row.id), warnings };
  };
  return tx ? run(tx) : db.transaction(run);
}

export async function update(
  ctx: ServiceContext,
  activityId: string,
  patch: UpdateActivityInput,
  tx?: Tx,
): Promise<ActivityUpdateResult> {
  const run = async (t: Tx): Promise<ActivityUpdateResult> => {
    const now = ctx.now ?? new Date();
    // Row lock so concurrent updates of the same activity serialize and events stay consistent.
    const [current] = await t
      .select()
      .from(activities)
      .where(eq(activities.id, activityId))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Activity");

    const changedFields = Object.keys(patch).filter(
      (k) => (patch as Record<string, unknown>)[k] !== undefined,
    );
    if (!canEditActivityFields(ctx.actor, current.assigneeId, changedFields)) {
      throw forbidden("You can only update status, progress and blockers on your own activities");
    }
    await assertProjectWritable(
      t,
      current.projectId,
      patch.subprojectId === undefined ? null : patch.subprojectId,
      patch.sprintId === undefined ? null : patch.sprintId,
    );
    // Writes to an already-archived subproject are rejected even when the subproject is unchanged.
    if (current.subprojectId && patch.subprojectId === undefined) {
      await assertProjectWritable(t, current.projectId, current.subprojectId, null);
    }

    const next = {
      subprojectId: patch.subprojectId === undefined ? current.subprojectId : patch.subprojectId,
      sprintId: patch.sprintId === undefined ? current.sprintId : patch.sprintId,
      assigneeId: patch.assigneeId === undefined ? current.assigneeId : patch.assigneeId,
      status: patch.status ?? current.status,
      percentComplete: patch.percentComplete ?? current.percentComplete,
      isBlocked: patch.isBlocked ?? current.isBlocked,
      blockedReason:
        patch.blockedReason === undefined ? current.blockedReason : patch.blockedReason,
    };

    // Business rules.
    if (next.status === "done") next.percentComplete = 100;
    if (patch.isBlocked === false) next.blockedReason = null;
    if (next.isBlocked && !(next.blockedReason && next.blockedReason.trim())) {
      throw unprocessable("A blocked activity needs a reason");
    }

    // Definition of Done gate.
    const dodOverride =
      next.status === "done" && current.status !== "done"
        ? await enforceDod(t, ctx.actor, activityId, current.projectId, patch.overrideReason)
        : null;

    // One in, one out.
    if (next.sprintId && next.sprintId !== current.sprintId) {
      await enforceScopeGate(t, ctx, now, {
        activityId,
        targetSprintId: next.sprintId,
        removeActivityId: patch.removeActivityId,
        tradeReason: patch.tradeReason,
        overrideReason: patch.overrideReason,
      });
    }

    // started_at is set once, on first leaving todo; completed_at is set on done and cleared on reopen.
    const startedAt = current.startedAt ?? (next.status !== "todo" ? now : null);
    const completedAt = next.status === "done" ? (current.completedAt ?? now) : null;

    const events: EventDraft[] = [];
    if (next.status !== current.status) {
      events.push({
        eventType: "status_changed",
        fromValue: current.status,
        toValue: next.status,
        note: dodOverride ? `Definition of Done overridden: ${dodOverride}` : undefined,
      });
    }
    if (next.isBlocked !== current.isBlocked) {
      events.push({
        eventType: next.isBlocked ? "blocked" : "unblocked",
        fromValue: null,
        toValue: null,
        note: next.isBlocked ? (next.blockedReason ?? undefined) : undefined,
      });
    }
    if (next.sprintId !== current.sprintId) {
      events.push({
        eventType: "sprint_changed",
        fromValue: current.sprintId,
        toValue: next.sprintId,
      });
    }
    if (next.assigneeId !== current.assigneeId) {
      events.push({
        eventType: "assigned",
        fromValue: current.assigneeId,
        toValue: next.assigneeId,
      });
    }

    await t
      .update(activities)
      .set({
        subprojectId: next.subprojectId,
        sprintId: next.sprintId,
        assigneeId: next.assigneeId,
        status: next.status,
        percentComplete: next.percentComplete,
        isBlocked: next.isBlocked,
        blockedReason: next.isBlocked ? next.blockedReason : null,
        startedAt,
        completedAt,
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.description === undefined ? {} : { description: patch.description }),
        ...(patch.priority === undefined ? {} : { priority: patch.priority }),
        ...(patch.workType === undefined ? {} : { workType: patch.workType }),
        ...(patch.track === undefined ? {} : { track: patch.track }),
        ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
        ...(patch.releaseId === undefined ? {} : { releaseId: patch.releaseId }),
        ...(ctx.now ? { updatedAt: now } : {}),
      })
      .where(eq(activities.id, activityId));

    if (dodOverride) {
      await recordOverride(t, {
        gate: "dod",
        entityType: "activity",
        entityId: activityId,
        reason: dodOverride,
        userId: ctx.actor.id,
      });
    }
    await writeEvents(t, activityId, ctx.actor.id, now, events);
    if (patch.tagIds) await setTags(t, activityId, patch.tagIds);

    const warnings =
      next.status === "in_progress" && current.status !== "in_progress"
        ? await wipWarning(t, next.assigneeId, current.projectId)
        : [];
    return { activity: await toDto(t, activityId), warnings };
  };
  return tx ? run(tx) : db.transaction(run);
}

export async function remove(ctx: ServiceContext, activityId: string): Promise<void> {
  if (ctx.actor.role !== "pm") throw forbidden();
  await db.transaction(async (t) => {
    const [current] = await t
      .select({ projectId: activities.projectId, subprojectId: activities.subprojectId })
      .from(activities)
      .where(eq(activities.id, activityId))
      .limit(1);
    if (!current) throw notFound("Activity");
    await assertProjectWritable(t, current.projectId, current.subprojectId, null);
    await t.delete(activities).where(eq(activities.id, activityId));
  });
}
