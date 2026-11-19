import {
  Anchor,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { zodResolver } from "mantine-form-zod-resolver";
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
import { useIsPm } from "../auth";
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
    validate: zodResolver(createSubprojectSchema.pick({ name: true })),
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

function EditProjectModal(props: { project: ProjectRow; onClose: () => void }) {
  const { project, onClose } = props;
  const update = useUpdateProject();
  const form = useForm({
    initialValues: {
      name: project.name,
      wipLimitPerPerson: project.wipLimitPerPerson,
    },
    validate: zodResolver(createProjectSchema),
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
        <NumberInput
          label="WIP limit per person"
          min={1}
          max={50}
          {...form.getInputProps("wipLimitPerPerson")}
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
    initialValues: { name: "", wipLimitPerPerson: 3 },
    validate: zodResolver(createProjectSchema),
  });

  // Search results and shared links point at /projects?subprojectId=…; send them to the current project's activity list.
  const subprojectId = params.get("subprojectId");
  const first = projects.data?.find((p) => !p.archivedAt);
  if (subprojectId && first)
    return <Navigate to={`/projects/${first.id}?subprojectId=${subprojectId}`} replace />;

  const rowProps = (onOpen: () => void) =>
    isPm
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
      <PageHeader
        title="Projects"
        actions={isPm ? <Button onClick={open}>New project</Button> : undefined}
      />
      <QueryState query={tree} isEmpty={(d) => d.length === 0} empty="No projects yet.">
        {(items) => (
          <Table.ScrollContainer minWidth={520}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Project</Table.Th>
                  <Table.Th>Code</Table.Th>
                  <Table.Th>WIP limit</Table.Th>
                  <Table.Th>Created</Table.Th>
                  {isPm ? <Table.Th /> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.flatMap((p) => [
                  <Table.Tr key={p.id} {...rowProps(() => setEditing(p))}>
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
                    <Table.Td>{p.wipLimitPerPerson}</Table.Td>
                    <Table.Td>{fmtDate(p.createdAt)}</Table.Td>
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
                            onClick={() => setSubTarget({ projectId: p.id, subproject: null })}
                          >
                            Add subproject
                          </Button>
                          <Button size="compact-sm" variant="default" onClick={() => setEditing(p)}>
                            Edit
                          </Button>
                          <Button
                            size="compact-sm"
                            variant="default"
                            color="red"
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
                        </Group>
                      </Table.Td>
                    ) : null}
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
                              color="red"
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
                      ) : null}
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
            <NumberInput
              label="WIP limit per person"
              min={1}
              max={50}
              {...form.getInputProps("wipLimitPerPerson")}
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
