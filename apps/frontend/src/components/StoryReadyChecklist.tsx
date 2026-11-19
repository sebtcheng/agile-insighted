import { Button, Checkbox, Group, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import type { StoryDto } from "@myapp/shared";
import { useAddStoryDor, useRemoveStoryDor, useToggleStoryReady } from "../api/hooks";
import { toast } from "./ui";

/**
 * A story's Definition of Ready: its own criteria as tick boxes, with an inline field to add more and a
 * remove action per row. Every change updates the cached map at once, so counts and percentages follow.
 */
export function StoryReadyChecklist({
  story,
  subprojectId,
  canTick,
}: {
  story: StoryDto;
  subprojectId: string;
  canTick: boolean;
}) {
  const toggle = useToggleStoryReady(subprojectId);
  const add = useAddStoryDor(subprojectId);
  const remove = useRemoveStoryDor(subprojectId);
  const [label, setLabel] = useState("");
  const items = story.dorItems;
  const done = items.filter((i) => i.isCompleted).length;

  const submit = () => {
    const text = label.trim();
    if (!text) return;
    add.mutate(
      { storyId: story.id, label: text },
      { onSuccess: () => setLabel(""), onError: (err) => toast.error(err.message) },
    );
  };

  return (
    <Stack gap={6}>
      <Text size="sm" fw={600}>
        Definition of Ready ({done}/{items.length})
      </Text>
      <Stack gap={4} role="group" aria-label={`Definition of Ready for ${story.code}`}>
        {items.map((i) => (
          <Group key={i.id} justify="space-between" wrap="nowrap" gap={4}>
            <Checkbox
              size="xs"
              label={
                <Text
                  size="xs"
                  c={i.isCompleted ? "dimmed" : undefined}
                  td={i.isCompleted ? "line-through" : undefined}
                >
                  {i.label}
                </Text>
              }
              checked={i.isCompleted}
              disabled={!canTick}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                toggle.mutate(
                  { storyId: story.id, itemId: i.id, isCompleted: e.currentTarget.checked },
                  { onError: (err) => toast.error(err.message) },
                )
              }
            />
            {canTick ? (
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                aria-label={`Remove ${i.label}`}
                onClick={() =>
                  remove.mutate(
                    { storyId: story.id, itemId: i.id },
                    { onError: (err) => toast.error(err.message) },
                  )
                }
              >
                Remove
              </Button>
            ) : null}
          </Group>
        ))}
      </Stack>
      {canTick ? (
        <Group gap={6} wrap="nowrap">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            aria-label="New Definition of Ready criterion"
            placeholder="Add a criterion"
            value={label}
            maxLength={300}
            onChange={(e) => setLabel(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button
            size="xs"
            variant="default"
            loading={add.isPending}
            disabled={label.trim() === ""}
            onClick={submit}
          >
            Add criterion
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}
