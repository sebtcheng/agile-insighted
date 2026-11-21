import {
  Alert,
  Badge,
  Card,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useSearchParams } from "react-router-dom";
import { sortTasksOngoingFirst, type HomeResponse, type HomeRow, type WorkItem } from "@myapp/shared";
import {
  SummaryStrip,
  WorkItemsView,
  WorkViewSwitch,
  type WorkView,
} from "../components/WorkItems";
import { useHome, useProjects, useSubprojects, useUsers, useCurrentProject } from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { ActivityRow } from "../components/ActivityRow";
import { PageHeader, QueryState, fmtDate } from "../components/ui";
import { applyHomeFilters, parseHomeFilters } from "../lib/filters";

function groupBy(rows: HomeRow[]): Array<{ key: string; label: string; rows: HomeRow[] }> {
  const map = new Map<string, { key: string; label: string; rows: HomeRow[] }>();
  for (const r of rows) {
    const key = r.subprojectId ?? "none";
    const label = r.subprojectCode
      ? `${r.subprojectCode} ${r.subprojectName ?? ""}`
      : "No subproject";
    const g = map.get(key) ?? { key, label, rows: [] };
    g.rows.push(r);
    map.set(key, g);
  }
  return [...map.values()];
}

function Section({
  title,
  rows,
  grouped,
  extra,
  moduleRows = [],
  view,
  projectNames,
}: {
  title: string;
  rows: HomeRow[];
  moduleRows?: WorkItem[];
  grouped: boolean;
  extra?: React.ReactNode;
  view: WorkView;
  projectNames: Map<string, string>;
}) {
  const isNextWeek = title === "Next Week";
  const risky = isNextWeek ? rows.filter((r) => r.atRisk) : [];
  return (
    <Card withBorder padding={0} className={title === "This Week" ? "lp-card-coral" : undefined}>
      <Group justify="space-between" p="md" style={{ borderBottom: "var(--outline)" }}>
        <Title order={2} className="lp-section-title">
          {title}
        </Title>
        <Badge variant="filled" color="navy">
          {rows.length + moduleRows.length}
        </Badge>
      </Group>
      {isNextWeek && risky.length > 0 ? (
        <Alert color="sun" m="sm" title="Risk coming up">
          {risky.length} item{risky.length === 1 ? " is" : "s are"} blocked or waiting on another
          activity before next week.
        </Alert>
      ) : null}
      {extra}
      {moduleRows.length > 0 ? (
        <div style={{ borderBottom: "var(--outline-thin)" }}>
          <Text className="lp-kicker" px="md" pt="sm">
            Other modules
          </Text>
          <WorkItemsView items={moduleRows} view={view} projectNames={projectNames} checkable />
        </div>
      ) : null}
      {rows.length === 0 && !extra && moduleRows.length === 0 ? (
        <Text c="dimmed" size="sm" p="md">
          Nothing due.
        </Text>
      ) : grouped ? (
        groupBy(rows).map((g) => (
          <div key={g.key}>
            <Text className="lp-kicker" px="md" pt="sm">
              {g.label}
            </Text>
            {g.rows.map((r) => (
              <ActivityRow key={r.id} activity={r} checkable />
            ))}
          </div>
        ))
      ) : (
        rows.map((r) => <ActivityRow key={r.id} activity={r} checkable />)
      )}
    </Card>
  );
}

function Header({ data }: { data: HomeResponse }) {
  return (
    <Paper withBorder p="lg" mb="lg" className="lp-card-lg">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text className="lp-label">
            {data.activeSprint ? `Sprint goal · ${data.activeSprint.name}` : "Sprint goal"}
          </Text>
          <Text className="lp-summary-value">
            {data.activeSprint ? (data.activeSprint.goal ?? "No goal set") : "No active sprint"}
          </Text>
          {data.activeSprint ? (
            <Text size="sm" c="dimmed">
              {data.activeSprint.daysLeft} day{data.activeSprint.daysLeft === 1 ? "" : "s"} left ·
              ends {fmtDate(data.activeSprint.endDate)}
            </Text>
          ) : null}
        </div>
        <div style={{ textAlign: "right" }}>
          <Text className="lp-label">Your work in progress</Text>
          <Text className="lp-summary-value">{data.wip.inProgress}</Text>
        </div>
      </Group>
      <div className="lp-rule" />
      <Text className="lp-kicker" mb="sm">
        All modules
      </Text>
      <SummaryStrip summary={data.summary} />
    </Paper>
  );
}

