import {
  Anchor,
  Badge,
  Checkbox,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ENUM_LABELS, HEALTHS, type Health, type PortfolioRow } from "@myapp/shared";
import { useCurrentProject, usePortfolio, useUpdateSubproject, useUsers } from "../api/hooks";
import { useIsPm } from "../auth";
import { HealthBadge, PageHeader, QueryState, fmtDate, toast } from "../components/ui";
import {
  applyPortfolioFilters,
  parsePortfolioFilters,
  type PortfolioFilters,
} from "../lib/filters";

const COLUMNS: Array<{ key: PortfolioFilters["sort"] | null; label: string }> = [
  { key: "code", label: "Code" },
  { key: "name", label: "Subproject" },
  { key: null, label: "Lead" },
  { key: "health", label: "Health" },
  { key: null, label: "Active sprint" },
  { key: "open", label: "Open" },
  { key: "blocked", label: "Blocked" },
  { key: "waiting", label: "Waiting" },
  { key: "overdue", label: "Overdue" },
  { key: "percentDone", label: "% done" },
  { key: null, label: "Next release" },
  { key: null, label: "High RAID" },
];

export function PortfolioPage() {
  const isPm = useIsPm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = parsePortfolioFilters(params);
  const set = (f: PortfolioFilters) =>
    setParams(applyPortfolioFilters(params, f), { replace: true });
  const query = usePortfolio(filters);
  const users = useUsers();
  const { project } = useCurrentProject();
  const update = useUpdateSubproject();

  const sortBy = (key: PortfolioFilters["sort"]) =>
    set({
      ...filters,
      sort: key,
      dir: filters.sort === key && filters.dir === "asc" ? "desc" : "asc",
    });

  const open = (row: PortfolioRow) => {
    if (project) void navigate(`/projects/${project.id}?subprojectId=${row.id}`);
  };

  return (
    <>
      <PageHeader
        title="Portfolio"
        subtitle="Every subproject at a glance. Click a row to see its activities."
      />
      <Stack>
        <Group align="flex-end" wrap="wrap">
          <Select
            label="Health"
            placeholder="Any"
            clearable
            size="xs"
            w={150}
            data={HEALTHS.map((h) => ({ value: h, label: ENUM_LABELS.health[h] }))}
            value={filters.health ?? null}
            onChange={(v) => set({ ...filters, health: (v as Health | null) ?? undefined })}
          />
          <Select
            label="Lead"
            placeholder="Anyone"
            clearable
            searchable
            size="xs"
            w={170}
            data={(users.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
            value={filters.leadId ?? null}
            onChange={(v) => set({ ...filters, leadId: v ?? undefined })}
          />
          <Checkbox
            label="Has blockers"
            checked={!!filters.hasBlockers}
            onChange={(e) => set({ ...filters, hasBlockers: e.currentTarget.checked || undefined })}
          />
          <Checkbox
            label="My subprojects"
            description="I lead or have work in"
            checked={!!filters.mine}
            onChange={(e) => set({ ...filters, mine: e.currentTarget.checked || undefined })}
          />
        </Group>
        <QueryState
          query={query}
          isEmpty={(d) => d.items.length === 0}
          empty="No subprojects match these filters."
        >
          {(data) => (
            <Table.ScrollContainer minWidth={1000}>
              <Table highlightOnHover verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    {COLUMNS.map((c) => (
                      <Table.Th
                        key={c.label}
                        aria-sort={
                          c.key && filters.sort === c.key
                            ? filters.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        {c.key ? (
                          <UnstyledButton onClick={() => c.key && sortBy(c.key)} fw={600} fz="sm">
                            {c.label}
                            {filters.sort === c.key ? (filters.dir === "asc" ? " ▲" : " ▼") : ""}
                          </UnstyledButton>
                        ) : (
                          c.label
                        )}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.items.map((r) => (
                    <Table.Tr key={r.id} style={{ cursor: "pointer" }} onClick={() => open(r)}>
                      <Table.Td>{r.code}</Table.Td>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          to={
                            project ? `/projects/${project.id}?subprojectId=${r.id}` : "/projects"
                          }
                          onClick={(e) => e.stopPropagation()}
                          fw={600}
                        >
                          {r.name}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>{r.leadName ?? "None"}</Table.Td>
                      <Table.Td onClick={(e) => e.stopPropagation()}>
                        {isPm ? (
                          <Stack gap={4}>
                            <Select
                              aria-label={`Health of ${r.name}`}
                              size="xs"
                              w={130}
                              allowDeselect={false}
                              value={r.health}
                              data={HEALTHS.map((h) => ({
                                value: h,
                                label: ENUM_LABELS.health[h],
                              }))}
                              onChange={(v) =>
                                v &&
                                update.mutate(
                                  { id: r.id, patch: { health: v as Health } },
                                  { onError: (e) => toast.error(e.message) },
                                )
                              }
                            />
                            <TextInput
                              aria-label={`Health note for ${r.name}`}
                              size="xs"
                              placeholder="Note"
                              defaultValue={r.healthNote ?? ""}
                              onBlur={(e) => {
                                const note = e.currentTarget.value.trim();
                                if (note !== (r.healthNote ?? ""))
                                  update.mutate(
                                    { id: r.id, patch: { healthNote: note || null } },
                                    { onError: (err) => toast.error(err.message) },
                                  );
                              }}
                            />
                          </Stack>
                        ) : (
                          <Stack gap={2}>
                            <HealthBadge health={r.health} />
                            {r.healthNote ? (
                              <Text size="xs" c="dimmed">
                                {r.healthNote}
                              </Text>
                            ) : null}
                          </Stack>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {r.activeSprint?.name ?? (
                          <Text c="dimmed" size="sm">
                            None
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>{r.open}</Table.Td>
                      <Table.Td>
                        {r.blocked > 0 ? <Badge color="red">{r.blocked}</Badge> : 0}
                      </Table.Td>
                      <Table.Td>
                        {r.waitingOnDependency > 0 ? (
                          <Badge color="orange">{r.waitingOnDependency}</Badge>
                        ) : (
                          0
                        )}
                      </Table.Td>
                      <Table.Td>
                        {r.overdue > 0 ? (
                          <Badge color="red" variant="light">
                            {r.overdue}
                          </Badge>
                        ) : (
                          0
                        )}
                      </Table.Td>
                      <Table.Td>{r.percentDone}%</Table.Td>
                      <Table.Td>
                        {r.nextRelease ? (
                          `${r.nextRelease.name} · ${fmtDate(r.nextRelease.targetDate)}`
                        ) : (
                          <Text c="dimmed" size="sm">
                            None
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {r.openHighRaid > 0 ? (
                          <Badge color="red" variant="outline">
                            {r.openHighRaid}
                          </Badge>
                        ) : (
                          0
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </QueryState>
      </Stack>
    </>
  );
}
