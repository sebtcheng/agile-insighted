import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActivityDto,
  ActivityEventDto,
  ActivityUpdateResult,
  ChecklistItemDto,
  CommentDto,
  CreateActivityInput,
  DependenciesDto,
  TagDto,
  UpdateActivityInput,
} from "@myapp/shared";
import { api } from "./client";
import type { ActivityFilters } from "../lib/filters";
import { useInvalidateActivities } from "./internal";

// ---------------------------------------------------------------- activities
export function useActivities(projectId: string | undefined, f: ActivityFilters) {
  return useInfiniteQuery({
    queryKey: ["activities", projectId, f],
    enabled: !!projectId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<{ items: ActivityDto[]; nextCursor: string | null }>("/activities", {
        projectId,
        ...f,
        cursor: pageParam,
        limit: 50,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const useActivity = (id: string | null) =>
  useQuery({
    queryKey: ["activity", id],
    enabled: !!id,
    queryFn: () => api.get<{ activity: ActivityDto; tags: TagDto[] }>(`/activities/${id}`),
  });
export const useEvents = (id: string | null) =>
  useQuery({
    queryKey: ["activity", id, "events"],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<{ items: ActivityEventDto[] }>(`/activities/${id}/events`)).items,
  });
export const useComments = (id: string | null) =>
  useQuery({
    queryKey: ["activity", id, "comments"],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<{ items: CommentDto[] }>(`/activities/${id}/comments`)).items,
  });
export const useDependencies = (id: string | null) =>
  useQuery({
    queryKey: ["activity", id, "dependencies"],
    enabled: !!id,
    queryFn: () => api.get<DependenciesDto>(`/activities/${id}/dependencies`),
  });
export const useChecklist = (id: string | null) =>
  useQuery({
    queryKey: ["activity", id, "checklist"],
    enabled: !!id,
    queryFn: async () =>
      (await api.get<{ items: ChecklistItemDto[] }>(`/activities/${id}/checklist`)).items,
  });

export function useUpdateActivity() {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateActivityInput }) =>
      api.patch<ActivityUpdateResult>(`/activities/${id}`, patch),
    onSuccess: invalidate,
  });
}
export function useCreateActivity(projectId: string) {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (input: Partial<CreateActivityInput> & { title: string }) =>
      api.post<ActivityUpdateResult>(`/projects/${projectId}/activities`, input),
    onSuccess: invalidate,
  });
}
export function useDeleteActivity() {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/activities/${id}`),
    onSuccess: invalidate,
  });
}
export function useAddComment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post(`/activities/${id}/comments`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity", id, "comments"] }),
  });
}
export function useSetCheck(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { templateId: string; checked: boolean }) =>
      api.put(`/activities/${id}/checklist/${v.templateId}`, { checked: v.checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity", id, "checklist"] }),
  });
}
export function useAddDependency(id: string) {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (blockingActivityId: string) =>
      api.post(`/activities/${id}/dependencies`, { blockingActivityId }),
    onSuccess: invalidate,
  });
}
export function useRemoveDependency(id: string) {
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (blockingId: string) => api.delete(`/activities/${id}/dependencies/${blockingId}`),
    onSuccess: invalidate,
  });
}
