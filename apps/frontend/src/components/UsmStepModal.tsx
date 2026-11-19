import { useEffect, useRef, useState } from "react";
import { ActionIcon, Button, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { MAX_USM_FEATURES_PER_STEP, type UsmFeatureDto, type UsmStepDto } from "@myapp/shared";
import {
  useCreateUsmFeature,
  useDeleteUsmFeature,
  useDeleteUsmStep,
  useUpdateUsmFeature,
  useUpdateUsmStep,
  useUsers,
} from "../api/hooks";
import { SideModal } from "./SideModal";
import { toast } from "./ui";

/** Row layout and controls mirror the Kano revision specs checklist (KanoSpecs.tsx). */
function usePeople(currentId: string | null) {
  const users = useUsers();
  return (users.data ?? [])
    .filter((u) => u.isActive || u.id === currentId)
    .map((u) => ({ value: u.id, label: u.fullName }));
}

function FeatureRow({
  feature,
  index,
  canEdit,
  canTick,
  onEnter,
}: {
  feature: UsmFeatureDto;
  index: number;
  canEdit: boolean;
  canTick: boolean;
  /** Enter in the text field: the parent opens a new feature row below. */
  onEnter: () => void;
}) {
  const update = useUpdateUsmFeature();
  const remove = useDeleteUsmFeature();
  const people = usePeople(feature.responsibleId);
  const [title, setTitle] = useState(feature.title);
  const save = (patch: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: feature.id, patch }, { onError: (e) => toast.error(e.message) });
  const commitTitle = () => {
    const next = title.trim();
    if (!next) setTitle(feature.title);
    else if (next !== feature.title) save({ title: next });
  };
  return (
    <Group gap="xs" wrap="nowrap" align="center" data-feature={feature.id}>
      <Checkbox
        aria-label={`Feature ${index + 1} done`}
        checked={feature.isCompleted}
        disabled={!canTick}
        onChange={(e) => save({ isCompleted: e.currentTarget.checked })}
      />
      <TextInput
        aria-label={`Feature ${index + 1}`}
        style={{ flex: 1 }}
        maxLength={300}
        disabled={!canEdit}
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          commitTitle();
          if (title.trim()) onEnter();
        }}
      />
      <TextInput
        type="date"
        aria-label={`Feature ${index + 1} target date`}
        style={{ width: 150 }}
        disabled={!canEdit}
        value={feature.targetDate ?? ""}
        onChange={(e) => save({ targetDate: e.currentTarget.value || null })}
      />
      <Select
        aria-label={`Feature ${index + 1} person responsible`}
        clearable
        searchable
        placeholder="Unassigned"
        style={{ width: 170 }}
        disabled={!canEdit}
        data={people}
        value={feature.responsibleId}
        onChange={(v) => save({ responsibleId: v })}
      />
      {canEdit ? (
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={`Remove feature ${index + 1}`}
          loading={remove.isPending}
          onClick={() => remove.mutate(feature.id, { onError: (e) => toast.error(e.message) })}
        >
          ✕
        </ActionIcon>
      ) : null}
    </Group>
  );
}

/**
 * A new row with no Save button. Enter creates the feature and opens the next row; leaving the row with text
 * creates it too, and leaving it empty discards it. `onDone(true)` asks the parent for another new row.
 */
function NewFeatureRow({
  projectId,
  stepId,
  onDone,
}: {
  projectId: string;
  stepId: string;
  onDone: (openNext: boolean) => void;
}) {
  const create = useCreateUsmFeature();
  const people = usePeople(null);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const sent = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const commit = (openNext: boolean) => {
    if (sent.current) return;
    const text = title.trim();
    if (!text) return onDone(false);
    sent.current = true;
    create.mutate(
      { projectId, stepId, title: text, targetDate: targetDate || null, responsibleId },
      {
        onSuccess: () => onDone(openNext),
        onError: (e) => {
          sent.current = false;
          toast.error(e.message);
        },
      },
    );
  };
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      align="center"
      onBlur={(e) => {
        // Only when focus leaves the whole row (not when moving between its own fields).
        if (!e.currentTarget.contains(e.relatedTarget)) commit(false);
      }}
    >
      <Checkbox aria-label="New feature done" disabled checked={false} readOnly />
      <TextInput
        ref={inputRef}
        aria-label="New feature"
        placeholder="Describe the feature"
        style={{ flex: 1 }}
        maxLength={300}
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          commit(true);
        }}
      />
      <TextInput
        type="date"
        aria-label="New feature target date"
        style={{ width: 150 }}
        value={targetDate}
        onChange={(e) => setTargetDate(e.currentTarget.value)}
      />
      <Select
        aria-label="New feature person responsible"
        clearable
        searchable
        placeholder="Unassigned"
        style={{ width: 170 }}
        data={people}
        value={responsibleId}
        onChange={setResponsibleId}
      />
      <ActionIcon
        variant="subtle"
        color="red"
        aria-label="Discard new feature"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          sent.current = true;
          onDone(false);
        }}
      >
        ✕
      </ActionIcon>
    </Group>
  );
}

