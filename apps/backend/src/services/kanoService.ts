import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  kanoCompletion,
  USER_ROLES,
  type CreateKanoInput,
  type KanoDto,
  type KanoSpecDto,
  type KanoSpecInput,
  type UpdateKanoInput,
} from "@myapp/shared";
import { sprintFieldsFor } from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import { kanoRequestSpecs, kanoRequests, projects, users } from "../db/schema";
import { conflict, notFound, unprocessable } from "../errors";
import type { Actor } from "../permissions";
import { createKanoRequest } from "./moduleService";
import { assertCompletionAllowed } from "./approvalGate";
import { sprintColumns } from "./sprintWrite";
import { nextSeq } from "./seq";
import { scopeCondition, type ProjectScope } from "./visibilityService";

/**
 * Kano Request Tracker. A request carries a revision-request text, a Kano category, an optional target
 * sprint/release and a checklist of revision specs; completion is derived from the specs.
 */

type Row = {
  r: typeof kanoRequests.$inferSelect;
  projectCode: string;
  projectName: string;
  responsibleName: string | null;
};

type SpecRow = { s: typeof kanoRequestSpecs.$inferSelect; responsibleName: string | null };

function toSpecDto({ s: a, responsibleName }: SpecRow): KanoSpecDto {
  return {
    id: a.id,
    label: a.label,
    isCompleted: a.isCompleted,
    completedAt: a.completedAt ? a.completedAt.toISOString() : null,
    sortOrder: a.sortOrder,
    targetDate: a.targetDate,
    ...sprintFieldsFor(a.sprintKey, a.targetDate),
    pmApproval: a.pmApproval,
    responsibleId: a.responsibleId,
    responsibleName,
  };
}

/** One batched query for a whole page of requests (no per-request lookups). */
async function loadSpecs(tx: DbOrTx, requestIds: string[]): Promise<Map<string, KanoSpecDto[]>> {
  const byRequest = new Map<string, KanoSpecDto[]>();
  if (requestIds.length === 0) return byRequest;
  const rows = await tx
    .select({ s: kanoRequestSpecs, responsibleName: users.fullName })
    .from(kanoRequestSpecs)
    .leftJoin(users, eq(users.id, kanoRequestSpecs.responsibleId))
    .where(inArray(kanoRequestSpecs.kanoRequestId, requestIds))
    .orderBy(asc(kanoRequestSpecs.sortOrder), asc(kanoRequestSpecs.createdAt));
  for (const a of rows) {
    const list = byRequest.get(a.s.kanoRequestId) ?? [];
    list.push(toSpecDto(a));
    byRequest.set(a.s.kanoRequestId, list);
  }
  return byRequest;
}

/**
 * Makes the stored spec checklist equal to the input: rows missing from the input are deleted, rows with an id are
 * updated, rows without one are inserted. Array order becomes sort_order. completed_at follows is_completed.
 */
async function syncSpecs(tx: DbOrTx, requestId: string, input: KanoSpecInput[]) {
  const existing = await tx
    .select()
    .from(kanoRequestSpecs)
    .where(eq(kanoRequestSpecs.kanoRequestId, requestId));
  const byId = new Map(existing.map((e) => [e.id, e]));
  const keep = new Set<string>();
  for (const a of input) {
    if (!a.id) continue;
    if (!byId.has(a.id)) throw unprocessable("Unknown spec for this request");
    if (keep.has(a.id)) throw unprocessable("Duplicate spec id");
    keep.add(a.id);
  }
  // A spec's person responsible follows the request rule; an unchanged (possibly now inactive) assignee is kept.
  for (const a of input) {
    if (a.responsibleId)
      await assertResponsible(tx, a.responsibleId, a.id ? byId.get(a.id)?.responsibleId : null);
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
    await tx.delete(kanoRequestSpecs).where(inArray(kanoRequestSpecs.id, removed));
  }
  if (input.length === 0) return;
  const now = new Date();
  await tx
    .insert(kanoRequestSpecs)
    .values(
      input.map((a, i) => {
        const done = a.isCompleted ?? false;
        return {
          id: a.id,
          kanoRequestId: requestId,
          label: a.label,
          isCompleted: done,
          completedAt: done ? (a.id && byId.get(a.id)?.completedAt) || now : null,
          sortOrder: i,
          ...sprintColumns(a),
          responsibleId: a.responsibleId ?? null,
        };
      }),
    )
    .onConflictDoUpdate({
      target: kanoRequestSpecs.id,
      set: {
        label: sql`excluded.label`,
        isCompleted: sql`excluded.is_completed`,
        completedAt: sql`excluded.completed_at`,
        sortOrder: sql`excluded.sort_order`,
        targetDate: sql`excluded.target_date`,
        sprintKey: sql`excluded.sprint_key`,
        responsibleId: sql`excluded.responsible_id`,
      },
    });
}

