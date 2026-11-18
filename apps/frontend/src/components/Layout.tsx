import { AppShell, Burger, Button, Group, NavLink, ScrollArea, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, NavLink as RouterNavLink, useNavigate, useSearchParams } from "react-router-dom";
import { ENUM_LABELS } from "@myapp/shared";
import { useLogout } from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { ActivityDrawer } from "./ActivityDrawer";
import { GlobalSearch } from "./GlobalSearch";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/workload", label: "Workload" },
  { to: "/projects", label: "Projects" },
  { to: "/ost", label: "Opportunity Solution Tree" },
  { to: "/usm", label: "User Story Mapping" },
  { to: "/kano", label: "Kano Request Tracker" },
  { to: "/raid", label: "RAID Log" },
];

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure();
  const user = useAuth();
  const isPm = useIsPm();
  const logout = useLogout();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activityId = params.get("activity");

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation"
            />
            <Text fw={700}>InsightED PM</Text>
          </Group>
          <GlobalSearch />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow component={ScrollArea}>
          <nav aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                component={RouterNavLink}
                to={item.to}
                end={item.end}
                label={item.label}
                onClick={close}
              />
            ))}
            {isPm ? (
              <NavLink component={RouterNavLink} to="/settings" label="Settings" onClick={close} />
            ) : null}
          </nav>
        </AppShell.Section>
        <AppShell.Section>
          <Stack
            gap={4}
            p="xs"
            style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
          >
            <Text fw={600} size="sm">
              {user.fullName}
            </Text>
            <Text size="xs" c="dimmed">
              {ENUM_LABELS.role[user.role]}
            </Text>
            <Button
              variant="default"
              size="xs"
              loading={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSuccess: () => {
                    qc.clear();
                    void navigate("/login");
                  },
                })
              }
            >
              Sign out
            </Button>
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
        <ActivityDrawer
          activityId={activityId}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete("activity");
            setParams(next);
          }}
        />
      </AppShell.Main>
    </AppShell>
  );
}
