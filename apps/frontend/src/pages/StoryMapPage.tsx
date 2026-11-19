import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { usmStepSummary, type UsmStepDto } from "@myapp/shared";
import {
  useCreateUsmPersona,
  useCreateUsmStep,
  useCurrentProject,
  useProjects,
  useReorderUsmSteps,
  useUsmPersonas,
  useUsmSteps,
} from "../api/hooks";
import { useIsPm } from "../auth";
import { SideModal } from "../components/SideModal";
import { UsmStepModal } from "../components/UsmStepModal";
import { PageHeader, QueryState, toast } from "../components/ui";

/** "Today" under the app's Asia/Manila date rule, as YYYY-MM-DD. */
const manilaToday = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

function StepCard({
  step,
  index,
  total,
  today,
  canReorder,
  onOpen,
  onMove,
}: {
  step: UsmStepDto;
  index: number;
  total: number;
  today: string;
  canReorder: boolean;
  onOpen: () => void;
  onMove: (to: number) => void;
}) {
  const sum = usmStepSummary(step.features, today);
  return (
    <Card
      className="item-card usm-card"
      p="md"
      data-step={step.id}
      role="button"
      tabIndex={0}
      aria-label={`Step ${index + 1}: ${step.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
          <Badge size="sm" variant="light" className="raid-mono">
            {index + 1}
          </Badge>
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={600} className="raid-card-title">
              {step.title}
            </Text>
            <Group gap="xs" mt={4}>
              <Text size="xs" className="raid-sub">
                {sum.completed}/{sum.total} features completed
              </Text>
              {sum.overdue > 0 ? (
                <Badge size="xs" color="red" variant="light">
                  {sum.overdue} overdue
                </Badge>
              ) : null}
            </Group>
          </div>
        </Group>
        {canReorder ? (
          <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
            <ActionIcon
              variant="subtle"
              className="usm-action"
              aria-label={`Move step ${index + 1} earlier`}
              disabled={index === 0}
              onClick={() => onMove(index - 1)}
            >
              ↑
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              className="usm-action"
              aria-label={`Move step ${index + 1} later`}
              disabled={index === total - 1}
              onClick={() => onMove(index + 1)}
            >
              ↓
            </ActionIcon>
          </Group>
        ) : null}
      </Group>
    </Card>
  );
}

function InsertButton({ at, onInsert }: { at: number; onInsert: (at: number) => void }) {
  return (
    <Group justify="center">
      <ActionIcon
        variant="subtle"
        size="sm"
        className="usm-action"
        aria-label={`Insert step at position ${at + 1}`}
        onClick={() => onInsert(at)}
      >
        +
      </ActionIcon>
    </Group>
  );
}

function AddStepModal({
  opened,
  onClose,
  projectId,
  personaId,
  insertAtIndex,
}: {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  personaId: string;
  insertAtIndex: number | undefined;
}) {
  const create = useCreateUsmStep();
  const form = useForm({
    initialValues: { title: "" },
    validate: { title: (v) => (v.trim() ? null : "Enter the step") },
  });
  return (
    <SideModal opened={opened} onClose={onClose} title="Add step">
      <form
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            { projectId, personaId, title: v.title.trim(), insertAtIndex },
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
          <TextInput
            label="What does the user do?"
            placeholder="e.g. Sign in to the app"
            data-autofocus
            {...form.getInputProps("title")}
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

function AddUser({ projectId, onAdded }: { projectId: string; onAdded: (id: string) => void }) {
  const create = useCreateUsmPersona();
  const [name, setName] = useState("");
  const submit = () => {
    const next = name.trim();
    if (!next) return;
    create.mutate(
      { projectId, name: next },
      {
        onSuccess: (p) => {
          setName("");
          onAdded(p.id);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  return (
    <Group gap="xs" wrap="nowrap">
      <TextInput
        aria-label="New user name"
        placeholder="User or role"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit();
        }}
      />
      <Button variant="default" onClick={submit} loading={create.isPending}>
        Add user
      </Button>
    </Group>
  );
}

export function StoryMapPage() {
  const isPm = useIsPm();
  const [params, setParams] = useSearchParams();
  const allProjects = useProjects();
  const { project } = useCurrentProject(params.get("project"));
  const personas = useUsmPersonas(project?.id);
  const personaParam = params.get("user");
  const persona = personas.data?.find((p) => p.id === personaParam) ?? personas.data?.[0];
  const steps = useUsmSteps(project?.id, persona?.id);
  const reorder = useReorderUsmSteps();
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, addModal] = useDisclosure(false);
  const [insertAt, setInsertAt] = useState<number | undefined>();
  const readOnly = !project || !!project.archivedAt;
  const today = manilaToday();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "project") next.delete("user");
    setParams(next, { replace: true });
  };
  const startAdd = (at?: number) => {
    setInsertAt(at);
    addModal.open();
  };
  const move = (list: UsmStepDto[], from: number, to: number) => {
    if (!project || !persona) return;
    const ids = list.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    reorder.mutate(
      { projectId: project.id, personaId: persona.id, stepIds: ids },
      { onError: (e) => toast.error(e.message) },
    );
  };
  // The modal reads the live step, so ticking a feature updates the card behind it without a reset.
  const openStep = steps.data?.find((s) => s.id === openId);

  return (
    <>
      <PageHeader
        title="User Story Mapping"
        subtitle="Pick a user, lay out their steps from start to finish, and list the features each step needs."
        actions={
          isPm && !readOnly && persona ? (
            <Button onClick={() => startAdd(undefined)}>Add step</Button>
          ) : null
        }
      />
      <Group mb="md" align="flex-end" wrap="wrap">
        <Select
          label="Project"
          w={220}
          allowDeselect={false}
          placeholder="Choose a project"
          data={(allProjects.data ?? [])
            .filter((p) => !p.archivedAt)
            .map((p) => ({ value: p.id, label: p.name }))}
          value={project?.id ?? null}
          onChange={(v) => setParam("project", v)}
        />
        {project && isPm && !readOnly ? (
          <AddUser projectId={project.id} onAdded={(id) => setParam("user", id)} />
        ) : null}
      </Group>
      {!project && !allProjects.isLoading ? (
        <Text c="dimmed">You are not assigned to a project yet.</Text>
      ) : (
        <QueryState
          query={personas}
          isEmpty={(d) => d.length === 0}
          empty={isPm ? "No users yet. Add one to start mapping their journey." : "No users yet."}
        >
          {(list) => (
            <Stack gap="md">
              <Group gap="xs" role="tablist" aria-label="Users">
                {list.map((p) => (
                  <Button
                    key={p.id}
                    role="tab"
                    aria-selected={p.id === persona?.id}
                    size="compact-sm"
                    variant={p.id === persona?.id ? "light" : "default"}
                    onClick={() => setParam("user", p.id)}
                  >
                    {p.name}
                  </Button>
                ))}
              </Group>
              <QueryState
                query={steps}
                isEmpty={(d) => d.length === 0}
                empty={
                  isPm
                    ? "No steps yet. Add the first step this user takes."
                    : "No steps for this user yet."
                }
              >
                {(data) => (
                  <Stack gap={4}>
                    {data.map((s, i) => (
                      <Stack key={s.id} gap={4}>
                        {isPm && !readOnly ? <InsertButton at={i} onInsert={startAdd} /> : null}
                        <StepCard
                          step={s}
                          index={i}
                          total={data.length}
                          today={today}
                          canReorder={isPm && !readOnly}
                          onOpen={() => setOpenId(s.id)}
                          onMove={(to) => move(data, i, to)}
                        />
                      </Stack>
                    ))}
                  </Stack>
                )}
              </QueryState>
            </Stack>
          )}
        </QueryState>
      )}
      <UsmStepModal
        step={openStep}
        opened={!!openStep}
        onClose={() => setOpenId(null)}
        canEdit={isPm && !readOnly}
        canTick={!readOnly}
      />
      {project && persona ? (
        <AddStepModal
          key={`${addOpen}-${insertAt}-${persona.id}`}
          opened={addOpen}
          onClose={addModal.close}
          projectId={project.id}
          personaId={persona.id}
          insertAtIndex={insertAt}
        />
      ) : null}
    </>
  );
}
