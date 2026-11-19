import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  MAX_USM_FEATURES_PER_STEP,
  type CreateUsmFeatureInput,
  type CreateUsmPersonaInput,
  type CreateUsmStepInput,
  type ReorderUsmStepsInput,
  type UpdateUsmFeatureInput,
  type UpdateUsmPersonaInput,
  type UpdateUsmStepInput,
  type UsmFeatureDto,
  type UsmPersonaDto,
  type UsmStepDto,
} from "@myapp/shared";
import { db, type DbOrTx } from "../db/client";
import { projects, usmPersonas, usmStepFeatures, usmSteps, users } from "../db/schema";
import { conflict, notFound, unprocessable } from "../errors";
import type { Actor } from "../permissions";
import { assertResponsibleUsers } from "./storyActionStepService";

/**
 * User Story Mapping v2: Project -> persona -> ordered steps -> feature checklist.
 * Steps and features keep a dense 0..n-1 sort_order; every reorder, insert and delete runs in one transaction.
 */

const responsible = alias(users, "usm_feature_responsible");

async function assertProjectOpen(tx: DbOrTx, projectId: string) {
  const [p] = await tx
    .select({ archivedAt: projects.archivedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p) throw notFound("Project");
  if (p.archivedAt) throw conflict("This project is archived and read-only");
}

function toPersonaDto(p: typeof usmPersonas.$inferSelect): UsmPersonaDto {
  return {
    id: p.id,
    projectId: p.projectId,
    name: p.name,
    description: p.description,
    sortOrder: p.sortOrder,
  };
}

function toFeatureDto(f: typeof usmStepFeatures.$inferSelect, name: string | null): UsmFeatureDto {
  return {
    id: f.id,
    projectId: f.projectId,
    stepId: f.stepId,
    title: f.title,
    isCompleted: f.isCompleted,
    completedAt: f.completedAt ? f.completedAt.toISOString() : null,
    responsibleId: f.responsibleId,
    responsibleName: name,
    targetDate: f.targetDate,
    sortOrder: f.sortOrder,
  };
}

/** One batched query for many steps (no N+1). */
async function featuresByStep(
  tx: DbOrTx,
  stepIds: string[],
): Promise<Map<string, UsmFeatureDto[]>> {
  const out = new Map<string, UsmFeatureDto[]>();
  if (stepIds.length === 0) return out;
  const rows = await tx
    .select({ f: usmStepFeatures, name: responsible.fullName })
    .from(usmStepFeatures)
    .leftJoin(responsible, eq(responsible.id, usmStepFeatures.responsibleId))
    .where(inArray(usmStepFeatures.stepId, stepIds))
    .orderBy(
      asc(usmStepFeatures.sortOrder),
      asc(usmStepFeatures.createdAt),
      asc(usmStepFeatures.id),
    );
  for (const { f, name } of rows) {
    const list = out.get(f.stepId) ?? [];
    list.push(toFeatureDto(f, name));
    out.set(f.stepId, list);
  }
  return out;
}

// ---------------------------------------------------------------- personas
export async function listPersonas(projectId: string): Promise<UsmPersonaDto[]> {
  const rows = await db
    .select()
    .from(usmPersonas)
    .where(eq(usmPersonas.projectId, projectId))
    .orderBy(asc(usmPersonas.sortOrder), asc(usmPersonas.createdAt), asc(usmPersonas.id));
  return rows.map(toPersonaDto);
}

export async function createPersona(
  actor: Actor,
  input: CreateUsmPersonaInput,
): Promise<UsmPersonaDto> {
  return db.transaction(async (tx) => {
    await assertProjectOpen(tx, input.projectId);
    const [last] = await tx
      .select({ m: max(usmPersonas.sortOrder) })
      .from(usmPersonas)
      .where(eq(usmPersonas.projectId, input.projectId));
    const [row] = await tx
      .insert(usmPersonas)
      .values({
        projectId: input.projectId,
        createdById: actor.id,
        name: input.name,
        description: input.description ?? null,
        sortOrder: (last?.m ?? -1) + 1,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return toPersonaDto(row);
  });
}

export async function updatePersona(id: string, patch: UpdateUsmPersonaInput) {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  const [row] = await db.update(usmPersonas).set(patch).where(eq(usmPersonas.id, id)).returning();
  if (!row) throw notFound("User");
  return toPersonaDto(row);
}

export async function deletePersona(id: string) {
  const [row] = await db
    .delete(usmPersonas)
    .where(eq(usmPersonas.id, id))
    .returning({ id: usmPersonas.id });
  if (!row) throw notFound("User");
}

// ---------------------------------------------------------------- steps
export async function listSteps(projectId: string, personaId?: string): Promise<UsmStepDto[]> {
  const steps = await db
    .select()
    .from(usmSteps)
    .where(
      and(
        eq(usmSteps.projectId, projectId),
        personaId ? eq(usmSteps.personaId, personaId) : undefined,
      ),
    )
    .orderBy(asc(usmSteps.sortOrder), asc(usmSteps.createdAt), asc(usmSteps.id));
  const features = await featuresByStep(
    db,
    steps.map((s) => s.id),
  );
  return steps.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    personaId: s.personaId,
    title: s.title,
    description: s.description,
    sortOrder: s.sortOrder,
    features: features.get(s.id) ?? [],
  }));
}

