import { Alert, Loader, Modal, NavLink, Stack, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UserDto } from "@myapp/shared";
import { useSimulationCandidates, useStartSimulation } from "../api/hooks";

/** Case-insensitive match on name or email; an empty query keeps everyone. */
export function filterCandidates(items: UserDto[], query: string): UserDto[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(q));
}

export function SimulationPicker({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const candidates = useSimulationCandidates(opened);
  const start = useStartSimulation();
  const shown = filterCandidates(candidates.data ?? [], query);

  const pick = (id: string) =>
    start.mutate(id, {
      onSuccess: () => {
        onClose();
        setQuery("");
        void navigate("/");
      },
    });

  return (
    <Modal opened={opened} onClose={onClose} title="Simulate team member" size="sm">
      <Stack gap="xs">
        <TextInput
          label="Search team members"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          data-autofocus
        />
        {candidates.isPending ? <Loader size="sm" /> : null}
        {candidates.isError ? <Alert color="red">Could not load team members.</Alert> : null}
        {start.isError ? <Alert color="red">Could not start the simulation.</Alert> : null}
        {candidates.data && shown.length === 0 ? (
          <Text size="sm" c="dimmed">
            No matching team members.
          </Text>
        ) : null}
        {shown.map((u) => (
          <NavLink
            key={u.id}
            label={u.fullName}
            description={u.email}
            disabled={start.isPending}
            onClick={() => pick(u.id)}
          />
        ))}
      </Stack>
    </Modal>
  );
}
