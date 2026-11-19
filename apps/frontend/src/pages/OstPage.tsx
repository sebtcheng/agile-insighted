import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  MIN_SOLUTIONS_PER_TARGET,
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
import { SolutionModal } from "../components/SolutionModal";
import { SolutionCheck } from "../components/SolutionCheck";
import { OstActionBar } from "../components/OstActionBar";
import { OstTable } from "../components/OstTable";
import { PageHeader, QueryState, fmtDate, toast } from "../components/ui";
import { ViewModeToggle } from "../components/ViewModeToggle";
import { useViewMode } from "../lib/viewMode";
import { outcomeSolutions, solutionProgress } from "../lib/ostOptimistic";
import { CompletionMeter } from "../components/CompletionMeter";
import { SideModal } from "../components/SideModal";

type Dialog =
  | { kind: "outcome"; existing?: OutcomeDto }
  | { kind: "opportunity"; outcomeId: string; existing?: OpportunityDto }
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

export type OstCtx = {
  tree: OstTreeDto;
  isPm: boolean;
  readOnly: boolean;
  setDialog: (d: Dialog) => void;
  openSolution: (id: string) => void;
};

/** A solution is the action under an opportunity: tick it when done. */
function SolutionRow({ s, ctx }: { s: SolutionDto; ctx: OstCtx }) {
  const remove = useDeleteSolution();
  const canEdit = ctx.isPm && !ctx.readOnly;
  return (
    <div className="ost-solution" style={{ paddingLeft: "var(--mantine-spacing-md)" }}>
      <Group justify="space-between" wrap="wrap" py={4} align="flex-start">
        <div style={{ minWidth: 0, flex: 1 }}>
          <SolutionCheck solution={s} editable={canEdit} />
          {s.ownerName ? (
            <Text size="xs" c="dimmed" ml={26}>
              Owner {s.ownerName}
            </Text>
          ) : null}
        </div>
        {canEdit ? (
          <OstActionBar
            scope={s.code}
            workflow={
              s.convertedStoryId
                ? []
                : [
                    {
                      label: "Convert to story",
                      onClick: () => ctx.openSolution(s.id),
                      hint: "Turn this solution into a user story",
                    },
                  ]
            }
            onEdit={() =>
              ctx.setDialog({ kind: "solution", opportunityId: s.opportunityId, existing: s })
            }
            onDelete={() => {
              if (window.confirm(`Delete ${s.code}?`)) {
                remove.mutate(s.id, { onError: (e) => toast.error(e.message) });
              }
            }}
          />
        ) : null}
      </Group>
    </div>
  );
}

function OpportunityNode({ o, ctx }: { o: OpportunityDto; ctx: OstCtx }) {
  const update = useUpdateOpportunity();
  const remove = useDeleteOpportunity();
  const solutions = ctx.tree.solutions.filter((s) => s.opportunityId === o.id);
  const thin = o.isTargeted && solutions.length < MIN_SOLUTIONS_PER_TARGET;
  const canEdit = ctx.isPm && !ctx.readOnly;
  return (
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
          <OstActionBar
            scope="opportunity"
            create={[
              {
                label: "Add solution",
                onClick: () => ctx.setDialog({ kind: "solution", opportunityId: o.id }),
              },
            ]}
            workflow={
              o.isTargeted
                ? []
                : [
                    {
                      label: "Target this",
                      hint: "Mark as the opportunity to solve now",
                      onClick: () =>
                        update.mutate(
                          { id: o.id, patch: { isTargeted: true } },
                          { onError: (e) => toast.error(e.message) },
                        ),
                    },
                  ]
            }
            onEdit={() =>
              ctx.setDialog({ kind: "opportunity", outcomeId: o.outcomeId, existing: o })
            }
            onDelete={() => {
              if (window.confirm(`Delete "${o.title}" with its solutions?`)) {
                remove.mutate(o.id, { onError: (e) => toast.error(e.message) });
              }
            }}
          />
        ) : null}
      </Group>
      {thin ? (
        <Alert color="yellow" mt="xs" p="xs">
          This is the targeted opportunity but has {solutions.length} of {MIN_SOLUTIONS_PER_TARGET}{" "}
          solutions. Compare at least {MIN_SOLUTIONS_PER_TARGET} different ideas before committing.
        </Alert>
      ) : null}
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mt="xs">
        Solutions (actions)
      </Text>
      {solutions.length === 0 ? (
        <Text size="sm" c="dimmed">
          No solutions yet.
        </Text>
      ) : (
        solutions.map((s) => <SolutionRow key={s.id} s={s} ctx={ctx} />)
      )}
    </Card>
  );
}

