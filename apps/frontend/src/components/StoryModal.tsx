import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import {
  ENUM_LABELS,
  STORY_POINT_VALUES,
  STORY_STATUS_LABELS,
  WORK_TYPES,
  type JourneyStepDto,
  type PersonaDto,
  type ReleaseDto,
  type SprintDto,
  type StoryDto,
  type StoryStatus,
  type UpdateStoryInput,
  type WorkType,
} from "@myapp/shared";
import { ApiClientError } from "../api/client";
import {
  useCreateStory,
  useDeleteStory,
  useSetStoryCheck,
  useStoryChecklist,
  useUpdateStory,
} from "../api/hooks";
import { toast } from "./ui";

type Lookups = {
  steps: JourneyStepDto[];
  personas: PersonaDto[];
  releases: ReleaseDto[];
  sprints: SprintDto[];
};

type Props = Lookups & {
  opened: boolean;
  onClose: () => void;
  subprojectId: string;
  story?: StoryDto;
  defaultStepId?: string | null;
  defaultReleaseId?: string | null;
  isPm: boolean;
};

type Values = {
  story: string;
  acceptanceCriteria: string;
  personaId: string;
  journeyStepId: string;
  workType: WorkType;
  releaseId: string;
  sprintId: string;
  storyPoints: string;
  status: StoryStatus;
};

const stepLabel = (s: JourneyStepDto, all: JourneyStepDto[]) => {
  const parent = s.parentStepId ? all.find((x) => x.id === s.parentStepId) : undefined;
  return parent ? `${parent.name} › ${s.name}` : s.name;
};

function ReadyChecklist({ story, canTick }: { story: StoryDto; canTick: boolean }) {
  const list = useStoryChecklist(story.id);
  const tick = useSetStoryCheck(story.id);
  const items = list.data ?? [];
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No Definition of Ready items are set for this project (a PM adds them in Settings).
      </Text>
    );
  }
  return (
    <Stack gap={6}>
      <Text size="sm" fw={600}>
        Definition of Ready ({items.filter((i) => i.checked).length}/{items.length})
      </Text>
      {items.map((i) => (
        <Checkbox
          key={i.templateId}
          label={i.label}
          checked={i.checked}
          disabled={!canTick || tick.isPending}
          onChange={(e) =>
            tick.mutate(
              { templateId: i.templateId, checked: e.currentTarget.checked },
              { onError: (err) => toast.error(err.message) },
            )
          }
        />
      ))}
    </Stack>
  );
}

export function StoryModal(props: Props) {
  const { opened, onClose, subprojectId, story, isPm } = props;
  const create = useCreateStory(subprojectId);
  const update = useUpdateStory();
  const remove = useDeleteStory();
  const [missing, setMissing] = useState<string[] | null>(null);
  const [pendingPatch, setPendingPatch] = useState<UpdateStoryInput | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const form = useForm<Values>({
    initialValues: {
      story: story?.story ?? "",
      acceptanceCriteria: story?.acceptanceCriteria ?? "",
      personaId: story?.personaId ?? "",
      journeyStepId: story?.journeyStepId ?? props.defaultStepId ?? "",
      workType: story?.workType ?? "feature",
      releaseId: story?.releaseId ?? props.defaultReleaseId ?? "",
      sprintId: story?.sprintId ?? "",
      storyPoints: story?.storyPoints ? String(story.storyPoints) : "",
      status: story?.status ?? "backlog",
    },
    validate: { story: (v) => (v.trim() ? null : "Write the story") },
  });
  const canEdit = isPm || !story;

  const save = (patch: UpdateStoryInput) => {
    if (!story) return;
    update.mutate(
      { id: story.id, patch },
      {
        onSuccess: () => {
          setMissing(null);
          setPendingPatch(null);
          setOverrideReason("");
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === "dor_incomplete") {
            setMissing((e.details as { missing?: string[] } | undefined)?.missing ?? []);
            setPendingPatch(patch);
          } else toast.error(e.message);
        },
      },
    );
  };

  const submit = form.onSubmit((v) => {
    const base = {
      story: v.story.trim(),
      acceptanceCriteria: v.acceptanceCriteria.trim() || null,
      personaId: v.personaId || null,
      journeyStepId: v.journeyStepId || null,
      workType: v.workType,
      releaseId: v.releaseId || null,
      storyPoints: v.storyPoints ? Number(v.storyPoints) : null,
    };
    if (!story) {
      create.mutate(base, { onSuccess: onClose, onError: (e) => toast.error(e.message) });
      return;
    }
    save({ ...base, sprintId: v.sprintId || null, status: v.status });
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
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
            label="Story"
            description="As a …, I want …, so that …"
            autosize
            minRows={2}
            data-autofocus
            disabled={!canEdit}
            {...form.getInputProps("story")}
          />
          <Textarea
            label="Acceptance criteria"
            description="Given … When … Then …"
            autosize
            minRows={2}
            disabled={!canEdit}
            {...form.getInputProps("acceptanceCriteria")}
          />
          <Group grow align="flex-start">
            <Select
              label="Persona"
              clearable
              disabled={!canEdit}
              data={props.personas.map((p) => ({ value: p.id, label: p.name }))}
              {...form.getInputProps("personaId")}
            />
            <Select
              label="Journey step"
              clearable
              searchable
              disabled={!canEdit}
              data={props.steps.map((s) => ({ value: s.id, label: stepLabel(s, props.steps) }))}
              {...form.getInputProps("journeyStepId")}
            />
          </Group>
          <Group grow align="flex-start">
            <Select
              label="Release"
              clearable
              placeholder="Unplanned"
              disabled={!canEdit}
              data={props.releases.map((r) => ({
                value: r.id,
                label: r.isMvp ? `${r.name} (MVP)` : r.name,
              }))}
              {...form.getInputProps("releaseId")}
            />
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
          </Group>
          {story && isPm ? (
            <Group grow align="flex-start">
              <Select
                label="Sprint target"
                clearable
                placeholder="None"
                data={props.sprints.map((s) => ({ value: s.id, label: s.name }))}
                {...form.getInputProps("sprintId")}
              />
              <Select
                label="Status"
                allowDeselect={false}
                data={(Object.keys(STORY_STATUS_LABELS) as StoryStatus[]).map((s) => ({
                  value: s,
                  label: STORY_STATUS_LABELS[s],
                }))}
                {...form.getInputProps("status")}
              />
            </Group>
          ) : null}
          {story ? <ReadyChecklist story={story} canTick /> : null}
          {missing ? (
            <Alert color="yellow" title="Not ready yet">
              <Stack gap={6}>
                <Text size="sm">
                  Still to check: {missing.join(", ")}. Tick them above, or a PM can override.
                </Text>
                {isPm ? (
                  <>
                    <TextInput
                      label="Override reason"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.currentTarget.value)}
                    />
                    <Button
                      size="xs"
                      variant="light"
                      color="yellow"
                      disabled={!overrideReason.trim() || !pendingPatch}
                      loading={update.isPending}
                      onClick={() =>
                        pendingPatch &&
                        save({ ...pendingPatch, overrideReason: overrideReason.trim() })
                      }
                    >
                      Override and save
                    </Button>
                  </>
                ) : null}
              </Stack>
            </Alert>
          ) : null}
          <Group justify="space-between">
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
    </Modal>
  );
}
