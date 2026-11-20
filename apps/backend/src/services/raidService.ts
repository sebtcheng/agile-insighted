import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  CreateRaidInput,
  RaidItemDto,
  RaidMitigatingActionDto,
  RaidMitigatingActionInput,
  UpdateRaidInput,
} from "@myapp/shared";
import { sprintFieldsFor } from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import { projects, raidItems, raidMitigatingActions, users } from "../db/schema";
import { conflict, notFound, unprocessable } from "../errors";
import type { Actor } from "../permissions";
import { createRaidItem } from "./moduleService";
import { assertCompletionAllowed } from "./approvalGate";
import { sprintColumns } from "./sprintWrite";
import { nextSeq } from "./seq";
import { scopeCondition, type ProjectScope } from "./visibilityService";

/** RAID log: Team Members submit, the PM edits, assigns owners and moves status. Codes come from nextSeq. */

const owner = alias(users, "raid_owner");
const raiser = alias(users, "raid_raiser");

type Row = {
  row: typeof raidItems.$inferSelect;
  projectCode: string;
  projectName: string;
  ownerName: string | null;
  raisedByName: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const responsible = alias(users, "raid_action_responsible");

function toActionDto(
  a: typeof raidMitigatingActions.$inferSelect,
  responsibleName: string | null,
): RaidMitigatingActionDto {
  return {
    id: a.id,
    description: a.description,
    isCompleted: a.isCompleted,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    targetDate: a.targetDate,
    ...sprintFieldsFor(a.sprintKey, a.targetDate),
    pmApproval: a.pmApproval,
    responsibleId: a.responsibleId,
    responsibleName,
    sortOrder: a.sortOrder,
  };
}

/** One batched query for the whole page of items (no per-item lookups). */
async function loadActions(
  tx: DbOrTx,
  raidItemIds: string[],
): Promise<Map<string, RaidMitigatingActionDto[]>> {
  const byItem = new Map<string, RaidMitigatingActionDto[]>();
  if (raidItemIds.length === 0) return byItem;
  const rows = await tx
    .select({ action: raidMitigatingActions, responsibleName: responsible.fullName })
    .from(raidMitigatingActions)
    .leftJoin(responsible, eq(responsible.id, raidMitigatingActions.responsibleId))
    .where(inArray(raidMitigatingActions.raidItemId, raidItemIds))
    .orderBy(asc(raidMitigatingActions.sortOrder), asc(raidMitigatingActions.createdAt));
  for (const { action: a, responsibleName } of rows) {
    const list = byItem.get(a.raidItemId) ?? [];
    list.push(toActionDto(a, responsibleName));
    byItem.set(a.raidItemId, list);
  }
  return byItem;
}

/**
 * Makes the stored checklist equal to the input: rows missing from the input are deleted, rows with an id are
 * updated, rows without one are inserted. Array order becomes sort_order. completed_at follows is_completed.
 * Runs inside the transaction of the caller.
 */
async function syncActions(tx: DbOrTx, raidItemId: string, input: RaidMitigatingActionInput[]) {
  const existing = await tx
    .select()
    .from(raidMitigatingActions)
    .where(eq(raidMitigatingActions.raidItemId, raidItemId));
  const byId = new Map(existing.map((e) => [e.id, e]));
  const keep = new Set<string>();
  for (const a of input) {
    if (!a.id) continue;
    if (!byId.has(a.id)) throw unprocessable("Unknown mitigating action for this RAID item");
    if (keep.has(a.id)) throw unprocessable("Duplicate mitigating action id");
    keep.add(a.id);
  }
  const responsibleIds = [...new Set(input.map((a) => a.responsibleId))];
  if (responsibleIds.length > 0) {
    const found = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, responsibleIds));
    if (found.length !== responsibleIds.length) {
      throw unprocessable("Unknown staff member responsible for a mitigating action");
    }
  }
  for (const a of input) {
    const prev = a.id ? byId.get(a.id) : undefined;
    assertCompletionAllowed(prev?.pmApproval ?? "PENDING", {
      wasCompleted: prev?.isCompleted ?? false,
      willComplete: a.isCompleted ?? false,
    });
  }
  const removed = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (removed.length > 0) {
    await tx.delete(raidMitigatingActions).where(inArray(raidMitigatingActions.id, removed));
  }
  if (input.length === 0) return;
  const now = new Date();
  await tx
    .insert(raidMitigatingActions)
    .values(
      input.map((a, i) => {
        const done = a.isCompleted ?? false;
        return {
          id: a.id,
          raidItemId,
          description: a.description,
          isCompleted: done,
          completedAt: done ? (a.id && byId.get(a.id)?.completedAt) || now : null,
          ...sprintColumns(a),
          responsibleId: a.responsibleId,
          sortOrder: i,
        };
      }),
    )
    .onConflictDoUpdate({
      target: raidMitigatingActions.id,
      set: {
        description: sql`excluded.description`,
        isCompleted: sql`excluded.is_completed`,
        completedAt: sql`excluded.completed_at`,
        targetDate: sql`excluded.target_date`,
        sprintKey: sql`excluded.sprint_key`,
        responsibleId: sql`excluded.responsible_id`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
}

function toDto(r: Row, actions: RaidMitigatingActionDto[]): RaidItemDto {
  const x = r.row;
  return {
    id: x.id,
    projectId: x.projectId,
    projectCode: r.projectCode,
    projectName: r.projectName,
    code: x.code,
    itemType: x.itemType,
    description: x.description,
    impact: x.impact,
    likelihood: x.likelihood,
    severityScore: x.severityScore,
    mitigatingActions: actions,
    ownerId: x.ownerId,
    ownerName: r.ownerName,
    raisedById: x.raisedById,
    raisedByName: r.raisedByName,
    status: x.status,
    closedAt: x.closedAt ? x.closedAt.toISOString() : null,
    createdAt: x.createdAt.toISOString(),
    isOverdue:
      x.status !== "closed" &&
      actions.some((a) => !a.isCompleted && a.targetDate !== null && a.targetDate < today()),
  };
}

function baseQuery(tx: DbOrTx) {
  return tx
    .select({
      row: raidItems,
      projectCode: projects.code,
      projectName: projects.name,
      ownerName: owner.fullName,
      raisedByName: raiser.fullName,
    })
    .from(raidItems)
    .innerJoin(projects, eq(projects.id, raidItems.projectId))
    .leftJoin(owner, eq(owner.id, raidItems.ownerId))
    .innerJoin(raiser, eq(raiser.id, raidItems.raisedById));
}

async function assertWritable(tx: DbOrTx, projectId: string) {
  const [p] = await tx
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) throw notFound("Project");
  if (p.archivedAt) throw conflict("This project is archived and read-only");
}

export type RaidFilters = {
  itemType?: RaidItemDto["itemType"];
  status?: RaidItemDto["status"];
  ownerId?: string;
  openOnly?: boolean;
  /** Project visibility for the "all projects" listing; null (the default) is unrestricted. */
  scope?: ProjectScope;
};

/** Lists one project's items, or every project's when `projectId` is omitted. */
export async function listRaid(
  projectId: string | undefined,
  f: RaidFilters = {},
): Promise<RaidItemDto[]> {
  const where: SQL[] = projectId ? [eq(raidItems.projectId, projectId)] : [];
  const inScope = scopeCondition(raidItems.projectId, f.scope ?? null);
  if (inScope) where.push(inScope);
  if (f.itemType) where.push(eq(raidItems.itemType, f.itemType));
  if (f.status) where.push(eq(raidItems.status, f.status));
  if (f.ownerId) where.push(eq(raidItems.ownerId, f.ownerId));
  if (f.openOnly) where.push(ne(raidItems.status, "closed"));
  const rows = await baseQuery(db)
    .where(and(...where))
    .orderBy(
      sql`(${raidItems.status} = 'closed')`,
      desc(sql`coalesce(${raidItems.severityScore}, ${raidItems.impact})`),
      asc(projects.code),
      asc(raidItems.seq),
    );
  const actions = await loadActions(
    db,
    rows.map((r) => r.row.id),
  );
  return rows.map((r) => toDto(r, actions.get(r.row.id) ?? []));
}

export async function getRaid(id: string): Promise<RaidItemDto> {
  const [row] = await baseQuery(db).where(eq(raidItems.id, id)).limit(1);
  if (!row) throw notFound("RAID item");
  const actions = await loadActions(db, [row.row.id]);
  return toDto(row, actions.get(row.row.id) ?? []);
}

export async function createRaid(
  actor: Actor,
  projectId: string,
  input: CreateRaidInput,
): Promise<RaidItemDto> {
  // The Project dropdown picks the owning project; the URL project is the default.
  const targetProjectId = input.projectId ?? projectId;
  const id = await db.transaction(async (tx) => {
    await assertWritable(tx, targetProjectId);
    const row = await createRaidItem(
      {
        projectId: targetProjectId,
        createdById: actor.id,
        itemType: input.itemType,
        description: input.description,
        impact: input.impact,
        likelihood: input.likelihood ?? null,
        ownerId: input.ownerId ?? null,
      },
      tx,
    );
    await syncActions(tx, row.id, input.mitigatingActions ?? []);
    return row.id;
  });
  return getRaid(id);
}

export async function updateRaid(id: string, patch: UpdateRaidInput): Promise<RaidItemDto> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(raidItems)
      .where(eq(raidItems.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("RAID item");
    await assertWritable(tx, current.projectId);
    const set: Partial<typeof raidItems.$inferInsert> = {};
    if (patch.projectId !== undefined && patch.projectId !== current.projectId) {
      await assertWritable(tx, patch.projectId);
      set.projectId = patch.projectId;
      set.seq = await nextSeq(tx, patch.projectId, "raid");
    }
    if (patch.itemType !== undefined) set.itemType = patch.itemType;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.impact !== undefined) set.impact = patch.impact;
    if (patch.likelihood !== undefined) set.likelihood = patch.likelihood;
    if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
    if (patch.status !== undefined && patch.status !== current.status) {
      set.status = patch.status;
      // closed_at follows the status: set on close, cleared on reopen.
      set.closedAt = patch.status === "closed" ? new Date() : null;
    }
    if (Object.keys(set).length > 0) {
      await tx.update(raidItems).set(set).where(eq(raidItems.id, id));
    }
    if (patch.mitigatingActions !== undefined) {
      await syncActions(tx, id, patch.mitigatingActions);
    }
  });
  return getRaid(id);
}

