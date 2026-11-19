import type { WorkItem } from "@myapp/shared";
import { statusForTick } from "./ostOptimistic";

/** The existing module endpoint that ticks one work item, so a tick here runs the module's own completion rules. */
export type ToggleRequest = { path: string; body: Record<string, unknown> };

/**
 * Maps a work item to the same PATCH its own module uses when you tick it there:
 * USM feature, OST solution (validated / planned), Kano revision spec, RAID mitigating action.
 * Project activities go through the governed status update instead (Definition of Done, sprint rules).
 * Returns null when the item has no completion state of its own (a Kano request or RAID item with no steps).
 */
export function workItemToggleRequest(item: WorkItem, isCompleted: boolean): ToggleRequest | null {
  switch (item.sourceModule) {
    case "user_story":
      return { path: `/story-map/features/${item.id}`, body: { isCompleted } };
    case "ost":
      return {
        path: `/ost/solutions/${item.id}`,
        body: { validationStatus: statusForTick(isCompleted) },
      };
    case "kano":
      return item.itemKind === "step" && item.parentId
        ? { path: `/kano/${item.parentId}/specs/${item.id}`, body: { isCompleted } }
        : null;
    case "raid":
      return item.itemKind === "step" && item.parentId
        ? { path: `/raid/${item.parentId}/mitigating-actions/${item.id}`, body: { isCompleted } }
        : null;
    default:
      return null;
  }
}

/** True when the row can show a working checkbox. */
export const isCheckable = (item: WorkItem): boolean =>
  item.sourceModule === "project" ||
  item.sourceModule === "ost" ||
  item.sourceModule === "user_story"
    ? true
    : workItemToggleRequest(item, true) !== null;

/** Optimistic copy of any cached response with one work item flipped. Unrelated data is returned as is. */
export function withWorkItemCompleted<T>(
  data: T,
  target: Pick<WorkItem, "id" | "sourceModule">,
  isCompleted: boolean,
): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.id === target.id && o.sourceModule === target.sourceModule && "isCompleted" in o) {
        return {
          ...o,
          isCompleted,
          completedAt: isCompleted ? new Date().toISOString() : null,
          scheduleStatus: isCompleted ? "completed" : o.dueDate ? "ongoing_on_time" : "no_due_date",
        };
      }
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(data) as T;
}
