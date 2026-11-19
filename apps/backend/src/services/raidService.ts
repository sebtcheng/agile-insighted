import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { CreateRaidInput, RaidItemDto, UpdateRaidInput } from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import { projects, raidItems, subprojects, users } from "../db/schema";
import { conflict, notFound } from "../errors";
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

function toDto(r: Row): RaidItemDto {
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
    mitigatingAction: x.mitigatingAction,
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
  return rows.map(toDto);
}

export async function getRaid(id: string): Promise<RaidItemDto> {
  const [row] = await baseQuery(db).where(eq(raidItems.id, id)).limit(1);
  if (!row) throw notFound("RAID item");
  return toDto(row);
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
        mitigatingAction: input.mitigatingAction ?? undefined,
        ownerId: input.ownerId ?? null,
        targetDate: input.targetDate ?? null,
      },
      tx,
    );
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
    if (patch.mitigatingAction !== undefined) set.mitigatingAction = patch.mitigatingAction;
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
  });
  return getRaid(id);
}

export async function deleteRaid(id: string): Promise<void> {
  const [row] = await db
    .delete(raidItems)
    .where(eq(raidItems.id, id))
    .returning({ id: raidItems.id });
  if (!row) throw notFound("RAID item");
}
