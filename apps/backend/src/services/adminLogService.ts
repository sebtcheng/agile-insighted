import { eq, sql } from "drizzle-orm";
import {
  isPmApproved,
  type AdminLogItemPatch,
  type AdminLogProjectGroup,
  type AdminLogResponse,
  type WorkItem,
  type WorkSourceModule,
} from "@myapp/shared";
import { db, type Tx } from "../db/client";
import {
  activities,
  kanoRequestSpecs,
  ostSolutions,
  projects,
  raidMitigatingActions,
  usmStepFeatures,
} from "../db/schema";
import { notFound, unprocessable } from "../errors";
import type { Actor } from "../permissions";
import * as activityService from "./activityService";
import { approvalRequired } from "./approvalGate";
import { sprintColumnsOrUndefined } from "./sprintWrite";
import { assertResponsibleUsers } from "./storyActionStepService";
import { loadWorkItems } from "./workItemService";

/** A Kano request or RAID item with no steps has no approval state, so it is not a task of its own. */
const hasApprovalState = (i: WorkItem) =>
  i.sourceModule === "project" ||
  i.sourceModule === "ost" ||
  i.sourceModule === "user_story" ||
  i.itemKind === "step";

/** Every task across all projects, grouped by project (PM only; the route guards the role). */
export async function listAdminLog(now: Date = new Date()): Promise<AdminLogResponse> {
  const loaded = await loadWorkItems({}, null, now);
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, code: projects.code })
    .from(projects);
  const meta = new Map(projectRows.map((p) => [p.id, p]));
  const groups = new Map<string, AdminLogProjectGroup>();
  for (const item of loaded.items.filter(hasApprovalState)) {
    const p = meta.get(item.projectId);
    const g = groups.get(item.projectId) ?? {
      projectId: item.projectId,
      projectName: p?.name ?? loaded.projectNames.get(item.projectId) ?? "Project",
      projectCode: p?.code ?? null,
      total: 0,
      approved: 0,
      pending: 0,
      items: [],
    };
    g.items.push(item);
    g.total += 1;
    if (isPmApproved(item.pmApproval)) g.approved += 1;
    else g.pending += 1;
    groups.set(item.projectId, g);
  }
  const sorted = [...groups.values()].sort((a, b) => a.projectName.localeCompare(b.projectName));
  for (const g of sorted) {
    g.items.sort(
      (a, b) =>
        Number(a.isCompleted) - Number(b.isCompleted) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
  }
  return { projects: sorted, today: loaded.today };
}

/** Completion needs approval: the stored one, or the one this same request sets. */
function guardCompletion(current: string, patch: AdminLogItemPatch, wasCompleted: boolean): void {
  if (patch.isCompleted !== true || wasCompleted) return;
  if (!isPmApproved(patch.pmApproval ?? current)) throw approvalRequired();
}

