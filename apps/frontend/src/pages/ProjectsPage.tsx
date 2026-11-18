import {
  Anchor,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { zodResolver } from "mantine-form-zod-resolver";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { createProjectSchema } from "@myapp/shared";
import { useCreateProject, useProjects } from "../api/hooks";
import { useIsPm } from "../auth";
import { PageHeader, QueryState, fmtDate, toast } from "../components/ui";

export function ProjectsPage() {
  const isPm = useIsPm();
  const [params] = useSearchParams();
  const projects = useProjects();
  const [opened, { open, close }] = useDisclosure();
  const create = useCreateProject();
  const form = useForm({
    initialValues: { name: "", code: "", wipLimitPerPerson: 3 },
    validate: zodResolver(createProjectSchema),
  });

  // Search results and shared links point at /projects?subprojectId=…; send them to the current project's activity list.
  const subprojectId = params.get("subprojectId");
  const first = projects.data?.find((p) => !p.archivedAt);
  if (subprojectId && first)
    return <Navigate to={`/projects/${first.id}?subprojectId=${subprojectId}`} replace />;

  return (
    <>
      <PageHeader
        title="Projects"
        actions={isPm ? <Button onClick={open}>New project</Button> : undefined}
      />
      <QueryState query={projects} isEmpty={(d) => d.length === 0} empty="No projects yet.">
        {(items) => (
          <Table.ScrollContainer minWidth={520}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Project</Table.Th>
                  <Table.Th>Code</Table.Th>
                  <Table.Th>WIP limit</Table.Th>
                  <Table.Th>Created</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/projects/${p.id}`} fw={600}>
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
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryState>

      <Modal opened={opened} onClose={close} title="New project">
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
            <TextInput
              label="Code"
              description="2 to 16 letters, numbers, - or _"
              {...form.getInputProps("code")}
            />
            <NumberInput
              label="WIP limit per person"
              min={1}
              max={50}
              {...form.getInputProps("wipLimitPerPerson")}
            />
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
    </>
  );
}
