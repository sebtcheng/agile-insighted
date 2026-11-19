import {
  Badge,
  Checkbox,
  Group,
  NumberInput,
  Progress,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ACTIVITY_STATUSES, ENUM_LABELS, type ActivityDto } from "@myapp/shared";
import { useAuth, useIsPm } from "../auth";
import { PriorityBadge, StatusBadge, WorkTypeBadge, fmtDate } from "./ui";
import { useGovernedUpdate } from "./useGovernedUpdate";

/** Opens the activity drawer by setting ?activity=<id> on the current page. */
export function useOpenActivity() {
  const [params, setParams] = useSearchParams();
  return (id: string) => {
    const next = new URLSearchParams(params);
    next.set("activity", id);
    setParams(next);
  };
}

export type RowActivity = ActivityDto & { isOverdue?: boolean; atRisk?: boolean };

/**
 * One activity as a row: title, subproject, assignee, badges, due date, status and progress, with overdue,
 * blocked and waiting indicators. The assignee (or a PM) can change status and progress inline; if a governance
 * rule stops the change, the drawer opens so the reason and the way forward are visible.
 */
export function ActivityRow({
  activity,
  showAssignee = true,
  checkable = false,
}: {
  activity: RowActivity;
  showAssignee?: boolean;
  /** Adds the leftmost completion checkbox (same governed update as the status select). */
  checkable?: boolean;
}) {
  const user = useAuth();
  const isPm = useIsPm();
  const open = useOpenActivity();
  const editable = isPm || activity.assigneeId === user.id;
  const gov = useGovernedUpdate(activity.id);
  const [percent, setPercent] = useState<number | string>(activity.percentComplete);
  const done = activity.status === "done";

  const change = async (patch: Parameters<typeof gov.run>[0]) => {
    const res = await gov.run(patch);
    // A refused change (Definition of Done, sprint trade) continues in the drawer.
    if (!res) open(activity.id);
  };

  return (
    <Stack gap={6} p="sm" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        {checkable ? (
          <Checkbox
            size="xs"
            mt={4}
            checked={done}
            disabled={!editable || gov.isPending}
            aria-label={`${done ? "Reopen" : "Complete"} ${activity.title}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              void change({ status: e.currentTarget.checked ? "done" : "in_progress" })
            }
          />
        ) : null}
        <UnstyledButton
          onClick={() => open(activity.id)}
          style={{ flex: 1, minWidth: 0 }}
          aria-label={`Open ${activity.title}`}
        >
          <Text
            fw={600}
            td={done ? "line-through" : undefined}
            c={done ? "dimmed" : undefined}
            lineClamp={2}
          >
            {activity.title}
          </Text>
          <Text size="xs" c="dimmed">
            {activity.subprojectCode
              ? `${activity.subprojectCode} ${activity.subprojectName ?? ""}`
              : "No subproject"}
            {showAssignee ? ` · ${activity.assigneeName ?? "Unassigned"}` : ""}
          </Text>
        </UnstyledButton>
        <Group gap={6} wrap="wrap" justify="flex-end">
          {activity.isOverdue ? <Badge color="red">Overdue</Badge> : null}
          {activity.isBlocked ? (
            <Tooltip label={activity.blockedReason ?? "Blocked"}>
              <Badge color="red" variant="light">
                Blocked
              </Badge>
            </Tooltip>
          ) : null}
          {activity.waitingOnDependency ? (
            <Badge color="orange" variant="light">
              Waiting on dependency
            </Badge>
          ) : null}
          <PriorityBadge priority={activity.priority} />
          <WorkTypeBadge type={activity.workType} />
        </Group>
      </Group>
      <Group gap="md" wrap="wrap" align="flex-end">
        <Text size="sm" c={activity.isOverdue ? "red" : "dimmed"} miw={110}>
          Due {fmtDate(activity.dueDate)}
        </Text>
        {editable && !done ? (
          <>
            <Select
              aria-label={`Status of ${activity.title}`}
              size="xs"
              w={140}
              allowDeselect={false}
              value={activity.status}
              data={ACTIVITY_STATUSES.map((s) => ({ value: s, label: ENUM_LABELS.status[s] }))}
              disabled={gov.isPending}
              onChange={(v) => v && void change({ status: v as ActivityDto["status"] })}
            />
            <NumberInput
              aria-label={`Percent complete of ${activity.title}`}
              size="xs"
              w={90}
              min={0}
              max={100}
              step={5}
              suffix="%"
              value={percent}
              onChange={setPercent}
              onBlur={() => {
                const n = Number(percent);
                if (Number.isFinite(n) && n !== activity.percentComplete)
                  void change({ percentComplete: n });
              }}
            />
          </>
        ) : (
          <StatusBadge status={activity.status} />
        )}
        <Progress
          value={activity.percentComplete}
          style={{ flex: 1, minWidth: 80 }}
          aria-label={`${activity.percentComplete}% complete`}
        />
      </Group>
    </Stack>
  );
}
