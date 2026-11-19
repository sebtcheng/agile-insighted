import { ActionIcon, Button, Checkbox, Group, Stack, Text, TextInput } from "@mantine/core";
import { MAX_MITIGATING_ACTIONS, type RaidItemDto } from "@myapp/shared";
import { useToggleMitigatingAction } from "../api/hooks";
import { toast } from "./ui";

/** Editable row in the drawer. `id` is set for rows that already exist on the server. */
export type MitigatingActionDraft = { id?: string; description: string; isCompleted: boolean };

/** Drawer control: add, rename, remove and tick actions. The whole list is saved with the item. */
export function MitigatingActionsField({
  value,
  onChange,
}: {
  value: MitigatingActionDraft[];
  onChange: (next: MitigatingActionDraft[]) => void;
}) {
  const patch = (i: number, change: Partial<MitigatingActionDraft>) =>
    onChange(value.map((a, idx) => (idx === i ? { ...a, ...change } : a)));
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        Mitigating actions
      </Text>
      {value.length === 0 ? (
        <Text size="sm" c="dimmed" className="side-modal-empty">
          No actions yet.
        </Text>
      ) : null}
      {value.map((a, i) => (
        <Group key={a.id ?? `new-${i}`} gap="xs" wrap="nowrap" align="center">
          <Checkbox
            aria-label={`Action ${i + 1} done`}
            checked={a.isCompleted}
            onChange={(e) => patch(i, { isCompleted: e.currentTarget.checked })}
          />
          <TextInput
            aria-label={`Action ${i + 1}`}
            placeholder="Describe the action"
            style={{ flex: 1 }}
            maxLength={500}
            value={a.description}
            onChange={(e) => patch(i, { description: e.currentTarget.value })}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={`Remove action ${i + 1}`}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            ✕
          </ActionIcon>
        </Group>
      ))}
      <div>
        <Button
          size="compact-xs"
          variant="default"
          className="side-modal-inline-btn"
          disabled={value.length >= MAX_MITIGATING_ACTIONS}
          onClick={() => onChange([...value, { description: "", isCompleted: false }])}
        >
          Add action
        </Button>
      </div>
    </Stack>
  );
}

/** List/card display: each action with a checkbox. Ticking calls the dedicated toggle endpoint. */
export function MitigationChecklist({ item, editable }: { item: RaidItemDto; editable: boolean }) {
  const toggle = useToggleMitigatingAction();
  if (item.mitigatingActions.length === 0) return null;
  const done = item.mitigatingActions.filter((a) => a.isCompleted).length;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Text size="xs" mt={2} className="raid-sub">
        Mitigation: {done}/{item.mitigatingActions.length} done
      </Text>
      <Stack gap="xs" mt="xs">
        {item.mitigatingActions.map((a) => (
          <Checkbox
            key={a.id}
            size="xs"
            className="raid-action-check"
            checked={a.isCompleted}
            disabled={!editable || toggle.isPending}
            label={a.description}
            onChange={(e) =>
              toggle.mutate(
                { raidItemId: item.id, actionId: a.id, isCompleted: e.currentTarget.checked },
                { onError: (err) => toast.error(err.message) },
              )
            }
          />
        ))}
      </Stack>
    </div>
  );
}
