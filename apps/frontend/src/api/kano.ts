import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  CreateKanoInput,
  KanoCategory,
  KanoDto,
  ToggleKanoSpecInput,
  UpdateKanoInput,
} from "@myapp/shared";
import { api } from "./client";
import { useAdminMutation } from "./internal";

// ---------------------------------------------------------------- Kano Request Tracker (Phase 7)
export type KanoFilters = {
  kanoCategory?: KanoCategory;
  unevaluated?: boolean;
  sort?: "newest" | "code";
};
export const useKano = (projectId: string | undefined, f: KanoFilters) =>
  useQuery({
    queryKey: ["kano", projectId, f],
    enabled: !!projectId,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<{ items: KanoDto[] }>(
          projectId === "all" ? "/kano" : `/projects/${projectId}/kano`,
          {
            kanoCategory: f.kanoCategory,
            unevaluated: f.unevaluated ? "true" : undefined,
            sort: f.sort,
          },
        )
      ).items,
  });
export const useCreateKano = (projectId: string) =>
  useAdminMutation(
    (v: CreateKanoInput) => api.post<KanoDto>(`/projects/${projectId}/kano`, v),
    ["kano"],
  );
export const useUpdateKano = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateKanoInput }) => api.patch<KanoDto>(`/kano/${v.id}`, v.patch),
    ["kano"],
  );
export const useToggleKanoSpec = () =>
  useAdminMutation(
    (v: { requestId: string; specId: string; isCompleted: boolean }) =>
      api.patch<KanoDto>(`/kano/${v.requestId}/specs/${v.specId}`, {
        isCompleted: v.isCompleted,
      } satisfies ToggleKanoSpecInput),
    ["kano"],
  );
export const useDeleteKano = () =>
  useAdminMutation((id: string) => api.delete(`/kano/${id}`), ["kano"]);
