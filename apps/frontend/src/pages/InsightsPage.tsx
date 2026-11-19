import {
  Badge,
  Box,
  Card,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useSearchParams } from "react-router-dom";
import { ENUM_LABELS, type InsightsDto, type ThroughputWeek, type WorkType } from "@myapp/shared";
import { useCurrentProject, useInsights, useSubprojects } from "../api/hooks";
import { useOpenActivity } from "../components/ActivityRow";
import { PageHeader, QueryState, fmtDate } from "../components/ui";

const WORK_COLOR: Record<WorkType, string> = {
  feature: "var(--mantine-color-blue-6)",
  defect: "var(--mantine-color-red-6)",
  risk: "var(--mantine-color-orange-6)",
  debt: "var(--mantine-color-grape-6)",
  enabler: "var(--mantine-color-teal-6)",
};

const days = (n: number | null) => (n === null ? "–" : `${n} ${n === 1 ? "day" : "days"}`);

function addWeeks(from: Date, weeks: number): Date {
  return new Date(from.getTime() + weeks * 7 * 86_400_000);
}
const fmtDay = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card withBorder p="md">
      <Text size="xs" tt="uppercase" fw={700} c="dimmed">
        {label}
      </Text>
      <Text fz={28} fw={700} lh={1.2}>
        {value}
      </Text>
      {hint ? (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

/** Weekly completions as plain SVG bars: the data is a handful of integers, so no chart library is needed. */
function ThroughputChart({ weeks, average }: { weeks: ThroughputWeek[]; average: number }) {
  const W = 640;
  const H = 180;
  const pad = { top: 12, right: 8, bottom: 28, left: 28 };
  const max = Math.max(4, ...weeks.map((w) => w.count));
  const bw = (W - pad.left - pad.right) / weeks.length;
  const y = (v: number) => pad.top + (H - pad.top - pad.bottom) * (1 - v / max);
  const summary = weeks.map((w) => `${fmtDate(w.weekStart)}: ${w.count}`).join("; ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Items completed per week. ${summary}`}
      style={{ width: "100%", height: "auto", maxHeight: 220 }}
    >
      {[0, Math.round(max / 2), max].map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--mantine-color-gray-3)"
            strokeWidth={1}
          />
          <text
            x={pad.left - 6}
            y={y(t) + 4}
            textAnchor="end"
            fontSize={11}
            fill="var(--mantine-color-dimmed)"
          >
            {t}
          </text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const x = pad.left + i * bw + bw * 0.15;
        const h = H - pad.bottom - y(w.count);
        return (
          <g key={w.weekStart}>
            <rect
              x={x}
              y={y(w.count)}
              width={bw * 0.7}
              height={Math.max(h, 0)}
              rx={2}
              fill="var(--mantine-color-blue-6)"
              opacity={w.partial ? 0.35 : 1}
            >
              <title>{`Week of ${fmtDate(w.weekStart)}: ${w.count}${w.partial ? " so far" : ""}`}</title>
            </rect>
            {w.count > 0 ? (
              <text
                x={x + bw * 0.35}
                y={y(w.count) - 4}
                textAnchor="middle"
                fontSize={11}
                fill="var(--mantine-color-text)"
              >
                {w.count}
              </text>
            ) : null}
            {i % Math.ceil(weeks.length / 8) === 0 || i === weeks.length - 1 ? (
              <text
                x={x + bw * 0.35}
                y={H - 10}
                textAnchor="middle"
                fontSize={10}
                fill="var(--mantine-color-dimmed)"
              >
                {new Date(`${w.weekStart}T00:00:00Z`).toLocaleDateString(undefined, {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
                })}
              </text>
            ) : null}
          </g>
        );
      })}
      <line
        x1={pad.left}
        x2={W - pad.right}
        y1={y(average)}
        y2={y(average)}
        stroke="var(--mantine-color-orange-6)"
        strokeDasharray="4 3"
        strokeWidth={1.5}
      >
        <title>{`Average ${average} per week`}</title>
      </line>
    </svg>
  );
}

