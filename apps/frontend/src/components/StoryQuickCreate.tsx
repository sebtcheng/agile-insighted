import { useState } from "react";
import { Button, Group, Text, TextInput } from "@mantine/core";
import { useCreateProjectRelease, useCreateStep } from "../api/hooks";
import { toast } from "./ui";

export type QuickCreateKind = "step" | "release";

const COPY = {
  step: {
    missing: "This project has no journey steps yet. Add one to place the story on the map.",
    label: "New journey step name",
    placeholder: "e.g. Sign in",
    button: "Add journey step",
  },
  release: {
    missing: "This project has no releases yet. Add one to plan the story.",
    label: "New release name",
    placeholder: "e.g. MVP",
    button: "Add release",
  },
} as const;

/**
 * Inline prerequisite helper shown under the Journey step / Release field of the story drawer. It creates the
 * missing item in the chosen project without closing the drawer and hands the new id back for selection.
 * Only PMs can create steps and releases, so everyone else is told who to ask.
 */
export function StoryQuickCreate({
  kind,
  projectId,
  canCreate,
  onCreated,
}: {
  kind: QuickCreateKind;
  projectId: string;
  canCreate: boolean;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const createStep = useCreateStep();
  const createRelease = useCreateProjectRelease();
  const pending = createStep.isPending || createRelease.isPending;
  const copy = COPY[kind];

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    const opts = {
      onSuccess: (created: { id: string }) => {
        setName("");
        onCreated(created.id);
      },
      onError: (e: Error) => toast.error(e.message),
    };
    if (kind === "step") createStep.mutate({ projectId, name: trimmed }, opts);
    else createRelease.mutate({ projectId, name: trimmed }, opts);
  };

  return (
    <div data-prereq={kind} role="group" aria-label={copy.button}>
      <Text size="xs" c="orange" mb={4}>
        {copy.missing}
      </Text>
      {canCreate ? (
        <Group gap="xs" wrap="nowrap" align="center">
          <TextInput
            aria-label={copy.label}
            placeholder={copy.placeholder}
            size="xs"
            style={{ flex: 1 }}
            maxLength={kind === "step" ? 120 : 80}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              submit();
            }}
          />
          <Button
            type="button"
            size="compact-xs"
            variant="default"
            className="side-modal-inline-btn"
            disabled={!name.trim()}
            loading={pending}
            onClick={submit}
          >
            {copy.button}
          </Button>
        </Group>
      ) : (
        <Text size="xs" c="dimmed">
          Ask a project manager to add one.
        </Text>
      )}
    </div>
  );
}