async function updateOne(
  tx: Tx,
  actor: Actor,
  module: WorkSourceModule,
  id: string,
  patch: AdminLogItemPatch,
): Promise<void> {
  const sprint = sprintColumnsOrUndefined({
    sprintKey: patch.sprintKey,
    targetDate: patch.targetDate,
  });
  if (patch.assigneeId) await assertResponsibleUsers(tx, [patch.assigneeId]);
  const done = patch.isCompleted;

  if (module === "project") {
    const [cur] = await tx.select().from(activities).where(eq(activities.id, id)).for("update");
    if (!cur) throw notFound("Task");
    guardCompletion(cur.pmApproval, patch, cur.status === "done");
    await tx
      .update(activities)
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.assigneeId === undefined ? {} : { assigneeId: patch.assigneeId }),
        ...(sprint ? { dueDate: sprint.targetDate } : {}),
        ...(patch.pmApproval === undefined ? {} : { pmApproval: patch.pmApproval }),
      })
      .where(eq(activities.id, id));
    if (done !== undefined && done !== (cur.status === "done")) {
      // Goes through the governed update so Definition of Done and the activity history still apply.
      await activityService.update({ actor }, id, { status: done ? "done" : "in_progress" }, tx);
    }
    return;
  }

  if (module === "user_story") {
    const [cur] = await tx
      .select()
      .from(usmStepFeatures)
      .where(eq(usmStepFeatures.id, id))
      .for("update");
    if (!cur) throw notFound("Task");
    guardCompletion(cur.pmApproval, patch, cur.isCompleted);
    await tx
      .update(usmStepFeatures)
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.assigneeId === undefined ? {} : { responsibleId: patch.assigneeId }),
        ...(sprint ?? {}),
        ...(patch.pmApproval === undefined ? {} : { pmApproval: patch.pmApproval }),
        ...(done === undefined
          ? {}
          : { isCompleted: done, completedAt: done ? (cur.completedAt ?? new Date()) : null }),
      })
      .where(eq(usmStepFeatures.id, id));
    return;
  }

  if (module === "ost") {
    const [cur] = await tx.select().from(ostSolutions).where(eq(ostSolutions.id, id)).for("update");
    if (!cur) throw notFound("Task");
    guardCompletion(cur.pmApproval, patch, cur.validationStatus === "validated");
    await tx
      .update(ostSolutions)
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.assigneeId === undefined ? {} : { ownerId: patch.assigneeId }),
        ...(sprint ?? {}),
        ...(patch.pmApproval === undefined ? {} : { pmApproval: patch.pmApproval }),
        ...(done === undefined
          ? {}
          : { validationStatus: done ? "validated" : ("planned" as const) }),
      })
      .where(eq(ostSolutions.id, id));
    return;
  }

  if (module === "kano") {
    const [cur] = await tx
      .select()
      .from(kanoRequestSpecs)
      .where(eq(kanoRequestSpecs.id, id))
      .for("update");
    if (!cur) throw notFound("Task");
    guardCompletion(cur.pmApproval, patch, cur.isCompleted);
    await tx
      .update(kanoRequestSpecs)
      .set({
        ...(patch.title === undefined ? {} : { label: patch.title }),
        ...(patch.assigneeId === undefined ? {} : { responsibleId: patch.assigneeId }),
        ...(sprint ?? {}),
        ...(patch.pmApproval === undefined ? {} : { pmApproval: patch.pmApproval }),
        ...(done === undefined
          ? {}
          : {
              isCompleted: done,
              completedAt: done ? sql`coalesce(${kanoRequestSpecs.completedAt}, now())` : null,
            }),
      })
      .where(eq(kanoRequestSpecs.id, id));
    return;
  }

  const [cur] = await tx
    .select()
    .from(raidMitigatingActions)
    .where(eq(raidMitigatingActions.id, id))
    .for("update");
  if (!cur) throw notFound("Task");
  guardCompletion(cur.pmApproval, patch, cur.isCompleted);
  await tx
    .update(raidMitigatingActions)
    .set({
      ...(patch.title === undefined ? {} : { description: patch.title }),
      ...(patch.assigneeId === undefined ? {} : { responsibleId: patch.assigneeId }),
      ...(sprint ?? {}),
      ...(patch.pmApproval === undefined ? {} : { pmApproval: patch.pmApproval }),
      ...(done === undefined
        ? {}
        : {
            isCompleted: done,
            completedAt: done ? sql`coalesce(${raidMitigatingActions.completedAt}, now())` : null,
          }),
    })
    .where(eq(raidMitigatingActions.id, id));
}

/**
 * PM edit of one task in its own source table, atomically. Returns the refreshed work item. A Kano request or
 * RAID item without steps has no approval state and is rejected.
 */
export async function updateAdminLogItem(
  actor: Actor,
  module: WorkSourceModule,
  id: string,
  patch: AdminLogItemPatch,
): Promise<WorkItem> {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  await db.transaction((tx) => updateOne(tx, actor, module, id, patch));
  const loaded = await loadWorkItems({}, null, new Date());
  const item = loaded.items.find((i) => i.id === id && i.sourceModule === module);
  if (!item) throw notFound("Task");
  return item;
}
