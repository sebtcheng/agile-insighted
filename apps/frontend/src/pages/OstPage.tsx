import { Alert, Badge, Button, Card, Group, Select, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  MIN_SOLUTIONS_PER_TARGET,
  VALIDATION_LABELS,
  type AssumptionDto,
  type OpportunityDto,
  type OstTreeDto,
  type OutcomeDto,
  type SolutionDto,
} from "@myapp/shared";
import {
  useCreateOpportunity,
  useCreateOutcome,
  useCreateSolution,
  useCurrentProject,
  useDeleteOpportunity,
  useDeleteOutcome,
  useDeleteSolution,
  useOstTree,
  useSubprojects,
  useUpdateOpportunity,
  useUpdateOutcome,
  useUpdateSolution,
  useUsers,
} from "../api/hooks";
import { useIsPm } from "../auth";
import { QuickModal, type QuickField } from "../components/QuickModal";
import { SolutionModal, VALIDATION_COLOR } from "../components/SolutionModal";
import { PageHeader, QueryState, fmtDate, toast } from "../components/ui";

type Dialog =
  | { kind: "outcome"; existing?: OutcomeDto }
  | { kind: "opportunity"; outcomeId: string; parentId?: string; existing?: OpportunityDto }
  | { kind: "solution"; opportunityId: string; existing?: SolutionDto }
  | null;

const toNum = (s: string): number | null => (s === "" ? null : Number(s));

function metricLine(o: OutcomeDto): string | null {
  if (!o.metricName && o.targetValue === null) return null;
  const from = o.baselineValue === null ? "?" : String(o.baselineValue);
  const to = o.targetValue === null ? "?" : String(o.targetValue);
  const by = o.targetDate ? ` by ${fmtDate(o.targetDate)}` : "";
  return `${o.metricName ?? "Metric"}: ${from} → ${to}${by}`;
}

type Ctx = {
  tree: OstTreeDto;
  isPm: boolean;
  readOnly: boolean;
  setDialog: (d: Dialog) => void;
  openSolution: (id: string) => void;
};

function SolutionRow({ s, ctx }: { s: SolutionDto; ctx: Ctx }) {
  const remove = useDeleteSolution();
  const asms = ctx.tree.assumptions.filter((a: AssumptionDto) => a.solutionId === s.id);
  const validated = asms.filter((a) => a.validationStatus === "validated").length;
  return (
    <Group justify="space-between" wrap="nowrap" py={4} pl="md">
      <div style={{ minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <Text size="xs" fw={700}>
            {s.code}
          </Text>
          <Badge size="xs" variant="light" color={VALIDATION_COLOR[s.validationStatus]}>
            {VALIDATION_LABELS[s.validationStatus]}
          </Badge>
          {s.convertedStoryCode ? (
            <Badge size="xs" variant="outline">
              {s.convertedStoryCode}
            </Badge>
          ) : null}
        </Group>
        <Text size="sm">{s.title}</Text>
        <Text size="xs" c="dimmed">
          {asms.length === 0
            ? "No assumptions yet"
            : `${validated}/${asms.length} assumptions validated`}
          {s.ownerName ? `, owner ${s.ownerName}` : ""}
        </Text>
      </div>
      <Group gap={4} wrap="nowrap">
        <Button size="compact-xs" variant="default" onClick={() => ctx.openSolution(s.id)}>
          Assumptions
        </Button>
        {ctx.isPm && !ctx.readOnly ? (
          <>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() =>
                ctx.setDialog({ kind: "solution", opportunityId: s.opportunityId, existing: s })
              }
            >
              Edit
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              onClick={() => {
                if (window.confirm(`Delete ${s.code} and its assumptions?`)) {
                  remove.mutate(s.id, { onError: (e) => toast.error(e.message) });
                }
              }}
            >
              Delete
            </Button>
          </>
        ) : null}
      </Group>
    </Group>
  );
}

function OpportunityNode({ o, ctx, depth }: { o: OpportunityDto; ctx: Ctx; depth: number }) {
  const update = useUpdateOpportunity();
  const remove = useDeleteOpportunity();
  const solutions = ctx.tree.solutions.filter((s) => s.opportunityId === o.id);
  const children = ctx.tree.opportunities.filter((c) => c.parentOpportunityId === o.id);
  const thin = o.isTargeted && solutions.length < MIN_SOLUTIONS_PER_TARGET;
  const canEdit = ctx.isPm && !ctx.readOnly;
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <Card withBorder p="sm" mb="xs">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div style={{ flex: 1, minWidth: 220 }}>
            <Group gap={6}>
              <Text fw={600}>{o.title}</Text>
              {o.isTargeted ? <Badge>Targeted</Badge> : null}
            </Group>
            {o.evidence ? (
              <Text size="xs" c="dimmed">
                Evidence: {o.evidence}
              </Text>
            ) : null}
          </div>
          {canEdit ? (
            <Group gap={4}>
              {!o.isTargeted ? (
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() =>
                    update.mutate(
                      { id: o.id, patch: { isTargeted: true } },
                      { onError: (e) => toast.error(e.message) },
                    )
                  }
                >
                  Target this
                </Button>
              ) : null}
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => ctx.setDialog({ kind: "solution", opportunityId: o.id })}
              >
                Add solution
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() =>
                  ctx.setDialog({ kind: "opportunity", outcomeId: o.outcomeId, parentId: o.id })
                }
              >
                Add sub-opportunity
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() =>
                  ctx.setDialog({ kind: "opportunity", outcomeId: o.outcomeId, existing: o })
                }
              >
                Edit
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => {
                  if (
                    window.confirm(`Delete "${o.title}" with its solutions and sub-opportunities?`)
                  ) {
                    remove.mutate(o.id, { onError: (e) => toast.error(e.message) });
                  }
                }}
              >
                Delete
              </Button>
            </Group>
          ) : null}
        </Group>
        {thin ? (
          <Alert color="yellow" mt="xs" p="xs">
            This is the targeted opportunity but has {solutions.length} of{" "}
            {MIN_SOLUTIONS_PER_TARGET} solutions. Compare at least {MIN_SOLUTIONS_PER_TARGET}{" "}
            different ideas before committing.
          </Alert>
        ) : null}
        {solutions.map((s) => (
          <SolutionRow key={s.id} s={s} ctx={ctx} />
        ))}
      </Card>
      {children.map((c) => (
        <OpportunityNode key={c.id} o={c} ctx={ctx} depth={depth + 1} />
      ))}
    </div>
  );
}

