import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConvertSolutionInput,
  CreateOpportunityInput,
  CreateOutcomeInput,
  CreateSolutionInput,
  OstTreeDto,
  UpdateOpportunityInput,
  UpdateOutcomeInput,
  UpdateSolutionInput,
} from "@myapp/shared";
import { api } from "./client";
import { statusForTick, withSolutionStatus } from "../lib/ostOptimistic";
import { useAdminMutation } from "./internal";

// ---------------------------------------------------------------- Opportunity Solution Tree (Phase 8)
export const useOstTree = (projectId: string | undefined) =>
  useQuery({
    queryKey: ["ost", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<OstTreeDto>(projectId === "all" ? "/ost" : `/projects/${projectId}/ost`),
  });
export const useCreateOutcome = (projectId: string) =>
  useAdminMutation(
    (v: CreateOutcomeInput) => api.post(`/projects/${projectId}/ost/outcomes`, v),
    ["ost"],
  );
export const useUpdateOutcome = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateOutcomeInput }) => api.patch(`/ost/outcomes/${v.id}`, v.patch),
    ["ost"],
  );
export const useDeleteOutcome = () =>
  useAdminMutation((id: string) => api.delete(`/ost/outcomes/${id}`), ["ost"]);
export const useCreateOpportunity = () =>
  useAdminMutation(
    (v: { outcomeId: string; input: CreateOpportunityInput }) =>
      api.post(`/ost/outcomes/${v.outcomeId}/opportunities`, v.input),
    ["ost"],
  );
export const useUpdateOpportunity = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateOpportunityInput }) =>
      api.patch(`/ost/opportunities/${v.id}`, v.patch),
    ["ost"],
  );
export const useDeleteOpportunity = () =>
  useAdminMutation((id: string) => api.delete(`/ost/opportunities/${id}`), ["ost"]);
export const useCreateSolution = () =>
  useAdminMutation(
    (v: { opportunityId: string; input: CreateSolutionInput }) =>
      api.post(`/ost/opportunities/${v.opportunityId}/solutions`, v.input),
    ["ost"],
  );
export const useUpdateSolution = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateSolutionInput }) => api.patch(`/ost/solutions/${v.id}`, v.patch),
    ["ost"],
  );
export const useDeleteSolution = () =>
  useAdminMutation((id: string) => api.delete(`/ost/solutions/${id}`), ["ost"]);
export const useConvertSolution = () =>
  useAdminMutation(
    (v: { id: string; input: ConvertSolutionInput }) =>
      api.post<{ storyId: string; storyCode: string }>(`/ost/solutions/${v.id}/convert`, v.input),
    ["ost", "story-map", "overrides"],
  );
/**
 * Ticks or unticks a solution (validated / planned) through the solution PATCH endpoint. The tree cache is
 * updated first so the checkbox and the completion percentage move at once; a failure restores the old data.
 */
export const useToggleSolution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; checked: boolean }) =>
      api.patch(`/ost/solutions/${v.id}`, { validationStatus: statusForTick(v.checked) }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["ost"] });
      const previous = qc.getQueriesData<OstTreeDto>({ queryKey: ["ost"] });
      qc.setQueriesData<OstTreeDto>({ queryKey: ["ost"] }, (tree) =>
        tree ? withSolutionStatus(tree, v.id, statusForTick(v.checked)) : tree,
      );
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ost"] }),
  });
};
