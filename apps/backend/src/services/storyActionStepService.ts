import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  USER_ROLES,
  storyCompletion,
  type StoryActionStepDto,
  type StoryActionStepInput,
} from "@myapp/shared";
import type { DbOrTx } from "../db/client";
import { storyActionSteps, users } from "../db/schema";
import { unprocessable } from "../errors";

/** Story action steps: the execution checklist of a user story, mirroring RAID mitigating actions. */

const responsible = alias(users, "story_step_responsible");

export function toStepDto(
  s: typeof storyActionSteps.$inferSelect,
  responsibleName: string | null,
): StoryActionStepDto {
  return {
    id: s.id,
    label: s.label,
    isCompleted: s.isCompleted,
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    targetDate: s.targetDate,
    responsibleId: s.responsibleId,
    responsibleName,
    sortOrder: s.sortOrder,
  };
}

export { storyCompletion };

/** One batched query for many stories, ordered sort_order, created_at, id (no N+1). */
export async function stepsByStory(
  tx: DbOrTx,
  storyIds: string[],
): Promise<Map<string, StoryActionStepDto[]>> {
  const out = new Map<string, StoryActionStepDto[]>();
  if (storyIds.length === 0) return out;
  const rows = await tx
    .select({ step: storyActionSteps, responsibleName: responsible.fullName })
    .from(storyActionSteps)
    .leftJoin(responsible, eq(responsible.id, storyActionSteps.responsibleId))
    .where(inArray(storyActionSteps.storyId, storyIds))
    .orderBy(
      asc(storyActionSteps.sortOrder),
      asc(storyActionSteps.createdAt),
      asc(storyActionSteps.id),
    );
  for (const { step, responsibleName } of rows) {
    const list = out.get(step.storyId) ?? [];
    list.push(toStepDto(step, responsibleName));
    out.set(step.storyId, list);
  }
  return out;
}

/**
 * Every id must be an existing Team Member or PM. A new assignment must also be active; `keep` lists ids already
 * assigned on this record, which stay valid after the person is deactivated.
 */
export async function assertResponsibleUsers(
  tx: DbOrTx,
  ids: ReadonlyArray<string | null | undefined>,
  keep: ReadonlyArray<string | null> = [],
): Promise<void> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (wanted.length === 0) return;
  const found = await tx
    .select({ id: users.id, role: users.role, isActive: users.isActive })
    .from(users)
    .where(inArray(users.id, wanted));
  const byId = new Map(found.map((u) => [u.id, u]));
  for (const uid of wanted) {
    const u = byId.get(uid);
    if (!u || !(USER_ROLES as readonly string[]).includes(u.role)) {
      throw unprocessable("Person responsible must be a Team Member or Project Manager");
    }
    if (!u.isActive && !keep.includes(uid)) {
      throw unprocessable("Person responsible is not active");
    }
  }
}

/**
 * Makes the stored steps equal to the input: rows missing from the input are deleted, rows with an id are
 * updated, rows without one are inserted. Array order becomes sort_order; completed_at follows is_completed.
 * Runs inside the caller's transaction.
 */
export async function syncActionSteps(
  tx: DbOrTx,
  storyId: string,
  input: StoryActionStepInput[],
): Promise<void> {
  const existing = await tx
    .select()
    .from(storyActionSteps)
    .where(eq(storyActionSteps.storyId, storyId));
  const byId = new Map(existing.map((e) => [e.id, e]));
  const keep = new Set<string>();
  for (const s of input) {
    if (!s.id) continue;
    if (!byId.has(s.id)) throw unprocessable("Unknown action step for this story");
    if (keep.has(s.id)) throw unprocessable("Duplicate action step id");
    keep.add(s.id);
  }
  await assertResponsibleUsers(
    tx,
    input.map((s) => s.responsibleId),
    existing.map((e) => e.responsibleId),
  );
  const removed = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (removed.length > 0) {
    await tx.delete(storyActionSteps).where(inArray(storyActionSteps.id, removed));
  }
  if (input.length === 0) return;
  const now = new Date();
  await tx
    .insert(storyActionSteps)
    .values(
      input.map((s, i) => {
        const done = s.isCompleted ?? false;
        return {
          id: s.id,
          storyId,
          label: s.label,
          isCompleted: done,
          completedAt: done ? (s.id && byId.get(s.id)?.completedAt) || now : null,
          targetDate: s.targetDate,
          responsibleId: s.responsibleId,
          sortOrder: i,
        };
      }),
    )
    .onConflictDoUpdate({
      target: storyActionSteps.id,
      set: {
        label: sql`excluded.label`,
        isCompleted: sql`excluded.is_completed`,
        completedAt: sql`excluded.completed_at`,
        targetDate: sql`excluded.target_date`,
        responsibleId: sql`excluded.responsible_id`,
        sortOrder: sql`excluded.sort_order`,
      },
      // A step id from another story must never be hijacked by the upsert.
      setWhere: sql`${storyActionSteps.storyId} = ${storyId}`,
    });
}

/** Flips one step. completed_at is set on first completion and cleared on undo. Null when the step is not on the story. */
export async function setStepCompleted(
  tx: DbOrTx,
  storyId: string,
  stepId: string,
  isCompleted: boolean,
): Promise<StoryActionStepDto | null> {
  const [row] = await tx
    .update(storyActionSteps)
    .set({
      isCompleted,
      completedAt: isCompleted ? sql`coalesce(${storyActionSteps.completedAt}, now())` : null,
    })
    .where(and(eq(storyActionSteps.id, stepId), eq(storyActionSteps.storyId, storyId)))
    .returning();
  if (!row) return null;
  const [who] = row.responsibleId
    ? await tx
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, row.responsibleId))
    : [];
  return toStepDto(row, who?.fullName ?? null);
}