function OutcomeCard({ outcome, ctx }: { outcome: OutcomeDto; ctx: Ctx }) {
  const remove = useDeleteOutcome();
  const roots = ctx.tree.opportunities.filter(
    (o) => o.outcomeId === outcome.id && !o.parentOpportunityId,
  );
  const line = metricLine(outcome);
  const canEdit = ctx.isPm && !ctx.readOnly;
  return (
    <Card withBorder p="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" mb="sm">
        <div>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Outcome{outcome.subprojectCode ? `, ${outcome.subprojectCode}` : ""}
          </Text>
          <Text fz={18} fw={700}>
            {outcome.title}
          </Text>
          {line ? <Text size="sm">{line}</Text> : null}
          {outcome.description ? (
            <Text size="sm" c="dimmed">
              {outcome.description}
            </Text>
          ) : null}
        </div>
        {canEdit ? (
          <Group gap={4}>
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => ctx.setDialog({ kind: "opportunity", outcomeId: outcome.id })}
            >
              Add opportunity
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => ctx.setDialog({ kind: "outcome", existing: outcome })}
            >
              Edit
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              onClick={() => {
                if (window.confirm(`Delete this outcome and everything under it?`)) {
                  remove.mutate(outcome.id, { onError: (e) => toast.error(e.message) });
                }
              }}
            >
              Delete
            </Button>
          </Group>
        ) : null}
      </Group>
      {roots.length === 0 ? (
        <Text size="sm" c="dimmed">
          No opportunities yet. Start with the customer pain points that block this outcome.
        </Text>
      ) : (
        roots.map((o) => <OpportunityNode key={o.id} o={o} ctx={ctx} depth={0} />)
      )}
    </Card>
  );
}

