import { useQuery } from "@tanstack/react-query";
import type {
  ProjectDto,
  ReleaseDto,
  SprintDto,
  SubprojectDto,
  TagDto,
  UserDto,
} from "@myapp/shared";
import { api } from "./client";

// ---------------------------------------------------------------- lookups
export const useUsers = () =>
  useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<{ items: UserDto[] }>("/users")).items,
  });
export const useProjects = () =>
  useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get<{ items: ProjectDto[] }>("/projects")).items,
  });
export const useProjectsWithSubprojects = () =>
  useQuery({
    queryKey: ["projects", "with-subprojects"],
    queryFn: async () =>
      (
        await api.get<{ items: Array<ProjectDto & { subprojects: SubprojectDto[] }> }>(
          "/projects",
          { withSubprojects: true },
        )
      ).items,
  });
export const useTags = () =>
  useQuery({
    queryKey: ["tags"],
    queryFn: async () => (await api.get<{ items: TagDto[] }>("/tags")).items,
  });
export const useSubprojects = (projectId: string | undefined, includeArchived = false) =>
  useQuery({
    queryKey: ["subprojects", projectId, includeArchived],
    enabled: !!projectId,
    queryFn: async () =>
      (
        await api.get<{ items: SubprojectDto[] }>(`/projects/${projectId}/subprojects`, {
          includeArchived,
        })
      ).items,
  });
export const useSprints = (projectId: string | undefined) =>
  useQuery({
    queryKey: ["sprints", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      (await api.get<{ items: SprintDto[] }>(`/projects/${projectId}/sprints`)).items,
  });
export const useReleases = (projectId: string | undefined) =>
  useQuery({
    queryKey: ["releases", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      (await api.get<{ items: ReleaseDto[] }>(`/projects/${projectId}/releases`)).items,
  });

/** This is a single-project tool for now: the oldest open project is the "current" one unless ?project= says otherwise. */
export function useCurrentProject(preferredId?: string | null) {
  const q = useProjects();
  const open = (q.data ?? []).filter((p) => !p.archivedAt);
  const project = open.find((p) => p.id === preferredId) ?? open[0];
  return { ...q, project };
}
