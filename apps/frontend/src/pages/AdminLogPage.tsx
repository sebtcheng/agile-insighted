import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  PM_APPROVALS,
  isPmApproved,
  resolveStoredSprint,
  type AdminLogItemPatch,
  type AdminLogProjectGroup,
  type PmApproval,
  type WorkItem,
  type WorkSourceModule,
} from "@myapp/shared";
import { useAdminLog, useSetApproval, useUpdateAdminLogItem } from "../api/adminLog";
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
}: {
  group: AdminLogProjectGroup;
  onEdit: (item: WorkItem) => void;
}) {
  const update = useUpdateAdminLogItem();
  const approve = useSetApproval();
  return (
    <section aria-label={group.projectName} data-testid="admin-log-project">
      <Group gap="sm" mb="xs">
        <Text fw={700} fz="lg" component="h2" m={0}>
          {group.projectName}
        </Text>
        <Badge variant="outline" color="gray">
          {group.total} {group.total === 1 ? "task" : "tasks"}
        </Badge>
        {group.pending > 0 ? (
          <Badge variant="light" color="gray">
            {group.pending} pending
          </Badge>
        ) : null}
      </Group>
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={36} aria-label="Done" />
              <Table.Th>Task</Table.Th>
              <Table.Th>Module</Table.Th>
              <Table.Th>Person responsible</Table.Th>
              <Table.Th>Sprint / Target date</Table.Th>
              <Table.Th>PM Approval</Table.Th>
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
                    <Badge variant="outline" color="gray">
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
                    <Button size="compact-xs" variant="default" onClick={() => onEdit(i)}>
                      Edit
                    </Button>
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
  if (!isPm) {
    return (
      <Alert color="red" title="Project managers only">
        The Admin Log is only available to project managers.
      </Alert>
    );
  }
  return (
    <>
      <PageHeader
        title="Admin Log"
        subtitle="Every task across all projects. Tasks can only be completed once you approve them."
      />
      <QueryState
        query={log}
        isEmpty={(d) => d.projects.length === 0}
        empty={<Text c="dimmed">No tasks yet.</Text>}
      >
        {(data) => (
          <Stack gap="xl">
            {data.projects.map((g) => (
              <ProjectSection key={g.projectId} group={g} onEdit={setEditing} />
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