export function OstPage() {
  const isPm = useIsPm();
  const [params, setParams] = useSearchParams();
  const { project } = useCurrentProject();
  const subprojects = useSubprojects(project?.id);
  const users = useUsers();
  const subprojectId = params.get("subprojectId") ?? undefined;
  const query = useOstTree(project?.id, subprojectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const readOnly = !project || !!project.archivedAt;

  const createOutcome = useCreateOutcome(project?.id ?? "");
  const updateOutcome = useUpdateOutcome();
  const createOpp = useCreateOpportunity();
  const updateOpp = useUpdateOpportunity();
  const createSol = useCreateSolution();
  const updateSol = useUpdateSolution();
  const close = () => setDialog(null);
  const done = { onSuccess: close, onError: (e: Error) => toast.error(e.message) };

  const outcomeFields: QuickField[] = [
    { key: "title", label: "Business outcome", required: true },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "metricName", label: "Metric", description: "What you will measure" },
    { key: "baselineValue", label: "Baseline", kind: "number" },
    { key: "targetValue", label: "Target", kind: "number" },
    { key: "targetDate", label: "Target date", kind: "date" },
    {
      key: "subprojectId",
      label: "Subproject",
      kind: "select",
      options: (subprojects.data ?? []).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` })),
    },
  ];
  const oppFields: QuickField[] = [
    {
      key: "title",
      label: "Customer opportunity",
      description: "A pain point or need",
      required: true,
    },
    { key: "evidence", label: "Evidence", kind: "textarea" },
    { key: "description", label: "Notes", kind: "textarea" },
  ];
  const solFields: QuickField[] = [
    { key: "title", label: "Potential solution", required: true },
    {
      key: "ownerId",
      label: "Owner",
      kind: "select",
      options: (users.data ?? [])
        .filter((u) => u.isActive)
        .map((u) => ({ value: u.id, label: u.fullName })),
    },
  ];

  return (
    <>
      <PageHeader
        title="Opportunity Solution Tree"
        subtitle="Start from an outcome, map the opportunities, compare solutions, and test the riskiest assumptions before building."
        actions={
          isPm && !readOnly ? (
            <Button onClick={() => setDialog({ kind: "outcome" })}>Add outcome</Button>
          ) : null
        }
      />
      <Select
        label="Subproject"
        w={260}
        mb="md"
        clearable
        placeholder="All subprojects"
        data={(subprojects.data ?? []).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))}
        value={subprojectId ?? null}
        onChange={(v) => {
          const next = new URLSearchParams(params);
          if (v) next.set("subprojectId", v);
          else next.delete("subprojectId");
          setParams(next, { replace: true });
        }}
      />
      <QueryState
        query={query}
        isEmpty={(d) => d.outcomes.length === 0}
        empty={
          isPm ? "No outcomes yet. Add the business outcome you want to move." : "No outcomes yet."
        }
      >
        {(tree) => {
          const ctx: Ctx = { tree, isPm, readOnly, setDialog, openSolution: setOpenId };
          const open = tree.solutions.find((s) => s.id === openId);
          return (
            <Stack>
              {tree.outcomes.map((o) => (
                <OutcomeCard key={o.id} outcome={o} ctx={ctx} />
              ))}
              {open ? (
                <SolutionModal
                  solution={open}
                  assumptions={tree.assumptions.filter((a) => a.solutionId === open.id)}
                  subprojects={subprojects.data ?? []}
                  defaultSubprojectId={
                    tree.outcomes.find(
                      (o) =>
                        o.id ===
                        tree.opportunities.find((p) => p.id === open.opportunityId)?.outcomeId,
                    )?.subprojectId ?? null
                  }
                  isPm={isPm}
                  readOnly={readOnly}
                  onClose={() => setOpenId(null)}
                />
              ) : null}
            </Stack>
          );
        }}
      </QueryState>

      {dialog?.kind === "outcome" ? (
        <QuickModal
          opened
          title={dialog.existing ? "Edit outcome" : "Add outcome"}
          fields={outcomeFields}
          pending={createOutcome.isPending || updateOutcome.isPending}
          initial={
            dialog.existing
              ? {
                  title: dialog.existing.title,
                  description: dialog.existing.description ?? "",
                  metricName: dialog.existing.metricName ?? "",
                  baselineValue: dialog.existing.baselineValue?.toString() ?? "",
                  targetValue: dialog.existing.targetValue?.toString() ?? "",
                  targetDate: dialog.existing.targetDate ?? "",
                  subprojectId: dialog.existing.subprojectId ?? "",
                }
              : undefined
          }
          onClose={close}
          onSubmit={(v) => {
            const input = {
              title: v.title ?? "",
              description: v.description || null,
              metricName: v.metricName || null,
              baselineValue: toNum(v.baselineValue ?? ""),
              targetValue: toNum(v.targetValue ?? ""),
              targetDate: v.targetDate || null,
              subprojectId: v.subprojectId || null,
            };
            if (dialog.existing)
              updateOutcome.mutate({ id: dialog.existing.id, patch: input }, done);
            else createOutcome.mutate(input, done);
          }}
        />
      ) : null}
      {dialog?.kind === "opportunity" ? (
        <QuickModal
          opened
          title={dialog.existing ? "Edit opportunity" : "Add opportunity"}
          fields={oppFields}
          pending={createOpp.isPending || updateOpp.isPending}
          initial={
            dialog.existing
              ? {
                  title: dialog.existing.title,
                  evidence: dialog.existing.evidence ?? "",
                  description: dialog.existing.description ?? "",
                }
              : undefined
          }
          onClose={close}
          onSubmit={(v) => {
            const input = {
              title: v.title ?? "",
              evidence: v.evidence || null,
              description: v.description || null,
            };
            if (dialog.existing) updateOpp.mutate({ id: dialog.existing.id, patch: input }, done);
            else
              createOpp.mutate(
                {
                  outcomeId: dialog.outcomeId,
                  input: { ...input, parentOpportunityId: dialog.parentId ?? null },
                },
                done,
              );
          }}
        />
      ) : null}
      {dialog?.kind === "solution" ? (
        <QuickModal
          opened
          title={dialog.existing ? "Edit solution" : "Add solution"}
          fields={solFields}
          pending={createSol.isPending || updateSol.isPending}
          initial={
            dialog.existing
              ? { title: dialog.existing.title, ownerId: dialog.existing.ownerId ?? "" }
              : undefined
          }
          onClose={close}
          onSubmit={(v) => {
            const input = { title: v.title ?? "", ownerId: v.ownerId || null };
            if (dialog.existing) updateSol.mutate({ id: dialog.existing.id, patch: input }, done);
            else createSol.mutate({ opportunityId: dialog.opportunityId, input }, done);
          }}
        />
      ) : null}
    </>
  );
}
