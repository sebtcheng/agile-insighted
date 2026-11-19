import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { STORY_STATUS_LABELS, type JourneyStepDto, type StoryDto } from "@myapp/shared";
import { StoryReadyChecklist } from "../components/StoryReadyChecklist";
import {
  useCreatePersona,
  useCreateStep,
  useCurrentProject,
  useDeleteStep,
  useReleases,
  useSprints,
  useStoryMap,
  useUpdateStory,
  useSubprojects,
  useUpdateStep,
} from "../api/hooks";
import { useIsPm } from "../auth";
import { StoryModal } from "../components/StoryModal";
import { PageHeader, QueryState, toast } from "../components/ui";
import { ViewModeToggle } from "../components/ViewModeToggle";
import { useViewMode } from "../lib/viewMode";
import { SideModal } from "../components/SideModal";
import { CompletionMeter } from "../components/CompletionMeter";

type Column = { key: string; backbone: JourneyStepDto; step: JourneyStepDto | null };

/** One-click "Mark complete" for a story; disabled once done. */
function CompleteButton({ story, disabled }: { story: StoryDto; disabled?: boolean }) {
  const update = useUpdateStory();
  const done = story.status === "completed";
  return (
    <Button
      size="compact-xs"
      variant={done ? "light" : "default"}
      color={done ? "teal" : undefined}
      disabled={done || disabled}
      loading={update.isPending}
      aria-label={done ? `${story.code} is completed` : `Mark ${story.code} complete`}
      onClick={(e) => {
        e.stopPropagation();
        update.mutate(
          { id: story.id, patch: { status: "completed" } },
          { onError: (err) => toast.error(err.message) },
        );
      }}
    >
      {done ? "Completed" : "Mark complete"}
    </Button>
  );
}

/** Compact grid card: code, title, badges and completion. Steps live in the slide-over. */
function StoryCard({
  story,
  onOpen,
  context,
}: {
  story: StoryDto;
  onOpen: (s: StoryDto) => void;
  context?: string | null;
}) {
  return (
    <Paper withBorder p="xs" radius="sm" h="100%">
      <UnstyledButton onClick={() => onOpen(story)} w="100%" aria-label={`Open ${story.code}`}>
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
        <Text size="sm" lineClamp={2} mt={4}>
          {story.story}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={1} mt={4}>
          {story.personaName ?? "No persona"}
          {context ? ` · ${context}` : ""}
        </Text>
        <div style={{ marginTop: "var(--mantine-spacing-xs)" }}>
          <CompletionMeter done={story.readyChecked} total={story.readyTotal} />
        </div>
      </UnstyledButton>
    </Paper>
  );
}

/** Slide-over with the story's readiness steps (tickable), status and ordering actions. */
function StoryDrawer({
  story,
  context,
  subprojectId,
  canAct,
  cell,
  canReorder,
  onMove,
  onEdit,
  onClose,
}: {
  story: StoryDto;
  context: string | null;
  subprojectId: string;
  canAct: boolean;
  cell: StoryDto[];
  canReorder: boolean;
  onMove: (cell: StoryDto[], index: number, dir: -1 | 1) => void;
  onEdit: (s: StoryDto) => void;
  onClose: () => void;
}) {
  const idx = cell.findIndex((x) => x.id === story.id);
  return (
    <SideModal opened onClose={onClose} title={`${story.code}`} size="lg">
      <Stack gap="md">
        <div>
          <Group gap={6}>
            <Badge size="sm" variant="light">
              {STORY_STATUS_LABELS[story.status]}
            </Badge>
            {story.storyPoints ? (
              <Badge size="sm" variant="outline" color="gray">
                {story.storyPoints} SP
              </Badge>
            ) : null}
          </Group>
          <Text mt="xs">{story.story}</Text>
          <Text size="xs" c="dimmed" mt={4}>
            {story.personaName ?? "No persona"}
            {context ? ` · ${context}` : ""}
          </Text>
        </div>
        <CompletionMeter done={story.readyChecked} total={story.readyTotal} />
        <StoryReadyChecklist story={story} subprojectId={subprojectId} canTick={canAct} />
        <Group gap="xs">
          <CompleteButton story={story} disabled={!canAct} />
          <Button
            size="compact-xs"
            variant="default"
            disabled={!canAct}
            onClick={() => onEdit(story)}
          >
            Edit
          </Button>
          {canReorder && cell.length > 1 ? (
            <>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                disabled={idx <= 0}
                aria-label={`Move ${story.code} up`}
                onClick={() => onMove(cell, idx, -1)}
              >
                ▲ Move up
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                disabled={idx === cell.length - 1}
                aria-label={`Move ${story.code} down`}
                onClick={() => onMove(cell, idx, 1)}
              >
                ▼ Move down
              </Button>
            </>
          ) : null}
        </Group>
      </Stack>
    </SideModal>
  );
}

