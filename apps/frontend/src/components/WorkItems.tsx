import {
  Badge,
  Card,
  Checkbox,
  Group,
  SegmentedControl,
  SimpleGrid,
  Table,
  Text,
} from "@mantine/core";
import {
  SOURCE_MODULE_LABELS,
  type ScheduleStatus,
  type WorkBreakdownRow,
  type WorkItem,
  type WorkSummary,
} from "@myapp/shared";
import { useToggleWorkItem } from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { isCheckable } from "../lib/workItemToggle";
import { useOpenActivity } from "./ActivityRow";
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
        <Badge variant="outline" color="gray">
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

/** Work items as a table with the project as its own column. */
export function WorkItemsTable({
  items,
  projectNames,
  onOpen,
  checkable = false,
}: {
  items: WorkItem[];
  projectNames: Map<string, string>;
  checkable?: boolean;
  /** Returns a click handler for items that can be opened, or undefined for those that cannot. */
  onOpen?: (item: WorkItem) => (() => void) | undefined;
}) {
  return (
    <Table verticalSpacing={4} fz="sm" mb="xs">
      <Table.Thead>
        <Table.Tr>
          {checkable ? <Table.Th w={36} aria-label="Done" /> : null}
          <Table.Th>Task</Table.Th>
          <Table.Th>Project</Table.Th>
          <Table.Th>Module</Table.Th>
          <Table.Th>Assignee</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Due date</Table.Th>
          <Table.Th>PM Approval</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {items.map((i) => {
          const open = onOpen?.(i);
          return (
            <Table.Tr
              key={`${i.sourceModule}-${i.id}`}
              data-testid="work-item-row"
              onClick={open}
              style={open ? { cursor: "pointer" } : undefined}
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
                <Badge variant="outline" color="gray">
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
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
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
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} p="sm">
      {items.map((i) => (
        <Card
          key={`${i.sourceModule}-${i.id}`}
          withBorder
          padding="sm"
          data-testid="work-item-row"
          onClick={onOpen?.(i)}
          style={onOpen?.(i) ? { cursor: "pointer" } : undefined}
        >
          <Group justify="space-between" wrap="nowrap" mb={4}>
            <Group gap="xs" wrap="nowrap">
              {checkable ? <WorkItemCheck item={i} /> : null}
              <Badge variant="outline" color="gray">
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
      ))}
    </SimpleGrid>
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
}: {
  items: WorkItem[];
  view: WorkView;
  /** Adds the leftmost completion checkbox in every view. */
  checkable?: boolean;
  projectNames: Map<string, string>;
  onOpen?: (item: WorkItem) => (() => void) | undefined;
  /** List view only: spell out an empty assignee and date. */
  detailed?: boolean;
}) {
  if (view === "table")
    return (
      <WorkItemsTable
        items={items}
        projectNames={projectNames}
        onOpen={onOpen}
        checkable={checkable}
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
          onOpen={onOpen?.(i)}
          checkable={checkable}
        />
      ))}
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
    <SimpleGrid cols={{ base: 2, sm: 4 }} data-testid="work-summary">
      {cells.map(([label, n]) => (
        <div key={label}>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {label}
          </Text>
          <Text fw={600} fz="lg">
            {n}
          </Text>
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
