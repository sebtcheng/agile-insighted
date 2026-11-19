import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
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
import {
  MitigatingActionsField,
  MitigationChecklist,
  type MitigatingActionDraft,
} from "../components/MitigatingActions";
import { SideModal } from "../components/SideModal";
import { ViewModeToggle } from "../components/ViewModeToggle";
import { mitigationPercent } from "../lib/raidMitigation";
import { useViewMode } from "../lib/viewMode";

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

const SELECT_UI = {
  classNames: { input: "raid-input", option: "raid-option" },
  comboboxProps: {
    transitionProps: { duration: 120, timingFunction: "cubic-bezier(0.2, 0, 0, 1)" },
  },
} as const;

type FormValues = {
  itemType: RaidType;
  description: string;
  impact: string;
  likelihood: string;
  mitigatingActions: MitigatingActionDraft[];
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
      mitigatingActions: (existing?.mitigatingActions ?? []).map((a) => ({
        id: a.id,
        description: a.description,
        isCompleted: a.isCompleted,
      })),
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
      mitigatingActions: v.mitigatingActions
        .map((a) => ({ ...a, description: a.description.trim() }))
        .filter((a) => a.description !== ""),
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
            label: s.name,
          }))}
          {...form.getInputProps("subprojectId")}
        />
        <MitigatingActionsField
          value={form.values.mitigatingActions}
          onChange={(next) => form.setFieldValue("mitigatingActions", next)}
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
        <Group justify="flex-end" className="side-modal-footer">
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

function RaidStatusControl({ item, editable }: { item: RaidItemDto; editable: boolean }) {
  const update = useUpdateRaid();
  if (!editable) {
    return (
      <Badge
        className="raid-status-badge"
        data-status={item.status}
        color={STATUS_COLOR[item.status]}
        variant="light"
      >
        {ENUM_LABELS.raidStatus[item.status]}
      </Badge>
    );
  }
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        {...SELECT_UI}
        classNames={{ input: "raid-status-input", option: "raid-option" }}
        data-status={item.status}
        size="xs"
        w={130}
        allowDeselect={false}
        aria-label={`Status for ${item.code}`}
        data={STATUS_OPTIONS}
        value={item.status}
        onChange={(v) =>
          v &&
          update.mutate(
            { id: item.id, patch: { status: v as RaidStatus } },
            { onError: (e) => toast.error(e.message) },
          )
        }
      />
    </div>
  );
}

function RaidActions({ item, onEdit }: { item: RaidItemDto; onEdit: (i: RaidItemDto) => void }) {
  const remove = useDeleteRaid();
  return (
    <Group gap={8} wrap="nowrap" className="raid-actions" onClick={(e) => e.stopPropagation()}>
      <Button
        size="compact-xs"
        variant="default"
        className="raid-action"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(item);
        }}
      >
        Edit
      </Button>
      <Button
        size="compact-xs"
        variant="subtle"
        className="raid-action raid-delete"
        onClick={(e) => {
          e.stopPropagation();
          if (window.confirm(`Delete ${item.code}? This cannot be undone.`)) {
            remove.mutate(item.id, { onError: (err) => toast.error(err.message) });
          }
        }}
      >
        Delete
      </Button>
    </Group>
  );
}