/** The outcome, stated once: it is the side modal's header, with its own Edit and Delete. */
function OutcomeHeader({
  outcome,
  ctx,
  onDeleted,
}: {
  outcome: OutcomeDto;
  ctx: OstCtx;
  onDeleted: () => void;
}) {
  const remove = useDeleteOutcome();
  const line = metricLine(outcome);
  const canEdit = ctx.isPm && !ctx.readOnly;
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
      <div style={{ minWidth: 0 }}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Outcome{outcome.subprojectName ? `, ${outcome.subprojectName}` : ""}
        </Text>
        <Text fz={18} fw={700}>
          {outcome.title}
        </Text>
        {line ? <Text size="sm">{line}</Text> : null}
      </div>
      {canEdit ? (
        <OstActionBar
          scope="outcome"
          onEdit={() => ctx.setDialog({ kind: "outcome", existing: outcome })}
          onDelete={() => {
            if (window.confirm(`Delete this outcome and everything under it?`)) {
              remove.mutate(outcome.id, {
                onSuccess: onDeleted,
                onError: (e) => toast.error(e.message),
              });
            }
          }}
        />
      ) : null}
    </Group>
  );
}

/** Body of the side modal: opportunities for this outcome, each with its solutions as the actions. */
function OutcomeDetail({ outcome, ctx }: { outcome: OutcomeDto; ctx: OstCtx }) {
  const opportunities = ctx.tree.opportunities.filter((o) => o.outcomeId === outcome.id);
  const canEdit = ctx.isPm && !ctx.readOnly;
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Opportunities
        </Text>
        {canEdit ? (
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => ctx.setDialog({ kind: "opportunity", outcomeId: outcome.id })}
          >
            Add opportunity
          </Button>
        ) : null}
      </Group>
      {opportunities.length === 0 ? (
        <Text size="sm" c="dimmed">
          No opportunities yet. Start with the customer pain points that block this outcome.
        </Text>
      ) : (
        opportunities.map((o) => <OpportunityNode key={o.id} o={o} ctx={ctx} />)
      )}
    </Stack>
  );
}

/** Compact grid card; opens the opportunities and their solution actions in a slide-over. */
export function OutcomeCard({ outcome, ctx }: { outcome: OutcomeDto; ctx: OstCtx }) {
  const [opened, setOpened] = useState(false);
  const { done, total } = solutionProgress(outcomeSolutions(ctx.tree, outcome.id));
  const line = metricLine(outcome);
  return (
    <>
      <Card withBorder p="md" h="100%">
        <UnstyledButton
          w="100%"
          onClick={() => setOpened(true)}
          aria-label={`View steps for ${outcome.title}`}
        >
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Outcome{outcome.subprojectName ? `, ${outcome.subprojectName}` : ""}
          </Text>
          <Text fz={16} fw={700} lineClamp={2}>
            {outcome.title}
          </Text>
          {line ? (
            <Text size="sm" lineClamp={1}>
              {line}
            </Text>
          ) : null}
          <div style={{ marginTop: "var(--mantine-spacing-sm)" }}>
            <CompletionMeter done={done} total={total} />
          </div>
          <Text size="xs" c="dimmed" mt={6}>
            View steps
          </Text>
        </UnstyledButton>
      </Card>
      <SideModal
        opened={opened}
        onClose={() => setOpened(false)}
        title={<OutcomeHeader outcome={outcome} ctx={ctx} onDeleted={() => setOpened(false)} />}
        size="lg"
      >
        <OutcomeDetail outcome={outcome} ctx={ctx} />
      </SideModal>
    </>
  );
}

export function OstPage() {
  const isPm = useIsPm();
  const [viewMode, setViewMode] = useViewMode("card");
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
      options: (subprojects.data ?? []).map((s) => ({ value: s.id, label: s.name })),
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
        subtitle="Start from an outcome, map the opportunities, and compare the solutions you could take as actions."
        actions={
          isPm && !readOnly ? (
            <Button onClick={() => setDialog({ kind: "outcome" })}>Add outcome</Button>
          ) : null
        }
      />
      <Group mb="md" align="flex-end" wrap="wrap">
        <Select
          label="Subproject"
          w={260}
          clearable
          placeholder="All subprojects"
          data={(subprojects.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={subprojectId ?? null}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            if (v) next.set("subprojectId", v);
            else next.delete("subprojectId");
            setParams(next, { replace: true });
          }}
        />
        <div style={{ marginInlineStart: "auto" }}>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </Group>
      <QueryState
        query={query}
        isEmpty={(d) => d.outcomes.length === 0}
        empty={
          isPm ? "No outcomes yet. Add the business outcome you want to move." : "No outcomes yet."
        }
      >
        {(tree) => {
          const ctx: OstCtx = { tree, isPm, readOnly, setDialog, openSolution: setOpenId };
          const open = tree.solutions.find((s) => s.id === openId);
          return (
            <Stack>
              {viewMode === "table" ? (
                <OstTable ctx={ctx} />
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                  {tree.outcomes.map((o) => (
                    <OutcomeCard key={o.id} outcome={o} ctx={ctx} />
                  ))}
                </SimpleGrid>
              )}
              {open ? (
                <SolutionModal
                  solution={open}
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
                  input,
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
