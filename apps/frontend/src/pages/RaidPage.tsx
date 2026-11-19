import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ENUM_LABELS,
  RAID_STATUSES,
  RAID_TYPES,
  type RaidItemDto,
  type RaidStatus,
  type RaidType,
} from "@myapp/shared";
import {
  useCreateRaid,
  useCurrentProject,
  useDeleteRaid,
  useRaid,
  useSubprojects,
  useUpdateRaid,
  useUsers,
} from "../api/hooks";
import { useIsPm } from "../auth";
import { PageHeader, QueryState, fmtDate, toast } from "../components/ui";

const LEVELS = [
  { value: "1", label: "Low" },
  { value: "2", label: "Medium" },
  { value: "3", label: "High" },
];
const TYPE_OPTIONS = RAID_TYPES.map((t) => ({ value: t, label: ENUM_LABELS.raidType[t] }));
const STATUS_OPTIONS = RAID_STATUSES.map((s) => ({ value: s, label: ENUM_LABELS.raidStatus[s] }));

const STATUS_COLOR: Record<RaidStatus, string> = {
  open: "red",
  in_progress: "blue",
  mitigated: "teal",
  closed: "gray",
};
const level = (n: number | null) => (n ? ENUM_LABELS.level[n as 1 | 2 | 3] : "Not set");

function severityColor(score: number | null, impact: number): string {
  const s = score ?? impact;
  if (s >= 6) return "red";
  if (s >= 3) return "yellow";
  return "gray";
}

type FormValues = {
  itemType: RaidType;
  description: string;
  impact: string;
  likelihood: string;
  mitigatingAction: string;
  ownerId: string;
  subprojectId: string;
  targetDate: string;
};

