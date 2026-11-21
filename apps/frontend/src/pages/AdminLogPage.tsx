import { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Popover,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import {
  PM_APPROVALS,
  isPmApproved,
  resolveStoredSprint,
  sortTasksOngoingFirst,
  type AdminLogItemPatch,
  type AdminLogProjectGroup,
  type PmApproval,
  type WorkItem,
  type WorkSourceModule,
} from "@myapp/shared";
import {
  useAdminLog,
  useDeleteAdminLogItem,
  useSetApproval,
  useUpdateAdminLogItem,
} from "../api/adminLog";
import { useUsers } from "../api/hooks";
import { useIsPm } from "../auth";
import { PmApprovalBadge, approvalGateProps } from "../components/PmApprovalBadge";
import { SideModal } from "../components/SideModal";
import { SprintSelect, sprintDraftValue } from "../components/SprintSelect";
import { PageHeader, QueryState, toast } from "../components/ui";

const MODULE_PILL: Record<WorkSourceModule, string> = {
  project: "PROJECT",
  user_story: "USM",
  ost: "OST",
  kano: "KANO",
  raid: "RAID",
};

type SortKey = "title" | "module" | "assignee" | "sprint" | "pmApproval";
type SortConfig = { key: SortKey | null; direction: "asc" | "desc" };
type ColumnFilters = {
  title: string;
  modules: string[];
  assignees: string[];
  sprints: string[];
  approvals: string[];
};

const EMPTY_FILTERS: ColumnFilters = {
  title: "",
  modules: [],
  assignees: [],
  sprints: [],
  approvals: [],
};

const sprintLabelFor = (i: WorkItem) => resolveStoredSprint(null, i.dueDate)?.label ?? "No sprint";
const assigneeLabelFor = (i: WorkItem) => i.assigneeName ?? "Unassigned";

function compareNullable(a: string | null, b: string | null, dir: "asc" | "desc"): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const cmp = a.localeCompare(b);
  return dir === "asc" ? cmp : -cmp;
}

function sortItems(items: WorkItem[], sort: SortConfig): WorkItem[] {
  if (!sort.key) return sortTasksOngoingFirst(items);
  const { key, direction } = sort;
  return [...items].sort((a, b) => {
    switch (key) {
      case "title":
        return compareNullable(a.title, b.title, direction);
      case "module":
        return compareNullable(MODULE_PILL[a.sourceModule], MODULE_PILL[b.sourceModule], direction);
      case "assignee":
        return compareNullable(a.assigneeName, b.assigneeName, direction);
      case "sprint":
        return compareNullable(a.dueDate, b.dueDate, direction);
      case "pmApproval":
        return compareNullable(a.pmApproval ?? "PENDING", b.pmApproval ?? "PENDING", direction);
    }
  });
}

