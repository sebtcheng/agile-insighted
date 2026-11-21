import { Button, Group, Modal, Text } from "@mantine/core";
import { SOURCE_MODULE_LABELS, type WorkItem } from "@myapp/shared";
import { useDeleteWorkItem } from "../api/adminLog";
import { toast } from "./ui";

/** Confirms, then deletes one task (only that task) via the shared work-item endpoint. */
export function DeleteTaskModal({
  item,
  projectName,
  onClose,
}: {
  item: WorkItem | null;
  projectName?: string;
  onClose: () => void;
}) {
  const remove = useDeleteWorkItem();
  const busy = remove.isPending;
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      opened={item !== null}
      onClose={close}
      title="Delete task"
      centered
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      {item ? (
        <>
          <Text fw={600}>{item.title}</Text>
          <Text size="sm" c="dimmed" mb="sm">
            {SOURCE_MODULE_LABELS[item.sourceModule]}
            {projectName ? ` · ${projectName}` : ""}
          </Text>
          <Text size="sm" mb="md">
            This permanently deletes the task and cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              color="coral"
              loading={busy}
              onClick={() =>
                remove.mutate(item, {
                  onSuccess: () => {
                    toast.ok("Task deleted");
                    onClose();
                  },
                  onError: (err) => toast.error(err.message),
                })
              }
            >
              Delete
            </Button>
          </Group>
        </>
      ) : null}
    </Modal>
  );
}