export function HomePage() {
  const user = useAuth();
  const isPm = useIsPm();
  const [params, setParams] = useSearchParams();
  const filters = parseHomeFilters(params);
  // The group-by toggle is remembered per user in localStorage; the URL overrides it for shared links.
  const [rememberedGroup, setRememberedGroup] = useLocalStorage({
    key: `home.group.${user.id}`,
    defaultValue: false,
  });
  const grouped = filters.group ?? rememberedGroup;

  const { project } = useCurrentProject();
  const subs = useSubprojects(project?.id);
  const users = useUsers();
  const [view, setView] = useLocalStorage<WorkView>({
    key: `home.view.${user.id}`,
    defaultValue: "list",
  });
  const projects = useProjects();
  const projectNames = new Map((projects.data ?? []).map((p) => [p.id, p.name]));
  const query = useHome({ assigneeId: filters.assigneeId, subprojectId: filters.subprojectId });

  const update = (next: typeof filters) =>
    setParams(applyHomeFilters(params, next), { replace: true });

  return (
    <>
      <PageHeader
        title="Home"
        subtitle={isPm ? "Everyone's work, by when it is due" : "Your work, by when it is due"}
      />
      <QueryState query={query}>
        {(data) => (
          <Stack>
            <Header data={data} />
            {isPm ? (
              <Group align="flex-end" wrap="wrap">
                <Select
                  label="Assignee"
                  placeholder="Everyone"
                  clearable
                  searchable
                  value={filters.assigneeId ?? null}
                  onChange={(v) => update({ ...filters, assigneeId: v ?? undefined })}
                  data={(users.data ?? [])
                    .filter((u) => u.isActive)
                    .map((u) => ({ value: u.id, label: u.fullName }))}
                />
                <Select
                  label="Scope"
                  allowDeselect={false}
                  value={filters.assigneeId === user.id ? "mine" : "team"}
                  onChange={(v) =>
                    update({ ...filters, assigneeId: v === "mine" ? user.id : undefined })
                  }
                  data={[
                    { value: "team", label: "Whole team" },
                    { value: "mine", label: "Only me" },
                  ]}
                />
                <Select
                  label="Subproject"
                  placeholder="All subprojects"
                  clearable
                  searchable
                  value={filters.subprojectId ?? null}
                  onChange={(v) => update({ ...filters, subprojectId: v ?? undefined })}
                  data={(subs.data ?? []).map((s) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
                <Switch
                  label="Group by subproject"
                  checked={grouped}
                  onChange={(e) => {
                    setRememberedGroup(e.currentTarget.checked);
                    update({ ...filters, group: e.currentTarget.checked });
                  }}
                />
              </Group>
            ) : null}
            <Group justify="flex-end">
              <WorkViewSwitch value={view} onChange={setView} />
            </Group>
            {data.truncated ? (
              <Alert color="sun" title="Showing part of a long list">
                There is more work than fits on this page. Filter by assignee or subproject to see
                the rest.
              </Alert>
            ) : null}
            <Section
              title="This Week"
              rows={sortTasksOngoingFirst(data.thisWeek)}
              moduleRows={sortTasksOngoingFirst(data.moduleItems.thisWeek)}
              grouped={grouped}
              view={view}
              projectNames={projectNames}
            />
            <Section
              title="Next Week"
              rows={sortTasksOngoingFirst(data.nextWeek)}
              moduleRows={sortTasksOngoingFirst(data.moduleItems.nextWeek)}
              grouped={grouped}
              view={view}
              projectNames={projectNames}
            />
            <Section
              title="This Month"
              rows={sortTasksOngoingFirst(data.thisMonth)}
              moduleRows={sortTasksOngoingFirst(data.moduleItems.thisMonth)}
              grouped={grouped}
              view={view}
              projectNames={projectNames}
              extra={
                data.upcomingReleases.length > 0 ? (
                  <Stack gap={4} p="sm" style={{ borderBottom: "var(--outline-thin)" }}>
                    <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                      Upcoming releases
                    </Text>
                    {data.upcomingReleases.map((r) => (
                      <Group key={r.id} gap="xs">
                        <Badge color="sea" variant="light">
                          Release
                        </Badge>
                        <Text size="sm" fw={600}>
                          {r.name}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {fmtDate(r.targetDate)}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                ) : undefined
              }
            />
            {data.later.length + data.moduleItems.later.length > 0 ? (
              <Section
                title="Later"
                rows={sortTasksOngoingFirst(data.later)}
                moduleRows={sortTasksOngoingFirst(data.moduleItems.later)}
                grouped={grouped}
                view={view}
                projectNames={projectNames}
              />
            ) : null}
            <Text size="xs" c="dimmed">
              Weeks start on Monday ({data.timezone}). Items with no due date are not shown here.
            </Text>
          </Stack>
        )}
      </QueryState>
    </>
  );
}
