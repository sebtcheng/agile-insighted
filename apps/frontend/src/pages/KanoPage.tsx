import {
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  KANO_CATEGORIES,
  KANO_DECISIONS,
  KANO_DECISION_LABELS,
  KANO_LABELS,
  RICE_IMPACT_VALUES,
  WSJF_VALUES,
  type KanoCategory,
  type KanoDecision,
  type KanoDto,
} from "@myapp/shared";
import {
  useCreateKano,
  useCurrentProject,
  useDeleteKano,
  useKano,
  usePromoteKano,
  useReleases,
  useSprints,
  useSubprojects,
  useUpdateKano,
} from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { PageHeader, QueryState, toast } from "../components/ui";

const CATEGORY_OPTIONS = KANO_CATEGORIES.map((c) => ({ value: c, label: KANO_LABELS[c] }));
const DECISION_OPTIONS = KANO_DECISIONS.map((d) => ({ value: d, label: KANO_DECISION_LABELS[d] }));
const WSJF_OPTIONS = WSJF_VALUES.map((n) => ({ value: String(n), label: String(n) }));
const IMPACT_OPTIONS = RICE_IMPACT_VALUES.map((n) => ({ value: String(n), label: String(n) }));

const CATEGORY_COLOR: Record<KanoCategory, string> = {
  must_be: "red",
  performance: "blue",
  attractive: "teal",
  indifferent: "gray",
  reverse: "orange",
};

