import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import {
  ASSUMPTION_CATEGORIES,
  CATEGORY_LABELS,
  VALIDATION_LABELS,
  VALIDATION_STATUSES,
  type AssumptionCategory,
  type AssumptionDto,
  type SolutionDto,
  type SubprojectDto,
} from "@myapp/shared";
import { ApiClientError } from "../api/client";
import {
  useConvertSolution,
  useCreateAssumption,
  useDeleteAssumption,
  useUpdateAssumption,
} from "../api/hooks";
import { toast } from "./ui";

export const VALIDATION_COLOR = {
  planned: "gray",
  in_progress: "blue",
  validated: "teal",
  invalidated: "red",
} as const;

const STATUS_OPTIONS = VALIDATION_STATUSES.map((s) => ({ value: s, label: VALIDATION_LABELS[s] }));
const CATEGORY_OPTIONS = ASSUMPTION_CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_LABELS[c],
}));

function AssumptionCard({
  a,
  isPm,
  readOnly,
}: {
  a: AssumptionDto;
  isPm: boolean;
  readOnly: boolean;
}) {
  const update = useUpdateAssumption();
  const remove = useDeleteAssumption();
  const [notes, setNotes] = useState(a.resultNotes ?? "");
  const [test, setTest] = useState(a.validationTest ?? "");
  const patch = (p: Parameters<typeof update.mutate>[0]["patch"]) =>
    update.mutate({ id: a.id, patch: p }, { onError: (e) => toast.error(e.message) });
  return (
    <Card withBorder p="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Group gap={6}>
            <Badge size="sm" variant="outline" color="gray">
              {CATEGORY_LABELS[a.category]}
            </Badge>
            {a.isRiskiest ? (
              <Badge size="sm" color="orange">
                Riskiest
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" mt={4}>
            {a.statement}
          </Text>
        </div>
        <Select
          size="xs"
          w={130}
          allowDeselect={false}
          aria-label="Validation status"
          disabled={readOnly}
          data={STATUS_OPTIONS}
          value={a.validationStatus}
          onChange={(v) => v && patch({ validationStatus: v as AssumptionDto["validationStatus"] })}
        />
      </Group>
      <Stack gap={6} mt="xs">
        <TextInput
          size="xs"
          label="Validation test (the next action)"
          value={test}
          disabled={readOnly}
          onChange={(e) => setTest(e.currentTarget.value)}
          onBlur={() =>
            test !== (a.validationTest ?? "") && patch({ validationTest: test.trim() || null })
          }
        />
        <Textarea
          size="xs"
          label="What you found"
          autosize
          minRows={1}
          value={notes}
          disabled={readOnly}
          onChange={(e) => setNotes(e.currentTarget.value)}
          onBlur={() =>
            notes !== (a.resultNotes ?? "") && patch({ resultNotes: notes.trim() || null })
          }
        />
        {isPm && !readOnly ? (
          <Group gap="xs">
            <Checkbox
              size="xs"
              label="Riskiest assumption"
              checked={a.isRiskiest}
              onChange={(e) => patch({ isRiskiest: e.currentTarget.checked })}
            />
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              onClick={() => {
                if (window.confirm("Delete this assumption?")) {
                  remove.mutate(a.id, { onError: (e) => toast.error(e.message) });
                }
              }}
            >
              Delete
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Card>
  );
}

function AddAssumption({ solutionId }: { solutionId: string }) {
  const create = useCreateAssumption();
  const [statement, setStatement] = useState("");
  const [category, setCategory] = useState<AssumptionCategory>("desirability");
  return (
    <Group align="flex-end" wrap="wrap">
      <TextInput
        label="Add an assumption"
        placeholder="We believe that…"
        style={{ flex: 1, minWidth: 220 }}
        value={statement}
        onChange={(e) => setStatement(e.currentTarget.value)}
      />
      <Select
        label="Category"
        w={150}
        allowDeselect={false}
        data={CATEGORY_OPTIONS}
        value={category}
        onChange={(v) => v && setCategory(v as AssumptionCategory)}
      />
      <Button
        disabled={!statement.trim()}
        loading={create.isPending}
        onClick={() =>
          create.mutate(
            { solutionId, input: { statement: statement.trim(), category } },
            { onSuccess: () => setStatement(""), onError: (e) => toast.error(e.message) },
          )
        }
      >
        Add
      </Button>
    </Group>
  );
}

export function SolutionModal({
  solution,
  assumptions,
  subprojects,
  defaultSubprojectId,
  isPm,
  readOnly,
  onClose,
}: {
  solution: SolutionDto;
  assumptions: AssumptionDto[];
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
  const riskiest = assumptions.find((a) => a.isRiskiest);

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
    <Modal opened onClose={onClose} size="xl" title={`${solution.code}  ${solution.title}`}>
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
          A solution counts as validated only when its riskiest assumption is.{" "}
          {riskiest ? "" : "Mark one assumption as the riskiest to start the roll-up."}
        </Text>
        {assumptions.length === 0 ? (
          <Text c="dimmed" size="sm">
            No assumptions yet.
          </Text>
        ) : (
          assumptions.map((a) => (
            <AssumptionCard key={a.id} a={a} isPm={isPm} readOnly={readOnly} />
          ))
        )}
        {!readOnly ? <AddAssumption solutionId={solution.id} /> : null}
        {isPm && !readOnly && !solution.convertedStoryId ? (
          <Card withBorder p="sm">
            <Text fw={600} size="sm" mb={6}>
              Convert to a user story
            </Text>
            <Group align="flex-end" wrap="wrap">
              <Select
                label="Subproject"
                w={260}
                data={subprojects.map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))}
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
                    Validate the riskiest assumption first, or override with a reason (it is
                    logged).
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
    </Modal>
  );
}
