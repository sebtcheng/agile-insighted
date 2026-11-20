import { useRef } from "react";
import { ActionIcon, Button, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import {
  MAX_REQUIREMENT_SOLUTIONS,
  type PmApproval,
  type RequirementSolutionInput,
} from "@myapp/shared";
import { SideModal } from "./SideModal";
import { approvalGateProps } from "./PmApprovalBadge";
import { SprintSelect, sprintDraftValue } from "./SprintSelect";

/** Editable solution / action-step row. `id` is set for rows that already exist on the server. */
export type StepDraft = {
  id?: string;
  title: string;
  completed: boolean;
  /** User id of the staff member responsible; "" until chosen. */
  ownerId: string;
  /** Sprint key `YYYY-Snn`; "" until picked. */
  sprintKey: string;
  /** Read-only here: only the Project Manager changes it (Admin Log). Missing means PENDING. */
  pmApproval?: PmApproval;
};

export type StaffOption = { value: string; label: string };

const emptyStep = (): StepDraft => ({ title: "", completed: false, ownerId: "", sprintKey: "" });

export const stepsToDrafts = (
  solutions: Array<{
    id: string;
    title: string;
    ownerId: string | null;
    targetDate: string | null;
    sprintKey?: string | null;
    pmApproval?: PmApproval;
    validationStatus: string;
  }>,
): StepDraft[] =>
  solutions.map((s) => ({
    id: s.id,
    title: s.title,
    completed: s.validationStatus === "validated",
    ownerId: s.ownerId ?? "",
    sprintKey: sprintDraftValue(s.sprintKey, s.targetDate),
    pmApproval: s.pmApproval,
  }));

export const draftsToSolutions = (
  steps: StepDraft[],
): Array<RequirementSolutionInput & { completed: boolean }> =>
  steps
    .map((s) => ({ ...s, title: s.title.trim() }))
    .filter((s) => s.title !== "")
    .map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      title: s.title,
      completed: s.completed,
      ownerId: s.ownerId || null,
      sprintKey: s.sprintKey || null,
    }));

/** Checklist editor: tick, describe, assign and date each step. The whole list is saved with the requirement. */
export function StepsField({
  value,
  onChange,
  staffOptions,
}: {
  value: StepDraft[];
  onChange: (next: StepDraft[]) => void;
  staffOptions: StaffOption[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const patch = (i: number, change: Partial<StepDraft>) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...change } : s)));
  // Enter adds a new step below instead of submitting the form.
  const addBelow = (i: number) => {
    if (value.length >= MAX_REQUIREMENT_SOLUTIONS) return;
    onChange([...value.slice(0, i + 1), emptyStep(), ...value.slice(i + 1)]);
    requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLInputElement>(`[data-step-input="${i + 1}"]`)?.focus(),
    );
  };
  return (
    <Stack gap="xs" ref={rootRef}>
      <Text size="sm" fw={500}>
        Solutions / action steps
      </Text>
      {value.length === 0 ? (
        <Text size="sm" c="dimmed" className="side-modal-empty">
          No steps yet.
        </Text>
      ) : null}
      {value.map((s, i) => (
        <Group key={s.id ?? `new-${i}`} gap="xs" wrap="nowrap" align="center">
          <Checkbox
            aria-label={`Step ${i + 1} done`}
            checked={s.completed}
            {...approvalGateProps(s.pmApproval)}
            onChange={(e) => patch(i, { completed: e.currentTarget.checked })}
          />
          <TextInput
            aria-label={`Step ${i + 1}`}
            placeholder="Describe the step"
            style={{ flex: 1, minWidth: 160 }}
            maxLength={300}
            data-step-input={i}
            value={s.title}
            onChange={(e) => patch(i, { title: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (s.title.trim()) addBelow(i);
            }}
          />
          <Select
            aria-label={`Step ${i + 1} staff responsible`}
            placeholder="Responsible"
            searchable
            clearable
            w={170}
            data={staffOptions}
            value={s.ownerId || null}
            onChange={(v) => patch(i, { ownerId: v ?? "" })}
          />
          <SprintSelect
            aria-label={`Step ${i + 1} sprint`}
            value={s.sprintKey}
            onChange={(sprintKey) => patch(i, { sprintKey })}
          />
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={`Remove step ${i + 1}`}
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
          disabled={value.length >= MAX_REQUIREMENT_SOLUTIONS}
          onClick={() => onChange([...value, emptyStep()])}
        >
          Add step
        </Button>
      </div>
    </Stack>
  );
}

/** Add / edit a requirement: its title and the checklist of solutions that deliver it. */
export function RequirementModal({
  title,
  initialTitle = "",
  initialSteps = [],
  staffOptions,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  initialTitle?: string;
  initialSteps?: StepDraft[];
  staffOptions: StaffOption[];
  pending?: boolean;
  onClose: () => void;
  onSubmit: (v: {
    title: string;
    solutions: Array<RequirementSolutionInput & { completed: boolean }>;
  }) => void;
}) {
  const form = useForm({
    initialValues: { title: initialTitle, steps: initialSteps },
    validate: { title: (v) => (v.trim() ? null : "Enter requirement") },
  });
  return (
    <SideModal opened onClose={onClose} title={title} size={860}>
      <form
        onSubmit={form.onSubmit((v) =>
          onSubmit({ title: v.title.trim(), solutions: draftsToSolutions(v.steps) }),
        )}
      >
        <Stack>
          <TextInput
            label="Requirement"
            description="Something needed to make this outcome a reality"
            data-autofocus
            {...form.getInputProps("title")}
          />
          <StepsField
            value={form.values.steps}
            onChange={(next) => form.setFieldValue("steps", next)}
            staffOptions={staffOptions}
          />
          <Group justify="flex-end" className="side-modal-footer">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </SideModal>
  );
}
