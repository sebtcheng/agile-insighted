import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  SOURCE_MODULE_LABELS,
  sortTasksOngoingFirst,
  type ScheduleStatus,
  type WorkBreakdownRow,
  type WorkItem,
  type WorkSummary,
} from "@myapp/shared";
import { ColumnHeader, compareNullable, toggleSortConfig, type SortConfig } from "./ColumnHeader";
import { TaskDetailModal } from "./TaskDetailModal";
import { useToggleWorkItem } from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { isCheckable } from "../lib/workItemToggle";
import { useOpenActivity } from "./ActivityRow";
import { DeleteTaskModal } from "./DeleteTaskModal";
import { PmApprovalBadge, approvalGateProps } from "./PmApprovalBadge";
import { fmtDate, toast } from "./ui";
import { useGovernedUpdate } from "./useGovernedUpdate";

export type WorkView = "table" | "list" | "cards";

export const SCHEDULE_LABEL: Record<ScheduleStatus, string> = {
  completed_on_time: "Completed on time",
  completed_delayed: "Completed late",
  completed: "Completed",
  ongoing_on_time: "Ongoing",
  delayed: "Delayed",
  no_due_date: "No due date",
};
const SCHEDULE_COLOR: Record<ScheduleStatus, string> = {
  completed_on_time: "green",
  completed_delayed: "orange",
  completed: "green",
  ongoing_on_time: "blue",
  delayed: "red",
  no_due_date: "gray",
};

export function ScheduleBadge({ status }: { status: ScheduleStatus }) {
  return (
    <Badge variant="light" color={SCHEDULE_COLOR[status]}>
      {SCHEDULE_LABEL[status]}
    </Badge>
  );
}

/**
 * Leftmost completion checkbox for any work item. Module items call that module's own toggle endpoint; project
 * activities use the governed status update (a refused change continues in the activity drawer). It never
 * triggers the row's own click, is disabled while its request is in flight, and rolls back with a toast on error.
 */
