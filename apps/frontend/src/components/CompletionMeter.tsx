import { Group, Progress, Text } from "@mantine/core";
import { completionLabel, completionPercent } from "../lib/progress";

/** Compact "60% complete" line with a thin bar; shared by the OST and Story Map cards. */
export function CompletionMeter({ done, total }: { done: number; total: number }) {
  const pct = completionPercent(done, total);
  return (
    <div>
      <Group justify="space-between" gap={4} wrap="nowrap">
        <Text size="xs" fw={600}>
          {completionLabel(done, total)}
        </Text>
        <Text size="xs" c="dimmed">
          {done}/{total}
        </Text>
      </Group>
      <Progress
        value={pct}
        size="xs"
        mt={4}
        color={pct === 100 ? "teal" : undefined}
        aria-label={completionLabel(done, total)}
      />
    </div>
  );
}