async function stepDto(tx: DbOrTx, id: string): Promise<UsmStepDto> {
  const [s] = await tx.select().from(usmSteps).where(eq(usmSteps.id, id)).limit(1);
  if (!s) throw notFound("Step");
  const features = await featuresByStep(tx, [id]);
  return {
    id: s.id,
    projectId: s.projectId,
    personaId: s.personaId,
    title: s.title,
    description: s.description,
    sortOrder: s.sortOrder,
    features: features.get(id) ?? [],
  };
}

/** Rewrites sort_order to 0..n-1 for one persona's steps, in current order. */
async function normalizeSteps(tx: DbOrTx, personaId: string) {
  await tx.execute(sql`
    UPDATE usm_steps s SET sort_order = r.rn
    FROM (
      SELECT id, (row_number() OVER (ORDER BY sort_order, created_at, id) - 1)::int AS rn
      FROM usm_steps WHERE persona_id = ${personaId}
    ) r
    WHERE s.id = r.id AND s.sort_order <> r.rn
  `);
}

async function lockPersona(tx: DbOrTx, projectId: string, personaId: string) {
  const [p] = await tx
    .select({ id: usmPersonas.id })
    .from(usmPersonas)
    .where(and(eq(usmPersonas.id, personaId), eq(usmPersonas.projectId, projectId)))
    .for("update")
    .limit(1);
  if (!p) throw notFound("User");
}

export async function createStep(actor: Actor, input: CreateUsmStepInput): Promise<UsmStepDto> {
  return db.transaction(async (tx) => {
    await assertProjectOpen(tx, input.projectId);
    // Locking the persona row serializes concurrent inserts and reorders for that user.
    await lockPersona(tx, input.projectId, input.personaId);
    const [c] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(usmSteps)
      .where(eq(usmSteps.personaId, input.personaId));
    const total = c?.n ?? 0;
    const at = Math.min(input.insertAtIndex ?? total, total);
    if (at < total) {
      await tx
        .update(usmSteps)
        .set({ sortOrder: sql`${usmSteps.sortOrder} + 1` })
        .where(and(eq(usmSteps.personaId, input.personaId), sql`${usmSteps.sortOrder} >= ${at}`));
    }
    const [row] = await tx
      .insert(usmSteps)
      .values({
        projectId: input.projectId,
        personaId: input.personaId,
        createdById: actor.id,
        title: input.title,
        description: input.description ?? null,
        sortOrder: at,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    await normalizeSteps(tx, input.personaId);
    return stepDto(tx, row.id);
  });
}

export async function updateStep(id: string, patch: UpdateUsmStepInput): Promise<UsmStepDto> {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  const [row] = await db.update(usmSteps).set(patch).where(eq(usmSteps.id, id)).returning();
  if (!row) throw notFound("Step");
  return stepDto(db, id);
}

/** Deletes the step (its features cascade) and closes the gap in sort_order. */
export async function deleteStep(id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(usmSteps).where(eq(usmSteps.id, id)).returning({
      personaId: usmSteps.personaId,
    });
    if (!row) throw notFound("Step");
    await normalizeSteps(tx, row.personaId);
  });
}

