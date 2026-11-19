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
  ConvertSolutionInput,
  CreateAssumptionInput,
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
  MeDto,
  PersonItemsDto,
  PortfolioResponse,
  ProjectDto,
  RaidItemDto,
  ReleaseDto,
  ScopeChangeDto,
  SearchResponse,
  SprintCapacityDto,
  KanoCategory,
  KanoDecision,
  KanoDto,
  OstTreeDto,
  PromoteKanoInput,
  StoryChecklistItemDto,
  StoryDto,
  StoryMapDto,
  SprintDto,
  SubprojectDto,
  TagDto,
  UpdateActivityInput,
  UpdateAssumptionInput,
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

// ---------------------------------------------------------------- RAID log (Phase 5)
export type RaidFilters = {
  subprojectId?: string;
  itemType?: RaidItemDto["itemType"];
  status?: RaidItemDto["status"];
  ownerId?: string;
  openOnly?: boolean;
};
export const useRaid = (projectId: string | undefined, f: RaidFilters) =>
  useQuery({
    queryKey: ["raid", projectId, f],
    enabled: !!projectId,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<{ items: RaidItemDto[] }>(`/projects/${projectId}/raid`, {
          subprojectId: f.subprojectId,
          itemType: f.itemType,
          status: f.status,
          ownerId: f.ownerId,
          openOnly: f.openOnly ? "true" : undefined,
        })
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
export const useDeleteRaid = () =>
  useAdminMutation((id: string) => api.delete(`/raid/${id}`), ["raid", "portfolio"]);

// ---------------------------------------------------------------- User Story Mapping (Phase 6)
export const useStoryMap = (subprojectId: string | undefined) =>
  useQuery({
    queryKey: ["story-map", subprojectId],
    enabled: !!subprojectId,
    queryFn: () => api.get<StoryMapDto>("/story-map", { subprojectId }),
  });
export const useCreatePersona = (projectId: string) =>
  useAdminMutation(
    (v: CreatePersonaInput) => api.post(`/projects/${projectId}/personas`, v),
    ["story-map"],
  );
export const useCreateStep = (subprojectId: string) =>
  useAdminMutation(
    (v: CreateJourneyStepInput) => api.post(`/subprojects/${subprojectId}/journey-steps`, v),
    ["story-map"],
  );
export const useUpdateStep = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateJourneyStepInput }) =>
      api.patch(`/journey-steps/${v.id}`, v.patch),
    ["story-map"],
  );
export const useDeleteStep = () =>
  useAdminMutation((id: string) => api.delete(`/journey-steps/${id}`), ["story-map"]);
export const useCreateStory = (subprojectId: string) =>
  useAdminMutation(
    (v: CreateStoryInput) => api.post<StoryDto>(`/subprojects/${subprojectId}/stories`, v),
    ["story-map"],
  );
export const useUpdateStory = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateStoryInput }) =>
      api.patch<StoryDto>(`/stories/${v.id}`, v.patch),
    ["story-map", "story-checklist", "overrides"],
  );
export const useDeleteStory = () =>
  useAdminMutation((id: string) => api.delete(`/stories/${id}`), ["story-map"]);
export const useStoryChecklist = (storyId: string | undefined) =>
  useQuery({
    queryKey: ["story-checklist", storyId],
    enabled: !!storyId,
    queryFn: async () =>
      (await api.get<{ items: StoryChecklistItemDto[] }>(`/stories/${storyId}/checklist`)).items,
  });
export const useSetStoryCheck = (storyId: string) =>
  useAdminMutation(
    (v: { templateId: string; checked: boolean }) =>
      api.put(`/stories/${storyId}/checklist/${v.templateId}`, { checked: v.checked }),
    ["story-checklist", "story-map"],
  );

// ---------------------------------------------------------------- Kano Request Tracker (Phase 7)
export type KanoFilters = {
  subprojectId?: string;
  kanoCategory?: KanoCategory;
  decision?: KanoDecision;
  unevaluated?: boolean;
  sort?: "wsjf" | "rice" | "code";
};
export const useKano = (projectId: string | undefined, f: KanoFilters) =>
  useQuery({
    queryKey: ["kano", projectId, f],
    enabled: !!projectId,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<{ items: KanoDto[] }>(`/projects/${projectId}/kano`, {
          subprojectId: f.subprojectId,
          kanoCategory: f.kanoCategory,
          decision: f.decision,
          unevaluated: f.unevaluated ? "true" : undefined,
          sort: f.sort,
        })
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
export const useDeleteKano = () =>
  useAdminMutation((id: string) => api.delete(`/kano/${id}`), ["kano"]);
export const usePromoteKano = () =>
  useAdminMutation(
    (v: { id: string; input: PromoteKanoInput }) =>
      api.post<{ request: KanoDto; storyId: string }>(`/kano/${v.id}/promote`, v.input),
    ["kano", "story-map"],
  );

// ---------------------------------------------------------------- Opportunity Solution Tree (Phase 8)
export const useOstTree = (projectId: string | undefined, subprojectId?: string) =>
  useQuery({
    queryKey: ["ost", projectId, subprojectId],
    enabled: !!projectId,
    queryFn: () => api.get<OstTreeDto>(`/projects/${projectId}/ost`, { subprojectId }),
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
export const useCreateAssumption = () =>
  useAdminMutation(
    (v: { solutionId: string; input: CreateAssumptionInput }) =>
      api.post(`/ost/solutions/${v.solutionId}/assumptions`, v.input),
    ["ost"],
  );
export const useUpdateAssumption = () =>
  useAdminMutation(
    (v: { id: string; patch: UpdateAssumptionInput }) =>
      api.patch(`/ost/assumptions/${v.id}`, v.patch),
    ["ost"],
  );
export const useDeleteAssumption = () =>
  useAdminMutation((id: string) => api.delete(`/ost/assumptions/${id}`), ["ost"]);
