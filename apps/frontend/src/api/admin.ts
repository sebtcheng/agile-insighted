import { useQuery } from "@tanstack/react-query";
import type {
  ChecklistTemplateDto,
  CreateProjectInput,
  CreateSprintInput,
  CreateSubprojectInput,
  CreateUserInput,
  GateOverrideDto,
  ReleaseDto,
  UpdateProjectInput,
  UpdateSprintInput,
  UpdateSubprojectInput,
  UpdateUserInput,
} from "@myapp/shared";
import { api } from "./client";
import { useAdminMutation } from "./internal";

// ---------------------------------------------------------------- admin (PM) mutations
export const useCreateProject = () =>
  useAdminMutation((v: CreateProjectInput) => api.post("/projects", v), ["projects"]);
export const useUpdateProject = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateProjectInput }) => api.patch(`/projects/${v.id}`, v.patch),
    ["projects", "workload"],
  );
export const useCreateSubproject = (projectId: string) =>
  useAdminMutation(
    (v: CreateSubprojectInput) => api.post(`/projects/${projectId}/subprojects`, v),
    ["subprojects"],
  );
export const useDeleteProject = () =>
  useAdminMutation((id: string) => api.delete(`/projects/${id}`), ["projects"]);
export const useDeleteSubproject = () =>
  useAdminMutation((id: string) => api.delete(`/subprojects/${id}`), ["subprojects", "projects"]);
export const useUpdateSubproject = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateSubprojectInput }) => api.patch(`/subprojects/${v.id}`, v.patch),
    ["subprojects", "activities"],
  );
export const useCreateSprint = (projectId: string) =>
  useAdminMutation(
    (v: CreateSprintInput) => api.post(`/projects/${projectId}/sprints`, v),
    ["sprints"],
  );
export const useUpdateSprint = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateSprintInput }) => api.patch(`/sprints/${v.id}`, v.patch),
    ["sprints", "home", "workload", "capacity"],
  );
export const useCreateRelease = (projectId: string) =>
  useAdminMutation(
    (v: { name: string; targetDate?: string | null; isMvp?: boolean }) =>
      api.post(`/projects/${projectId}/releases`, v),
    ["releases"],
  );
export const useUpdateRelease = () =>
  useAdminMutation(
    (v: {
      id: string;
      patch: Partial<Pick<ReleaseDto, "name" | "targetDate" | "position" | "status" | "isMvp">>;
    }) => api.patch(`/releases/${v.id}`, v.patch),
    ["releases", "home"],
  );
export const useDeleteRelease = () =>
  useAdminMutation(
    (id: string) => api.delete(`/releases/${id}`),
    ["releases", "activities", "home"],
  );
export const useCreateUser = () =>
  useAdminMutation((v: CreateUserInput) => api.post("/users", v), ["users"]);
export const useUpdateUser = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateUserInput }) => api.patch(`/users/${v.id}`, v.patch),
    ["users"],
  );
export const useDeleteUser = () =>
  useAdminMutation((id: string) => api.delete(`/users/${id}`), ["users"]);
export const useCreateTag = () =>
  useAdminMutation((v: { name: string; colorCode?: string }) => api.post("/tags", v), ["tags"]);

export const useTemplates = (projectId: string | undefined) =>
  useQuery({
    queryKey: ["templates", projectId],
    enabled: !!projectId,
    queryFn: async () =>
      (
        await api.get<{ items: ChecklistTemplateDto[] }>(
          `/projects/${projectId}/checklist-templates`,
        )
      ).items,
  });
export const useCreateTemplate = (projectId: string) =>
  useAdminMutation(
    (v: { kind: "ready" | "done"; label: string }) =>
      api.post(`/projects/${projectId}/checklist-templates`, v),
    ["templates"],
  );
export const useUpdateTemplate = () =>
  useAdminMutation(
    (v: {
      id: string;
      patch: Partial<Pick<ChecklistTemplateDto, "label" | "position" | "isActive">>;
    }) => api.patch(`/checklist-templates/${v.id}`, v.patch),
    ["templates", "activity"],
  );
export const useOverrides = () =>
  useQuery({
    queryKey: ["overrides"],
    queryFn: async () => (await api.get<{ items: GateOverrideDto[] }>("/gate-overrides")).items,
  });