function FlowBar({ data }: { data: InsightsDto["flowDistribution"] }) {
  return (
    <Stack gap="xs">
      <Box
        role="img"
        aria-label={data.map((d) => `${ENUM_LABELS.workType[d.workType]} ${d.share}%`).join(", ")}
        style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden" }}
      >
        {data.map((d) => (
          <div
            key={d.workType}
            title={`${ENUM_LABELS.workType[d.workType]}: ${d.count} (${d.share}%)`}
            style={{ width: `${d.share}%`, background: WORK_COLOR[d.workType] }}
          />
        ))}
      </Box>
      <Group gap="md" wrap="wrap">
        {data.map((d) => (
          <Group key={d.workType} gap={6}>
            <span
              aria-hidden
              style={{ width: 10, height: 10, borderRadius: 2, background: WORK_COLOR[d.workType] }}
            />
            <Text size="sm">
              {ENUM_LABELS.workType[d.workType]} {d.count} ({d.share}%)
            </Text>
          </Group>
        ))}
      </Group>
    </Stack>
  );
}

function ForecastCard({ data }: { data: InsightsDto }) {
  const f = data.forecast;
  const today = new Date(data.generatedAt);
  return (
    <Card withBorder p="md">
      <Text fw={700}>Forecast</Text>
      <Text size="sm" c="dimmed" mb="sm">
        Simulated {f.runs.toLocaleString()} times from the last {f.samples.length} complete weeks of
        throughput. A range, not a promise: it assumes the next weeks look like these.
      </Text>
      {f.note ? (
        <Text size="sm">{f.note}</Text>
      ) : (
        <Stack gap="md">
          {f.weeksToFinish ? (
            <div>
              <Text size="sm" mb={6}>
                <b>{f.remaining}</b> open {f.remaining === 1 ? "item" : "items"} will be done:
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                {(
                  [
                    ["50% likely", f.weeksToFinish.p50],
                    ["85% likely", f.weeksToFinish.p85],
                    ["95% likely", f.weeksToFinish.p95],
                  ] as const
                ).map(([label, w]) => (
                  <Card key={label} withBorder p="sm">
                    <Text size="xs" c="dimmed">
                      {label} by
                    </Text>
                    <Text fw={700}>{w === 0 ? "Already done" : fmtDay(addWeeks(today, w))}</Text>
                    <Text size="xs" c="dimmed">
                      {w === 0 ? "" : `within ${w} ${w === 1 ? "week" : "weeks"}`}
                    </Text>
                  </Card>
                ))}
              </SimpleGrid>
            </div>
          ) : null}
          <div>
            <Text size="sm" mb={6}>
              Or, how many items get done:
            </Text>
            <Group gap="lg" wrap="wrap">
              {f.itemsDone.map((h) => (
                <Text size="sm" key={h.weeks}>
                  In {h.weeks} weeks: at least <b>{h.p85}</b> (85% likely), around <b>{h.p50}</b>{" "}
                  (50%)
                </Text>
              ))}
            </Group>
          </div>
        </Stack>
      )}
    </Card>
  );
}