function RaidForm({
  projectId,
  existing,
  isPm,
  onDone,
}: {
  projectId: string;
  existing?: RaidItemDto;
  isPm: boolean;
  onDone: () => void;
}) {
  const subprojects = useSubprojects(projectId);
  const users = useUsers();
  const create = useCreateRaid(projectId);
  const update = useUpdateRaid();
  const form = useForm<FormValues>({
    initialValues: {
      itemType: existing?.itemType ?? "risk",
      description: existing?.description ?? "",
      impact: String(existing?.impact ?? 2),
      likelihood: existing?.likelihood ? String(existing.likelihood) : "",
      mitigatingAction: existing?.mitigatingAction ?? "",
      ownerId: existing?.ownerId ?? "",
      subprojectId: existing?.subprojectId ?? "",
      targetDate: existing?.targetDate ?? "",
    },
    validate: { description: (v) => (v.trim() ? null : "Describe the item") },
  });
  const pending = create.isPending || update.isPending;
  const submit = form.onSubmit((v) => {
    const payload = {
      itemType: v.itemType,
      description: v.description.trim(),
      impact: Number(v.impact),
      likelihood: v.likelihood ? Number(v.likelihood) : null,
      mitigatingAction: v.mitigatingAction.trim() || null,
      ownerId: v.ownerId || null,
      subprojectId: v.subprojectId || null,
      targetDate: v.targetDate || null,
    };
    const opts = { onSuccess: onDone, onError: (e: Error) => toast.error(e.message) };
    if (existing) update.mutate({ id: existing.id, patch: payload }, opts);
    else create.mutate(payload, opts);
  });
  return (
    <form onSubmit={submit}>
      <Stack>
        <Select
          label="Type"
          data={TYPE_OPTIONS}
          allowDeselect={false}
          {...form.getInputProps("itemType")}
        />
        <Textarea
          label="Description"
          autosize
          minRows={2}
          data-autofocus
          {...form.getInputProps("description")}
        />
        <SimpleGrid cols={2}>
          <Select
            label="Impact"
            data={LEVELS}
            allowDeselect={false}
            {...form.getInputProps("impact")}
          />
          <Select
            label="Likelihood"
            data={LEVELS}
            clearable
            placeholder="Not set"
            {...form.getInputProps("likelihood")}
          />
        </SimpleGrid>
        <Select
          label="Subproject"
          clearable
          placeholder="Whole project"
          data={(subprojects.data ?? []).map((s) => ({
            value: s.id,
            label: `${s.code} ${s.name}`,
          }))}
          {...form.getInputProps("subprojectId")}
        />
        <Textarea
          label="Mitigating action"
          autosize
          minRows={2}
          {...form.getInputProps("mitigatingAction")}
        />
        {isPm ? (
          <Select
            label="Owner"
            clearable
            searchable
            placeholder="Unassigned"
            data={(users.data ?? [])
              .filter((u) => u.isActive)
              .map((u) => ({ value: u.id, label: u.fullName }))}
            {...form.getInputProps("ownerId")}
          />
        ) : null}
        <TextInput label="Target date" type="date" {...form.getInputProps("targetDate")} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {existing ? "Save" : "Submit"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function RaidPage() {
  const isPm = useIsPm();
  const [params, setParams] = useSearchParams();
  const { project } = useCurrentProject();
  const subprojects = useSubprojects(project?.id);
  const filters = {
    itemType: (params.get("type") as RaidType | null) ?? undefined,
    status: (params.get("status") as RaidStatus | null) ?? undefined,
    subprojectId: params.get("subprojectId") ?? undefined,
    openOnly: params.get("all") !== "true",
  };
  const query = useRaid(project?.id, filters);
  const update = useUpdateRaid();
  const remove = useDeleteRaid();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<RaidItemDto | undefined>();
  const readOnly = !project || !!project.archivedAt;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const openNew = () => {
    setEditing(undefined);
    open();
  };
  const openEdit = (item: RaidItemDto) => {
    setEditing(item);
    open();
  };

  return (
    <>
      <PageHeader
        title="RAID Log"
        subtitle="Risks, assumptions, issues and dependencies. Anyone can submit; the PM assigns owners and resolves."
        actions={
          <Button onClick={openNew} disabled={readOnly}>
            Add item
          </Button>
        }
      />
      <Group mb="md" align="flex-end" wrap="wrap">
        <Select
          label="Type"
          clearable
          placeholder="All types"
          data={TYPE_OPTIONS}
          value={filters.itemType ?? null}
          onChange={(v) => setParam("type", v)}
          w={160}
        />
        <Select
          label="Status"
          clearable
          placeholder="All statuses"
          data={STATUS_OPTIONS}
          value={filters.status ?? null}
          onChange={(v) => setParam("status", v)}
          w={160}
        />
        <Select
          label="Subproject"
          clearable
          placeholder="All"
          data={(subprojects.data ?? []).map((s) => ({ value: s.id, label: s.code }))}
          value={filters.subprojectId ?? null}
          onChange={(v) => setParam("subprojectId", v)}
          w={160}
        />
        <Checkbox
          label="Include closed"
          mb={6}
          checked={!filters.openOnly}
          onChange={(e) => setParam("all", e.currentTarget.checked ? "true" : null)}
        />
      </Group>
      <QueryState
        query={query}
        isEmpty={(d) => d.length === 0}
        empty="No RAID items match these filters."
      >
        {(items) => (
          <Table.ScrollContainer minWidth={960}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Impact</Table.Th>
                  <Table.Th>Likelihood</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Target</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((i) => (
                  <Table.Tr key={i.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {i.code}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {i.subprojectCode ?? "Project"}
                      </Text>
                    </Table.Td>
                    <Table.Td>{ENUM_LABELS.raidType[i.itemType]}</Table.Td>
                    <Table.Td maw={360}>
                      <Text size="sm">{i.description}</Text>
                      {i.mitigatingAction ? (
                        <Text size="xs" c="dimmed" mt={2}>
                          Mitigation: {i.mitigatingAction}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={severityColor(i.severityScore, i.impact)} variant="light">
                        {level(i.impact)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{level(i.likelihood)}</Table.Td>
                    <Table.Td>{i.ownerName ?? <Text c="dimmed">Unassigned</Text>}</Table.Td>
                    <Table.Td>
                      {isPm && !readOnly ? (
                        <Select
                          size="xs"
                          w={130}
                          allowDeselect={false}
                          aria-label={`Status for ${i.code}`}
                          data={STATUS_OPTIONS}
                          value={i.status}
                          onChange={(v) =>
                            v &&
                            update.mutate(
                              { id: i.id, patch: { status: v as RaidStatus } },
                              { onError: (e) => toast.error(e.message) },
                            )
                          }
                        />
                      ) : (
                        <Badge color={STATUS_COLOR[i.status]} variant="light">
                          {ENUM_LABELS.raidStatus[i.status]}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={i.isOverdue ? "red" : undefined}>
                        {fmtDate(i.targetDate)}
                      </Text>
                      {i.isOverdue ? (
                        <Text size="xs" c="red">
                          Overdue
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {isPm && !readOnly ? (
                        <Group gap={4} wrap="nowrap">
                          <Button size="compact-xs" variant="default" onClick={() => openEdit(i)}>
                            Edit
                          </Button>
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            color="red"
                            onClick={() => {
                              if (window.confirm(`Delete ${i.code}? This cannot be undone.`)) {
                                remove.mutate(i.id, { onError: (e) => toast.error(e.message) });
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </Group>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryState>
      <Modal
        opened={opened}
        onClose={close}
        title={editing ? `Edit ${editing.code}` : "Add RAID item"}
        size="lg"
      >
        {project ? (
          <RaidForm
            key={editing?.id ?? "new"}
            projectId={project.id}
            existing={editing}
            isPm={isPm}
            onDone={close}
          />
        ) : null}
      </Modal>
    </>
  );
}
