import { Badge, Button, Group, Select, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  ENUM_LABELS,
  STORY_POINT_VALUES,
  STORY_STATUS_LABELS,
  USER_ROLES,
  WORK_TYPES,
  type CreateStoryInput,
  type JourneyStepDto,
  type StoryDto,
  type StoryMapDto,
  type StoryStatus,
  type UpdateStoryInput,
  type UserDto,
  type WorkType,
} from "@myapp/shared";
import { ApiClientError } from "../api/client";
import {
  useCreateStory,
  useDeleteStory,
  useProjects,
  useReleases,
  useSprints,
  useUpdateStory,
  useUsers,
} from "../api/hooks";
import { StoryActionStepsField, type StoryActionStepDraft } from "./StoryActionSteps";
import { SideModal } from "./SideModal";
import { StoryQuickCreate } from "./StoryQuickCreate";
import { toast } from "./ui";

type Props = {
  opened: boolean;
  onClose: () => void;
  story?: StoryDto;
  /** Steps and personas for every project in view; the modal shows the selected project's. */
  map: StoryMapDto | undefined;
  defaultProjectId: string | null;
  defaultStepId?: string | null;
  defaultReleaseId?: string | null;
  isPm: boolean;
};

type Values = {
  projectId: string;
  story: string;
  acceptanceCriteria: string;
  responsibleId: string;
  targetDate: string;
  personaId: string;
  journeyStepId: string;
  workType: WorkType;
  releaseId: string;
  sprintId: string;
  storyPoints: string;
  status: StoryStatus;
  actionSteps: StoryActionStepDraft[];
};

const stepLabel = (s: JourneyStepDto, all: JourneyStepDto[]) => {
  const parent = s.parentStepId ? all.find((x) => x.id === s.parentStepId) : undefined;
  return parent ? `${parent.name} › ${s.name}` : s.name;
};

/** Team Members and Project Managers who are active, plus anyone already assigned (so old rows still display). */
export function staffOptions(users: UserDto[] | undefined, keep: string[]) {
  return (users ?? [])
    .filter((u) => (USER_ROLES as readonly string[]).includes(u.role))
    .filter((u) => u.isActive || keep.includes(u.id))
    .map((u) => ({ value: u.id, label: u.fullName }));
}