/** Card summary: completion percentage only. Opens the side modal where the actions are managed. */
export function MitigationSummary({
  item,
  onOpen,
}: {
  item: RaidItemDto;
  onOpen: (i: RaidItemDto) => void;
}) {
  const total = item.mitigatingActions.length;
  const done = item.mitigatingActions.filter((a) => a.isCompleted).length;
  return (
    <UnstyledButton
      type="button"
      className="raid-mitigation-summary"
      aria-label={`Mitigation ${mitigationPercent(item.mitigatingActions)} percent, ${done} of ${total} actions done. Open ${item.code}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
    >
      <Text size="xs" mt={2} className="raid-sub">
        Mitigation: <span className="raid-mono">{mitigationPercent(item.mitigatingActions)}%</span>
      </Text>
    </UnstyledButton>
  );
}

export function RaidCards({
  items,
  canEdit,
  onEdit,
}: {
  items: RaidItemDto[];
  canEdit: boolean;
  onEdit: (i: RaidItemDto) => void;
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {items.map((i) => (
        <Card
          key={i.id}
          className="item-card raid-table raid-item"
          p="md"
          data-clickable={canEdit ? "" : undefined}
          onClick={canEdit ? () => onEdit(i) : undefined}
        >
          <Group justify="space-between" align="baseline" wrap="nowrap" mb="xs">
            <div>
              <Text size="sm" fw={600} className="raid-mono">
                {i.code}
              </Text>
              <Text size="xs" mt={2} className="raid-mono raid-sub">
                {i.subprojectCode ?? "Project"}
              </Text>
            </div>
            <Group gap={6} wrap="nowrap" align="baseline">
              <Text size="xs" className="raid-sub raid-type">
                {ENUM_LABELS.raidType[i.itemType]}
              </Text>
              <Badge className="raid-badge" data-severity={i.impact} variant="light">
                {level(i.impact)}
              </Badge>
            </Group>
          </Group>
          <Text size="sm">{i.description}</Text>
          <MitigationSummary item={i} onOpen={onEdit} />
          <div className="raid-card-foot">
            <SimpleGrid cols={2} spacing="xs" verticalSpacing="md" mt="sm" className="raid-meta">
              <div>
                <Text size="xs" className="raid-sub">
                  Likelihood
                </Text>
                <Text size="sm">{level(i.likelihood)}</Text>
              </div>
              <div>
                <Text size="xs" className="raid-sub">
                  Owner
                </Text>
                <Text size="sm">{i.ownerName ?? "Unassigned"}</Text>
              </div>
              <div>
                <Text size="xs" className="raid-sub">
                  Target
                </Text>
                <Text size="sm" c={i.isOverdue ? "red" : undefined} className="raid-mono">
                  {fmtDate(i.targetDate)}
                </Text>
                {i.isOverdue ? (
                  <Text size="xs" c="red">
                    Overdue
                  </Text>
                ) : null}
              </div>
              <div>
                <Text size="xs" className="raid-sub" mb={2}>
                  Status
                </Text>
                <RaidStatusControl item={i} editable={canEdit} />
              </div>
            </SimpleGrid>
            {canEdit ? (
              <Group mt="sm" pt="sm" justify="flex-end" className="raid-card-actions">
                <RaidActions item={i} onEdit={onEdit} />
              </Group>
            ) : null}
          </div>
        </Card>
      ))}
    </SimpleGrid>
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
  const [viewMode, setViewMode] = useViewMode("card");
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
    <div className="raid-page">
      <PageHeader
        title="RAID Log"
        subtitle="Risks, assumptions, issues and dependencies. Anyone can submit; the PM assigns owners and resolves."
        actions={
          <Button className="raid-add-btn" onClick={openNew} disabled={readOnly}>
            Add item
          </Button>
        }
      />
      <Group mb="md" align="flex-end" wrap="wrap" className="raid-filters">
        <Select
          {...SELECT_UI}
          label="Type"
          clearable
          placeholder="All types"
          data={TYPE_OPTIONS}
          value={filters.itemType ?? null}
          onChange={(v) => setParam("type", v)}
          w={160}
        />
        <Select
          {...SELECT_UI}
          label="Status"
          clearable
          placeholder="All statuses"
          data={STATUS_OPTIONS}
          value={filters.status ?? null}
          onChange={(v) => setParam("status", v)}
          w={160}
        />
        <Select
          {...SELECT_UI}
          label="Subproject"
          clearable
          placeholder="All"
          data={(subprojects.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={filters.subprojectId ?? null}
          onChange={(v) => setParam("subprojectId", v)}
          w={160}
        />
        <Checkbox
          label="Include closed"
          className="raid-closed"
          checked={!filters.openOnly}
          onChange={(e) => setParam("all", e.currentTarget.checked ? "true" : null)}
        />
        <div className="raid-toggle" style={{ marginInlineStart: "auto" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </Group>
      <QueryState
        query={query}
        isEmpty={(d) => d.length === 0}
        empty="No RAID items match these filters."
      >
        {(items) =>
          viewMode === "card" ? (
            <RaidCards items={items} canEdit={isPm && !readOnly} onEdit={openEdit} />
          ) : (
            <div className="raid-card">
              <Table.ScrollContainer minWidth={960}>
                <Table verticalSpacing="xs" highlightOnHover className="raid-table">
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
                      <Table.Tr
                        key={i.id}
                        style={isPm && !readOnly ? { cursor: "pointer" } : undefined}
                        onClick={isPm && !readOnly ? () => openEdit(i) : undefined}
                      >
                        <Table.Td>
                          <Text size="sm" fw={600} className="raid-mono">
                            {i.code}
                          </Text>
                          <Text size="xs" mt={2} className="raid-mono raid-sub">
                            {i.subprojectCode ?? "Project"}
                          </Text>
                        </Table.Td>
                        <Table.Td>{ENUM_LABELS.raidType[i.itemType]}</Table.Td>
                        <Table.Td maw={360}>
                          <Text size="sm">{i.description}</Text>
                          <MitigationChecklist item={i} editable={isPm && !readOnly} />
                        </Table.Td>
                        <Table.Td>
                          <Badge className="raid-badge" data-severity={i.impact} variant="light">
                            {level(i.impact)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{level(i.likelihood)}</Table.Td>
                        <Table.Td>{i.ownerName ?? <Text c="dimmed">Unassigned</Text>}</Table.Td>
                        <Table.Td>
                          <RaidStatusControl item={i} editable={isPm && !readOnly} />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={i.isOverdue ? "red" : undefined} className="raid-mono">
                            {fmtDate(i.targetDate)}
                          </Text>
                          {i.isOverdue ? (
                            <Text size="xs" c="red">
                              Overdue
                            </Text>
                          ) : null}
                        </Table.Td>
                        <Table.Td>
                          {isPm && !readOnly ? <RaidActions item={i} onEdit={openEdit} /> : null}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </div>
          )
        }
      </QueryState>
      <SideModal
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
      </SideModal>
    </div>
  );
}
