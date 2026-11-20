import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkItem } from "@myapp/shared";
import { api } from "./client";
import { withWorkItemCompleted, workItemToggleRequest } from "../lib/workItemToggle";

/** Every cache that shows or is derived from work items, refreshed after any completion tick. */
export const WORK_ITEM_KEYS = [
  "home",
  "workload",
  "workload-items",
  "project-work-items",
  "portfolio",
  "ost",
  "kano",
  "raid",
  "story-map",
  "usm",
  "activities",
  "activity",
];

/**
 * Ticks or unticks one work item from Home, Workload or the project page by calling the same module endpoint the
 * module itself uses (USM feature, OST solution, Kano spec, RAID action), so persistence and completed_at follow
 * the module's own rules. Project activities use the governed update instead (see WorkItemCheck).
 * The row flips at once in the Home, Workload and project caches; a failure restores them, and success refetches
 * every affected view so counters and filters stay in step.
 */
export function useToggleWorkItem() {
  const qc = useQueryClient();
  const optimisticKeys = ["home", "workload", "project-work-items"];
  return useMutation({
    mutationFn: (v: { item: WorkItem; isCompleted: boolean }) => {
      const req = workItemToggleRequest(v.item, v.isCompleted);
      if (!req) return Promise.reject(new Error("This item has no completion state of its own"));
      return api.patch<unknown>(req.path, req.body);
    },
    onMutate: async (v) => {
      await Promise.all(optimisticKeys.map((k) => qc.cancelQueries({ queryKey: [k] })));
      const previous = optimisticKeys.flatMap((k) => qc.getQueriesData({ queryKey: [k] }));
      for (const [key, data] of previous)
        if (data) qc.setQueryData(key, withWorkItemCompleted(data, v.item, v.isCompleted));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () =>
      Promise.all(WORK_ITEM_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
}
