import { Badge, Group, SimpleGrid, Table, Text } from "@mantine/core";
import {
  SOURCE_MODULE_LABELS,
  type ScheduleStatus,
  type WorkBreakdownRow,
  type WorkItem,
  type WorkSummary,
} from "@myapp/shared";
import { fmtDate } from "./ui";

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

/** One non-project work item: source module, title, assignee, due date and schedule status. */
export function WorkItemRow({ item }: { item: WorkItem }) {
  return (
    <Group justify="space-between" wrap="nowrap" py={4} px="sm" data-testid="work-item-row">
      <div style={{ minWidth: 0 }}>
        <Text size="sm" lineClamp={1}>
          {item.title}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={1}>
          {item.parentTitle ?? SOURCE_MODULE_LABELS[item.sourceModule]}
          {item.assigneeName ? ` · ${item.assigneeName}` : ""}
        </Text>
      </div>
      <Group gap={6} wrap="nowrap">
        <Badge variant="outline" color="gray">
          {SOURCE_MODULE_LABELS[item.sourceModule]}
        </Badge>
        <ScheduleBadge status={item.scheduleStatus} />
        <Text size="xs" c="dimmed" miw={90}>
          {fmtDate(item.dueDate)}
        </Text>
      </Group>
    </Group>
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
