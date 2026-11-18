import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ActivityDto,
  ActivityEventDto,
  ActivityUpdateResult,
  ChecklistItemDto,
  ChecklistTemplateDto,
  CommentDto,
  CreateActivityInput,
  CreateProjectInput,
  CreateSprintInput,
  CreateSubprojectInput,
  CreateUserInput,
  DependenciesDto,
  GateOverrideDto,
  HomeResponse,
  MeDto,
  PersonItemsDto,
  PortfolioResponse,
  ProjectDto,
  ReleaseDto,
  ScopeChangeDto,
  SearchResponse,
  SprintCapacityDto,
  SprintDto,
  SubprojectDto,
  TagDto,
  UpdateActivityInput,
  UpdateProjectInput,
  UpdateSprintInput,
  UpdateSubprojectInput,
  UpdateUserInput,
  UserDto,
  WorkloadResponse,
} from "@myapp/shared";
import { ApiClientError, api, type Params } from "./client";
import type { ActivityFilters, PortfolioFilters } from "../lib/filters";

/** All server access lives here; components never call fetch. */

// ---------------------------------------------------------------- auth
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return (await api.get<MeDto>("/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 401) return null;
        throw e;
      }
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; password: string }) => api.post("/auth/login", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.clear();
    },
  });
}

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

// ---------------------------------------------------------------- home, portfolio, workload, search
export const useHome = (params: { assigneeId?: string; subprojectId?: string }) =>
  useQuery({
    queryKey: ["home", params],
    queryFn: () => api.get<HomeResponse>("/home", params),
  });

export const usePortfolio = (f: PortfolioFilters) =>
  useQuery({
    queryKey: ["portfolio", f],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<PortfolioResponse>("/portfolio", f as unknown as Params),
  });

export const useWorkload = (projectId?: string) =>
  useQuery({
    queryKey: ["workload", projectId],
    queryFn: () => api.get<WorkloadResponse>("/workload", { projectId }),
  });

export const usePersonItems = (userId: string | null) =>
  useQuery({
    queryKey: ["workload-items", userId],
    enabled: !!userId,
    queryFn: () => api.get<PersonItemsDto>(`/workload/${userId}/items`),
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q],
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    queryFn: () => api.get<SearchResponse>("/search", { q }),
  });

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

/** Anything that changes activities refreshes every view that shows them. */
function useInvalidateActivities() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        "home",
        "activities",
        "activity",
        "portfolio",
        "workload",
        "workload-items",
        "capacity",
        "scope-changes",
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

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

// ---------------------------------------------------------------- admin (PM) mutations
function useAdminMutation<V, R = unknown>(fn: (v: V) => Promise<R>, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] }))),
  });
}
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
    ["subprojects", "portfolio"],
  );
export const useUpdateSubproject = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateSubprojectInput }) => api.patch(`/subprojects/${v.id}`, v.patch),
    ["subprojects", "portfolio", "activities"],
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