export function InsightsPage() {
  const [params, setParams] = useSearchParams();
  const { project } = useCurrentProject();
  const subprojects = useSubprojects(project?.id);
  const open = useOpenActivity();
  const subprojectId = params.get("subprojectId") ?? undefined;
  const weeks = Number(params.get("weeks") ?? 12);
  const query = useInsights({ projectId: project?.id, subprojectId, weeks });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="How work flows through the team: how much finishes, how long it takes, and what is likely next. Team-level only; nothing here compares people."
      />
      <Group mb="md" align="flex-end" wrap="wrap">
        <Select
          label="Subproject"
          clearable
          placeholder="All subprojects"
          w={260}
          data={(subprojects.data ?? []).map((s) => ({
            value: s.id,
            label: s.name,
          }))}
          value={subprojectId ?? null}
          onChange={(v) => setParam("subprojectId", v)}
        />
        <Select
          label="History"
          allowDeselect={false}
          w={160}
          data={[
            { value: "8", label: "Last 8 weeks" },
            { value: "12", label: "Last 12 weeks" },
            { value: "26", label: "Last 26 weeks" },
          ]}
          value={String(weeks)}
          onChange={(v) => setParam("weeks", v === "12" ? null : v)}
        />
      </Group>
      <QueryState query={query}>
        {(d) => (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 2, md: 4 }}>
              <Stat
                label="Throughput"
                value={`${d.throughputAverage}/wk`}
                hint={`Average of ${d.windowWeeks} complete weeks`}
              />
              <Stat
                label="Cycle time"
                value={days(d.cycleTime.p50)}
                hint={
                  d.cycleTime.p85 === null
                    ? "No finished work with a start date yet"
                    : `Median. 85% finish within ${days(d.cycleTime.p85)}`
                }
              />
              <Stat
                label="Work in progress"
                value={String(d.wip.current)}
                hint={`${d.wip.inProgress} in progress, ${d.wip.inReview} in review${d.wip.blocked ? `, ${d.wip.blocked} blocked` : ""}`}
              />
              <Stat label="Open items" value={String(d.forecast.remaining)} hint="Not done yet" />
            </SimpleGrid>

            <Card withBorder p="md">
              <Group justify="space-between" mb="xs">
                <Text fw={700}>Items finished per week</Text>
                <Text size="xs" c="dimmed">
                  Dashed line is the average. The pale bar is this week so far.
                </Text>
              </Group>
              <ThroughputChart weeks={d.throughput} average={d.throughputAverage} />
            </Card>

            <SimpleGrid cols={{ base: 1, md: 2 }}>
              <Card withBorder p="md">
                <Text fw={700} mb="xs">
                  Cycle time
                </Text>
                {d.cycleTime.sample === 0 ? (
                  <Text size="sm" c="dimmed">
                    Finished items need a start date to measure this.
                  </Text>
                ) : (
                  <Table verticalSpacing={4}>
                    <Table.Tbody>
                      {(
                        [
                          ["50% finish within", d.cycleTime.p50],
                          ["85% finish within", d.cycleTime.p85],
                          ["95% finish within", d.cycleTime.p95],
                          ["Average", d.cycleTime.average],
                        ] as const
                      ).map(([label, v]) => (
                        <Table.Tr key={label}>
                          <Table.Td>{label}</Table.Td>
                          <Table.Td ta="right" fw={600}>
                            {days(v)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
                <Text size="xs" c="dimmed" mt="xs">
                  From {d.cycleTime.sample} finished {d.cycleTime.sample === 1 ? "item" : "items"},
                  start to finish.
                </Text>
              </Card>
              <Card withBorder p="md">
                <Text fw={700} mb="xs">
                  What kind of work finished
                </Text>
                {d.flowDistribution.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Nothing finished in this window.
                  </Text>
                ) : (
                  <FlowBar data={d.flowDistribution} />
                )}
              </Card>
            </SimpleGrid>

            <ForecastCard data={d} />

            <Card withBorder p="md">
              <Text fw={700} mb="xs">
                Oldest work in progress
              </Text>
              {d.aging.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Nothing is in progress.
                </Text>
              ) : (
                <Table verticalSpacing={4}>
                  <Table.Tbody>
                    {d.aging.map((a) => (
                      <Table.Tr key={a.id}>
                        <Table.Td>
                          <UnstyledButton onClick={() => open(a.id)}>
                            <Text size="sm">{a.title}</Text>
                          </UnstyledButton>
                          <Text size="xs" c="dimmed">
                            {a.subprojectCode ?? "No subproject"}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {a.isBlocked ? (
                            <Badge color="red" variant="light">
                              Blocked
                            </Badge>
                          ) : (
                            <Badge variant="light" color="gray">
                              {a.status === "in_review" ? "In review" : "In progress"}
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" fw={600}>
                          {days(a.ageDays)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Stack>
        )}
      </QueryState>
    </>
  );
}
