import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { zodResolver } from "mantine-form-zod-resolver";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ACTIVITY_STATUSES,
  ENUM_LABELS,
  HEALTHS,
  WORK_TYPES,
  createSprintSchema,
  createSubprojectSchema,
  type ReleaseDto,
  type SubprojectDto,
} from "@myapp/shared";
import {
  useActivities,
  useCreateActivity,
  useCreateRelease,
  useCreateSprint,
  useCreateSubproject,
  useDeleteRelease,
  useProjects,
  useReleases,
  useSprints,
  useSubprojects,
  useTags,
  useUpdateRelease,
  useUpdateSubproject,
  useUsers,
} from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { ActivityRow } from "../components/ActivityRow";
import { HealthBadge, PageHeader, QueryState, SprintBadge, fmtDate, toast } from "../components/ui";
import { applyActivityFilters, parseActivityFilters, type ActivityFilters } from "../lib/filters";

export function ProjectPage() {
  const { projectId } = useParams();
  const isPm = useIsPm();
  const [params, setParams] = useSearchParams();
  const projects = useProjects();
  const project = projects.data?.find((p) => p.id === projectId);
  const tab = params.get("tab") ?? "activities";

  return (
    <QueryState query={projects}>
      {() =>
        !project ? (
          <Alert color="red" title="Project not found">
            <Anchor component={Link} to="/projects">
              Back to projects
            </Anchor>
          </Alert>
        ) : (
          <>
            <PageHeader
              title={project.name}
              subtitle={`${project.code} · WIP limit ${project.wipLimitPerPerson} per person${project.archivedAt ? " · Archived (read-only)" : ""}`}
            />
            <Tabs
              value={tab}
              onChange={(v) => {
                const next = new URLSearchParams(params);
                if (v) next.set("tab", v);
                setParams(next, { replace: true });
              }}
            >
              <Tabs.List mb="md">
                <Tabs.Tab value="activities">Activities</Tabs.Tab>
                <Tabs.Tab value="subprojects">Subprojects</Tabs.Tab>
                <Tabs.Tab value="sprints">Sprints</Tabs.Tab>
                <Tabs.Tab value="releases">Releases</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="activities">
                <ActivitiesTab
                  projectId={project.id}
                  readOnly={!!project.archivedAt}
                  canCreate={isPm}
                />
              </Tabs.Panel>
              <Tabs.Panel value="subprojects">
                <SubprojectsTab projectId={project.id} canEdit={isPm && !project.archivedAt} />
              </Tabs.Panel>
              <Tabs.Panel value="sprints">
                <SprintsTab projectId={project.id} canEdit={isPm && !project.archivedAt} />
              </Tabs.Panel>
              <Tabs.Panel value="releases">
                <ReleasesTab projectId={project.id} canEdit={isPm && !project.archivedAt} />
              </Tabs.Panel>
            </Tabs>
          </>
        )
      }
    </QueryState>
  );
}