function toDto(x: Row, specs: KanoSpecDto[]): KanoDto {
  const r = x.r;
  return {
    id: r.id,
    projectId: r.projectId,
    code: r.code,
    projectCode: x.projectCode,
    projectName: x.projectName,
    revisionRequest: r.revisionRequest,
    specs,
    ...kanoCompletion(specs),
    kanoCategory: r.kanoCategory,
    targetDate: r.targetDate,
    responsibleId: r.responsibleId,
    responsibleName: x.responsibleName,
    createdAt: r.createdAt.toISOString(),
  };
}

const responsible = alias(users, "kano_responsible");

/** The person responsible must be an existing Team Member or PM; a new assignment must also be active. */
async function assertResponsible(
  tx: DbOrTx,
  userId: string | null | undefined,
  currentId?: string | null,
) {
  if (!userId) return;
  const [u] = await tx
    .select({ role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u || !(USER_ROLES as readonly string[]).includes(u.role)) {
    throw unprocessable("Person responsible must be a Team Member or Project Manager");
  }
  if (!u.isActive && userId !== currentId) throw unprocessable("Person responsible is not active");
}

function baseQuery(tx: DbOrTx) {
  return tx
    .select({
      r: kanoRequests,
      projectCode: projects.code,
      projectName: projects.name,
      responsibleName: responsible.fullName,
    })
    .from(kanoRequests)
    .innerJoin(projects, eq(projects.id, kanoRequests.projectId))
    .leftJoin(responsible, eq(responsible.id, kanoRequests.responsibleId));
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

export type KanoFilters = {
  kanoCategory?: KanoDto["kanoCategory"];
  unevaluated?: boolean;
  sort?: "newest" | "code";
  /** Project visibility for the "all projects" listing; null (the default) is unrestricted. */
  scope?: ProjectScope;
};

/** Lists one project's requests, or every project's when `projectId` is omitted. */
export async function listKano(
  projectId: string | undefined,
  f: KanoFilters = {},
): Promise<KanoDto[]> {
  const where: SQL[] = projectId ? [eq(kanoRequests.projectId, projectId)] : [];
  const inScope = scopeCondition(kanoRequests.projectId, f.scope ?? null);
  if (inScope) where.push(inScope);
  if (f.kanoCategory) where.push(eq(kanoRequests.kanoCategory, f.kanoCategory));
  if (f.unevaluated) where.push(sql`${kanoRequests.kanoCategory} IS NULL`);
  const order =
    f.sort === "code"
      ? [asc(projects.code), asc(kanoRequests.seq)]
      : [desc(kanoRequests.createdAt), desc(kanoRequests.seq)];
  const rows = await baseQuery(db)
    .where(and(...where))
    .orderBy(...order);
  const specs = await loadSpecs(
    db,
    rows.map((x) => x.r.id),
  );
  return rows.map((x) => toDto(x, specs.get(x.r.id) ?? []));
}

export async function getKano(id: string, tx: DbOrTx = db): Promise<KanoDto> {
  const [row] = await baseQuery(tx).where(eq(kanoRequests.id, id)).limit(1);
  if (!row) throw notFound("Request");
  const specs = await loadSpecs(tx, [row.r.id]);
  return toDto(row, specs.get(row.r.id) ?? []);
}

export async function createKano(
  actor: Actor,
  projectId: string,
  input: CreateKanoInput,
): Promise<KanoDto> {
  // The Project dropdown picks the owning project; the URL project is the default.
  const targetProjectId = input.projectId ?? projectId;
  const id = await db.transaction(async (tx) => {
    await assertWritable(tx, targetProjectId);
    await assertResponsible(tx, input.responsibleId);
    const row = await createKanoRequest(
      {
        projectId: targetProjectId,
        createdById: actor.id,
        revisionRequest: input.revisionRequest,
        targetDate: input.targetDate ?? null,
        responsibleId: input.responsibleId ?? null,
      },
      tx,
    );
    await syncSpecs(tx, row.id, input.specs ?? []);
    return row.id;
  });
  return getKano(id);
}

export async function updateKano(id: string, patch: UpdateKanoInput): Promise<KanoDto> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(kanoRequests)
      .where(eq(kanoRequests.id, id))
      .for("update")
      .limit(1);
    if (!current) throw notFound("Request");
    await assertWritable(tx, current.projectId);
    await assertResponsible(tx, patch.responsibleId, current.responsibleId);
    const { projectId: nextProjectId, specs, ...rest } = patch;
    const set: Partial<typeof kanoRequests.$inferInsert> = { ...rest };
    if (nextProjectId !== undefined && nextProjectId !== current.projectId) {
      await assertWritable(tx, nextProjectId);
      set.projectId = nextProjectId;
      set.seq = await nextSeq(tx, nextProjectId, "req");
    }
    for (const k of Object.keys(set) as Array<keyof typeof set>) {
      if (set[k] === undefined) delete set[k];
    }
    if (Object.keys(set).length > 0) {
      await tx.update(kanoRequests).set(set).where(eq(kanoRequests.id, id));
    }
    if (specs !== undefined) await syncSpecs(tx, id, specs);
  });
  return getKano(id);
}

