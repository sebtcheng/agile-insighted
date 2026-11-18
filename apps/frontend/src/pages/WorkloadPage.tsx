import { Badge, Collapse, Group, Stack, Table, Text, UnstyledButton } from "@mantine/core";
import { Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurrentProject, usePersonItems, useWorkload } from "../api/hooks";
import { useOpenActivity } from "../components/ActivityRow";
import { PageHeader, PriorityBadge, QueryState, StatusBadge, fmtDate } from "../components/ui";

function PersonItems({ userId }: { userId: string }) {
  const q = usePersonItems(userId);
  const open = useOpenActivity();
  return (
    <QueryState query={q} isEmpty={(d) => d.groups.length === 0} empty="No open items.">
      {(data) => (
        <Stack gap="sm" p="sm">
          {data.groups.map((g) => (
            <div key={g.subprojectId ?? "none"}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                {g.code ? `${g.code} ${g.name ?? ""}` : "No subproject"}
              </Text>
              {g.items.map((i) => (
                <Group key={i.id} justify="space-between" wrap="nowrap" py={2}>
                  <UnstyledButton onClick={() => open(i.id)} style={{ minWidth: 0 }}>
                    <Text size="sm" lineClamp={1}>
                      {i.title}
                    </Text>
                  </UnstyledButton>
                  <Group gap={6} wrap="nowrap">
                    {i.isBlocked ? (
                      <Badge color="red" variant="light">
                        Blocked
                      </Badge>
                    ) : null}
                    <PriorityBadge priority={i.priority} />
                    <StatusBadge status={i.status} />
                    <Text size="xs" c="dimmed" miw={90}>
                      {fmtDate(i.dueDate)}
                    </Text>
                  </Group>
                </Group>
              ))}
            </div>
          ))}
        </Stack>
      )}
    </QueryState>
  );
}

export function WorkloadPage() {
  const [params, setParams] = useSearchParams();
  const expanded = params.get("person");
  const { project } = useCurrentProject();
  const query = useWorkload(project?.id);
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
        {(data) => (
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Person</Table.Th>
                  <Table.Th>In progress / limit</Table.Th>
                  <Table.Th>Due this week</Table.Th>
                  <Table.Th>Blocked</Table.Th>
                  <Table.Th>Waiting on dependency</Table.Th>
                  <Table.Th>
                    {data.items[0]?.sprint
                      ? `${data.items[0].sprint.name}: assigned / capacity`
                      : "Active sprint"}
                  </Table.Th>
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
                      <Table.Td>
                        <Text
                          c={r.overWipLimit ? "red" : undefined}
                          fw={r.overWipLimit ? 700 : 400}
                        >
                          {r.inProgress} / {r.wipLimit}
                          {r.overWipLimit ? " (over limit)" : ""}
                        </Text>
                      </Table.Td>
                      <Table.Td>{r.dueThisWeek}</Table.Td>
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
                        {r.sprint ? (
                          <Text
                            c={r.overCapacity ? "red" : undefined}
                            fw={r.overCapacity ? 700 : 400}
                          >
                            {r.sprintAssigned} / {r.sprintCapacity ?? "not set"}
                            {r.overCapacity ? " (over capacity)" : ""}
                          </Text>
                        ) : (
                          <Text c="dimmed" size="sm">
                            No active sprint
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr key={`${r.userId}-items`}>
                      <Table.Td
                        colSpan={6}
                        p={0}
                        style={{ borderBottom: expanded === r.userId ? undefined : "none" }}
                      >
                        <Collapse in={expanded === r.userId}>
                          {expanded === r.userId ? <PersonItems userId={r.userId} /> : null}
                        </Collapse>
                      </Table.Td>
                    </Table.Tr>
                  </Fragment>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </QueryState>
    </>
  );
}