export function WorkItemCheck({ item }: { item: WorkItem }) {
  const user = useAuth();
  const isPm = useIsPm();
  const toggle = useToggleWorkItem();
  const gov = useGovernedUpdate(item.id);
  const openActivity = useOpenActivity();
  const isProject = item.sourceModule === "project";
  const canEdit = !isProject || isPm || item.assigneeId === user.id;
  const gate = approvalGateProps(item.pmApproval);
  const disabled =
    !isCheckable(item) || !canEdit || toggle.isPending || gov.isPending || gate.disabled;
  const onChange = (checked: boolean) => {
    if (isProject) {
      void gov.run({ status: checked ? "done" : "in_progress" }).then((res) => {
        if (!res) openActivity(item.id);
      });
      return;
    }
    toggle.mutate({ item, isCompleted: checked }, { onError: (err) => toast.error(err.message) });
  };
  return (
    <span
      style={{ display: "inline-flex" }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      title={gate.title}
    >
      <Checkbox
        size="xs"
        checked={item.isCompleted}
        disabled={disabled}
        aria-disabled={gate["aria-disabled"]}
        aria-label={`${item.isCompleted ? "Reopen" : "Complete"} ${item.title}`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </span>
  );
}

/** One non-project work item: source module, title, assignee, due date and schedule status. */
export function WorkItemRow({
  item,
  detailed = false,
  onOpen,
  checkable = false,
}: {
  item: WorkItem;
  /** Adds the leftmost completion checkbox. */
  checkable?: boolean;
  /** Spell out an empty assignee ("Unassigned") and an empty date ("No due date"). */
  detailed?: boolean;
  /** Makes the whole row a button, e.g. to open a project activity. */
  onOpen?: () => void;
}) {
  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      py={4}
      px="sm"
      data-testid="work-item-row"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      style={onOpen ? { cursor: "pointer" } : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
        {checkable ? <WorkItemCheck item={item} /> : null}
        <div style={{ minWidth: 0 }}>
          <Text
            size="sm"
            lineClamp={1}
            td={item.isCompleted ? "line-through" : undefined}
            c={item.isCompleted ? "dimmed" : undefined}
          >
            {item.title}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {item.parentTitle ?? SOURCE_MODULE_LABELS[item.sourceModule]}
            {item.assigneeName ? ` · ${item.assigneeName}` : detailed ? " · Unassigned" : ""}
          </Text>
        </div>
      </Group>
      <Group gap={6} wrap="nowrap">
        <Badge variant="outline" color="navy">
          {SOURCE_MODULE_LABELS[item.sourceModule]}
        </Badge>
        <ScheduleBadge status={item.scheduleStatus} />
        <PmApprovalBadge value={item.pmApproval} />
        <Text size="xs" c="dimmed" miw={90}>
          {item.dueDate || !detailed ? fmtDate(item.dueDate) : "No due date"}
        </Text>
      </Group>
    </Group>
  );
}

type WorkColKey = "title" | "project" | "module" | "assignee" | "status" | "dueDate" | "pmApproval";
type WorkColFilters = {
  title: string;
  projects: string[];
  modules: string[];
  assignees: string[];
  statuses: string[];
  approvals: string[];
};
const EMPTY_WORK_FILTERS: WorkColFilters = {
  title: "",
  projects: [],
  modules: [],
  assignees: [],
  statuses: [],
  approvals: [],
};

/** Work items as a table with the project as its own column. */
export function WorkItemsTable({
  items,
  projectNames,
  onOpen,
  checkable = false,
  deletable = false,
}: {
  items: WorkItem[];
  projectNames: Map<string, string>;
  checkable?: boolean;
  /** Adds a Delete column right of PM Approval (any role) with a confirmation modal. */
  deletable?: boolean;
  /** Returns a click handler for items that can be opened, or undefined for those that cannot. */
  onOpen?: (item: WorkItem) => (() => void) | undefined;
}) {
  const [pendingDelete, setPendingDelete] = useState<WorkItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<WorkItem | null>(null);
  const [sort, setSort] = useState<SortConfig<WorkColKey>>({ key: null, direction: "asc" });
  const [filters, setFilters] = useState<WorkColFilters>(EMPTY_WORK_FILTERS);

  const hasFilters =
    filters.title.trim().length > 0 ||
    filters.projects.length > 0 ||
    filters.modules.length > 0 ||
    filters.assignees.length > 0 ||
    filters.statuses.length > 0 ||
    filters.approvals.length > 0;

  const projectOpts = useMemo(
    () => [...new Set(items.map((i) => projectNames.get(i.projectId) ?? "—"))].sort(),
    [items, projectNames],
  );
  const moduleOpts = useMemo(
    () => [...new Set(items.map((i) => SOURCE_MODULE_LABELS[i.sourceModule]))].sort(),
    [items],
  );
  const assigneeOpts = useMemo(
    () => [...new Set(items.map((i) => i.assigneeName ?? "Unassigned"))].sort(),
    [items],
  );
  const statusOpts = useMemo(
    () => [...new Set(items.map((i) => SCHEDULE_LABEL[i.scheduleStatus]))].sort(),
    [items],
  );
  const approvalOpts = useMemo(
    () => [...new Set(items.map((i) => i.pmApproval ?? "PENDING"))].sort(),
    [items],
  );

  const visible = useMemo(() => {
    const q = filters.title.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (q && !i.title.toLowerCase().includes(q)) return false;
      if (filters.projects.length && !filters.projects.includes(projectNames.get(i.projectId) ?? "—"))
        return false;
      if (filters.modules.length && !filters.modules.includes(SOURCE_MODULE_LABELS[i.sourceModule]))
        return false;
      if (filters.assignees.length && !filters.assignees.includes(i.assigneeName ?? "Unassigned"))
        return false;
      if (filters.statuses.length && !filters.statuses.includes(SCHEDULE_LABEL[i.scheduleStatus]))
        return false;
      if (filters.approvals.length && !filters.approvals.includes(i.pmApproval ?? "PENDING"))
        return false;
      return true;
    });
    if (!sort.key) return sortTasksOngoingFirst(filtered);
    const { key, direction } = sort;
    return [...filtered].sort((a, b) => {
      switch (key) {
        case "title":
          return compareNullable(a.title, b.title, direction);
        case "project":
          return compareNullable(
            projectNames.get(a.projectId) ?? null,
            projectNames.get(b.projectId) ?? null,
            direction,
          );
        case "module":
          return compareNullable(
            SOURCE_MODULE_LABELS[a.sourceModule],
            SOURCE_MODULE_LABELS[b.sourceModule],
            direction,
          );
        case "assignee":
          return compareNullable(a.assigneeName, b.assigneeName, direction);
        case "status":
          return compareNullable(
            SCHEDULE_LABEL[a.scheduleStatus],
            SCHEDULE_LABEL[b.scheduleStatus],
            direction,
          );
        case "dueDate":
          return compareNullable(a.dueDate, b.dueDate, direction);
        case "pmApproval":
          return compareNullable(a.pmApproval ?? "PENDING", b.pmApproval ?? "PENDING", direction);
      }
    });
  }, [items, filters, sort, projectNames]);

  const handleSort = (key: WorkColKey) => setSort((prev) => toggleSortConfig(prev, key));

  return (
    <>
      {hasFilters ? (
        <Group justify="flex-end" mb={4}>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => setFilters(EMPTY_WORK_FILTERS)}
          >
            Clear column filters
          </Button>
        </Group>
      ) : null}
      <Table verticalSpacing={4} fz="sm" mb="xs">
        <Table.Thead>
          <Table.Tr>
            {checkable ? <Table.Th w={36} aria-label="Done" /> : null}
            <ColumnHeader
              label="Task"
              colKey="title"
              sort={sort}
              onSort={handleSort}
              activeFilterCount={filters.title ? 1 : 0}
              onClearFilter={() => setFilters((f) => ({ ...f, title: "" }))}
            >
              <TextInput
                size="xs"
                placeholder="Search task..."
                value={filters.title}
                onChange={(e) => setFilters((f) => ({ ...f, title: e.currentTarget.value }))}
              />
            </ColumnHeader>
            <ColumnHeader
              label="Project"
              colKey="project"
              sort={sort}
              onSort={handleSort}
              activeFilterCount={filters.projects.length}
              onClearFilter={() => setFilters((f) => ({ ...f, projects: [] }))}
            >
              <Checkbox.Group
                value={filters.projects}
                onChange={(v) => setFilters((f) => ({ ...f, projects: v }))}
              >
                <Stack gap={4}>
                  {projectOpts.map((opt) => (
                    <Checkbox key={opt} size="xs" value={opt} label={opt} />
                  ))}
                </Stack>
              </Checkbox.Group>
            </ColumnHeader>
            <ColumnHeader
              label="Module"
              colKey="module"
              sort={sort}
              onSort={handleSort}
              activeFilterCount={filters.modules.length}
              onClearFilter={() => setFilters((f) => ({ ...f, modules: [] }))}
            >
              <Checkbox.Group
                value={filters.modules}
                onChange={(v) => setFilters((f) => ({ ...f, modules: v }))}
              >
                <Stack gap={4}>
                  {moduleOpts.map((opt) => (
                    <Checkbox key={opt} size="xs" value={opt} label={opt} />
                  ))}
                </Stack>
              </Checkbox.Group>
            </ColumnHeader>
            <ColumnHeader
              label="Assignee"
              colKey="assignee"
              sort={sort}
              onSort={handleSort}
              activeFilterCount={filters.assignees.length}
              onClearFilter={() => setFilters((f) => ({ ...f, assignees: [] }))}
            >
              <Checkbox.Group
                value={filters.assignees}
                onChange={(v) => setFilters((f) => ({ ...f, assignees: v }))}
              >
                <Stack gap={4}>
                  {assigneeOpts.map((opt) => (
                    <Checkbox key={opt} size="xs" value={opt} label={opt} />
                  ))}
                </Stack>
              </Checkbox.Group>
            </ColumnHeader>
            <ColumnHeader
              label="Status"
              colKey="status"
              sort={sort}
              onSort={handleSort}
              activeFilterCount={filters.statuses.length}
              onClearFilter={() => setFilters((f) => ({ ...f, statuses: [] }))}
            >
              <Checkbox.Group
                value={filters.statuses}
                onChange={(v) => setFilters((f) => ({ ...f, statuses: v }))}
              >
                <Stack gap={4}>
                  {statusOpts.map((opt) => (
                    <Checkbox key={opt} size="xs" value={opt} label={opt} />
                  ))}
                </Stack>
              </Checkbox.Group>
            </ColumnHeader>
            <ColumnHeader label="Due date" colKey="dueDate" sort={sort} onSort={handleSort} />
            <ColumnHeader
              label="PM Approval"
              colKey="pmApproval"
              sort={sort}
              onSort={handleSort}
              activeFilterCount={filters.approvals.length}
              onClearFilter={() => setFilters((f) => ({ ...f, approvals: [] }))}
            >
              <Checkbox.Group
                value={filters.approvals}
                onChange={(v) => setFilters((f) => ({ ...f, approvals: v }))}
              >
                <Stack gap={4}>
                  {approvalOpts.map((opt) => (
                    <Checkbox key={opt} size="xs" value={opt} label={opt} />
                  ))}
                </Stack>
              </Checkbox.Group>
            </ColumnHeader>
            {deletable ? <Table.Th>Delete</Table.Th> : null}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((i) => {
            const open = onOpen?.(i) ?? (() => setSelectedTask(i));
            return (
              <Table.Tr
                key={`${i.sourceModule}-${i.id}`}
                data-testid="work-item-row"
                onClick={open}
                style={{ cursor: "pointer" }}
              >
                {checkable ? (
                  <Table.Td>
                    <WorkItemCheck item={i} />
                  </Table.Td>
                ) : null}
                <Table.Td>
                  <Text
                    size="sm"
                    lineClamp={1}
                    td={i.isCompleted ? "line-through" : undefined}
                    c={i.isCompleted ? "dimmed" : undefined}
                  >
                    {i.title}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {i.parentTitle ?? SOURCE_MODULE_LABELS[i.sourceModule]}
                  </Text>
                </Table.Td>
                <Table.Td>{projectNames.get(i.projectId) ?? "—"}</Table.Td>
                <Table.Td>
                  <Badge variant="outline" color="navy">
                    {SOURCE_MODULE_LABELS[i.sourceModule]}
                  </Badge>
                </Table.Td>
                <Table.Td>{i.assigneeName ?? "Unassigned"}</Table.Td>
                <Table.Td>
                  <ScheduleBadge status={i.scheduleStatus} />
                </Table.Td>
                <Table.Td>{i.dueDate ? fmtDate(i.dueDate) : "No due date"}</Table.Td>
                <Table.Td>
                  <PmApprovalBadge value={i.pmApproval} />
                </Table.Td>
                {deletable ? (
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="coral"
                      aria-label={`Delete ${i.title}`}
                      onClick={() => setPendingDelete(i)}
                    >
                      Delete
                    </Button>
                  </Table.Td>
                ) : null}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      {deletable ? (
        <DeleteTaskModal
          item={pendingDelete}
          projectName={pendingDelete ? projectNames.get(pendingDelete.projectId) : undefined}
          onClose={() => setPendingDelete(null)}
        />
      ) : null}
      <TaskDetailModal
        item={selectedTask}
        projectName={selectedTask ? projectNames.get(selectedTask.projectId) : undefined}
        onClose={() => setSelectedTask(null)}
      />
    </>
  );
}

/** Work items as cards in a responsive grid. */
export function WorkItemsCards({
  items,
  projectNames,
  onOpen,
  checkable = false,
}: {
  items: WorkItem[];
  projectNames: Map<string, string>;
  checkable?: boolean;
  onOpen?: (item: WorkItem) => (() => void) | undefined;
}) {
  const [selectedTask, setSelectedTask] = useState<WorkItem | null>(null);
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} p="sm">
        {items.map((i) => {
          const open = onOpen?.(i) ?? (() => setSelectedTask(i));
          return (
            <Card
              key={`${i.sourceModule}-${i.id}`}
              withBorder
              padding="sm"
              data-testid="work-item-row"
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }}
              style={{ cursor: "pointer" }}
            >
          <Group justify="space-between" wrap="nowrap" mb={4}>
            <Group gap="xs" wrap="nowrap">
              {checkable ? <WorkItemCheck item={i} /> : null}
              <Badge variant="outline" color="navy">
                {SOURCE_MODULE_LABELS[i.sourceModule]}
              </Badge>
            </Group>
            <Group gap={6} wrap="nowrap">
              <PmApprovalBadge value={i.pmApproval} />
              <ScheduleBadge status={i.scheduleStatus} />
            </Group>
          </Group>
          <Text
            size="sm"
            fw={600}
            lineClamp={2}
            td={i.isCompleted ? "line-through" : undefined}
            c={i.isCompleted ? "dimmed" : undefined}
          >
            {i.title}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {i.parentTitle ?? SOURCE_MODULE_LABELS[i.sourceModule]}
          </Text>
          <Text size="xs" c="dimmed" mt={6}>
            {projectNames.get(i.projectId) ?? "—"} · {i.assigneeName ?? "Unassigned"} ·{" "}
            {i.dueDate ? fmtDate(i.dueDate) : "No due date"}
          </Text>
            </Card>
          );
        })}
      </SimpleGrid>
      <TaskDetailModal
        item={selectedTask}
        projectName={selectedTask ? projectNames.get(selectedTask.projectId) : undefined}
        onClose={() => setSelectedTask(null)}
      />
    </>
  );
}

