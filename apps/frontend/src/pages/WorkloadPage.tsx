import { Badge, Collapse, Table, Text, UnstyledButton } from "@mantine/core";
import { Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import type { WorkItem, WorkMemberRollup } from "@myapp/shared";
import { WorkItemsTable } from "../components/WorkItems";
import { useProjects, useWorkload } from "../api/hooks";
import { PageHeader, QueryState } from "../components/ui";

function MemberCells({ m }: { m: WorkMemberRollup | undefined }) {
  return (
    <>
      <Table.Td>{m?.total ?? 0}</Table.Td>
      <Table.Td>{m?.ongoing ?? 0}</Table.Td>
      <Table.Td>{m?.onTime ?? 0}</Table.Td>
      <Table.Td>{m && m.delayed > 0 ? <Badge color="red">{m.delayed}</Badge> : 0}</Table.Td>
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
  return <WorkItemsTable items={items} projectNames={projectNames} checkable />;
}

export function WorkloadPage() {
  const [params, setParams] = useSearchParams();
  const expanded = params.get("person");
  const query = useWorkload();
  const projects = useProjects();
  const projectNames = new Map((projects.data ?? []).map((p) => [p.id, p.name]));
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
          return (
            <Table.ScrollContainer minWidth={700}>
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Person</Table.Th>
                    <Table.Th>Due this week</Table.Th>
                    <Table.Th>All tasks</Table.Th>
                    <Table.Th>Ongoing</Table.Th>
                    <Table.Th>On time</Table.Th>
                    <Table.Th>Delayed</Table.Th>
                    <Table.Th>Completed</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.items.map((r) => (
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
                        <Table.Td>{r.dueThisWeek}</Table.Td>
                        <MemberCells m={byUser.get(r.userId)} />
                      </Table.Tr>
                      <Table.Tr key={`${r.userId}-items`}>
                        <Table.Td
                          colSpan={7}
                          p={0}
                          style={{ borderBottom: expanded === r.userId ? undefined : "none" }}
                        >
                          <Collapse in={expanded === r.userId}>
                            {expanded === r.userId ? (
                              <WorkList
                                items={byUser.get(r.userId)?.items ?? []}
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
                        <Table.Td colSpan={2}>
                          <UnstyledButton
                            onClick={() => toggle("unassigned")}
                            aria-expanded={expanded === "unassigned"}
                            fw={600}
                          >
                            {expanded === "unassigned" ? "▾ " : "▸ "}Unassigned
                          </UnstyledButton>
                        </Table.Td>
                        <MemberCells m={unassigned} />
                      </Table.Tr>
                      <Table.Tr>
                        <Table.Td colSpan={7} p={0} style={{ borderBottom: "none" }}>
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
          );
        }}
      </QueryState>
    </>
  );
}
