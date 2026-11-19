import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STORY_STATUS_LABELS, type JourneyStepDto, type StoryDto } from "@myapp/shared";
import {
  useCreatePersona,
  useCreateStep,
  useCurrentProject,
  useDeleteStep,
  useReleases,
  useSprints,
  useStoryMap,
  useSubprojects,
  useUpdateStep,
} from "../api/hooks";
import { useIsPm } from "../auth";
import { StoryModal } from "../components/StoryModal";
import { PageHeader, QueryState, toast } from "../components/ui";

const COL_WIDTH = 240;

type Column = { key: string; backbone: JourneyStepDto; step: JourneyStepDto | null };

function StoryCard({ story, onOpen }: { story: StoryDto; onOpen: (s: StoryDto) => void }) {
  const ready = story.readyTotal === 0 || story.readyChecked >= story.readyTotal;
  return (
    <UnstyledButton onClick={() => onOpen(story)} w="100%" aria-label={`Open ${story.code}`}>
      <Paper withBorder p="xs" radius="sm">
        <Group justify="space-between" gap={4} wrap="nowrap">
          <Text size="xs" fw={700}>
            {story.code}
          </Text>
          <Group gap={4} wrap="nowrap">
            {story.storyPoints ? (
              <Badge size="xs" variant="outline" color="gray">
                {story.storyPoints} SP
              </Badge>
            ) : null}
            <Badge size="xs" variant="light">
              {STORY_STATUS_LABELS[story.status]}
            </Badge>
          </Group>
        </Group>
        <Text size="sm" lineClamp={3} mt={4}>
          {story.story}
        </Text>
        <Group justify="space-between" mt={6} gap={4}>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {story.personaName ?? "No persona"}
          </Text>
          {story.readyTotal > 0 ? (
            <Text size="xs" c={ready ? "teal" : "dimmed"}>
              Ready {story.readyChecked}/{story.readyTotal}
            </Text>
          ) : null}
        </Group>
      </Paper>
    </UnstyledButton>
  );
}

function StepHeader({ step, isPm, label }: { step: JourneyStepDto; isPm: boolean; label: string }) {
  const update = useUpdateStep();
  const remove = useDeleteStep();
  return (
    <Group justify="space-between" wrap="nowrap" gap={4}>
      <Text size="sm" fw={600} lineClamp={2}>
        {label}
      </Text>
      {isPm ? (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Options for ${label}`}>
              ⋯
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() => {
                const name = window.prompt("Rename", step.name)?.trim();
                if (name && name !== step.name) {
                  update.mutate(
                    { id: step.id, patch: { name } },
                    { onError: (e) => toast.error(e.message) },
                  );
                }
              }}
            >
              Rename
            </Menu.Item>
            <Menu.Item
              color="red"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${step.name}"${step.parentStepId ? "" : " and its steps"}? Stories stay in the backlog as unmapped.`,
                  )
                ) {
                  remove.mutate(step.id, { onError: (e) => toast.error(e.message) });
                }
              }}
            >
              Delete
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : null}
    </Group>
  );
}

