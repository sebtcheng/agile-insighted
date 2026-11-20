import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminLogItemPatch,
  AdminLogResponse,
  PmApproval,
  WorkItem,
  WorkSourceModule,
} from "@myapp/shared";
import { api } from "./client";
import { WORK_ITEM_KEYS } from "./workItems";

export const useAdminLog = () =>
  useQuery({
    queryKey: ["admin-log"],
    queryFn: () => api.get<AdminLogResponse>("/admin-log"),
  });

/** Every view that shows tasks is refreshed after a PM edit or approval. */
function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [...WORK_ITEM_KEYS, "admin-log"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

export const useUpdateAdminLogItem = () => {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (v: { item: Pick<WorkItem, "id" | "sourceModule">; patch: AdminLogItemPatch }) =>
      api.patch<WorkItem>(`/admin-log/items/${v.item.sourceModule}/${v.item.id}`, v.patch),
    onSettled: refresh,
  });
};

export const useSetApproval = () => {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (v: {
      item: { id: string; sourceModule: WorkSourceModule };
      pmApproval: PmApproval;
    }) =>
      api.patch<WorkItem>(`/admin-log/items/${v.item.sourceModule}/${v.item.id}/approval`, {
        pmApproval: v.pmApproval,
      }),
    onSettled: refresh,
  });
};