/** Flips one spec without touching the request. completed_at is set on first completion, cleared on undo. */
export async function setKanoSpecCompleted(
  requestId: string,
  specId: string,
  isCompleted: boolean,
): Promise<KanoDto> {
  await db.transaction(async (tx) => {
    const [req] = await tx
      .select({ projectId: kanoRequests.projectId })
      .from(kanoRequests)
      .where(eq(kanoRequests.id, requestId))
      .limit(1);
    if (!req) throw notFound("Request");
    await assertWritable(tx, req.projectId);
    const [cur] = await tx
      .select({ pmApproval: kanoRequestSpecs.pmApproval, isCompleted: kanoRequestSpecs.isCompleted })
      .from(kanoRequestSpecs)
      .where(and(eq(kanoRequestSpecs.id, specId), eq(kanoRequestSpecs.kanoRequestId, requestId)))
      .limit(1);
    if (!cur) throw notFound("Spec");
    assertCompletionAllowed(cur.pmApproval, {
      wasCompleted: cur.isCompleted,
      willComplete: isCompleted,
    });
    const [row] = await tx
      .update(kanoRequestSpecs)
      .set({
        isCompleted,
        completedAt: isCompleted ? sql`coalesce(${kanoRequestSpecs.completedAt}, now())` : null,
      })
      .where(and(eq(kanoRequestSpecs.id, specId), eq(kanoRequestSpecs.kanoRequestId, requestId)))
      .returning({ id: kanoRequestSpecs.id });
    if (!row) throw notFound("Spec");
  });
  return getKano(requestId);
}

export async function deleteKano(id: string): Promise<void> {
  const [row] = await db
    .delete(kanoRequests)
    .where(eq(kanoRequests.id, id))
    .returning({ id: kanoRequests.id });
  if (!row) throw notFound("Request");
}