/** Atomic reorder: stepIds must be exactly this persona's steps, in the new order. */
export async function reorderSteps(input: ReorderUsmStepsInput): Promise<UsmStepDto[]> {
  await db.transaction(async (tx) => {
    await assertProjectOpen(tx, input.projectId);
    await lockPersona(tx, input.projectId, input.personaId);
    const existing = await tx
      .select({ id: usmSteps.id })
      .from(usmSteps)
      .where(and(eq(usmSteps.personaId, input.personaId), eq(usmSteps.projectId, input.projectId)));
    const have = new Set(existing.map((e) => e.id));
    const want = new Set(input.stepIds);
    if (
      want.size !== input.stepIds.length ||
      want.size !== have.size ||
      input.stepIds.some((s) => !have.has(s))
    ) {
      throw unprocessable("stepIds must list every step of this user exactly once");
    }
    const values = sql.join(
      input.stepIds.map((sid, i) => sql`(${sid}::uuid, ${i}::int)`),
      sql`, `,
    );
    await tx.execute(sql`
      UPDATE usm_steps s SET sort_order = v.ord
      FROM (VALUES ${values}) AS v(id, ord)
      WHERE s.id = v.id AND s.persona_id = ${input.personaId}
    `);
  });
  return listSteps(input.projectId, input.personaId);
}

// ---------------------------------------------------------------- features
async function featureDto(tx: DbOrTx, id: string): Promise<UsmFeatureDto> {
  const [r] = await tx
    .select({ f: usmStepFeatures, name: responsible.fullName })
    .from(usmStepFeatures)
    .leftJoin(responsible, eq(responsible.id, usmStepFeatures.responsibleId))
    .where(eq(usmStepFeatures.id, id))
    .limit(1);
  if (!r) throw notFound("Feature");
  return toFeatureDto(r.f, r.name);
}

export async function createFeature(input: CreateUsmFeatureInput): Promise<UsmFeatureDto> {
  return db.transaction(async (tx) => {
    const [step] = await tx
      .select({ id: usmSteps.id, projectId: usmSteps.projectId })
      .from(usmSteps)
      .where(eq(usmSteps.id, input.stepId))
      .limit(1);
    if (!step) throw notFound("Step");
    if (step.projectId !== input.projectId) {
      throw unprocessable("projectId does not match the step's project");
    }
    await assertProjectOpen(tx, step.projectId);
    await assertResponsibleUsers(tx, [input.responsibleId]);
    const [c] = await tx
      .select({ n: sql<number>`count(*)::int`, m: max(usmStepFeatures.sortOrder) })
      .from(usmStepFeatures)
      .where(eq(usmStepFeatures.stepId, step.id));
    if ((c?.n ?? 0) >= MAX_USM_FEATURES_PER_STEP) {
      throw unprocessable(`A step holds at most ${MAX_USM_FEATURES_PER_STEP} features`);
    }
    const done = input.isCompleted ?? false;
    const [row] = await tx
      .insert(usmStepFeatures)
      .values({
        projectId: step.projectId,
        stepId: step.id,
        title: input.title,
        isCompleted: done,
        completedAt: done ? new Date() : null,
        responsibleId: input.responsibleId ?? null,
        targetDate: input.targetDate ?? null,
        sortOrder: (c?.m ?? -1) + 1,
      })
      .returning({ id: usmStepFeatures.id });
    if (!row) throw new Error("insert returned no row");
    return featureDto(tx, row.id);
  });
}

export async function updateFeature(
  id: string,
  patch: UpdateUsmFeatureInput,
): Promise<UsmFeatureDto> {
  if (Object.keys(patch).length === 0) throw unprocessable("Nothing to change");
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(usmStepFeatures)
      .where(eq(usmStepFeatures.id, id))
      .limit(1);
    if (!cur) throw notFound("Feature");
    if (patch.responsibleId !== undefined) {
      await assertResponsibleUsers(tx, [patch.responsibleId], [cur.responsibleId]);
    }
    const { isCompleted, ...rest } = patch;
    await tx
      .update(usmStepFeatures)
      .set({
        ...rest,
        ...(isCompleted === undefined
          ? {}
          : {
              isCompleted,
              // Set on first completion, cleared on undo.
              completedAt: isCompleted ? (cur.completedAt ?? new Date()) : null,
            }),
      })
      .where(eq(usmStepFeatures.id, id));
    return featureDto(tx, id);
  });
}

export async function deleteFeature(id: string) {
  const [row] = await db
    .delete(usmStepFeatures)
    .where(eq(usmStepFeatures.id, id))
    .returning({ id: usmStepFeatures.id });
  if (!row) throw notFound("Feature");
}
