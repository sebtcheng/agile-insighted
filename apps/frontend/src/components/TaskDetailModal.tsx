import { useState } from "react";
import { Badge, Button, Divider, Group, Modal, Stack, Text } from "@mantine/core";
import { SOURCE_MODULE_LABELS, type ScheduleStatus, type WorkItem } from "@myapp/shared";
import { useToggleWorkItem } from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { fmtDate, toast } from "./ui";
import { approvalGateProps, PmApprovalBadge } from "./PmApprovalBadge";
import { useGovernedUpdate } from "./useGovernedUpdate";

const SCHEDULE_LABELS: Record<ScheduleStatus, { label: string; color: string }> = {
  completed_on_time: { label: "On time", color: "teal" },
  completed_delayed: { label: "Delayed", color: "coral" },
  completed: { label: "Completed", color: "teal" },
  ongoing_on_time: { label: "On time", color: "teal" },
  delayed: { label: "Delayed", color: "coral" },
  no_due_date: { label: "Ongoing", color: "navy" },
};

export function TaskDetailModal({
  item,
  projectName,
  onClose,
}: {
  item: WorkItem | null;
  projectName?: string;
  onClose: () => void;
}) {
  const user = useAuth();
  const isPm = useIsPm();
  const toggle = useToggleWorkItem();
  const gov = useGovernedUpdate(item?.id ?? "");
  const [override, setOverride] = useState<{ id: string; completed: boolean } | null>(null);

  if (!item) return null;

  const completed = override?.id === item.id ? override.completed : item.isCompleted;
  const sched = SCHEDULE_LABELS[item.scheduleStatus];
  const isProject = item.sourceModule === "project";
  const canEdit = !isProject || isPm || item.assigneeId === user.id;
  const gate = approvalGateProps(item.pmApproval);
  const isPending = toggle.isPending || gov.isPending;
  const disabled = !canEdit || isPending || gate.disabled;

  const handleToggle = () => {
    const next = !completed;
    if (isProject) {
      void gov.run({ status: next ? "done" : "in_progress" }).then((res) => {
        if (res) setOverride({ id: item.id, completed: next });
      });
      return;
    }
    toggle.mutate(
      { item, isCompleted: next },
      {
        onSuccess: () => setOverride({ id: item.id, completed: next }),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Modal
      opened={!!item}
      onClose={onClose}
      title={item.title}
      size="md"
      centered
      styles={{
        header: { alignItems: "flex-start" },
        title: { fontSize: "18px", lineHeight: 1.35, fontWeight: 700, wordBreak: "break-word" },
        body: { maxHeight: "85vh", overflowY: "auto", paddingTop: "14px" },
      }}
    >
      <Stack gap="sm">
        <Group gap="xs" wrap="wrap">
          <Badge variant="outline" color="navy">
            {SOURCE_MODULE_LABELS[item.sourceModule]}
          </Badge>
          <Badge variant="light" color={sched.color}>
            {sched.label}
          </Badge>
          <PmApprovalBadge value={item.pmApproval} />
        </Group>

        <Divider />

        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start">
            <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              Project
            </Text>
            <Text size="sm" ta="right" style={{ wordBreak: "break-word" }}>
              {projectName ?? "—"}
            </Text>
          </Group>
          <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start">
            <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              Parent Context
            </Text>
            <Text size="sm" ta="right" style={{ wordBreak: "break-word" }}>
              {item.parentTitle ?? "—"}
            </Text>
          </Group>
          <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start">
            <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              Assignee
            </Text>
            <Text size="sm" ta="right" style={{ wordBreak: "break-word" }}>
              {item.assigneeName ?? "Unassigned"}
            </Text>
          </Group>
          <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start">
            <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              Due Date
            </Text>
            <Text size="sm" ta="right">
              {item.dueDate ? fmtDate(item.dueDate) : "No due date"}
            </Text>
          </Group>
          <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start">
            <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              Schedule Status
            </Text>
            <Text size="sm" ta="right">
              {sched.label}
            </Text>
          </Group>
          <Group justify="space-between" wrap="nowrap" gap="md" align="flex-start">
            <Text size="xs" c="dimmed" fw={600} style={{ flexShrink: 0 }}>
              Completion
            </Text>
            <Text size="sm" ta="right">
              {completed
                ? item.completedAt
                  ? `Completed (${fmtDate(item.completedAt)})`
                  : "Completed"
                : "Incomplete"}
            </Text>
          </Group>
        </Stack>

        <Divider />

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          <Button
            color={completed ? "gray" : "teal"}
            disabled={disabled}
            loading={isPending}
            title={gate.title}
            onClick={handleToggle}
          >
            {completed ? "Mark as incomplete" : "Mark as completed"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
