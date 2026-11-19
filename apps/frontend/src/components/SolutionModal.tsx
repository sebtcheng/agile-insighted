import { Alert, Badge, Button, Card, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { VALIDATION_LABELS, type SolutionDto, type SubprojectDto } from "@myapp/shared";
import { ApiClientError } from "../api/client";
import { useConvertSolution } from "../api/hooks";
import { toast } from "./ui";
import { SideModal } from "./SideModal";

export const VALIDATION_COLOR = {
  planned: "gray",
  in_progress: "blue",
  validated: "teal",
  invalidated: "red",
} as const;

export function SolutionModal({
  solution,
  subprojects,
  defaultSubprojectId,
  isPm,
  readOnly,
  onClose,
}: {
  solution: SolutionDto;
  subprojects: SubprojectDto[];
  defaultSubprojectId: string | null;
  isPm: boolean;
  readOnly: boolean;
  onClose: () => void;
}) {
  const convert = useConvertSolution();
  const [subprojectId, setSubprojectId] = useState<string | null>(defaultSubprojectId);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [reason, setReason] = useState("");

  const run = (overrideReason?: string) => {
    if (!subprojectId) return;
    convert.mutate(
      { id: solution.id, input: { subprojectId, overrideReason } },
      {
        onSuccess: (r) => {
          toast.ok(`Created ${r.storyCode} in the story map`);
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === "validation_incomplete") {
            setNeedsOverride(true);
          } else toast.error(e.message);
        },
      },
    );
  };

  return (
    <SideModal opened onClose={onClose} size="xl" title={`${solution.code}  ${solution.title}`}>
      <Stack>
        <Group gap="xs">
          <Badge color={VALIDATION_COLOR[solution.validationStatus]} variant="light">
            {VALIDATION_LABELS[solution.validationStatus]}
          </Badge>
          {solution.ownerName ? <Text size="sm">Owner: {solution.ownerName}</Text> : null}
          {solution.convertedStoryCode ? (
            <Badge variant="outline">Story {solution.convertedStoryCode}</Badge>
          ) : null}
        </Group>
        <Text size="sm" c="dimmed">
          A solution counts as validated when it is ticked as done in the outcome.
        </Text>
        {isPm && !readOnly && !solution.convertedStoryId ? (
          <Card withBorder p="sm">
            <Text fw={600} size="sm" mb={6}>
              Convert to a user story
            </Text>
            <Group align="flex-end" wrap="wrap">
              <Select
                label="Subproject"
                w={260}
                data={subprojects.map((s) => ({ value: s.id, label: s.name }))}
                value={subprojectId}
                onChange={setSubprojectId}
              />
              <Button
                disabled={!subprojectId}
                loading={convert.isPending && !needsOverride}
                onClick={() => run()}
              >
                Convert
              </Button>
            </Group>
            {needsOverride ? (
              <Alert color="yellow" mt="sm" title="Not validated yet">
                <Stack gap={6}>
                  <Text size="sm">
                    Mark the solution validated first, or override with a reason (it is logged).
                  </Text>
                  <TextInput
                    label="Override reason"
                    value={reason}
                    onChange={(e) => setReason(e.currentTarget.value)}
                  />
                  <Button
                    size="xs"
                    variant="light"
                    color="yellow"
                    disabled={!reason.trim()}
                    loading={convert.isPending}
                    onClick={() => run(reason.trim())}
                  >
                    Override and convert
                  </Button>
                </Stack>
              </Alert>
            ) : null}
          </Card>
        ) : null}
      </Stack>
    </SideModal>
  );
}
