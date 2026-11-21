import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { withStoryActionSteps } from "../lib/storyActionSteps";
import type {
  StoryMapDto,
  ToggleStoryActionStepResult,
  ProjectWorkItemsQuery,
  ProjectWorkItemsResponse,
  CreateUsmFeatureInput,
  CreateUsmPersonaInput,
  CreateUsmStepInput,
  ReorderUsmStepsInput,
  UpdateUsmFeatureInput,
  UpdateUsmStepInput,
  UsmFeatureDto,
  UsmPersonaDto,
  UsmStepDto,
} from "@myapp/shared";
import { api, type Params } from "./client";
import { useAdminMutation } from "./internal";

// ---------------------------------------------------------------- User Story Mapping v2
// Step features feed Home and Workload, so every USM write also refreshes those caches.
const USM_KEYS = ["usm", "home", "workload", "workload-items", "project-work-items"];

/** Every action of one project across Projects, OST, Kano, User Story Map and RAID, with optional filters. */
export const useProjectWorkItems = (
  projectId: string | undefined,
  filters: ProjectWorkItemsQuery,
) =>
  useQuery({
    queryKey: ["project-work-items", projectId, filters],
    enabled: !!projectId,
    queryFn: () =>
      api.get<ProjectWorkItemsResponse>(
        `/projects/${projectId}/work-items`,
        filters as unknown as Params,
      ),
  });

export const useUsmPersonas = (projectId: string | undefined) =>
  useQuery({
    queryKey: ["usm", "personas", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      (await api.get<{ items: UsmPersonaDto[] }>("/story-map/personas", { projectId })).items,
  });
export const useUsmSteps = (projectId: string | undefined, personaId: string | undefined) =>
  useQuery({
    queryKey: ["usm", "steps", projectId, personaId],
    enabled: !!projectId && !!personaId,
    queryFn: async () =>
      (await api.get<{ items: UsmStepDto[] }>("/story-map/steps", { projectId, personaId })).items,
  });
export const useCreateUsmPersona = () =>
  useAdminMutation(
    (v: CreateUsmPersonaInput) => api.post<UsmPersonaDto>("/story-map/personas", v),
    USM_KEYS,
  );
export const useCreateUsmStep = () =>
  useAdminMutation(
    (v: CreateUsmStepInput) => api.post<UsmStepDto>("/story-map/steps", v),
    USM_KEYS,
  );
export const useUpdateUsmStep = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateUsmStepInput }) =>
      api.patch<UsmStepDto>(`/story-map/steps/${v.id}`, v.patch),
    USM_KEYS,
  );
export const useDeleteUsmStep = () =>
  useAdminMutation((id: string) => api.delete(`/story-map/steps/${id}`), USM_KEYS);
export const useCreateUsmFeature = () =>
  useAdminMutation(
    (v: CreateUsmFeatureInput) => api.post<UsmFeatureDto>("/story-map/features", v),
    USM_KEYS,
  );
export const useUpdateUsmFeature = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateUsmFeatureInput }) =>
      api.patch<UsmFeatureDto>(`/story-map/features/${v.id}`, v.patch),
    USM_KEYS,
  );
export const useDeleteUsmFeature = () =>
  useAdminMutation((id: string) => api.delete(`/story-map/features/${id}`), USM_KEYS);

/** Optimistic reorder: the cards move at once and snap back if the server refuses. */
export function useReorderUsmSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ReorderUsmStepsInput) => api.patch("/story-map/steps/reorder", v),
    onMutate: async (v) => {
      // The same user's steps can be cached under their project or under the all-projects view.
      const match = {
        queryKey: ["usm", "steps"],
        predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[3] === v.personaId,
      };
      await qc.cancelQueries(match);
      const previous = qc.getQueriesData<UsmStepDto[]>(match);
      qc.setQueriesData<UsmStepDto[]>(match, (old) => {
        if (!old) return old;
        const byId = new Map(old.map((s) => [s.id, s]));
        return v.stepIds.flatMap((id, i) => {
          const s = byId.get(id);
          return s ? [{ ...s, sortOrder: i }] : [];
        });
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      for (const [key, data] of ctx?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["usm"] }),
  });
}

/**
 * Ticks one action step. Every cached map is updated at once so the checkbox, fraction and percentage move
 * together; the change rolls back on error and the server's status (a reopened story) is applied on success.
 */
export function useToggleStoryActionStep() {
  const qc = useQueryClient();
  const key = ["story-map"];
  return useMutation({
    mutationFn: (v: { storyId: string; stepId: string; isCompleted: boolean }) =>
      api.patch<ToggleStoryActionStepResult>(`/stories/${v.storyId}/action-steps/${v.stepId}`, {
        isCompleted: v.isCompleted,
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueriesData<StoryMapDto>({ queryKey: key });
      qc.setQueriesData<StoryMapDto>({ queryKey: key }, (map) =>
        map
          ? withStoryActionSteps(map, v.storyId, (steps) =>
              steps.map((x) => (x.id === v.stepId ? { ...x, isCompleted: v.isCompleted } : x)),
            )
          : map,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      for (const [k, data] of ctx?.previous ?? []) qc.setQueryData(k, data);
    },
    onSuccess: (res, v) => {
      qc.setQueriesData<StoryMapDto>({ queryKey: key }, (map) =>
        map
          ? {
              ...map,
              stories: map.stories.map((x) =>
                x.id === v.storyId ? { ...x, status: res.status } : x,
              ),
            }
          : map,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
