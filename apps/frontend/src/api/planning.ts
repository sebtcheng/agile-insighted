import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScopeChangeDto, SprintCapacityDto } from "@myapp/shared";
import { api } from "./client";

// ---------------------------------------------------------------- planning
export const useCapacity = (sprintId: string | undefined) =>
  useQuery({
    queryKey: ["capacity", sprintId],
    enabled: !!sprintId,
    queryFn: () => api.get<SprintCapacityDto>(`/sprints/${sprintId}/capacity`),
  });
export const useScopeChanges = (sprintId: string | undefined) =>
  useQuery({
    queryKey: ["scope-changes", sprintId],
    enabled: !!sprintId,
    queryFn: async () =>
      (await api.get<{ items: ScopeChangeDto[] }>(`/sprints/${sprintId}/scope-changes`)).items,
  });
export function useSetCapacity(sprintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (members: Array<{ userId: string; capacityItems: number }>) =>
      api.put(`/sprints/${sprintId}/capacity`, { members }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["capacity"] }),
  });
}