/** Renders work items in the chosen view: table, list (rows) or cards. */
export function WorkItemsView({
  items,
  view,
  projectNames,
  onOpen,
  detailed = false,
  checkable = false,
  deletable = false,
}: {
  items: WorkItem[];
  view: WorkView;
  /** Table view only: adds the Delete column. */
  deletable?: boolean;
  /** Adds the leftmost completion checkbox in every view. */
  checkable?: boolean;
  projectNames: Map<string, string>;
  onOpen?: (item: WorkItem) => (() => void) | undefined;
  /** List view only: spell out an empty assignee and date. */
  detailed?: boolean;
}) {
  const [selectedTask, setSelectedTask] = useState<WorkItem | null>(null);
  if (view === "table")
    return (
      <WorkItemsTable
        items={items}
        projectNames={projectNames}
        onOpen={onOpen}
        checkable={checkable}
        deletable={deletable}
      />
    );
  if (view === "cards")
    return (
      <WorkItemsCards
        items={items}
        projectNames={projectNames}
        onOpen={onOpen}
        checkable={checkable}
      />
    );
  return (
    <>
      {items.map((i) => (
        <WorkItemRow
          key={`${i.sourceModule}-${i.id}`}
          item={i}
          detailed={detailed}
          onOpen={onOpen?.(i) ?? (() => setSelectedTask(i))}
          checkable={checkable}
        />
      ))}
      <TaskDetailModal
        item={selectedTask}
        projectName={selectedTask ? projectNames.get(selectedTask.projectId) : undefined}
        onClose={() => setSelectedTask(null)}
      />
    </>
  );
}

