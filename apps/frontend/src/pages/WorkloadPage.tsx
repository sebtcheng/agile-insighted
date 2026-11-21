import {
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { Fragment, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { sortTasksOngoingFirst, type WorkItem, type WorkMemberRollup } from "@myapp/shared";
import { ColumnHeader, compareNullable, toggleSortConfig, type SortConfig } from "../components/ColumnHeader";
import { WorkItemsTable } from "../components/WorkItems";
import { useProjects, useWorkload } from "../api/hooks";
import { PageHeader, QueryState } from "../components/ui";

function MemberCells({ m }: { m: WorkMemberRollup | undefined }) {
  return (
    <>
      <Table.Td>{m?.total ?? 0}</Table.Td>
      <Table.Td>{m?.ongoing ?? 0}</Table.Td>
      <Table.Td>{m?.onTime ?? 0}</Table.Td>
      <Table.Td>{m && m.delayed > 0 ? <Badge color="coral">{m.delayed}</Badge> : 0}</Table.Td>
      <Table.Td>{m?.completed ?? 0}</Table.Td>
    </>
  );
}

function WorkList({
  items,
  projectNames,
}: {
  items: WorkItem[];
  projectNames: Map<string, string>;
}) {
  if (items.length === 0) {
    return (
      <Text c="dimmed" size="sm" p="sm">
        No items.
      </Text>
    );
  }
  return <WorkItemsTable items={items} projectNames={projectNames} checkable deletable />;
}

type WorkloadSortKey =
  | "person"
  | "owner"
  | "teamMember"
  | "dueThisWeek"
  | "total"
  | "ongoing"
  | "onTime"
  | "delayed"
  | "completed";
type WorkloadNumKey = Exclude<WorkloadSortKey, "person">;

const NUM_COLS: Array<{ key: WorkloadNumKey; label: string }> = [
  { key: "owner", label: "Owner" },
  { key: "teamMember", label: "Team member" },
  { key: "dueThisWeek", label: "Due this week" },
  { key: "total", label: "All tasks" },
  { key: "ongoing", label: "Ongoing" },
  { key: "onTime", label: "On time" },
  { key: "delayed", label: "Delayed" },
  { key: "completed", label: "Completed" },
];

export function WorkloadPage() {
  const [params, setParams] = useSearchParams();
  const expanded = params.get("person");
  const query = useWorkload();
  const projects = useProjects();
  const [sort, setSort] = useState<SortConfig<WorkloadSortKey>>({ key: null, direction: "asc" });
  const [personFilter, setPersonFilter] = useState("");
  const [numFilters, setNumFilters] = useState<Partial<Record<WorkloadNumKey, string[]>>>({});

  const hasFilters =
    Boolean(personFilter.trim()) ||
    Object.values(numFilters).some((v) => v && v.length > 0);
  const clearAllFilters = () => {
    setPersonFilter("");
    setNumFilters({});
  };
  // The roster is org-wide, so a person can have work in projects the viewer is not on: names come from the response.
  const projectNames = new Map<string, string>([
    ...(projects.data ?? []).map((p): [string, string] => [p.id, p.name]),
    ...Object.entries(query.data?.projectNames ?? {}),
  ]);
  const toggle = (id: string) => {
    const next = new URLSearchParams(params);
    if (expanded === id) next.delete("person");
    else next.set("person", id);
    setParams(next, { replace: true });
  };
  return (
    <>
      <PageHeader
        title="Workload"
        subtitle="Load and capacity across all subprojects. This shows counts against limits, not performance."
      />
      <QueryState query={query} isEmpty={(d) => d.items.length === 0} empty="No active people.">
        {(data) => {
          const byUser = new Map(data.members.map((m) => [m.userId, m]));
          const unassigned = byUser.get(null);
          const getNum = (
            r: (typeof data.items)[number],
            key: WorkloadNumKey,
          ): number => {
            const m = byUser.get(r.userId);
            switch (key) {
              case "owner":
                return r.ownedProjectsCount ?? 0;
              case "teamMember":
                return r.teamMemberProjectsCount ?? 0;
              case "dueThisWeek":
                return r.dueThisWeek;
              case "total":
                return m?.total ?? 0;
              case "ongoing":
                return m?.ongoing ?? 0;
              case "onTime":
                return m?.onTime ?? 0;
              case "delayed":
                return m?.delayed ?? 0;
              case "completed":
                return m?.completed ?? 0;
            }
          };
          const qPerson = personFilter.trim().toLowerCase();
          const filtered = data.items.filter((r) => {
            if (qPerson && !r.fullName.toLowerCase().includes(qPerson)) return false;
            for (const col of NUM_COLS) {
              const sel = numFilters[col.key];
              if (sel && sel.length > 0 && !sel.includes(String(getNum(r, col.key)))) {
                return false;
              }
            }
            return true;
          });
          const sorted = !sort.key
            ? filtered
            : [...filtered].sort((a, b) => {
                if (sort.key === "person") {
                  return compareNullable(
                    a.fullName.toLowerCase(),
                    b.fullName.toLowerCase(),
                    sort.direction,
                  );
                }
                const diff = getNum(a, sort.key!) - getNum(b, sort.key!);
                return sort.direction === "asc" ? diff : -diff;
              });
          const handleSort = (key: WorkloadSortKey) =>
            setSort((prev) => toggleSortConfig(prev, key));

          return (
            <>
              {hasFilters ? (
                <Group justify="flex-end" mb="xs">
                  <Button size="compact-xs" variant="subtle" onClick={clearAllFilters}>
                    Clear filters
                  </Button>
                </Group>
              ) : null}
              <Table.ScrollContainer minWidth={700}>
                <Table verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <ColumnHeader
                        label="Person"
                        colKey="person"
                        sort={sort}
                        onSort={handleSort}
                        activeFilterCount={personFilter ? 1 : 0}
                        onClearFilter={() => setPersonFilter("")}
                      >
                        <TextInput
                          size="xs"
                          placeholder="Search person..."
                          value={personFilter}
                          onChange={(e) => setPersonFilter(e.currentTarget.value)}
                        />
                      </ColumnHeader>
                      {NUM_COLS.map((col) => {
                        const opts = [
                          ...new Set(data.items.map((r) => String(getNum(r, col.key)))),
                        ].sort((a, b) => Number(a) - Number(b));
                        const selected = numFilters[col.key] ?? [];
                        return (
                          <ColumnHeader
                            key={col.key}
                            label={col.label}
                            colKey={col.key}
                            sort={sort}
                            onSort={handleSort}
                            activeFilterCount={selected.length}
                            onClearFilter={() =>
                              setNumFilters((prev) => ({ ...prev, [col.key]: [] }))
                            }
                          >
                            <Checkbox.Group
                              value={selected}
                              onChange={(v) =>
                                setNumFilters((prev) => ({ ...prev, [col.key]: v }))
                              }
                            >
                              <Stack gap={4}>
                                {opts.map((opt) => (
                                  <Checkbox key={opt} size="xs" value={opt} label={opt} />
                                ))}
                              </Stack>
                            </Checkbox.Group>
                          </ColumnHeader>
                        );
                      })}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {sorted.map((r) => (
                    <Fragment key={r.userId}>
                      <Table.Tr>
                        <Table.Td>
                          <UnstyledButton
                            onClick={() => toggle(r.userId)}
                            aria-expanded={expanded === r.userId}
                            fw={600}
                          >
                            {expanded === r.userId ? "▾ " : "▸ "}
                            {r.fullName}
                          </UnstyledButton>
                        </Table.Td>
                        <Table.Td data-col="owner">{r.ownedProjectsCount ?? 0}</Table.Td>
                        <Table.Td data-col="team-member">{r.teamMemberProjectsCount ?? 0}</Table.Td>
                        <Table.Td>{r.dueThisWeek}</Table.Td>
                        <MemberCells m={byUser.get(r.userId)} />
                      </Table.Tr>
                      <Table.Tr key={`${r.userId}-items`}>
                        <Table.Td
                          colSpan={9}
                          p={0}
                          style={{ borderBottom: expanded === r.userId ? undefined : "none" }}
                        >
                          <Collapse in={expanded === r.userId}>
                            {expanded === r.userId ? (
                              <WorkList
                                items={sortTasksOngoingFirst(byUser.get(r.userId)?.items ?? [])}
                                projectNames={projectNames}
                              />
                            ) : null}
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  ))}
                  {unassigned ? (
                    <Fragment key="unassigned">
                      <Table.Tr>
                        <Table.Td>
                          <UnstyledButton
                            onClick={() => toggle("unassigned")}
                            aria-expanded={expanded === "unassigned"}
                            fw={600}
                          >
                            {expanded === "unassigned" ? "▾ " : "▸ "}Unassigned
                          </UnstyledButton>
                        </Table.Td>
                        <Table.Td data-col="owner">—</Table.Td>
                        <Table.Td data-col="team-member">—</Table.Td>
                        <Table.Td />
                        <MemberCells m={unassigned} />
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td colSpan={9} p={0} style={{ borderBottom: "none" }}>
                          <Collapse in={expanded === "unassigned"}>
                            <WorkList items={unassigned.items} projectNames={projectNames} />
                          </Collapse>
                        </Table.Td>
                      </Table.Tr>
                    </Fragment>
                  ) : null}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
