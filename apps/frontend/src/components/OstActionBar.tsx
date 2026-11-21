import { Button, Divider, Group } from "@mantine/core";
import type { ReactNode } from "react";

export type OstAction = { label: string; onClick: () => void; hint?: string };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const PLUS = (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const TARGET = (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
const LIST = (
  <Icon>
    <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Icon>
);
const PENCIL = (
  <Icon>
    <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
  </Icon>
);
const TRASH = (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);

/** Icon for a workflow action, picked from its label so callers only pass text. */
const workflowIcon = (label: string) => (label === "Target this" ? TARGET : LIST);

/**
 * One action bar per tree item, in three scannable clusters: add things below it, move it through the
 * workflow, and edit or delete it. Every handler is passed in, so the bar is the same on cards and table rows.
 */
export function OstActionBar({
  scope,
  create = [],
  workflow = [],
  onEdit,
  onDelete,
}: {
  scope: string;
  create?: OstAction[];
  workflow?: OstAction[];
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const clusters: ReactNode[] = [];
  if (create.length > 0) {
    clusters.push(
      <Group key="create" gap={4} wrap="nowrap" role="group" aria-label={`Add to ${scope}`}>
        {create.map((a) => (
          <Button
            key={a.label}
            size="compact-xs"
            variant="default"
            leftSection={PLUS}
            title={a.hint ?? a.label}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
      </Group>,
    );
  }
  if (workflow.length > 0) {
    clusters.push(
      <Group key="workflow" gap={4} wrap="nowrap" role="group" aria-label={`Workflow for ${scope}`}>
        {workflow.map((a) => (
          <Button
            key={a.label}
            size="compact-xs"
            variant="light"
            leftSection={workflowIcon(a.label)}
            title={a.hint ?? a.label}
            onClick={a.onClick}
          >
            {a.label}
          </Button>
        ))}
      </Group>,
    );
  }
  if (onEdit || onDelete) {
    clusters.push(
      <Group key="manage" gap={4} wrap="nowrap" role="group" aria-label={`Edit or delete ${scope}`}>
        {onEdit ? (
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={PENCIL}
            title={`Edit ${scope}`}
            onClick={onEdit}
          >
            Edit
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            size="compact-xs"
            variant="subtle"
            color="coral"
            leftSection={TRASH}
            title={`Delete ${scope}`}
            onClick={onDelete}
          >
            Delete
          </Button>
        ) : null}
      </Group>,
    );
  }
  if (clusters.length === 0) return null;
  return (
    <Group
      className="ost-actions"
      gap="xs"
      wrap="wrap"
      justify="flex-end"
      role="toolbar"
      aria-label={`${scope} actions`}
    >
      {clusters.flatMap((c, i) =>
        i === 0 ? [c] : [<Divider key={`d${i}`} orientation="vertical" h={16} my="auto" />, c],
      )}
    </Group>
  );
}
