import { useQuery } from "@tanstack/react-query";
import type {
  CreateJourneyStepInput,
  CreatePersonaInput,
  CreateStoryInput,
  StoryDto,
  StoryMapDto,
  UpdateJourneyStepInput,
  UpdateStoryInput,
} from "@myapp/shared";
import { api } from "./client";
import { useAdminMutation } from "./internal";

// ---------------------------------------------------------------- User Story Mapping (Phase 6)
/** One project's map, or every visible project with "all". */
export const useStoryMap = (projectId: string | undefined) =>
  useQuery({
    queryKey: ["story-map", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<StoryMapDto>("/story-map", projectId === "all" ? {} : { projectId }),
  });
export const useCreatePersona = (projectId: string) =>
  useAdminMutation(
    (v: CreatePersonaInput) => api.post(`/projects/${projectId}/personas`, v),
    ["story-map"],
  );
/** The project travels with the call, so one hook serves a fixed project and the "All projects" picker alike. */
export const useCreateStep = () =>
  useAdminMutation(
    (v: CreateJourneyStepInput & { projectId: string }) =>
      api.post<{ id: string }>(`/projects/${v.projectId}/journey-steps`, {
        name: v.name,
        parentStepId: v.parentStepId,
      }),
    ["story-map"],
  );
export const useCreateProjectRelease = () =>
  useAdminMutation(
    (v: { projectId: string; name: string; targetDate?: string | null }) =>
      api.post<{ id: string }>(`/projects/${v.projectId}/releases`, {
        name: v.name,
        targetDate: v.targetDate ?? null,
      }),
    ["releases", "story-map"],
  );
export const useUpdateStep = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateJourneyStepInput }) =>
      api.patch(`/journey-steps/${v.id}`, v.patch),
    ["story-map"],
  );
export const useDeleteStep = () =>
  useAdminMutation((id: string) => api.delete(`/journey-steps/${id}`), ["story-map"]);
export const useCreateStory = () =>
  useAdminMutation((v: CreateStoryInput) => api.post<StoryDto>(`/stories`, v), ["story-map"]);
export const useUpdateStory = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateStoryInput }) =>
      api.patch<StoryDto>(`/stories/${v.id}`, v.patch),
    ["story-map"],
  );
export const useDeleteStory = () =>
  useAdminMutation((id: string) => api.delete(`/stories/${id}`), ["story-map"]);
