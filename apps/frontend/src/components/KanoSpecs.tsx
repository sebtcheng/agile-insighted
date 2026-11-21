import { useRef } from "react";
import { ActionIcon, Button, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { MAX_KANO_SPECS, type KanoDto, type KanoSpecDto, type PmApproval } from "@myapp/shared";
import { useToggleKanoSpec, useUsers } from "../api/hooks";
import { approvalGateProps } from "./PmApprovalBadge";
import { SprintSelect, sprintDraftValue } from "./SprintSelect";
import { fmtDate, toast } from "./ui";

/** Editable spec row in the form. `id` is set for rows that already exist on the server. */
export type KanoSpecDraft = {
  id?: string;
  label: string;
  isCompleted: boolean;
  /** Sprint key `YYYY-Snn`, or "" when unassigned. */
  sprintKey: string;
  /** Read-only here: only the Project Manager changes it (Admin Log). Missing means PENDING. */
  pmApproval?: PmApproval;
  /** User id, or "" when unassigned. */
  responsibleId: string;
};

export const emptySpec = (): KanoSpecDraft => ({
  label: "",
  isCompleted: false,
  sprintKey: "",
  responsibleId: "",
});

export const specsToDrafts = (specs: KanoSpecDto[]): KanoSpecDraft[] =>
  specs.map((s) => ({
    id: s.id,
    label: s.label,
    isCompleted: s.isCompleted,
    sprintKey: sprintDraftValue(s.sprintKey, s.targetDate),
    pmApproval: s.pmApproval,
    responsibleId: s.responsibleId ?? "",
  }));

export const draftsToSpecs = (
  drafts: KanoSpecDraft[],
): Array<{
  id?: string;
  label: string;
  isCompleted: boolean;
  sprintKey: string | null;
  responsibleId: string | null;
}> =>
  drafts
    .map((d) => ({
      id: d.id,
      label: d.label.trim(),
      isCompleted: d.isCompleted,
      sprintKey: d.sprintKey || null,
      responsibleId: d.responsibleId || null,
    }))
    .filter((d) => d.label.length > 0);

/** Checklist builder shown directly below the Revision Request input: add, rename, remove and tick specs. */
export function KanoSpecsField({
  value,
  onChange,
}: {
  value: KanoSpecDraft[];
  onChange: (next: KanoSpecDraft[]) => void;
}) {
  const users = useUsers();
  const patch = (i: number, change: Partial<KanoSpecDraft>) =>
    onChange(value.map((a, idx) => (idx === i ? { ...a, ...change } : a)));
  const rootRef = useRef<HTMLDivElement>(null);
  // Enter adds a new spec below instead of submitting the form.
  const addBelow = (i: number) => {
    if (value.length >= MAX_KANO_SPECS) return;
    onChange([...value.slice(0, i + 1), emptySpec(), ...value.slice(i + 1)]);
    requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLInputElement>(`[data-spec-input="${i + 1}"]`)?.focus(),
    );
  };
  return (
    <Stack gap="xs" ref={rootRef}>
      <Text size="sm" fw={500}>
        Revision specs
      </Text>
      {value.length === 0 ? (
        <Text size="sm" c="dimmed" className="side-modal-empty">
          No specs yet.
        </Text>
      ) : null}
      {value.map((a, i) => (
        <Group key={a.id ?? `new-${i}`} gap="xs" wrap="nowrap" align="center">
          <Checkbox
            aria-label={`Spec ${i + 1} done`}
            checked={a.isCompleted}
            {...approvalGateProps(a.pmApproval)}
            onChange={(e) => patch(i, { isCompleted: e.currentTarget.checked })}
          />
          <TextInput
            aria-label={`Spec ${i + 1}`}
            placeholder="Describe the spec"
            style={{ flex: 1 }}
            maxLength={500}
            data-spec-input={i}
            value={a.label}
            onChange={(e) => patch(i, { label: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (a.label.trim()) addBelow(i);
            }}
          />
          <SprintSelect
            aria-label={`Spec ${i + 1} sprint`}
            value={a.sprintKey}
            onChange={(sprintKey) => patch(i, { sprintKey })}
          />
          <Select
            aria-label={`Spec ${i + 1} person responsible`}
            clearable
            searchable
            placeholder="Unassigned"
            style={{ width: 170 }}
            data={(users.data ?? [])
              .filter((u) => u.isActive || u.id === a.responsibleId)
              .map((u) => ({ value: u.id, label: u.fullName }))}
            value={a.responsibleId || null}
            onChange={(v) => patch(i, { responsibleId: v ?? "" })}
          />
          <ActionIcon
            variant="subtle"
            color="coral"
            aria-label={`Remove spec ${i + 1}`}
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
          disabled={value.length >= MAX_KANO_SPECS}
          onClick={() => onChange([...value, emptySpec()])}
        >
          Add spec
        </Button>
      </div>
    </Stack>
  );
}

export function completionLabel(
  r: Pick<KanoDto, "specsTotal" | "specsCompleted" | "completionPercent" | "isComplete">,
) {
  if (r.specsTotal === 0) return "No specs yet";
  return `${r.specsCompleted}/${r.specsTotal} specs · ${r.completionPercent}%${r.isComplete ? " · Complete" : ""}`;
}

/** Card/table display: each spec with a checkbox and the derived completion state. */
export function KanoSpecChecklist({ request, editable }: { request: KanoDto; editable: boolean }) {
  const toggle = useToggleKanoSpec();
  if (request.specs.length === 0) return null;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Text size="xs" mt={2} c={request.isComplete ? "teal" : "dimmed"}>
        {completionLabel(request)}
      </Text>
      <Stack gap="xs" mt="xs">
        {request.specs.map((s) => (
          <Checkbox
            key={s.id}
            size="xs"
            checked={s.isCompleted}
            disabled={!editable || toggle.isPending || approvalGateProps(s.pmApproval).disabled}
            aria-disabled={approvalGateProps(s.pmApproval)["aria-disabled"]}
            title={approvalGateProps(s.pmApproval).title}
            label={
              <>
                {s.label}
                {s.targetDate ? (
                  <Text span size="xs" c="dimmed" ml="xs">
                    {s.sprintLabel ?? fmtDate(s.targetDate)}
                  </Text>
                ) : null}
                {s.responsibleName ? (
                  <Text span size="xs" c="dimmed" ml="xs">
                    {s.responsibleName}
                  </Text>
                ) : null}
              </>
            }
            onChange={(e) =>
              toggle.mutate(
                { requestId: request.id, specId: s.id, isCompleted: e.currentTarget.checked },
                { onError: (err) => toast.error(err.message) },
              )
            }
          />
        ))}
      </Stack>
    </div>
  );
}
