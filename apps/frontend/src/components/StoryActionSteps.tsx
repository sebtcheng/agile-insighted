import { useRef } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { MAX_STORY_ACTION_STEPS, type StoryDto } from "@myapp/shared";
import { useToggleStoryActionStep } from "../api/hooks";
import { isStepOverdue } from "../lib/storyActionSteps";
import { fmtDate, toast } from "./ui";

/** Editable row in the side modal. `id` is set for rows that already exist on the server. */
export type StoryActionStepDraft = {
  id?: string;
  label: string;
  isCompleted: boolean;
  /** User id of the staff member responsible; "" until chosen. */
  responsibleId: string;
  /** ISO yyyy-mm-dd; "" until the user picks a date. */
  targetDate: string;
};

const blank = (): StoryActionStepDraft => ({
  label: "",
  isCompleted: false,
  responsibleId: "",
  targetDate: "",
});

/** Side-modal control: add, edit, tick and remove steps. The whole list is saved with the story. */
export function StoryActionStepsField({
  value,
  onChange,
  staffOptions,
  error,
}: {
  value: StoryActionStepDraft[];
  onChange: (next: StoryActionStepDraft[]) => void;
  /** Team Members and Project Managers, as Select data. */
  staffOptions: Array<{ value: string; label: string }>;
  error?: string | null;
}) {
  const patch = (i: number, change: Partial<StoryActionStepDraft>) =>
    onChange(value.map((s, idx) => (idx === i ? { ...s, ...change } : s)));
  const rootRef = useRef<HTMLDivElement>(null);
  // Enter adds a new step below instead of submitting the form.
  const addBelow = (i: number) => {
    if (value.length >= MAX_STORY_ACTION_STEPS) return;
    onChange([...value.slice(0, i + 1), blank(), ...value.slice(i + 1)]);
    requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLInputElement>(`[data-step-input="${i + 1}"]`)?.focus(),
    );
  };
  return (
    <Stack gap="xs" ref={rootRef}>
      <Text size="sm" fw={500}>
        Action steps
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
            checked={s.isCompleted}
            onChange={(e) => patch(i, { isCompleted: e.currentTarget.checked })}
          />
          <TextInput
            aria-label={`Step ${i + 1}`}
            placeholder="What will be done"
            style={{ flex: 1, minWidth: 180 }}
            maxLength={300}
            data-step-input={i}
            value={s.label}
            onChange={(e) => patch(i, { label: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (s.label.trim()) addBelow(i);
            }}
          />
          <Select
            aria-label={`Step ${i + 1} staff responsible`}
            placeholder="Responsible"
            w={190}
            searchable
            allowDeselect={false}
            data={staffOptions}
            value={s.responsibleId || null}
            onChange={(v) => patch(i, { responsibleId: v ?? "" })}
          />
          <TextInput
            type="date"
            aria-label={`Step ${i + 1} target date`}
            w={150}
            value={s.targetDate}
            onChange={(e) => patch(i, { targetDate: e.currentTarget.value })}
          />
          <ActionIcon
            variant="subtle"
            color="coral"
            aria-label={`Remove step ${i + 1}`}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            ✕
          </ActionIcon>
        </Group>
      ))}
      {error ? (
        <Text size="xs" c="coral">
          {error}
        </Text>
      ) : null}
      <div>
        <Button
          size="compact-xs"
          variant="default"
          className="side-modal-inline-btn"
          disabled={value.length >= MAX_STORY_ACTION_STEPS}
          onClick={() => onChange([...value, blank()])}
        >
          Add step
        </Button>
      </div>
    </Stack>
  );
}

/** Card / table display: every step as a checkbox. Ticking calls the dedicated toggle endpoint. */
export function StoryStepChecklist({ story, editable }: { story: StoryDto; editable: boolean }) {
  const toggle = useToggleStoryActionStep();
  if (story.actionSteps.length === 0) {
    return (
      <Text size="xs" className="raid-sub">
        No action steps
      </Text>
    );
  }
  return (
    <Stack gap="xs" onClick={(e) => e.stopPropagation()}>
      {story.actionSteps.map((s) => (
        <Checkbox
          key={s.id}
          size="xs"
          className="raid-action-check"
          checked={s.isCompleted}
          disabled={!editable}
          label={
            <>
              <span className="raid-action-text">{s.label}</span>
              <span className="raid-action-meta">
                <span className="raid-action-person">{s.responsibleName ?? "Unassigned"}</span>
                {s.targetDate ? (
                  <>
                    {" · "}
                    <span
                      className="raid-action-due"
                      data-overdue={isStepOverdue(s) ? "" : undefined}
                    >
                      due {fmtDate(s.targetDate)}
                    </span>
                  </>
                ) : null}
              </span>
            </>
          }
          onChange={(e) =>
            toggle.mutate(
              { storyId: story.id, stepId: s.id, isCompleted: e.currentTarget.checked },
              { onError: (err) => toast.error(err.message) },
            )
          }
        />
      ))}
    </Stack>
  );
}

/** Upper-right of a card: emphasised percentage with the completed/total fraction. */
export function StoryCompletionBadge({ story }: { story: StoryDto }) {
  return (
    <Stack gap={2} align="flex-end" className="usm-completion">
      <Badge
        size="lg"
        variant="light"
        className="raid-mono"
        aria-label={`${story.completionPercentage} percent, ${story.completedCount} of ${story.totalCount} steps done`}
      >
        {story.completionPercentage}%
      </Badge>
      <Text size="xs" className="raid-sub raid-mono" aria-hidden>
        {story.completedCount}/{story.totalCount}
      </Text>
    </Stack>
  );
}