function StoryTable({
  stories,
  stepNames,
  releaseNames,
  onOpen,
  subprojectId,
  canAct,
}: {
  stories: StoryDto[];
  stepNames: Map<string, string>;
  releaseNames: Map<string, string>;
  onOpen: (s: StoryDto) => void;
  subprojectId: string;
  canAct: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const flip = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table verticalSpacing="xs" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Story</Table.Th>
            <Table.Th>Step</Table.Th>
            <Table.Th>Release</Table.Th>
            <Table.Th>Persona</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th ta="right">SP</Table.Th>
            <Table.Th>Ready</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {stories.map((s) => {
            const ready = s.readyTotal === 0 || s.readyChecked >= s.readyTotal;
            return (
              <Fragment key={s.id}>
                <Table.Tr style={{ cursor: "pointer" }} onClick={() => onOpen(s)}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {s.code}
                    </Text>
                  </Table.Td>
                  <Table.Td maw={380}>
                    <Text size="sm" lineClamp={2}>
                      {s.story}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {(s.journeyStepId && stepNames.get(s.journeyStepId)) || (
                      <Text size="sm" c="dimmed">
                        Not on the map
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {(s.releaseId && releaseNames.get(s.releaseId)) || (
                      <Text size="sm" c="dimmed">
                        Unplanned
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{s.personaName ?? <Text c="dimmed">No persona</Text>}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light">
                      {STORY_STATUS_LABELS[s.status]}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right">{s.storyPoints ?? "–"}</Table.Td>
                  <Table.Td>
                    {s.readyTotal > 0 ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color={ready ? "teal" : "gray"}
                        aria-expanded={expanded.has(s.id)}
                        aria-label={`${expanded.has(s.id) ? "Hide" : "Show"} readiness steps for ${s.code}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          flip(s.id);
                        }}
                      >
                        {s.readyChecked}/{s.readyTotal} {expanded.has(s.id) ? "▴" : "▾"}
                      </Button>
                    ) : (
                      "–"
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <CompleteButton story={s} disabled={!canAct} />
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(s);
                        }}
                      >
                        Open
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
                {expanded.has(s.id) ? (
                  <Table.Tr>
                    <Table.Td />
                    <Table.Td colSpan={8}>
                      <StoryReadyChecklist story={s} subprojectId={subprojectId} canTick={canAct} />
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
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
        <Group gap={2} wrap="nowrap" role="group" aria-label={`Edit actions for ${label}`}>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            className="usm-action"
            aria-label={`Rename ${label}`}
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
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            className="usm-action"
            aria-label={`Delete ${label}`}
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
          </Button>
        </Group>
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
    <SideModal opened={opened} onClose={onClose} title="Add to the map">
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
          <Group justify="flex-end" className="side-modal-footer">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add
            </Button>
          </Group>
        </Stack>
      </form>
    </SideModal>
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
    <SideModal opened={opened} onClose={onClose} title="Add persona">
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
          <Group justify="flex-end" className="side-modal-footer">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add
            </Button>
          </Group>
        </Stack>
      </form>
    </SideModal>
  );
}

export function StoryMapPage() {
  const isPm = useIsPm();
  const [viewMode, setViewMode] = useViewMode("card");
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
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [storyOpen, story] = useDisclosure(false);
  const [stepOpen, stepModal] = useDisclosure(false);
  const [personaOpen, personaModal] = useDisclosure(false);
  const readOnly = !project || !!project.archivedAt;
  const reorder = useUpdateStory();
  // Rewrites the cell's positions as 0..n-1 with the swap applied, so ties from earlier inserts resolve too.
  const moveStory = (cell: StoryDto[], index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= cell.length) return;
    const order = [...cell];
    [order[index], order[j]] = [order[j] as StoryDto, order[index] as StoryDto];
    order.forEach((st, i) => {
      if (st.position !== i) {
        reorder.mutate(
          { id: st.id, patch: { position: i } },
          { onError: (e) => toast.error(e.message) },
        );
      }
    });
  };

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
      <Group mb="md" align="flex-end" wrap="wrap">
        <Select
          label="Subproject"
          w={280}
          allowDeselect={false}
          placeholder="Choose a subproject"
          data={(subprojects.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={subprojectId ?? null}
          onChange={select}
        />
        <div style={{ marginInlineStart: "auto" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </Group>
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
            if (viewMode === "table") {
              return (
                <StoryTable
                  stories={data.stories}
                  stepNames={new Map(data.steps.map((x) => [x.id, x.name]))}
                  releaseNames={new Map((releases.data ?? []).map((r) => [r.id, r.name]))}
                  onOpen={(x) => openStory(x)}
                  subprojectId={subprojectId}
                  canAct={!readOnly}
                />
              );
            }
            const stepLabel = (id: string | null) => {
              const st = data.steps.find((x) => x.id === id);
              if (!st) return null;
              const bb = st.parentStepId ? data.steps.find((x) => x.id === st.parentStepId) : null;
              return bb ? `${bb.name} › ${st.name}` : st.name;
            };
            const cellOf = (s: StoryDto) =>
              data.stories.filter(
                (x) => x.journeyStepId === s.journeyStepId && x.releaseId === s.releaseId,
              );
            const openStoryDto = data.stories.find((x) => x.id === openStoryId);
            const cardGrid = (list: StoryDto[]) => (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                {list.map((s) => (
                  <StoryCard
                    key={s.id}
                    story={s}
                    context={stepLabel(s.journeyStepId)}
                    onOpen={(x) => setOpenStoryId(x.id)}
                  />
                ))}
              </SimpleGrid>
            );
            return (
              <Stack gap="lg">
                {layout.columns.map((c, i) => {
                  const firstOfBackbone =
                    layout.columns.findIndex((x) => x.backbone.id === c.backbone.id) === i;
                  return (
                    <Stack key={c.key} gap="xs">
                      {firstOfBackbone ? (
                        <Paper withBorder p="xs" bg="var(--mantine-color-gray-light)">
                          <StepHeader
                            step={c.backbone}
                            isPm={isPm && !readOnly}
                            label={c.backbone.name}
                          />
                        </Paper>
                      ) : null}
                      {c.step ? (
                        <StepHeader step={c.step} isPm={isPm && !readOnly} label={c.step.name} />
                      ) : (
                        <Text size="xs" c="dimmed">
                          No steps yet
                        </Text>
                      )}
                      {lanes.map((lane) => {
                        const cell = data.stories.filter(
                          (s) => s.journeyStepId === c.key && s.releaseId === lane.id,
                        );
                        if (cell.length === 0 && readOnly) return null;
                        return (
                          <Stack key={`${lane.id}-${c.key}`} gap={6}>
                            <Group gap="xs">
                              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                                {lane.name}
                              </Text>
                              {lane.isMvp ? <Badge size="xs">MVP</Badge> : null}
                              {!readOnly ? (
                                <Button
                                  size="compact-xs"
                                  variant="light"
                                  color="blue"
                                  onClick={() => openStory(undefined, c.key, lane.id)}
                                  aria-label={`Add story to ${c.step?.name ?? c.backbone.name}, ${lane.name}`}
                                >
                                  + Story
                                </Button>
                              ) : null}
                            </Group>
                            {cell.length > 0 ? cardGrid(cell) : null}
                          </Stack>
                        );
                      })}
                    </Stack>
                  );
                })}
                {unmapped.length > 0 ? (
                  <div>
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
                      Not on the map yet ({unmapped.length})
                    </Text>
                    {cardGrid(unmapped)}
                  </div>
                ) : null}
                {openStoryDto ? (
                  <StoryDrawer
                    story={openStoryDto}
                    context={stepLabel(openStoryDto.journeyStepId)}
                    subprojectId={subprojectId}
                    canAct={!readOnly}
                    cell={cellOf(openStoryDto)}
                    canReorder={isPm && !readOnly && !!openStoryDto.journeyStepId}
                    onMove={moveStory}
                    onEdit={(x) => {
                      setOpenStoryId(null);
                      openStory(x);
                    }}
                    onClose={() => setOpenStoryId(null)}
                  />
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
