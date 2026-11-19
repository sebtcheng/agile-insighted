import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { withStoryActionSteps } from "../lib/storyActionSteps";
import type {
  ActivityDto,
  ActivityEventDto,
  ActivityUpdateResult,
  ChecklistItemDto,
  ChecklistTemplateDto,
  CommentDto,
  CreateActivityInput,
  ConvertSolutionInput,
  CreateJourneyStepInput,
  CreateOpportunityInput,
  CreateOutcomeInput,
  CreateSolutionInput,
  CreateKanoInput,
  CreatePersonaInput,
  CreateProjectInput,
  CreateStoryInput,
  CreateRaidInput,
  CreateSprintInput,
  CreateSubprojectInput,
  CreateUserInput,
  DependenciesDto,
  GateOverrideDto,
  HomeResponse,
  InsightsDto,
  MeDto,
  PersonItemsDto,
  PortfolioResponse,
  ProjectDto,
  RaidItemDto,
  RaidMitigatingActionDto,
  ReleaseDto,
  ScopeChangeDto,
  SearchResponse,
  SprintCapacityDto,
  KanoCategory,
  KanoDto,
  ToggleKanoSpecInput,
  OstTreeDto,
  StoryDto,
  StoryMapDto,
  ToggleStoryActionStepResult,
  SprintDto,
  SubprojectDto,
  TagDto,
  UpdateActivityInput,
  UpdateJourneyStepInput,
  UpdateOpportunityInput,
  UpdateOutcomeInput,
  UpdateSolutionInput,
  UpdateKanoInput,
  UpdateProjectInput,
  UpdateStoryInput,
  UpdateRaidInput,
  UpdateSprintInput,
  UpdateSubprojectInput,
  UpdateUserInput,
  UserDto,
  WorkloadResponse,
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
import { ApiClientError, api, type Params } from "./client";
import type { ActivityFilters, PortfolioFilters } from "../lib/filters";
import { statusForTick, withSolutionStatus } from "../lib/ostOptimistic";

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
    // A different user may sign in on the same tab: drop everything cached for the previous session.
    onSuccess: async () => {
      qc.clear();
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
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
export const useDeleteProject = () =>
  useAdminMutation((id: string) => api.delete(`/projects/${id}`), ["projects", "portfolio"]);
export const useDeleteSubproject = () =>
  useAdminMutation(
    (id: string) => api.delete(`/subprojects/${id}`),
    ["subprojects", "projects", "portfolio"],
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
    ["raid", "portfolio"],
  );
export const useUpdateRaid = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateRaidInput }) => api.patch<RaidItemDto>(`/raid/${v.id}`, v.patch),
    ["raid", "portfolio"],
  );
export const useToggleMitigatingAction = () =>
  useAdminMutation(
    (v: { raidItemId: string; actionId: string; isCompleted: boolean }) =>
      api.patch<RaidMitigatingActionDto>(`/raid/${v.raidItemId}/mitigating-actions/${v.actionId}`, {
        isCompleted: v.isCompleted,
      }),
    ["raid", "portfolio"],
  );
export const useDeleteRaid = () =>
  useAdminMutation((id: string) => api.delete(`/raid/${id}`), ["raid", "portfolio"]);

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

// ---------------------------------------------------------------- User Story Mapping v2
// Step features feed Home, Workload and Insights, so every USM write also refreshes those caches.
const USM_KEYS = ["usm", "home", "workload", "workload-items", "insights", "portfolio"];

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
      const key = ["usm", "steps", v.projectId, v.personaId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<UsmStepDto[]>(key);
      if (previous) {
        const byId = new Map(previous.map((s) => [s.id, s]));
        qc.setQueryData<UsmStepDto[]>(
          key,
          v.stepIds.flatMap((id, i) => {
            const s = byId.get(id);
            return s ? [{ ...s, sortOrder: i }] : [];
          }),
        );
      }
      return { key, previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
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

// ---------------------------------------------------------------- Insights (Phase 9)
export const useInsights = (params: { projectId?: string; subprojectId?: string; weeks: number }) =>
  useQuery({
    queryKey: ["insights", params],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<InsightsDto>("/insights", params),
  });