/** The Table / List / Cards switch shared by Home and the project page. */
export function WorkViewSwitch({
  value,
  onChange,
}: {
  value: WorkView;
  onChange: (v: WorkView) => void;
}) {
  return (
    <SegmentedControl
      size="xs"
      aria-label="View"
      value={value}
      onChange={(v) => onChange(v as WorkView)}
      data={[
        { value: "table", label: "Table" },
        { value: "list", label: "List" },
        { value: "cards", label: "Cards" },
      ]}
    />
  );
}

export function SummaryStrip({ summary }: { summary: WorkSummary }) {
  const cells: Array<[string, number]> = [
    ["Ongoing", summary.ongoing],
    ["On time", summary.onTime],
    ["Delayed", summary.delayed],
    ["Completed", summary.completed],
  ];
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" data-testid="work-summary">
      {cells.map(([label, n]) => (
        <div key={label} className="lp-tile" data-tone={label.replace(" ", "-").toLowerCase()}>
          <Text className="lp-label">{label}</Text>
          <Text className="lp-stat">{n}</Text>
        </div>
      ))}
    </SimpleGrid>
  );
}

export function BreakdownTable({ title, rows }: { title: string; rows: WorkBreakdownRow[] }) {
  return (
    <Table verticalSpacing="xs" aria-label={title}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{title}</Table.Th>
          <Table.Th>Total</Table.Th>
          <Table.Th>Completed</Table.Th>
          <Table.Th>Ongoing</Table.Th>
          <Table.Th>On time</Table.Th>
          <Table.Th>Delayed</Table.Th>
          <Table.Th>No due date</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.key}>
            <Table.Td>{r.label}</Table.Td>
            <Table.Td>{r.total}</Table.Td>
            <Table.Td>
              {r.completed} ({r.completionRate}%)
            </Table.Td>
            <Table.Td>{r.ongoing}</Table.Td>
            <Table.Td>{r.onTime}</Table.Td>
            <Table.Td>{r.delayed}</Table.Td>
            <Table.Td>{r.unscheduled}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
