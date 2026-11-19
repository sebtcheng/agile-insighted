import { and, asc, eq, inArray, max } from "drizzle-orm";
import {
  DEFAULT_DOR_LABELS,
  type DorSummaryDto,
  type StoryDorItemDto,
  type SyncDorItemInput,
} from "@myapp/shared";
import type { DbOrTx } from "../db/client";
import { checklistTemplates, storyDorItems, userStories } from "../db/schema";
import { notFound } from "../errors";

const toDto = (r: typeof storyDorItems.$inferSelect): StoryDorItemDto => ({
  id: r.id,
  label: r.label,
  isCompleted: r.isCompleted,
  sortOrder: r.sortOrder,
});

export function summarize(items: Pick<StoryDorItemDto, "isCompleted">[]): DorSummaryDto {
  const readyTotal = items.length;
  const readyChecked = items.filter((i) => i.isCompleted).length;
  return {
    readyChecked,
    readyTotal,
    percent: readyTotal === 0 ? 0 : Math.round((readyChecked / readyTotal) * 100),
  };
}

/** One batched query for many stories; ordered sort_order ASC, created_at ASC (no N+1). */
export async function dorItemsByStory(
  tx: DbOrTx,
  storyIds: string[],
): Promise<Map<string, StoryDorItemDto[]>> {
  const out = new Map<string, StoryDorItemDto[]>();
  if (storyIds.length === 0) return out;
  const rows = await tx
    .select()
    .from(storyDorItems)
    .where(inArray(storyDorItems.storyId, storyIds))
    .orderBy(asc(storyDorItems.sortOrder), asc(storyDorItems.createdAt), asc(storyDorItems.id));
  for (const r of rows) {
    const list = out.get(r.storyId);
    if (list) list.push(toDto(r));
    else out.set(r.storyId, [toDto(r)]);
  }
  return out;
}

/**
 * Seeds a new story's criteria: the supplied labels, else the project's active ready templates (kept in
 * Settings as the project default), else the five built-in defaults.
 */
export async function seedDorItems(
  tx: DbOrTx,
  storyId: string,
  projectId: string,
  labels?: string[],
): Promise<void> {
  let seed = labels;
  if (!seed || seed.length === 0) {
    const templates = await tx
      .select({ label: checklistTemplates.label })
      .from(checklistTemplates)
      .where(
        and(
          eq(checklistTemplates.projectId, projectId),
          eq(checklistTemplates.kind, "ready"),
          eq(checklistTemplates.isActive, true),
        ),
      )
      .orderBy(asc(checklistTemplates.position), asc(checklistTemplates.id));
    seed = templates.map((t) => t.label);
  }
  if (seed.length === 0) seed = [...DEFAULT_DOR_LABELS];
  await tx.insert(storyDorItems).values(seed.map((label, i) => ({ storyId, label, sortOrder: i })));
}

async function storyProject(tx: DbOrTx, storyId: string): Promise<string> {
  const [s] = await tx
    .select({ projectId: userStories.projectId })
    .from(userStories)
    .where(eq(userStories.id, storyId))
    .limit(1);
  if (!s) throw notFound("Story");
  return s.projectId;
}

export async function listDorItems(tx: DbOrTx, storyId: string): Promise<StoryDorItemDto[]> {
  await storyProject(tx, storyId);
  return (await dorItemsByStory(tx, [storyId])).get(storyId) ?? [];
}

export async function addDorItem(tx: DbOrTx, storyId: string, label: string) {
  await storyProject(tx, storyId);
  const [last] = await tx
    .select({ m: max(storyDorItems.sortOrder) })
    .from(storyDorItems)
    .where(eq(storyDorItems.storyId, storyId));
  const [row] = await tx
    .insert(storyDorItems)
    .values({ storyId, label, sortOrder: (last?.m ?? -1) + 1 })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return { item: toDto(row), summary: summarize(await listDorItems(tx, storyId)) };
}

export async function patchDorItem(
  tx: DbOrTx,
  storyId: string,
  itemId: string,
  patch: { label?: string; isCompleted?: boolean; sortOrder?: number },
) {
  const [row] = await tx
    .update(storyDorItems)
    .set(patch)
    .where(and(eq(storyDorItems.id, itemId), eq(storyDorItems.storyId, storyId)))
    .returning();
  if (!row) throw notFound("Definition of Ready item");
  return { item: toDto(row), summary: summarize(await listDorItems(tx, storyId)) };
}

export async function removeDorItem(tx: DbOrTx, storyId: string, itemId: string) {
  const [row] = await tx
    .delete(storyDorItems)
    .where(and(eq(storyDorItems.id, itemId), eq(storyDorItems.storyId, storyId)))
    .returning({ id: storyDorItems.id });
  if (!row) throw notFound("Definition of Ready item");
  return { summary: summarize(await listDorItems(tx, storyId)) };
}

/**
 * Makes the story's criteria match `items` (call inside a transaction): rows with an id are edited and
 * reordered, rows without one are added, and existing rows missing from the list are deleted.
 */
export async function syncDorItems(tx: DbOrTx, storyId: string, items: SyncDorItemInput[]) {
  const existing = await dorItemsByStory(tx, [storyId]);
  const have = new Set((existing.get(storyId) ?? []).map((i) => i.id));
  const keep = new Set(items.flatMap((i) => (i.id ? [i.id] : [])));
  for (const id of keep) if (!have.has(id)) throw notFound("Definition of Ready item");
  const drop = [...have].filter((id) => !keep.has(id));
  if (drop.length > 0) {
    await tx
      .delete(storyDorItems)
      .where(and(eq(storyDorItems.storyId, storyId), inArray(storyDorItems.id, drop)));
  }
  for (const [i, it] of items.entries()) {
    if (it.id) {
      await tx
        .update(storyDorItems)
        .set({ label: it.label, isCompleted: it.isCompleted ?? false, sortOrder: i })
        .where(and(eq(storyDorItems.id, it.id), eq(storyDorItems.storyId, storyId)));
    } else {
      await tx
        .insert(storyDorItems)
        .values({ storyId, label: it.label, isCompleted: it.isCompleted ?? false, sortOrder: i });
    }
  }
}