const toNum = (v: string): number | null => (v === "" ? null : Number(v));
const fmtScore = (n: number | null) =>
  n === null ? "–" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function SubmitModal({
  opened,
  onClose,
  projectId,
}: {
  opened: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const me = useAuth();
  const subprojects = useSubprojects(projectId);
  const create = useCreateKano(projectId);
  const form = useForm({
    initialValues: {
      description: "",
      requesterName: me.fullName,
      requesterRole: "",
      subprojectId: "",
    },
    validate: {
      description: (v) => (v.trim() ? null : "Describe the request"),
      requesterName: (v) => (v.trim() ? null : "Who asked for this?"),
    },
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Submit a request" size="lg">
      <form
        onSubmit={form.onSubmit((v) =>
          create.mutate(
            {
              description: v.description.trim(),
              requesterName: v.requesterName.trim(),
              requesterRole: v.requesterRole.trim() || null,
              subprojectId: v.subprojectId || null,
            },
            {
              onSuccess: () => {
                form.reset();
                onClose();
              },
              onError: (e) => toast.error(e.message),
            },
          ),
        )}
      >
        <Stack>
          <Textarea
            label="Request"
            autosize
            minRows={2}
            data-autofocus
            {...form.getInputProps("description")}
          />
          <Group grow align="flex-start">
            <TextInput label="Requested by" {...form.getInputProps("requesterName")} />
            <TextInput label="Their role" {...form.getInputProps("requesterRole")} />
          </Group>
          <Select
            label="Subproject"
            clearable
            placeholder="Not sure yet"
            data={(subprojects.data ?? []).map((s) => ({
              value: s.id,
              label: `${s.code} ${s.name}`,
            }))}
            {...form.getInputProps("subprojectId")}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Submit
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

type EditValues = {
  description: string;
  requesterName: string;
  requesterRole: string;
  subprojectId: string;
  kanoCategory: string;
  decision: string;
  targetSprintId: string;
  targetReleaseId: string;
  wsjfBusinessValue: string;
  wsjfTimeCriticality: string;
  wsjfRiskReduction: string;
  wsjfJobSize: string;
  riceReach: number | string;
  riceImpact: string;
  riceConfidence: number | string;
  riceEffort: number | string;
};

const numOrNull = (v: number | string): number | null => (v === "" ? null : Number(v));

function EditModal({
  request,
  onClose,
  projectId,
}: {
  request: KanoDto;
  onClose: () => void;
  projectId: string;
}) {
  const subprojects = useSubprojects(projectId);
  const sprints = useSprints(projectId);
  const releases = useReleases(projectId);
  const update = useUpdateKano();
  const remove = useDeleteKano();
  const promote = usePromoteKano();
  const form = useForm<EditValues>({
    initialValues: {
      description: request.description,
      requesterName: request.requesterName,
      requesterRole: request.requesterRole ?? "",
      subprojectId: request.subprojectId ?? "",
      kanoCategory: request.kanoCategory ?? "",
      decision: request.decision ?? "",
      targetSprintId: request.targetSprintId ?? "",
      targetReleaseId: request.targetReleaseId ?? "",
      wsjfBusinessValue: request.wsjfBusinessValue ? String(request.wsjfBusinessValue) : "",
      wsjfTimeCriticality: request.wsjfTimeCriticality ? String(request.wsjfTimeCriticality) : "",
      wsjfRiskReduction: request.wsjfRiskReduction ? String(request.wsjfRiskReduction) : "",
      wsjfJobSize: request.wsjfJobSize ? String(request.wsjfJobSize) : "",
      riceReach: request.riceReach ?? "",
      riceImpact: request.riceImpact !== null ? String(request.riceImpact) : "",
      riceConfidence: request.riceConfidence ?? "",
      riceEffort: request.riceEffort ?? "",
    },
    validate: {
      description: (v) => (v.trim() ? null : "Describe the request"),
      requesterName: (v) => (v.trim() ? null : "Who asked for this?"),
    },
  });
  const save = form.onSubmit((v) =>
    update.mutate(
      {
        id: request.id,
        patch: {
          description: v.description.trim(),
          requesterName: v.requesterName.trim(),
          requesterRole: v.requesterRole.trim() || null,
          subprojectId: v.subprojectId || null,
          kanoCategory: (v.kanoCategory || null) as KanoCategory | null,
          decision: (v.decision || null) as KanoDecision | null,
          targetSprintId: v.targetSprintId || null,
          targetReleaseId: v.targetReleaseId || null,
          wsjfBusinessValue: toNum(v.wsjfBusinessValue),
          wsjfTimeCriticality: toNum(v.wsjfTimeCriticality),
          wsjfRiskReduction: toNum(v.wsjfRiskReduction),
          wsjfJobSize: toNum(v.wsjfJobSize),
          riceReach: numOrNull(v.riceReach),
          riceImpact: toNum(v.riceImpact),
          riceConfidence: numOrNull(v.riceConfidence),
          riceEffort: numOrNull(v.riceEffort),
        },
      },
      { onSuccess: onClose, onError: (e) => toast.error(e.message) },
    ),
  );
  return (
    <Modal opened onClose={onClose} title={request.code} size="xl">
      <form onSubmit={save}>
        <Stack>
          <Textarea label="Request" autosize minRows={2} {...form.getInputProps("description")} />
          <Group grow align="flex-start">
            <TextInput label="Requested by" {...form.getInputProps("requesterName")} />
            <TextInput label="Their role" {...form.getInputProps("requesterRole")} />
            <Select
              label="Subproject"
              clearable
              data={(subprojects.data ?? []).map((s) => ({ value: s.id, label: s.code }))}
              {...form.getInputProps("subprojectId")}
            />
          </Group>
          <Group grow align="flex-start">
            <Select
              label="Kano category"
              clearable
              placeholder="Not evaluated"
              data={CATEGORY_OPTIONS}
              {...form.getInputProps("kanoCategory")}
            />
            <Select
              label="Decision"
              clearable
              placeholder="Undecided"
              data={DECISION_OPTIONS}
              {...form.getInputProps("decision")}
            />
          </Group>
          <Group grow align="flex-start">
            <Select
              label="Target sprint"
              clearable
              data={(sprints.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              {...form.getInputProps("targetSprintId")}
            />
            <Select
              label="Target release"
              clearable
              data={(releases.data ?? []).map((r) => ({
                value: r.id,
                label: r.isMvp ? `${r.name} (MVP)` : r.name,
              }))}
              {...form.getInputProps("targetReleaseId")}
            />
          </Group>
          <div>
            <Group justify="space-between" mb={4}>
              <Text fw={600} size="sm">
                WSJF
              </Text>
              <Text size="xs" c="dimmed">
                (value + time criticality + risk reduction) ÷ job size. Needs all four inputs.
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <Select
                label="Business value"
                clearable
                data={WSJF_OPTIONS}
                {...form.getInputProps("wsjfBusinessValue")}
              />
              <Select
                label="Time criticality"
                clearable
                data={WSJF_OPTIONS}
                {...form.getInputProps("wsjfTimeCriticality")}
              />
              <Select
                label="Risk reduction"
                clearable
                data={WSJF_OPTIONS}
                {...form.getInputProps("wsjfRiskReduction")}
              />
              <Select
                label="Job size"
                clearable
                data={WSJF_OPTIONS}
                {...form.getInputProps("wsjfJobSize")}
              />
            </SimpleGrid>
            <Text size="sm" mt={4}>
              Score now: <b>{fmtScore(request.wsjfScore)}</b> (recalculated when you save)
            </Text>
          </div>
          <div>
            <Group justify="space-between" mb={4}>
              <Text fw={600} size="sm">
                RICE (optional)
              </Text>
              <Text size="xs" c="dimmed">
                reach × impact × confidence ÷ effort
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }}>
              <NumberInput
                label="Reach"
                min={0}
                allowDecimal={false}
                {...form.getInputProps("riceReach")}
              />
              <Select
                label="Impact"
                clearable
                data={IMPACT_OPTIONS}
                {...form.getInputProps("riceImpact")}
              />
              <NumberInput
                label="Confidence %"
                min={0}
                max={100}
                allowDecimal={false}
                {...form.getInputProps("riceConfidence")}
              />
              <NumberInput label="Effort" min={0.01} {...form.getInputProps("riceEffort")} />
            </SimpleGrid>
            <Text size="sm" mt={4}>
              Score now: <b>{fmtScore(request.riceScore)}</b>
            </Text>
          </div>
          <Group justify="space-between">
            <Group gap="xs">
              <Button
                variant="subtle"
                color="red"
                onClick={() => {
                  if (window.confirm(`Delete ${request.code}? This cannot be undone.`)) {
                    remove.mutate(request.id, {
                      onSuccess: onClose,
                      onError: (e) => toast.error(e.message),
                    });
                  }
                }}
              >
                Delete
              </Button>
              {request.promotedStoryId ? (
                <Badge variant="light">Promoted to {request.promotedStoryCode}</Badge>
              ) : (
                <Button
                  variant="light"
                  loading={promote.isPending}
                  disabled={!request.subprojectId}
                  title={
                    request.subprojectId
                      ? undefined
                      : "Choose a subproject and save before promoting"
                  }
                  onClick={() =>
                    promote.mutate(
                      { id: request.id, input: {} },
                      {
                        onSuccess: (r) => {
                          toast.ok(`Created ${r.request.promotedStoryCode} in the story map`);
                          onClose();
                        },
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  Promote to story
                </Button>
              )}
            </Group>
            <Group>
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={update.isPending}>
                Save
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function KanoPage() {
  const isPm = useIsPm();
  const [params, setParams] = useSearchParams();
  const { project } = useCurrentProject();
  const subprojects = useSubprojects(project?.id);
  const filters = {
    kanoCategory: (params.get("category") as KanoCategory | null) ?? undefined,
    decision: (params.get("decision") as KanoDecision | null) ?? undefined,
    subprojectId: params.get("subprojectId") ?? undefined,
    unevaluated: params.get("unevaluated") === "true",
    sort: (params.get("sort") as "wsjf" | "rice" | "code" | null) ?? "wsjf",
  };
  const query = useKano(project?.id, filters);
  const [submitOpen, submit] = useDisclosure(false);
  const [editing, setEditing] = useState<KanoDto | null>(null);
  const readOnly = !project || !!project.archivedAt;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Kano Request Tracker"
        subtitle="Requests from the people you build for. Categorize them, score them, decide, then promote the keepers into the story map."
        actions={
          <Button onClick={submit.open} disabled={readOnly}>
            Submit request
          </Button>
        }
      />
      <Group mb="md" align="flex-end" wrap="wrap">
        <Select
          label="Category"
          clearable
          placeholder="All"
          data={CATEGORY_OPTIONS}
          value={filters.kanoCategory ?? null}
          onChange={(v) => setParam("category", v)}
          w={190}
        />
        <Select
          label="Decision"
          clearable
          placeholder="All"
          data={DECISION_OPTIONS}
          value={filters.decision ?? null}
          onChange={(v) => setParam("decision", v)}
          w={200}
        />
        <Select
          label="Subproject"
          clearable
          placeholder="All"
          data={(subprojects.data ?? []).map((s) => ({ value: s.id, label: s.code }))}
          value={filters.subprojectId ?? null}
          onChange={(v) => setParam("subprojectId", v)}
          w={150}
        />
        <Select
          label="Sort by"
          allowDeselect={false}
          data={[
            { value: "wsjf", label: "WSJF score" },
            { value: "rice", label: "RICE score" },
            { value: "code", label: "Request ID" },
          ]}
          value={filters.sort}
          onChange={(v) => setParam("sort", v === "wsjf" ? null : v)}
          w={150}
        />
        <Checkbox
          label="Not evaluated yet"
          mb={6}
          checked={filters.unevaluated}
          onChange={(e) => setParam("unevaluated", e.currentTarget.checked ? "true" : null)}
        />
      </Group>
      <QueryState query={query} isEmpty={(d) => d.length === 0} empty="No requests match.">
        {(items) => (
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Request</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th ta="right">WSJF</Table.Th>
                  <Table.Th ta="right">RICE</Table.Th>
                  <Table.Th>Decision</Table.Th>
                  <Table.Th>Story</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {r.code}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {r.subprojectCode ?? "No subproject"}
                      </Text>
                    </Table.Td>
                    <Table.Td maw={380}>
                      <Text size="sm">{r.description}</Text>
                      <Text size="xs" c="dimmed">
                        {r.requesterName}
                        {r.requesterRole ? `, ${r.requesterRole}` : ""}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {r.kanoCategory ? (
                        <Badge color={CATEGORY_COLOR[r.kanoCategory]} variant="light">
                          {KANO_LABELS[r.kanoCategory]}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Not evaluated
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">{fmtScore(r.wsjfScore)}</Table.Td>
                    <Table.Td ta="right">{fmtScore(r.riceScore)}</Table.Td>
                    <Table.Td>
                      {r.decision ? (
                        KANO_DECISION_LABELS[r.decision]
                      ) : (
                        <Text size="sm" c="dimmed">
                          Undecided
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{r.promotedStoryCode ?? "–"}</Table.Td>
                    <Table.Td>
                      {isPm && !readOnly ? (
                        <Button size="compact-xs" variant="default" onClick={() => setEditing(r)}>
                          Evaluate
                        </Button>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryState>
      {project ? (
        <SubmitModal opened={submitOpen} onClose={submit.close} projectId={project.id} />
      ) : null}
      {project && editing ? (
        <EditModal
          key={editing.id}
          request={editing}
          projectId={project.id}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