/**
 * Opens from a step card: the step's title and description, a delete action, and the feature checklist
 * ("what must be prepared within this step"). `canEdit` is the PM on an open project; `canTick` also covers members.
 */
export function UsmStepModal({
  step,
  opened,
  onClose,
  canEdit,
  canTick,
}: {
  step: UsmStepDto | undefined;
  opened: boolean;
  onClose: () => void;
  canEdit: boolean;
  canTick: boolean;
}) {
  return (
    <SideModal opened={opened} onClose={onClose} title={step ? step.title : "Step"} size="xl">
      {step ? (
        <StepBody key={step.id} step={step} onClose={onClose} canEdit={canEdit} canTick={canTick} />
      ) : null}
    </SideModal>
  );
}

function StepBody({
  step,
  onClose,
  canEdit,
  canTick,
}: {
  step: UsmStepDto;
  onClose: () => void;
  canEdit: boolean;
  canTick: boolean;
}) {
  const updateStep = useUpdateUsmStep();
  const deleteStep = useDeleteUsmStep();
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description ?? "");
  const [adding, setAdding] = useState(false);
  // Bumping the key mounts a fresh, focused row, so Enter can chain one feature after another.
  const [rowKey, setRowKey] = useState(0);
  const openNewRow = () => {
    if (step.features.length >= MAX_USM_FEATURES_PER_STEP) return;
    setRowKey((k) => k + 1);
    setAdding(true);
  };
  const dirty = title.trim() !== step.title || description.trim() !== (step.description ?? "");
  return (
    <Stack gap="md">
      <TextInput
        label="Step"
        disabled={!canEdit}
        maxLength={160}
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
      />
      <TextInput
        label="Description"
        placeholder="Optional"
        disabled={!canEdit}
        maxLength={2000}
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
      />
      {canEdit ? (
        <Group justify="space-between">
          <Button
            variant="default"
            color="red"
            loading={deleteStep.isPending}
            onClick={() =>
              deleteStep.mutate(step.id, {
                onSuccess: onClose,
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Delete step
          </Button>
          <Button
            disabled={!dirty || !title.trim()}
            loading={updateStep.isPending}
            onClick={() =>
              updateStep.mutate(
                {
                  id: step.id,
                  patch: { title: title.trim(), description: description.trim() || null },
                },
                { onError: (e) => toast.error(e.message) },
              )
            }
          >
            Save step
          </Button>
        </Group>
      ) : null}
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          Feature checklist
        </Text>
        <Text size="xs" c="dimmed">
          What features must be prepared within this step?
        </Text>
        {step.features.length === 0 && !adding ? (
          <Text size="sm" c="dimmed" className="side-modal-empty">
            No features yet.
          </Text>
        ) : null}
        {step.features.map((f, i) => (
          <FeatureRow
            key={f.id}
            feature={f}
            index={i}
            canEdit={canEdit}
            canTick={canTick}
            onEnter={() => {
              if (!adding) openNewRow();
            }}
          />
        ))}
        {adding ? (
          <NewFeatureRow
            key={rowKey}
            projectId={step.projectId}
            stepId={step.id}
            onDone={(openNext) => (openNext ? openNewRow() : setAdding(false))}
          />
        ) : null}
        {canEdit ? (
          <div>
            <Button
              size="compact-xs"
              variant="default"
              className="side-modal-inline-btn"
              disabled={adding || step.features.length >= MAX_USM_FEATURES_PER_STEP}
              onClick={() => setAdding(true)}
            >
              Add feature
            </Button>
          </div>
        ) : null}
      </Stack>
    </Stack>
  );
}
