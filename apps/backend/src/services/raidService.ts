import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type {
  CreateRaidInput,
  RaidItemDto,
  RaidMitigatingActionDto,
  RaidMitigatingActionInput,
  UpdateRaidInput,
} from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import { projects, raidItems, raidMitigatingActions, subprojects, users } from "../db/schema";
import { conflict, notFound, unprocessable } from "../errors";
import type { Actor } from "../permissions";
import { createRaidItem } from "./moduleService";

/** RAID log: Team Members submit, the PM edits, assigns owners and moves status. Codes come from nextSeq. */

const owner = alias(users, "raid_owner");
const raiser = alias(users, "raid_raiser");

type Row = {
  row: typeof raidItems.$inferSelect;
  subprojectCode: string | null;
  ownerName: string | null;
  raisedByName: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toActionDto(a: typeof raidMitigatingActions.$inferSelect): RaidMitigatingActionDto {
  return {
    id: a.id,
    description: a.description,
    isCompleted: a.isCompleted,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
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
    .select()
    .from(raidMitigatingActions)
    .where(inArray(raidMitigatingActions.raidItemId, raidItemIds))
    .orderBy(asc(raidMitigatingActions.sortOrder), asc(raidMitigatingActions.createdAt));
  for (const a of rows) {
    const list = byItem.get(a.raidItemId) ?? [];
    list.push(toActionDto(a));
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
        sortOrder: sql`excluded.sort_order`,
      },
    });
}

function toDto(r: Row, actions: RaidMitigatingActionDto[]): RaidItemDto {
  const x = r.row;
  return {
    id: x.id,
    projectId: x.projectId,
    subprojectId: x.subprojectId,
    subprojectCode: r.subprojectCode,
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
    targetDate: x.targetDate,
    closedAt: x.closedAt ? x.closedAt.toISOString() : null,
    createdAt: x.createdAt.toISOString(),
    isOverdue: x.status !== "closed" && x.targetDate !== null && x.targetDate < today(),
  };
}

function baseQuery(tx: DbOrTx) {
  return tx
    .select({
      row: raidItems,
      subprojectCode: subprojects.code,
      ownerName: owner.fullName,
      raisedByName: raiser.fullName,
    })
    .from(raidItems)
    .leftJoin(subprojects, eq(subprojects.id, raidItems.subprojectId))
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
  subprojectId?: string;
  itemType?: RaidItemDto["itemType"];
  status?: RaidItemDto["status"];
  ownerId?: string;
  openOnly?: boolean;
};

export async function listRaid(projectId: string, f: RaidFilters = {}): Promise<RaidItemDto[]> {
  const where: SQL[] = [eq(raidItems.projectId, projectId)];
  if (f.subprojectId) where.push(eq(raidItems.subprojectId, f.subprojectId));
  if (f.itemType) where.push(eq(raidItems.itemType, f.itemType));
  if (f.status) where.push(eq(raidItems.status, f.status));
  if (f.ownerId) where.push(eq(raidItems.ownerId, f.ownerId));
  if (f.openOnly) where.push(ne(raidItems.status, "closed"));
  const rows = await baseQuery(db)
    .where(and(...where))
    .orderBy(
      sql`(${raidItems.status} = 'closed')`,
      desc(sql`coalesce(${raidItems.severityScore}, ${raidItems.impact})`),
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
  const id = await db.transaction(async (tx) => {
    await assertWritable(tx, projectId);
    const row = await createRaidItem(
      {
        projectId,
        createdById: actor.id,
        subprojectId: input.subprojectId ?? null,
        itemType: input.itemType,
        description: input.description,
        impact: input.impact,
        likelihood: input.likelihood ?? null,
        ownerId: input.ownerId ?? null,
        targetDate: input.targetDate ?? null,
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
    if (patch.subprojectId !== undefined) set.subprojectId = patch.subprojectId;
    if (patch.itemType !== undefined) set.itemType = patch.itemType;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.impact !== undefined) set.impact = patch.impact;
    if (patch.likelihood !== undefined) set.likelihood = patch.likelihood;
    if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
    if (patch.targetDate !== undefined) set.targetDate = patch.targetDate;
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
    return toActionDto(row);
  });
}

export async function deleteRaid(id: string): Promise<void> {
  const [row] = await db
    .delete(raidItems)
    .where(eq(raidItems.id, id))
    .returning({ id: raidItems.id });
  if (!row) throw notFound("RAID item");
}
