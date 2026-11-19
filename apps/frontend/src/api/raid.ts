import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  CreateRaidInput,
  RaidItemDto,
  RaidMitigatingActionDto,
  UpdateRaidInput,
} from "@myapp/shared";
import { api } from "./client";
import { useAdminMutation } from "./internal";

// ---------------------------------------------------------------- RAID log (Phase 5)
export type RaidFilters = {
  itemType?: RaidItemDto["itemType"];
  status?: RaidItemDto["status"];
  ownerId?: string;
  openOnly?: boolean;
};
/** `projectId` "all" lists every project's items. */
export const useRaid = (projectId: string | undefined, f: RaidFilters) =>
  useQuery({
    queryKey: ["raid", projectId, f],
    enabled: !!projectId,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<{ items: RaidItemDto[] }>(
          projectId === "all" ? "/raid" : `/projects/${projectId}/raid`,
          {
            itemType: f.itemType,
            status: f.status,
            ownerId: f.ownerId,
            openOnly: f.openOnly ? "true" : undefined,
          },
        )
      ).items,
  });
export const useCreateRaid = (projectId: string) =>
  useAdminMutation(
    (v: CreateRaidInput) => api.post<RaidItemDto>(`/projects/${projectId}/raid`, v),
    ["raid"],
  );
export const useUpdateRaid = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateRaidInput }) => api.patch<RaidItemDto>(`/raid/${v.id}`, v.patch),
    ["raid"],
  );
export const useToggleMitigatingAction = () =>
  useAdminMutation(
    (v: { raidItemId: string; actionId: string; isCompleted: boolean }) =>
      api.patch<RaidMitigatingActionDto>(`/raid/${v.raidItemId}/mitigating-actions/${v.actionId}`, {
        isCompleted: v.isCompleted,
      }),
    ["raid"],
  );
export const useDeleteRaid = () =>
  useAdminMutation((id: string) => api.delete(`/raid/${id}`), ["raid"]);
