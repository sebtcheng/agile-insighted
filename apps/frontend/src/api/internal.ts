import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Helpers shared by the feature hook files. Not re-exported from hooks.ts. */

/** Anything that changes activities refreshes every view that shows them. */
export function useInvalidateActivities() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        "home",
        "activities",
        "activity",
        "workload",
        "workload-items",
        "capacity",
        "scope-changes",
        "project-work-items",
        "portfolio",
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

export function useAdminMutation<V, R = unknown>(fn: (v: V) => Promise<R>, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
}
