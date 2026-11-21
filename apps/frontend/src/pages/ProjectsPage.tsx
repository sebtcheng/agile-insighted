import {
  Anchor,
  Badge,
  Button,
  Group,
  MultiSelect,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useState, type KeyboardEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { createProjectSchema, createSubprojectSchema } from "@myapp/shared";
import type { ProjectDto, SubprojectDto } from "@myapp/shared";
import {
  useCreateProject,
  useCreateSubproject,
  useDeleteProject,
  useDeleteSubproject,
  useProjects,
  useProjectsWithSubprojects,
  useUpdateProject,
  useUpdateSubproject,
  useUsers,
} from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { PageHeader, QueryState, fmtDate, toast } from "../components/ui";
import { SideModal } from "../components/SideModal";

type ProjectRow = ProjectDto & { subprojects: SubprojectDto[] };

function SubprojectModal(props: {
  projectId: string;
  subproject: SubprojectDto | null;
  onClose: () => void;
}) {
  const { projectId, subproject, onClose } = props;
  const create = useCreateSubproject(projectId);
  const update = useUpdateSubproject();
  const users = useUsers();
  const leadData = (users.data ?? [])
    .filter((u) => u.isActive)
    .map((u) => ({ value: u.id, label: u.fullName }));
  const form = useForm({
    initialValues: {
      name: subproject?.name ?? "",
      description: subproject?.description ?? "",
      leadId: subproject?.leadId ?? null,
    },
    validate: zod4Resolver(createSubprojectSchema.pick({ name: true })),
  });
  const done = {
    onSuccess: () => {
      toast.ok(subproject ? "Subproject updated" : "Subproject created");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  };
  return (
    <form
      onSubmit={form.onSubmit((v) =>
        subproject
          ? update.mutate(
              {
                id: subproject.id,
                patch: { name: v.name, description: v.description, leadId: v.leadId },
              },
              done,
            )
          : create.mutate({ ...v, health: "on_track" }, done),
      )}
    >
      <Stack>
        <TextInput label="Name" data-autofocus {...form.getInputProps("name")} />
        <Textarea label="Description" {...form.getInputProps("description")} />
        <Select
          label="Team member"
          placeholder="Unassigned"
          clearable
          searchable
          data={leadData}
          {...form.getInputProps("leadId")}
        />
        <Group justify="flex-end" className="side-modal-footer">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {subproject ? "Save" : "Create"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

type InputProps = ReturnType<ReturnType<typeof useForm>["getInputProps"]>;

/** Owner and Team members pickers shared by the New and Edit project modals. */
function TeamFields(props: { owner: InputProps; members: InputProps }) {
  const users = useUsers();
  const options = (users.data ?? [])
    .filter((u) => u.isActive)
    .map((u) => ({ value: u.id, label: u.fullName }));
  return (
    <>
      <Select
        label="Owner"
        placeholder="Select an owner"
        data={options}
        searchable
        allowDeselect={false}
        {...props.owner}
      />
      <MultiSelect
        label="Team members"
        placeholder="Select team members"
        data={options}
        searchable
        clearable
        {...props.members}
      />
    </>
  );
}

function EditProjectModal(props: { project: ProjectRow; onClose: () => void }) {
  const { project, onClose } = props;
  const update = useUpdateProject();
  const form = useForm({
    initialValues: {
      name: project.name,
      ownerId: project.ownerId,
      memberIds: project.memberIds ?? [],
    },
    validate: zod4Resolver(createProjectSchema),
  });
  return (
    <form
      onSubmit={form.onSubmit((v) =>
        update.mutate(
          { id: project.id, patch: v },
          {
            onSuccess: () => {
              toast.ok("Project updated");
              onClose();
            },
            onError: (e) => toast.error(e.message),
          },
        ),
      )}
    >
      <Stack>
        <TextInput label="Name" data-autofocus {...form.getInputProps("name")} />
        <TeamFields
          owner={form.getInputProps("ownerId")}
          members={form.getInputProps("memberIds")}
        />
        <Group justify="flex-end" className="side-modal-footer">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function ProjectsPage() {
  const isPm = useIsPm();
  const me = useAuth();
  const [params] = useSearchParams();
  const projects = useProjects();
  const tree = useProjectsWithSubprojects();
  const [opened, { open, close }] = useDisclosure();
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [subTarget, setSubTarget] = useState<{
    projectId: string;
    subproject: SubprojectDto | null;
  } | null>(null);
  const create = useCreateProject();
  const delProject = useDeleteProject();
  const delSub = useDeleteSubproject();
  const form = useForm({
    initialValues: {
      name: "",
      ownerId: me.id,
      memberIds: [] as string[],
    },
    validate: zod4Resolver(createProjectSchema),
  });

  // Search results and shared links point at /projects?subprojectId=…; send them to the current project's activity list.
  const subprojectId = params.get("subprojectId");
  const first = projects.data?.find((p) => !p.archivedAt);
  if (subprojectId && first)
    return <Navigate to={`/projects/${first.id}?subprojectId=${subprojectId}`} replace />;

  // Project rows open the edit form for everyone; subproject rows stay PM-only.
  const rowProps = (onOpen: () => void, enabled = isPm) =>
    enabled
      ? {
          tabIndex: 0,
          style: { cursor: "pointer" },
          onClick: onOpen,
          onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onOpen();
            }
          },
        }
      : {};

  const confirmDelete = (what: string, run: () => void) => {
    if (window.confirm(`Delete ${what}? This cannot be undone.`)) run();
  };

  return (
    <>
      <PageHeader title="Projects" actions={<Button onClick={open}>New project</Button>} />
      <QueryState query={tree} isEmpty={(d) => d.length === 0} empty="No projects yet.">
        {(items) => (
          <Table.ScrollContainer minWidth={520}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Project</Table.Th>
                  <Table.Th>Code</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Team members</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.flatMap((p) => [
                  <Table.Tr key={p.id} {...rowProps(() => setEditing(p), true)}>
                    <Table.Td>
                      <Anchor
                        component={Link}
                        to={`/projects/${p.id}`}
                        fw={600}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.name}
                      </Anchor>
                      {p.archivedAt ? (
                        <Text size="xs" c="dimmed">
                          Archived
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>{p.code}</Table.Td>
                    <Table.Td data-col="owner">{p.ownerName ?? "—"}</Table.Td>
                    <Table.Td data-col="members">
                      {p.members && p.members.length > 0 ? (
                        <Group gap={4} wrap="wrap">
                          {p.members.map((m) => (
                            <Badge key={m.id} variant="light" color="navy">
                              {m.fullName}
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>{fmtDate(p.createdAt)}</Table.Td>
                    <Table.Td>
                      <Group
                        gap="xs"
                        justify="flex-end"
                        wrap="nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isPm ? (
                          <Button
                            size="compact-sm"
                            variant="default"
                            onClick={() => setSubTarget({ projectId: p.id, subproject: null })}
                          >
                            Add subproject
                          </Button>
                        ) : null}
                        <Button size="compact-sm" variant="default" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                        {isPm ? (
                          <Button
                            size="compact-sm"
                            variant="default"
                            color="coral"
                            onClick={() =>
                              confirmDelete(`project ${p.name}`, () =>
                                delProject.mutate(p.id, {
                                  onSuccess: () => toast.ok("Project deleted"),
                                  onError: (e) => toast.error(e.message),
                                }),
                              )
                            }
                          >
                            Delete
                          </Button>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>,
                  ...p.subprojects.map((s) => (
                    <Table.Tr
                      key={s.id}
                      {...rowProps(() => setSubTarget({ projectId: p.id, subproject: s }))}
                    >
                      <Table.Td pl="xl">
                        <Text size="sm">{s.name}</Text>
                      </Table.Td>
                      <Table.Td>{s.code}</Table.Td>
                      <Table.Td />
                      <Table.Td />
                      <Table.Td />
                      {isPm ? (
                        <Table.Td>
                          <Group
                            gap="xs"
                            justify="flex-end"
                            wrap="nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="compact-sm"
                              variant="default"
                              onClick={() => setSubTarget({ projectId: p.id, subproject: s })}
                            >
                              Edit
                            </Button>
                            <Button
                              size="compact-sm"
                              variant="default"
                              color="coral"
                              onClick={() =>
                                confirmDelete(`subproject ${s.name}`, () =>
                                  delSub.mutate(s.id, {
                                    onSuccess: () => toast.ok("Subproject deleted"),
                                    onError: (e) => toast.error(e.message),
                                  }),
                                )
                              }
                            >
                              Delete
                            </Button>
                          </Group>
                        </Table.Td>
                      ) : (
                        <Table.Td />
                      )}
                    </Table.Tr>
                  )),
                ])}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryState>

      <SideModal opened={!!editing} onClose={() => setEditing(null)} title="Edit project">
        {editing ? <EditProjectModal project={editing} onClose={() => setEditing(null)} /> : null}
      </SideModal>
      <SideModal
        opened={!!subTarget}
        onClose={() => setSubTarget(null)}
        title={subTarget?.subproject ? "Edit subproject" : "New subproject"}
      >
        {subTarget ? (
          <SubprojectModal
            key={subTarget.subproject?.id ?? "new"}
            projectId={subTarget.projectId}
            subproject={subTarget.subproject}
            onClose={() => setSubTarget(null)}
          />
        ) : null}
      </SideModal>

      <SideModal opened={opened} onClose={close} title="New project">
        <form
          onSubmit={form.onSubmit((v) =>
            create.mutate(v, {
              onSuccess: () => {
                toast.ok("Project created");
                form.reset();
                close();
              },
              onError: (e) => toast.error(e.message),
            }),
          )}
        >
          <Stack>
            <TextInput label="Name" data-autofocus {...form.getInputProps("name")} />
            <TeamFields
              owner={form.getInputProps("ownerId")}
              members={form.getInputProps("memberIds")}
            />
            <Group justify="flex-end" className="side-modal-footer">
              <Button variant="default" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </SideModal>
    </>
  );
}