/** Wide add / edit side modal, laid out like the OST requirement and RAID edit modals. */
export function StoryModal(props: Props) {
  const { opened, onClose, story, isPm, map } = props;
  const projects = useProjects();
  const users = useUsers();
  const create = useCreateStory();
  const update = useUpdateStory();
  const remove = useDeleteStory();

  const form = useForm<Values>({
    initialValues: {
      projectId: story?.projectId ?? props.defaultProjectId ?? "",
      story: story?.story ?? "",
      acceptanceCriteria: story?.acceptanceCriteria ?? "",
      responsibleId: story?.responsibleId ?? "",
      targetDate: story?.targetDate ?? "",
      personaId: story?.personaId ?? "",
      journeyStepId: story?.journeyStepId ?? props.defaultStepId ?? "",
      workType: story?.workType ?? "feature",
      releaseId: story?.releaseId ?? props.defaultReleaseId ?? "",
      sprintId: story?.sprintId ?? "",
      storyPoints: story?.storyPoints ? String(story.storyPoints) : "",
      status: story?.status ?? "backlog",
      actionSteps: (story?.actionSteps ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        isCompleted: s.isCompleted,
        responsibleId: s.responsibleId ?? "",
        targetDate: s.targetDate ?? "",
      })),
    },
    validate: {
      projectId: (v) => (v ? null : "Choose a project"),
      story: (v) => (v.trim() ? null : "Write the story"),
      // A new story is mapped: it needs a journey step and a release from its project.
      journeyStepId: (v) => (story || v ? null : "Choose a journey step"),
      releaseId: (v) => (story || v ? null : "Choose a release"),
      actionSteps: (list) =>
        list.some((s) => s.label.trim() !== "" && (!s.targetDate || !s.responsibleId))
          ? "Every action step needs a staff member responsible and a target date"
          : null,
    },
  });
  const projectId = form.values.projectId;
  const releases = useReleases(projectId || undefined);
  const sprints = useSprints(projectId || undefined);
  const canEdit = isPm || !story;
  const steps = (map?.steps ?? []).filter((s) => s.projectId === projectId);
  const leafSteps = steps.filter(
    (s) => !!s.parentStepId || !steps.some((c) => c.parentStepId === s.id),
  );
  const personas = (map?.personas ?? []).filter((p) => p.projectId === projectId);
  const keepIds = [
    form.values.responsibleId,
    ...form.values.actionSteps.map((s) => s.responsibleId),
  ].filter(Boolean);
  const staff = staffOptions(users.data, keepIds);
  const noSteps = !!projectId && leafSteps.length === 0;
  const noReleases = !!projectId && releases.isSuccess && (releases.data ?? []).length === 0;

  const onError = (e: Error) => {
    if (e instanceof ApiClientError && e.code === "story_steps_incomplete") {
      const missing = (e.details as { missing?: string[] } | undefined)?.missing ?? [];
      form.setFieldError(
        "actionSteps",
        `Tick every step before completing the story. Still open: ${missing.join(", ")}`,
      );
    } else toast.error(e.message);
  };

  const submit = form.onSubmit((v) => {
    const base = {
      story: v.story.trim(),
      acceptanceCriteria: v.acceptanceCriteria.trim() || null,
      responsibleId: v.responsibleId || null,
      targetDate: v.targetDate || null,
      personaId: v.personaId || null,
      journeyStepId: v.journeyStepId || null,
      workType: v.workType,
      releaseId: v.releaseId || null,
      storyPoints: v.storyPoints ? Number(v.storyPoints) : null,
      actionSteps: v.actionSteps
        .map((s) => ({ ...s, label: s.label.trim() }))
        .filter((s) => s.label !== ""),
    };
    if (!story) {
      const input: CreateStoryInput = {
        ...base,
        projectId: v.projectId,
        journeyStepId: v.journeyStepId,
        releaseId: v.releaseId,
      };
      create.mutate(input, { onSuccess: onClose, onError });
      return;
    }
    const patch: UpdateStoryInput = { ...base, sprintId: v.sprintId || null, status: v.status };
    update.mutate({ id: story.id, patch }, { onSuccess: onClose, onError });
  });

  // A new story's map links belong to its project, so changing project clears them.
  const changeProject = (id: string | null) => {
    form.setValues({ projectId: id ?? "", journeyStepId: "", releaseId: "", personaId: "" });
  };

  return (
    <SideModal
      opened={opened}
      onClose={onClose}
      size={860}
      title={story ? `${story.code}` : "Add user story"}
    >
      <form onSubmit={submit}>
        <Stack>
          {story ? (
            <Group gap="xs">
              <Badge variant="light">{STORY_STATUS_LABELS[story.status]}</Badge>
              {story.isMvp ? <Badge color="blue">MVP</Badge> : null}
              {story.linkedActivities > 0 ? (
                <Badge variant="outline" color="gray">
                  {story.linkedActivities} linked{" "}
                  {story.linkedActivities === 1 ? "activity" : "activities"}
                </Badge>
              ) : null}
            </Group>
          ) : null}
          <Textarea
            label="Story title"
            description="As a …, I want …, so that …"
            autosize
            minRows={2}
            data-autofocus
            disabled={!canEdit}
            {...form.getInputProps("story")}
          />
          <Group className="side-modal-pair" align="flex-start">
            <Select
              label="Project"
              allowDeselect={false}
              searchable
              placeholder="Choose a project"
              disabled={!canEdit || !!story}
              description={story ? "A story stays in the project it was created in." : undefined}
              data={(projects.data ?? [])
                .filter((p) => !p.archivedAt || p.id === projectId)
                .map((p) => ({ value: p.id, label: p.name }))}
              value={projectId || null}
              onChange={changeProject}
              error={form.errors.projectId}
            />
            <Select
              label="Person responsible"
              clearable
              searchable
              placeholder="Unassigned"
              disabled={!canEdit}
              data={staff}
              {...form.getInputProps("responsibleId")}
            />
            <TextInput
              label="Target date"
              type="date"
              disabled={!canEdit}
              {...form.getInputProps("targetDate")}
            />
          </Group>
          <Group className="side-modal-pair" align="flex-start">
            <Select
              label="Release"
              clearable={!!story}
              placeholder={projectId ? "Choose a release" : "Choose a project first"}
              disabled={!canEdit || !projectId}
              data={(releases.data ?? []).map((r) => ({
                value: r.id,
                label: r.isMvp ? `${r.name} (MVP)` : r.name,
              }))}
              {...form.getInputProps("releaseId")}
            />
            <Select
              label="Journey step"
              clearable={!!story}
              searchable
              placeholder={projectId ? "Choose a journey step" : "Choose a project first"}
              disabled={!canEdit || !projectId}
              data={leafSteps.map((s) => ({ value: s.id, label: stepLabel(s, steps) }))}
              {...form.getInputProps("journeyStepId")}
            />
            <Select
              label="Persona"
              clearable
              disabled={!canEdit || !projectId}
              data={personas.map((p) => ({ value: p.id, label: p.name }))}
              {...form.getInputProps("personaId")}
            />
          </Group>
          {canEdit && (noSteps || noReleases) ? (
            <Stack gap="xs" className="usm-prereqs">
              {noReleases ? (
                <StoryQuickCreate
                  kind="release"
                  projectId={projectId}
                  canCreate={isPm}
                  onCreated={(id) => form.setFieldValue("releaseId", id)}
                />
              ) : null}
              {noSteps ? (
                <StoryQuickCreate
                  kind="step"
                  projectId={projectId}
                  canCreate={isPm}
                  onCreated={(id) => form.setFieldValue("journeyStepId", id)}
                />
              ) : null}
            </Stack>
          ) : null}
          <StoryActionStepsField
            value={form.values.actionSteps}
            onChange={(next) => {
              form.setFieldValue("actionSteps", next);
              form.clearFieldError("actionSteps");
            }}
            staffOptions={staff}
            error={typeof form.errors.actionSteps === "string" ? form.errors.actionSteps : null}
          />
          <Textarea
            label="Acceptance criteria"
            description="Given … When … Then …"
            autosize
            minRows={2}
            disabled={!canEdit}
            {...form.getInputProps("acceptanceCriteria")}
          />
          <Group className="side-modal-pair" align="flex-start">
            <Select
              label="Story points"
              clearable
              placeholder="Not sized"
              disabled={!canEdit}
              data={STORY_POINT_VALUES.map((n) => ({ value: String(n), label: String(n) }))}
              {...form.getInputProps("storyPoints")}
            />
            <Select
              label="Type"
              allowDeselect={false}
              disabled={!canEdit}
              data={WORK_TYPES.map((t) => ({ value: t, label: ENUM_LABELS.workType[t] }))}
              {...form.getInputProps("workType")}
            />
            {story && isPm ? (
              <Select
                label="Sprint target"
                clearable
                placeholder="None"
                data={(sprints.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                {...form.getInputProps("sprintId")}
              />
            ) : null}
            {story && isPm ? (
              <Select
                label="Status"
                allowDeselect={false}
                data={(Object.keys(STORY_STATUS_LABELS) as StoryStatus[]).map((s) => ({
                  value: s,
                  label: STORY_STATUS_LABELS[s],
                }))}
                {...form.getInputProps("status")}
              />
            ) : null}
          </Group>
          <Group justify="space-between" className="side-modal-footer">
            {story && isPm ? (
              <Button
                variant="subtle"
                color="red"
                onClick={() => {
                  if (window.confirm(`Delete ${story.code}? This cannot be undone.`)) {
                    remove.mutate(story.id, {
                      onSuccess: onClose,
                      onError: (e) => toast.error(e.message),
                    });
                  }
                }}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Group>
              <Button variant="default" onClick={onClose}>
                {canEdit ? "Cancel" : "Close"}
              </Button>
              {canEdit ? (
                <Button type="submit" loading={create.isPending || update.isPending}>
                  {story ? "Save" : "Add story"}
                </Button>
              ) : null}
            </Group>
          </Group>
        </Stack>
      </form>
    </SideModal>
  );
}
