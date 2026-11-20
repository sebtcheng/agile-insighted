import { useRef } from "react";
import { ActionIcon, Button, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { MAX_MITIGATING_ACTIONS, type PmApproval, type RaidItemDto } from "@myapp/shared";
import { useToggleMitigatingAction } from "../api/hooks";
import { approvalGateProps } from "./PmApprovalBadge";
import { SprintSelect } from "./SprintSelect";
import { fmtDate, toast } from "./ui";

/** Editable row in the drawer. `id` is set for rows that already exist on the server. */
export type MitigatingActionDraft = {
  id?: string;
  description: string;
  isCompleted: boolean;
  /** Sprint key `YYYY-Snn` (its Sunday end date becomes the deadline); "" until the user picks a sprint. */
  sprintKey: string;
  /** Read-only here: only the Project Manager changes it (Admin Log). Missing means PENDING. */
  pmApproval?: PmApproval;
  /** User id of the staff member responsible; "" until chosen. */
  responsibleId: string;
};

/** Drawer control: add, rename, remove and tick actions. The whole list is saved with the item. */
export function MitigatingActionsField({
  value,
  onChange,
  staffOptions,
}: {
  value: MitigatingActionDraft[];
  onChange: (next: MitigatingActionDraft[]) => void;
  /** Same staff list the Owner dropdown uses, as Select data. */
  staffOptions: Array<{ value: string; label: string }>;
}) {
  const patch = (i: number, change: Partial<MitigatingActionDraft>) =>
    onChange(value.map((a, idx) => (idx === i ? { ...a, ...change } : a)));
  const rootRef = useRef<HTMLDivElement>(null);
  // Enter adds a new action below instead of submitting the drawer form.
  const addBelow = (i: number) => {
    if (value.length >= MAX_MITIGATING_ACTIONS) return;
    onChange([
      ...value.slice(0, i + 1),
      { description: "", isCompleted: false, sprintKey: "", responsibleId: "" },
      ...value.slice(i + 1),
    ]);
    // Focus the new row once React has rendered it.
    requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLInputElement>(`[data-action-input="${i + 1}"]`)?.focus(),
    );
  };
  return (
    <Stack gap="xs" ref={rootRef}>
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
            {...approvalGateProps(a.pmApproval)}
            onChange={(e) => patch(i, { isCompleted: e.currentTarget.checked })}
          />
          <TextInput
            aria-label={`Action ${i + 1}`}
            placeholder="Describe the action"
            style={{ flex: 1, minWidth: 180 }}
            maxLength={500}
            data-action-input={i}
            value={a.description}
            onChange={(e) => patch(i, { description: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (a.description.trim()) addBelow(i);
            }}
          />
          <SprintSelect
            aria-label={`Action ${i + 1} sprint`}
            required
            clearable={false}
            value={a.sprintKey}
            onChange={(sprintKey) => patch(i, { sprintKey })}
          />
          <Select
            aria-label={`Action ${i + 1} staff responsible`}
            placeholder="Responsible"
            w={190}
            searchable
            allowDeselect={false}
            data={staffOptions}
            value={a.responsibleId || null}
            onChange={(v) => patch(i, { responsibleId: v ?? "" })}
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
          onClick={() =>
            onChange([
              ...value,
              { description: "", isCompleted: false, sprintKey: "", responsibleId: "" },
            ])
          }
        >
          Add action
        </Button>
      </div>
    </Stack>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** List/card display: each action with a checkbox. Ticking calls the dedicated toggle endpoint. */
export function MitigationChecklist({
  item,
  editable,
  hideCount = false,
}: {
  item: RaidItemDto;
  editable: boolean;
  hideCount?: boolean;
}) {
  const toggle = useToggleMitigatingAction();
  if (item.mitigatingActions.length === 0) return null;
  const done = item.mitigatingActions.filter((a) => a.isCompleted).length;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {hideCount ? null : (
        <Text size="xs" mt={2} className="raid-sub">
          Mitigation: {done}/{item.mitigatingActions.length} done
        </Text>
      )}
      <Stack gap="xs" mt="xs">
        {item.mitigatingActions.map((a) => (
          <Checkbox
            key={a.id}
            size="xs"
            className="raid-action-check"
            checked={a.isCompleted}
            disabled={!editable || toggle.isPending || approvalGateProps(a.pmApproval).disabled}
            aria-disabled={approvalGateProps(a.pmApproval)["aria-disabled"]}
            title={approvalGateProps(a.pmApproval).title}
            label={
              <>
                <span className="raid-action-text">{a.description}</span>
                {a.targetDate || a.responsibleName ? (
                  <span className="raid-action-meta">
                    {a.targetDate ? (
                      <span
                        className="raid-action-due"
                        data-overdue={!a.isCompleted && a.targetDate < todayIso() ? "" : undefined}
                      >
                        {a.sprintLabel ?? `due ${fmtDate(a.targetDate)}`}
                      </span>
                    ) : null}
                    {a.targetDate && a.responsibleName ? " · " : null}
                    {a.responsibleName ? (
                      <span className="raid-action-person">{a.responsibleName}</span>
                    ) : null}
                  </span>
                ) : null}
              </>
            }
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