function AddStepModal({
  opened,
  onClose,
  subprojectId,
  backbones,
}: {
  opened: boolean;
  onClose: () => void;
  subprojectId: string;
  backbones: JourneyStepDto[];
}) {
  const create = useCreateStep(subprojectId);
  const form = useForm({
    initialValues: { name: "", parentStepId: "" },
    validate: { name: (v) => (v.trim() ? null : "Enter a name") },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add to the map">
      <form
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            { name: v.name.trim(), parentStepId: v.parentStepId || null },
            {
              onSuccess: () => {
                form.reset();
                onClose();
              },
              onError: (e) => toast.error(e.message),
            },
          ),
        )}
      >
        <Stack>
          <Select
            label="Where"
            placeholder="New backbone activity"
            description="Leave empty for a top-level activity, or choose one to add a step under it."
            clearable
            data={backbones.map((b) => ({ value: b.id, label: `Step under: ${b.name}` }))}
            {...form.getInputProps("parentStepId")}
          />
          <TextInput label="Name" data-autofocus {...form.getInputProps("name")} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function AddPersonaModal({
  opened,
  onClose,
  projectId,
}: {
  opened: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const create = useCreatePersona(projectId);
  const form = useForm({
    initialValues: { name: "", description: "" },
    validate: { name: (v) => (v.trim() ? null : "Enter a name") },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add persona">
      <form
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            { name: v.name.trim(), description: v.description.trim() || null },
            {
              onSuccess: () => {
                form.reset();
                onClose();
              },
              onError: (e) => toast.error(e.message),
            },
          ),
        )}
      >
        <Stack>
          <TextInput label="Name" data-autofocus {...form.getInputProps("name")} />
          <Textarea
            label="Description"
            autosize
            minRows={2}
            {...form.getInputProps("description")}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function StoryMapPage() {
  const isPm = useIsPm();
  const [params, setParams] = useSearchParams();
  const { project } = useCurrentProject();
  const subprojects = useSubprojects(project?.id);
  const releases = useReleases(project?.id);
  const sprints = useSprints(project?.id);
  const subprojectId = params.get("subprojectId") ?? subprojects.data?.[0]?.id;
  const map = useStoryMap(subprojectId);

  const [editing, setEditing] = useState<StoryDto | undefined>();
  const [defaults, setDefaults] = useState<{ stepId: string | null; releaseId: string | null }>({
    stepId: null,
    releaseId: null,
  });
  const [storyOpen, story] = useDisclosure(false);
  const [stepOpen, stepModal] = useDisclosure(false);
  const [personaOpen, personaModal] = useDisclosure(false);
  const readOnly = !project || !!project.archivedAt;

  const layout = useMemo(() => {
    const steps = map.data?.steps ?? [];
    const backbones = steps.filter((s) => !s.parentStepId);
    const columns: Column[] = [];
    for (const b of backbones) {
      const kids = steps.filter((s) => s.parentStepId === b.id);
      if (kids.length === 0) columns.push({ key: b.id, backbone: b, step: null });
      else for (const k of kids) columns.push({ key: k.id, backbone: b, step: k });
    }
    const leafIds = new Set(columns.map((c) => c.key));
    return { backbones, columns, leafIds };
  }, [map.data?.steps]);

  const lanes = useMemo(() => {
    const rs = releases.data ?? [];
    const result: Array<{ id: string | null; name: string; isMvp: boolean }> = rs.map((r) => ({
      id: r.id,
      name: r.name,
      isMvp: r.isMvp,
    }));
    result.push({ id: null, name: "Unplanned", isMvp: false });
    return result;
  }, [releases.data]);

  const openStory = (
    s?: StoryDto,
    stepId: string | null = null,
    releaseId: string | null = null,
  ) => {
    setEditing(s);
    setDefaults({ stepId, releaseId });
    story.open();
  };
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("subprojectId", id);
    else next.delete("subprojectId");
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="User Story Mapping"
        subtitle="Backbone across, steps beneath, stories stacked by necessity. Release lines run across the map."
        actions={
          <>
            {isPm && !readOnly ? (
              <>
                <Button variant="default" onClick={personaModal.open}>
                  Add persona
                </Button>
                <Button variant="default" onClick={stepModal.open} disabled={!subprojectId}>
                  Add step
                </Button>
              </>
            ) : null}
            <Button onClick={() => openStory()} disabled={readOnly || !subprojectId}>
              Add story
            </Button>
          </>
        }
      />
      <Select
        label="Subproject"
        w={280}
        mb="md"
        allowDeselect={false}
        placeholder="Choose a subproject"
        data={(subprojects.data ?? []).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))}
        value={subprojectId ?? null}
        onChange={select}
      />
      {!subprojectId ? (
        <Text c="dimmed">Create a subproject first to start a story map.</Text>
      ) : (
        <QueryState
          query={map}
          isEmpty={(d) => d.steps.length === 0 && d.stories.length === 0}
          empty={
            isPm
              ? "This map is empty. Add a backbone activity with Add step, then stories."
              : "This map is empty."
          }
        >
          {(data) => {
            const unmapped = data.stories.filter(
              (s) => !s.journeyStepId || !layout.leafIds.has(s.journeyStepId),
            );
            return (
              <Stack gap="lg">
                {layout.columns.length > 0 ? (
                  <ScrollArea type="auto" offsetScrollbars>
                    <Box
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${layout.columns.length}, ${COL_WIDTH}px)`,
                        gap: 8,
                        width: "max-content",
                      }}
                    >
                      {layout.columns.map((c, i) => {
                        const first =
                          layout.columns.findIndex((x) => x.backbone.id === c.backbone.id) === i;
                        const span = layout.columns.filter(
                          (x) => x.backbone.id === c.backbone.id,
                        ).length;
                        return first ? (
                          <Paper
                            key={`b-${c.backbone.id}`}
                            withBorder
                            p="xs"
                            bg="var(--mantine-color-gray-light)"
                            style={{ gridColumn: `span ${span}`, gridRow: 1 }}
                          >
                            <StepHeader
                              step={c.backbone}
                              isPm={isPm && !readOnly}
                              label={c.backbone.name}
                            />
                          </Paper>
                        ) : null;
                      })}
                      {layout.columns.map((c) => (
                        <Box key={`s-${c.key}`} style={{ gridRow: 2 }} px={4}>
                          {c.step ? (
                            <StepHeader
                              step={c.step}
                              isPm={isPm && !readOnly}
                              label={c.step.name}
                            />
                          ) : (
                            <Text size="xs" c="dimmed">
                              No steps yet
                            </Text>
                          )}
                        </Box>
                      ))}
                      {lanes.map((lane, li) => (
                        <Box key={lane.id ?? "none"} style={{ display: "contents" }}>
                          <Group
                            gap="xs"
                            style={{ gridColumn: "1 / -1", gridRow: 3 + li * 2 }}
                            mt="sm"
                          >
                            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                              {lane.name}
                            </Text>
                            {lane.isMvp ? <Badge size="xs">MVP</Badge> : null}
                          </Group>
                          {layout.columns.map((c) => {
                            const cell = data.stories.filter(
                              (s) => s.journeyStepId === c.key && s.releaseId === lane.id,
                            );
                            return (
                              <Stack
                                key={`${lane.id}-${c.key}`}
                                gap={6}
                                style={{ gridRow: 4 + li * 2 }}
                                mih={40}
                              >
                                {cell.map((s) => (
                                  <StoryCard key={s.id} story={s} onOpen={(x) => openStory(x)} />
                                ))}
                                {!readOnly ? (
                                  <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    color="gray"
                                    onClick={() => openStory(undefined, c.key, lane.id)}
                                    aria-label={`Add story to ${c.step?.name ?? c.backbone.name}, ${lane.name}`}
                                  >
                                    + Story
                                  </Button>
                                ) : null}
                              </Stack>
                            );
                          })}
                        </Box>
                      ))}
                    </Box>
                  </ScrollArea>
                ) : null}
                {unmapped.length > 0 ? (
                  <div>
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
                      Not on the map yet ({unmapped.length})
                    </Text>
                    <Group align="flex-start" gap="xs">
                      {unmapped.map((s) => (
                        <Box key={s.id} w={COL_WIDTH}>
                          <StoryCard story={s} onOpen={(x) => openStory(x)} />
                        </Box>
                      ))}
                    </Group>
                  </div>
                ) : null}
              </Stack>
            );
          }}
        </QueryState>
      )}
      {subprojectId ? (
        <>
          <StoryModal
            key={`${editing?.id ?? "new"}-${defaults.stepId}-${defaults.releaseId}-${storyOpen}`}
            opened={storyOpen}
            onClose={story.close}
            subprojectId={subprojectId}
            story={editing}
            defaultStepId={defaults.stepId}
            defaultReleaseId={defaults.releaseId}
            isPm={isPm}
            steps={(map.data?.steps ?? []).filter((s) => layout.leafIds.has(s.id))}
            personas={map.data?.personas ?? []}
            releases={releases.data ?? []}
            sprints={sprints.data ?? []}
          />
          <AddStepModal
            opened={stepOpen}
            onClose={stepModal.close}
            subprojectId={subprojectId}
            backbones={layout.backbones}
          />
        </>
      ) : null}
      {project ? (
        <AddPersonaModal opened={personaOpen} onClose={personaModal.close} projectId={project.id} />
      ) : null}
    </>
  );
}