function ColumnHeader({
  label,
  colKey,
  sort,
  onSort,
  activeFilterCount,
  onClearFilter,
  children,
}: {
  label: string;
  colKey: SortKey;
  sort: SortConfig;
  onSort: (key: SortKey) => void;
  activeFilterCount: number;
  onClearFilter: () => void;
  children: React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const isSorted = sort.key === colKey;
  const ariaSort = isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  const sortIcon = isSorted ? (sort.direction === "asc" ? "↑" : "↓") : "↕";

  return (
    <Table.Th aria-sort={ariaSort}>
      <Group gap={4} wrap="nowrap" justify="space-between">
        <UnstyledButton
          type="button"
          onClick={() => onSort(colKey)}
          fw={700}
          fz="sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <span>{label}</span>
          <Text span size="xs" c={isSorted ? "navy" : "dimmed"} aria-hidden="true">
            {sortIcon}
          </Text>
        </UnstyledButton>
        <Popover
          opened={opened}
          onChange={setOpened}
          position="bottom-start"
          withArrow
          shadow="md"
        >
          <Popover.Target>
            <ActionIcon
              type="button"
              size="xs"
              variant={activeFilterCount > 0 ? "filled" : "subtle"}
              color={activeFilterCount > 0 ? "navy" : "gray"}
              aria-label={`Filter ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpened((o) => !o);
              }}
            >
              <Text span fz={11} lh={1}>
                ⧗
              </Text>
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown p="xs" miw={200} onClick={(e) => e.stopPropagation()}>
            <Stack gap="xs">
              {children}
              <Group justify="flex-end">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() => {
                    onClearFilter();
                    setOpened(false);
                  }}
                >
                  Clear
                </Button>
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>
    </Table.Th>
  );
}

/** OST titles are shown as "OST-01 Title"; the stored title has no code. */
const editableTitle = (i: WorkItem) => i.title.replace(/^OST-\d+\s+/, "");

function EditItemModal({ item, onClose }: { item: WorkItem; onClose: () => void }) {
  const users = useUsers();
  const update = useUpdateAdminLogItem();
  const [title, setTitle] = useState(editableTitle(item));
  const [assigneeId, setAssigneeId] = useState(item.assigneeId ?? "");
  const [sprintKey, setSprintKey] = useState(sprintDraftValue(null, item.dueDate));
  const [approval, setApproval] = useState<PmApproval>(item.pmApproval ?? "PENDING");
  const [completed, setCompleted] = useState(item.isCompleted);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const name = title.trim();
    if (!name) return setError("Title is required");
    const patch: AdminLogItemPatch = {
      ...(name !== editableTitle(item) ? { title: name } : {}),
      ...(assigneeId !== (item.assigneeId ?? "") ? { assigneeId: assigneeId || null } : {}),
      ...(sprintKey !== sprintDraftValue(null, item.dueDate)
        ? { sprintKey: sprintKey || null }
        : {}),
      ...(approval !== (item.pmApproval ?? "PENDING") ? { pmApproval: approval } : {}),
      ...(completed !== item.isCompleted ? { isCompleted: completed } : {}),
    };
    if (Object.keys(patch).length === 0) return onClose();
    update.mutate(
      { item, patch },
      {
        onSuccess: () => {
          toast.ok("Task updated");
          onClose();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <SideModal opened onClose={onClose} title="Edit task">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Stack>
          <TextInput
            label="Task"
            data-autofocus
            maxLength={300}
            value={title}
            error={error}
            onChange={(e) => {
              setTitle(e.currentTarget.value);
              setError(null);
            }}
          />
          <Select
            label="Person responsible"
            clearable
            searchable
            placeholder="Unassigned"
            data={(users.data ?? [])
              .filter((u) => u.isActive || u.id === item.assigneeId)
              .map((u) => ({ value: u.id, label: u.fullName }))}
            value={assigneeId || null}
            onChange={(v) => setAssigneeId(v ?? "")}
          />
          <SprintSelect
            label="Sprint"
            aria-label="Sprint"
            width="100%"
            value={sprintKey}
            onChange={setSprintKey}
          />
          <Select
            label="PM Approval"
            allowDeselect={false}
            data={PM_APPROVALS.map((a) => ({
              value: a,
              label: a === "APPROVED" ? "Approved" : "Pending",
            }))}
            value={approval}
            onChange={(v) => v && setApproval(v as PmApproval)}
          />
          <Checkbox
            label="Completed"
            checked={completed}
            {...approvalGateProps(approval)}
            onChange={(e) => setCompleted(e.currentTarget.checked)}
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
    </SideModal>
  );
}

function ProjectSection({
  group,
  onEdit,
  sort,
  onSort,
  filters,
  onFiltersChange,
  options,
}: {
  group: AdminLogProjectGroup;
  onEdit: (item: WorkItem) => void;
  sort: SortConfig;
  onSort: (key: SortKey) => void;
  filters: ColumnFilters;
  onFiltersChange: (next: ColumnFilters) => void;
  options: { modules: string[]; assignees: string[]; sprints: string[]; approvals: string[] };
}) {
  const update = useUpdateAdminLogItem();
  const approve = useSetApproval();
  const remove = useDeleteAdminLogItem();
  return (
    <section aria-label={group.projectName} data-testid="admin-log-project">
      <Group gap="sm" mb="xs">
        <Text fw={700} fz="lg" component="h2" m={0}>
          {group.projectName}
        </Text>
        <Badge variant="outline" color="navy">
          {group.total} {group.total === 1 ? "task" : "tasks"}
        </Badge>
        {group.pending > 0 ? (
          <Badge variant="light" color="navy">
            {group.pending} pending
          </Badge>
        ) : null}
      </Group>
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36} aria-label="Done" />
              <ColumnHeader
                label="Task"
                colKey="title"
                sort={sort}
                onSort={onSort}
                activeFilterCount={filters.title ? 1 : 0}
                onClearFilter={() => onFiltersChange({ ...filters, title: "" })}
              >
                <TextInput
                  size="xs"
                  placeholder="Search task..."
                  aria-label="Search Task"
                  value={filters.title}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, title: e.currentTarget.value })
                  }
                />
              </ColumnHeader>
              <ColumnHeader
                label="Module"
                colKey="module"
                sort={sort}
                onSort={onSort}
                activeFilterCount={filters.modules.length}
                onClearFilter={() => onFiltersChange({ ...filters, modules: [] })}
              >
                <Checkbox.Group
                  value={filters.modules}
                  onChange={(v) => onFiltersChange({ ...filters, modules: v })}
                >
                  <Stack gap={4}>
                    {options.modules.map((m) => (
                      <Checkbox key={m} value={m} label={m} size="xs" />
                    ))}
                  </Stack>
                </Checkbox.Group>
              </ColumnHeader>
              <ColumnHeader
                label="Person responsible"
                colKey="assignee"
                sort={sort}
                onSort={onSort}
                activeFilterCount={filters.assignees.length}
                onClearFilter={() => onFiltersChange({ ...filters, assignees: [] })}
              >
                <Checkbox.Group
                  value={filters.assignees}
                  onChange={(v) => onFiltersChange({ ...filters, assignees: v })}
                >
                  <Stack gap={4} mah={200} style={{ overflowY: "auto" }}>
                    {options.assignees.map((a) => (
                      <Checkbox key={a} value={a} label={a} size="xs" />
                    ))}
                  </Stack>
                </Checkbox.Group>
              </ColumnHeader>
              <ColumnHeader
                label="Sprint / Target date"
                colKey="sprint"
                sort={sort}
                onSort={onSort}
                activeFilterCount={filters.sprints.length}
                onClearFilter={() => onFiltersChange({ ...filters, sprints: [] })}
              >
                <Checkbox.Group
                  value={filters.sprints}
                  onChange={(v) => onFiltersChange({ ...filters, sprints: v })}
                >
                  <Stack gap={4} mah={200} style={{ overflowY: "auto" }}>
                    {options.sprints.map((s) => (
                      <Checkbox key={s} value={s} label={s} size="xs" />
                    ))}
                  </Stack>
                </Checkbox.Group>
              </ColumnHeader>
              <ColumnHeader
                label="PM Approval"
                colKey="pmApproval"
                sort={sort}
                onSort={onSort}
                activeFilterCount={filters.approvals.length}
                onClearFilter={() => onFiltersChange({ ...filters, approvals: [] })}
              >
                <Checkbox.Group
                  value={filters.approvals}
                  onChange={(v) => onFiltersChange({ ...filters, approvals: v })}
                >
                  <Stack gap={4}>
                    {options.approvals.map((a) => (
                      <Checkbox key={a} value={a} label={a} size="xs" />
                    ))}
                  </Stack>
                </Checkbox.Group>
              </ColumnHeader>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {group.items.map((i) => {
              const sprint = resolveStoredSprint(null, i.dueDate);
              const approved = isPmApproved(i.pmApproval);
              return (
                <Table.Tr key={`${i.sourceModule}-${i.id}`} data-testid="admin-log-row">
                  <Table.Td>
                    <Checkbox
                      size="xs"
                      checked={i.isCompleted}
                      aria-label={`${i.isCompleted ? "Reopen" : "Complete"} ${i.title}`}
                      {...approvalGateProps(i.pmApproval)}
                      disabled={!approved || update.isPending}
                      onChange={(e) =>
                        update.mutate(
                          { item: i, patch: { isCompleted: e.currentTarget.checked } },
                          { onError: (err) => toast.error(err.message) },
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1} td={i.isCompleted ? "line-through" : undefined}>
                      {i.title}
                    </Text>
                    {i.parentTitle ? (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {i.parentTitle}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="outline" color="navy">
                      {MODULE_PILL[i.sourceModule]}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{i.assigneeName ?? "Unassigned"}</Table.Td>
                  <Table.Td>{sprint ? sprint.label : "No sprint"}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <PmApprovalBadge value={i.pmApproval} />
                      <Button
                        size="compact-xs"
                        variant="default"
                        loading={approve.isPending && approve.variables?.item.id === i.id}
                        onClick={() =>
                          approve.mutate(
                            { item: i, pmApproval: approved ? "PENDING" : "APPROVED" },
                            { onError: (err) => toast.error(err.message) },
                          )
                        }
                      >
                        {approved ? "Revoke" : "Approve"}
                      </Button>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Button size="compact-xs" variant="default" onClick={() => onEdit(i)}>
                        Edit
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="coral"
                        loading={remove.isPending && remove.variables?.id === i.id}
                        disabled={remove.isPending}
                        onClick={() => {
                          if (!window.confirm(`Delete "${i.title}"? This cannot be undone.`))
                            return;
                          remove.mutate(i, {
                            onSuccess: () => toast.ok("Task deleted"),
                            onError: (err) => toast.error(err.message),
                          });
                        }}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </section>
  );
}

export function AdminLogPage() {
  const isPm = useIsPm();
  const log = useAdminLog();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [sort, setSort] = useState<SortConfig>({ key: null, direction: "asc" });
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: "asc" };
    });
  };

  const hasActiveFilters =
    Boolean(filters.title.trim()) ||
    filters.modules.length > 0 ||
    filters.assignees.length > 0 ||
    filters.sprints.length > 0 ||
    filters.approvals.length > 0;

  const options = useMemo(() => {
    const all = (log.data?.projects ?? []).flatMap((g) => g.items);
    const uniq = (vals: string[]) => [...new Set(vals)].sort((a, b) => a.localeCompare(b));
    return {
      modules: uniq(all.map((i) => MODULE_PILL[i.sourceModule])),
      assignees: uniq(all.map(assigneeLabelFor)),
      sprints: uniq(all.map(sprintLabelFor)),
      approvals: uniq(all.map((i) => i.pmApproval ?? "PENDING")),
    };
  }, [log.data]);

  const filteredProjects = useMemo(() => {
    const q = filters.title.trim().toLowerCase();
    return (log.data?.projects ?? []).map((g) => {
      const items = sortItems(
        g.items.filter((i) => {
          if (
            q &&
            !i.title.toLowerCase().includes(q) &&
            !(i.parentTitle ?? "").toLowerCase().includes(q)
          ) {
            return false;
          }
          if (filters.modules.length > 0 && !filters.modules.includes(MODULE_PILL[i.sourceModule])) {
            return false;
          }
          if (filters.assignees.length > 0 && !filters.assignees.includes(assigneeLabelFor(i))) {
            return false;
          }
          if (filters.sprints.length > 0 && !filters.sprints.includes(sprintLabelFor(i))) {
            return false;
          }
          if (
            filters.approvals.length > 0 &&
            !filters.approvals.includes(i.pmApproval ?? "PENDING")
          ) {
            return false;
          }
          return true;
        }),
        sort,
      );
      const approved = items.filter((i) => isPmApproved(i.pmApproval)).length;
      return {
        ...g,
        items,
        total: items.length,
        approved,
        pending: items.length - approved,
      };
    });
  }, [log.data, filters, sort]);

  if (!isPm) {
    return (
      <Alert color="coral" title="Project managers only">
        The Admin Log is only available to project managers.
      </Alert>
    );
  }
  return (
    <>
      <PageHeader
        title="Admin Log"
        subtitle="Every task across all projects. Tasks can only be completed once you approve them."
        actions={
          hasActiveFilters ? (
            <Button
              size="xs"
              variant="default"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear all filters
            </Button>
          ) : undefined
        }
      />
      <QueryState
        query={log}
        isEmpty={(d) => d.projects.length === 0}
        empty={<Text c="dimmed">No tasks yet.</Text>}
      >
        {() => (
          <Stack gap="xl">
            {filteredProjects.map((g) => (
              <ProjectSection
                key={g.projectId}
                group={g}
                onEdit={setEditing}
                sort={sort}
                onSort={toggleSort}
                filters={filters}
                onFiltersChange={setFilters}
                options={options}
              />
            ))}
          </Stack>
        )}
      </QueryState>
      {editing ? (
        <EditItemModal key={editing.id} item={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