/** Flips one checklist entry without touching the parent item. completed_at is set on first completion, cleared on undo. */
export async function setMitigatingActionCompleted(
  raidItemId: string,
  actionId: string,
  isCompleted: boolean,
): Promise<RaidMitigatingActionDto> {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({ projectId: raidItems.projectId })
      .from(raidItems)
      .where(eq(raidItems.id, raidItemId))
      .limit(1);
    if (!item) throw notFound("RAID item");
    await assertWritable(tx, item.projectId);
    const [cur] = await tx
      .select({
        pmApproval: raidMitigatingActions.pmApproval,
        isCompleted: raidMitigatingActions.isCompleted,
      })
      .from(raidMitigatingActions)
      .where(
        and(
          eq(raidMitigatingActions.id, actionId),
          eq(raidMitigatingActions.raidItemId, raidItemId),
        ),
      )
      .limit(1);
    if (!cur) throw notFound("Mitigating action");
    assertCompletionAllowed(cur.pmApproval, {
      wasCompleted: cur.isCompleted,
      willComplete: isCompleted,
    });
    const [row] = await tx
      .update(raidMitigatingActions)
      .set({
        isCompleted,
        completedAt: isCompleted
          ? sql`coalesce(${raidMitigatingActions.completedAt}, now())`
          : null,
      })
      .where(
        and(
          eq(raidMitigatingActions.id, actionId),
          eq(raidMitigatingActions.raidItemId, raidItemId),
        ),
      )
      .returning();
    if (!row) throw notFound("Mitigating action");
    const [who] = row.responsibleId
      ? await tx
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, row.responsibleId))
      : [];
    return toActionDto(row, who?.fullName ?? null);
  });
}

export async function deleteRaid(id: string): Promise<void> {
  const [row] = await db
    .delete(raidItems)
    .where(eq(raidItems.id, id))
    .returning({ id: raidItems.id });
  if (!row) throw notFound("RAID item");
}