// ------------------------------------------------------------ activities
function ActivitiesTab({
  projectId,
  canCreate,
  readOnly,
}: {
  projectId: string;
  canCreate: boolean;
  readOnly: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const filters = parseActivityFilters(params);
  const setFilters = (f: ActivityFilters) =>
    setParams(applyActivityFilters(params, f), { replace: true });
  const subs = useSubprojects(projectId);
  const sprints = useSprints(projectId);
  const users = useUsers();
  const tags = useTags();
  const releases = useReleases(projectId);
  const query = useActivities(projectId, filters);
  const [opened, { open, close }] = useDisclosure();
  const me = useAuth();
  const hasFilters = Object.keys(filters).length > 0;

  const sel = (
    label: string,
    key: keyof ActivityFilters,
    data: Array<{ value: string; label: string }>,
  ) => (
    <Select
      key={key}
      label={label}
      placeholder="Any"
      clearable
      searchable
      size="xs"
      w={170}
      data={data}
      value={(filters[key] as string | undefined) ?? null}
      onChange={(v) => setFilters({ ...filters, [key]: v ?? undefined })}
    />
  );

  return (
    <Stack>
      <Group align="flex-end" wrap="wrap" gap="xs">
        {sel(
          "Subproject",
          "subprojectId",
          (subs.data ?? []).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` })),
        )}
        {sel(
          "Status",
          "status",
          ACTIVITY_STATUSES.map((s) => ({ value: s, label: ENUM_LABELS.status[s] })),
        )}
        {sel(
          "Assignee",
          "assigneeId",
          (users.data ?? []).map((u) => ({ value: u.id, label: u.fullName })),
        )}
        {sel(
          "Sprint",
          "sprintId",
          (sprints.data ?? []).map((s) => ({ value: s.id, label: s.name })),
        )}
        {sel(
          "Release",
          "releaseId",
          (releases.data ?? []).map((r) => ({ value: r.id, label: r.name })),
        )}
        {sel(
          "Tag",
          "tagId",
          (tags.data ?? []).map((t) => ({ value: t.id, label: t.name })),
        )}
        {sel(
          "Work type",
          "workType",
          WORK_TYPES.map((s) => ({ value: s, label: ENUM_LABELS.workType[s] })),
        )}
        <Checkbox
          label="Blocked only"
          checked={filters.blocked === true}
          onChange={(e) =>
            setFilters({ ...filters, blocked: e.currentTarget.checked ? true : undefined })
          }
        />
        <Button
          size="xs"
          variant="default"
          onClick={() => setFilters({ ...filters, assigneeId: me.id })}
        >
          Assigned to me
        </Button>
        {hasFilters ? (
          <Button size="xs" variant="subtle" onClick={() => setFilters({})}>
            Clear filters
          </Button>
        ) : null}
        {canCreate && !readOnly ? (
          <Button size="xs" ml="auto" onClick={open}>
            New activity
          </Button>
        ) : null}
      </Group>

      <QueryState
        query={query}
        isEmpty={(d) => d.pages.every((p) => p.items.length === 0)}
        empty={hasFilters ? "No activities match these filters." : "No activities yet."}
      >
        {(data) => (
          <Card withBorder padding={0}>
            {data.pages
              .flatMap((p) => p.items)
              .map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            {query.hasNextPage ? (
              <Group justify="center" p="sm">
                <Button
                  variant="light"
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Load more
                </Button>
              </Group>
            ) : null}
          </Card>
        )}
      </QueryState>
      {canCreate ? (
        <NewActivityModal projectId={projectId} opened={opened} onClose={close} />
      ) : null}
    </Stack>
  );
}

function NewActivityModal({
  projectId,
  opened,
  onClose,
}: {
  projectId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const create = useCreateActivity(projectId);
  const subs = useSubprojects(projectId);
  const users = useUsers();
  const form = useForm({
    initialValues: {
      title: "",
      subprojectId: null as string | null,
      assigneeId: null as string | null,
      dueDate: "",
      description: "",
    },
    validate: { title: (v) => (v.trim() ? null : "Enter a title") },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="New activity">
      <form
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            {
              title: v.title.trim(),
              subprojectId: v.subprojectId,
              assigneeId: v.assigneeId,
              dueDate: v.dueDate || null,
              description: v.description || null,
            },
            {
              onSuccess: () => {
                toast.ok("Activity created");
                form.reset();
                onClose();
              },
              onError: (e) => toast.error(e.message),
            },
          ),
        )}
      >
        <Stack>
          <TextInput label="Title" data-autofocus {...form.getInputProps("title")} />
          <Textarea
            label="Description"
            autosize
            minRows={2}
            {...form.getInputProps("description")}
          />
          <Select
            label="Subproject"
            clearable
            searchable
            data={(subs.data ?? []).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))}
            {...form.getInputProps("subprojectId")}
          />
          <Select
            label="Assignee"
            clearable
            searchable
            data={(users.data ?? [])
              .filter((u) => u.isActive)
              .map((u) => ({ value: u.id, label: u.fullName }))}
            {...form.getInputProps("assigneeId")}
          />
          <TextInput label="Due date" type="date" {...form.getInputProps("dueDate")} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------ subprojects
function SubprojectsTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [includeArchived, setIncludeArchived] = useDisclosure(false);
  const subs = useSubprojects(projectId, includeArchived);
  const users = useUsers();
  const [opened, { open, close }] = useDisclosure();
  const [editRow, setEditRow] = useState<SubprojectDto | null>(null);
  const create = useCreateSubproject(projectId);
  const update = useUpdateSubproject();
  const createForm = useForm({
    initialValues: {
      code: "",
      name: "",
      description: "",
      leadId: null as string | null,
      health: "on_track" as (typeof HEALTHS)[number],
      healthNote: "",
    },
    validate: zodResolver(createSubprojectSchema),
  });
  const editForm = useForm({
    initialValues: {
      name: "",
      description: "",
      leadId: null as string | null,
      health: "on_track" as (typeof HEALTHS)[number],
      healthNote: "",
    },
  });
  const leadData = (users.data ?? [])
    .filter((u) => u.isActive)
    .map((u) => ({ value: u.id, label: u.fullName }));

  return (
    <Stack>
      <Group justify="space-between">
        <Checkbox
          label="Show archived"
          checked={includeArchived}
          onChange={() => setIncludeArchived.toggle()}
        />
        {canEdit ? <Button onClick={open}>New subproject</Button> : null}
      </Group>
      <QueryState query={subs} isEmpty={(d) => d.length === 0} empty="No subprojects yet.">
        {(items) => (
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Code</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Lead</Table.Th>
                  <Table.Th>Health</Table.Th>
                  {canEdit ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>{s.code}</Table.Td>
                    <Table.Td>
                      <Anchor component={Link} to={`/projects/${projectId}?subprojectId=${s.id}`}>
                        {s.name}
                      </Anchor>
                      {s.archivedAt ? (
                        <Badge ml="xs" color="gray">
                          Archived
                        </Badge>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {users.data?.find((u) => u.id === s.leadId)?.fullName ?? "None"}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <HealthBadge health={s.health} />
                        {s.healthNote ? (
                          <Text size="xs" c="dimmed">
                            {s.healthNote}
                          </Text>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    {canEdit ? (
                      <Table.Td>
                        <Group gap="xs" justify="flex-end">
                          <Button
                            size="compact-xs"
                            variant="default"
                            onClick={() => {
                              setEditRow(s);
                              editForm.setValues({
                                name: s.name,
                                description: s.description ?? "",
                                leadId: s.leadId,
                                health: s.health,
                                healthNote: s.healthNote ?? "",
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color={s.archivedAt ? "blue" : "red"}
                            onClick={() =>
                              update.mutate(
                                { id: s.id, patch: { archived: !s.archivedAt } },
                                { onError: (e) => toast.error(e.message) },
                              )
                            }
                          >
                            {s.archivedAt ? "Restore" : "Archive"}
                          </Button>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryState>

      <Modal opened={opened} onClose={close} title="New subproject">
        <form
          onSubmit={createForm.onSubmit((v) =>
            create.mutate(
              { ...v, description: v.description || null, healthNote: v.healthNote || null },
              {
                onSuccess: () => {
                  toast.ok("Subproject created");
                  createForm.reset();
                  close();
                },
                onError: (e) => toast.error(e.message),
              },
            ),
          )}
        >
          <Stack>
            <TextInput
              label="Code"
              description="For example PRJ-16"
              data-autofocus
              {...createForm.getInputProps("code")}
            />
            <TextInput label="Name" {...createForm.getInputProps("name")} />
            <Textarea
              label="Description"
              autosize
              minRows={2}
              {...createForm.getInputProps("description")}
            />
            <Select
              label="Lead"
              clearable
              searchable
              data={leadData}
              {...createForm.getInputProps("leadId")}
            />
            <Select
              label="Health"
              allowDeselect={false}
              data={HEALTHS.map((h) => ({ value: h, label: ENUM_LABELS.health[h] }))}
              {...createForm.getInputProps("health")}
            />
            <TextInput label="Health note" {...createForm.getInputProps("healthNote")} />
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={!!editRow}
        onClose={() => setEditRow(null)}
        title={editRow ? `Edit ${editRow.code}` : ""}
      >
        <form
          onSubmit={editForm.onSubmit((v) => {
            if (!editRow) return;
            update.mutate(
              {
                id: editRow.id,
                patch: {
                  name: v.name,
                  description: v.description || null,
                  leadId: v.leadId,
                  health: v.health,
                  healthNote: v.healthNote || null,
                },
              },
              {
                onSuccess: () => {
                  toast.ok("Saved");
                  setEditRow(null);
                },
                onError: (e) => toast.error(e.message),
              },
            );
          })}
        >
          <Stack>
            <TextInput label="Name" {...editForm.getInputProps("name")} />
            <Textarea
              label="Description"
              autosize
              minRows={2}
              {...editForm.getInputProps("description")}
            />
            <Select
              label="Lead"
              clearable
              searchable
              data={leadData}
              {...editForm.getInputProps("leadId")}
            />
            <Select
              label="Health"
              allowDeselect={false}
              data={HEALTHS.map((h) => ({ value: h, label: ENUM_LABELS.health[h] }))}
              {...editForm.getInputProps("health")}
            />
            <TextInput label="Health note" {...editForm.getInputProps("healthNote")} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditRow(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={update.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

// ------------------------------------------------------------ sprints
function SprintsTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const sprints = useSprints(projectId);
  const [opened, { open, close }] = useDisclosure();
  const create = useCreateSprint(projectId);
  const form = useForm({
    initialValues: { name: "", goal: "", startDate: "", endDate: "", status: "planning" as const },
    validate: zodResolver(createSprintSchema),
  });
  return (
    <Stack>
      {canEdit ? (
        <Group justify="flex-end">
          <Button onClick={open}>New sprint</Button>
        </Group>
      ) : null}
      <QueryState query={sprints} isEmpty={(d) => d.length === 0} empty="No sprints yet.">
        {(items) => (
          <Stack gap="xs">
            {items.map((s) => (
              <Card key={s.id} withBorder>
                <Group justify="space-between" wrap="wrap">
                  <div>
                    <Anchor component={Link} to={`/projects/${projectId}/sprints/${s.id}`} fw={600}>
                      {s.name}
                    </Anchor>
                    <Text size="sm" c="dimmed">
                      {fmtDate(s.startDate)} to {fmtDate(s.endDate)}
                    </Text>
                    <Text size="sm">{s.goal ?? <i>No goal yet</i>}</Text>
                  </div>
                  <SprintBadge status={s.status} />
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </QueryState>
      <Modal opened={opened} onClose={close} title="New sprint">
        <form
          onSubmit={form.onSubmit((v) =>
            create.mutate(
              { ...v, goal: v.goal || null },
              {
                onSuccess: () => {
                  toast.ok("Sprint created");
                  form.reset();
                  close();
                },
                onError: (e) => toast.error(e.message),
              },
            ),
          )}
        >
          <Stack>
            <TextInput label="Name" data-autofocus {...form.getInputProps("name")} />
            <Textarea
              label="Sprint goal"
              description="Required before the sprint can become active"
              autosize
              minRows={2}
              {...form.getInputProps("goal")}
            />
            <Group grow>
              <TextInput label="Start" type="date" {...form.getInputProps("startDate")} />
              <TextInput label="End" type="date" {...form.getInputProps("endDate")} />
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

// ------------------------------------------------------------ releases
function ReleasesTab({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const releases = useReleases(projectId);
  const create = useCreateRelease(projectId);
  const update = useUpdateRelease();
  const remove = useDeleteRelease();
  const form = useForm({
    initialValues: { name: "", targetDate: "", isMvp: false },
    validate: { name: (v) => (v.trim() ? null : "Enter a name") },
  });
  const move = (list: ReleaseDto[], index: number, delta: -1 | 1) => {
    const other = list[index + delta];
    const self = list[index];
    if (!other || !self) return;
    // Swap positions; two small patches keep the order explicit.
    update.mutate({ id: self.id, patch: { position: other.position } });
    update.mutate({ id: other.id, patch: { position: self.position } });
  };
  return (
    <Stack>
      {canEdit ? (
        <form
          onSubmit={form.onSubmit((v) =>
            create.mutate(
              { name: v.name.trim(), targetDate: v.targetDate || null, isMvp: v.isMvp },
              { onSuccess: () => form.reset(), onError: (e) => toast.error(e.message) },
            ),
          )}
        >
          <Group align="flex-end" wrap="wrap">
            <TextInput label="New release" placeholder="v1.3" {...form.getInputProps("name")} />
            <TextInput label="Target date" type="date" {...form.getInputProps("targetDate")} />
            <Checkbox
              label="MVP release"
              mb={6}
              {...form.getInputProps("isMvp", { type: "checkbox" })}
            />
            <Button type="submit" loading={create.isPending}>
              Add
            </Button>
          </Group>
        </form>
      ) : null}
      <QueryState query={releases} isEmpty={(d) => d.length === 0} empty="No releases yet.">
        {(items) => (
          <Stack gap="xs">
            {items.map((r, i) => (
              <Card key={r.id} withBorder>
                <Group justify="space-between" wrap="wrap">
                  <div>
                    <Group gap="xs">
                      <Text fw={600}>{r.name}</Text>
                      {r.isMvp ? <Badge color="blue">MVP</Badge> : null}
                      {r.status === "released" ? <Badge color="green">Released</Badge> : null}
                    </Group>
                    <Text size="sm" c="dimmed">
                      Target {fmtDate(r.targetDate)}
                    </Text>
                  </div>
                  {canEdit ? (
                    <Group gap="xs">
                      <ActionIcon
                        variant="default"
                        aria-label={`Move ${r.name} up`}
                        disabled={i === 0}
                        onClick={() => move(items, i, -1)}
                      >
                        ↑
                      </ActionIcon>
                      <ActionIcon
                        variant="default"
                        aria-label={`Move ${r.name} down`}
                        disabled={i === items.length - 1}
                        onClick={() => move(items, i, 1)}
                      >
                        ↓
                      </ActionIcon>
                      {!r.isMvp ? (
                        <Button
                          size="compact-xs"
                          variant="default"
                          onClick={() =>
                            update.mutate(
                              { id: r.id, patch: { isMvp: true } },
                              { onError: (e) => toast.error(e.message) },
                            )
                          }
                        >
                          Make MVP
                        </Button>
                      ) : null}
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={() =>
                          update.mutate({
                            id: r.id,
                            patch: { status: r.status === "released" ? "planned" : "released" },
                          })
                        }
                      >
                        {r.status === "released" ? "Reopen" : "Mark released"}
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={() =>
                          window.confirm(
                            `Delete ${r.name}? Activities in it keep existing but lose this release.`,
                          ) && remove.mutate(r.id, { onError: (e) => toast.error(e.message) })
                        }
                      >
                        Delete
                      </Button>
                    </Group>
                  ) : null}
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </QueryState>
    </Stack>
  );
}
