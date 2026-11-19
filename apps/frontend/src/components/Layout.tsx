import {
  AppShell,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Outlet, NavLink as RouterNavLink, useNavigate, useSearchParams } from "react-router-dom";
import { ENUM_LABELS } from "@myapp/shared";
import { useLogout } from "../api/hooks";
import { useAuth, useIsPm } from "../auth";
import { ActivityDrawer } from "./ActivityDrawer";
import { GlobalSearch } from "./GlobalSearch";
import { useRailExpansion } from "./useRailExpansion";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  portfolio: <path d="M3 7h18v13H3zM8 7V4h8v3M3 13h18" />,
  workload: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  insights: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  projects: <path d="M3 6a2 2 0 012-2h4l2 3h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  ost: <path d="M12 3v6M12 9H5v5M12 9h7v5M3 14h4v5H3zM17 14h4v5h-4zM10 14h4v5h-4z" />,
  usm: <path d="M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v6h-4z" />,
  kano: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2l-5.5 3 1-6.2L3 9.6l6.2-.9z" />,
  raid: <path d="M12 3l10 18H2zM12 10v5M12 18h.01" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
} as const;

type NavItem = { to: string; label: string; icon: keyof typeof ICONS; end?: boolean };

const NAV: NavItem[] = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/portfolio", label: "Portfolio", icon: "portfolio" },
  { to: "/workload", label: "Workload", icon: "workload" },
  { to: "/insights", label: "Insights", icon: "insights" },
  { to: "/projects", label: "Projects", icon: "projects" },
  { to: "/ost", label: "Opportunity Solution Tree", icon: "ost" },
  { to: "/usm", label: "User Story Mapping", icon: "usm" },
  { to: "/kano", label: "Kano Request Tracker", icon: "kano" },
  { to: "/raid", label: "RAID Log", icon: "raid" },
];

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure();
  const rail = useRailExpansion();
  const expanded = rail.expanded || opened;
  const user = useAuth();
  const isPm = useIsPm();
  const logout = useLogout();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activityId = params.get("activity");

  const items: NavItem[] = isPm
    ? [...NAV, { to: "/settings", label: "Settings", icon: "settings" }]
    : NAV;

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 64, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header className="shell-header">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation"
              color="#fff"
            />
            <Text fw={700} className="shell-brand">
              InsightED AGILE
            </Text>
          </Group>
          <Group wrap="nowrap" gap="md">
            <GlobalSearch />
            <Menu position="bottom-end" width={240} withinPortal>
              <Menu.Target>
                <UnstyledButton
                  aria-haspopup="menu"
                  aria-label="Account menu"
                  className="shell-account"
                  px="xs"
                  py={4}
                >
                  <Group gap={8} wrap="nowrap">
                    <div style={{ textAlign: "right" }}>
                      <Text fw={600} size="sm" lh={1.2}>
                        {user.fullName}
                      </Text>
                      <Text size="xs" c="#FFFFFF" lh={1.2} className="shell-role">
                        {ENUM_LABELS.role[user.role]}
                      </Text>
                    </div>
                    <span
                      className="shell-chevron"
                      style={{ display: "inline-flex", color: "#FFFFFF" }}
                    >
                      <Icon size={14}>
                        <path d="M6 9l6 6 6-6" />
                      </Icon>
                    </span>
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Text fw={600} size="sm" c="var(--mantine-color-text)">
                    {user.fullName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {ENUM_LABELS.role[user.role]}
                  </Text>
                </Menu.Label>
                <Menu.Divider />
                {isPm ? (
                  <Menu.Item onClick={() => void navigate("/settings")}>Settings</Menu.Item>
                ) : null}
                <Menu.Item
                  color="red"
                  disabled={logout.isPending}
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
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        className="shell-navbar"
        p="xs"
        w={expanded ? 260 : undefined}
        {...rail.handlers}
        style={{ transition: "width 150ms ease", overflow: "hidden", zIndex: 101 }}
      >
        <AppShell.Section grow component={ScrollArea}>
          <nav aria-label="Main">
            {items.map((item) => (
              <NavLink
                key={item.to}
                component={RouterNavLink}
                to={item.to}
                end={item.end}
                label={item.label}
                leftSection={<Icon>{ICONS[item.icon]}</Icon>}
                title={item.label}
                h={40}
                styles={{
                  root: { padding: "0 10px", overflow: "hidden" },
                  body: { overflow: "hidden" },
                  label: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
                  section: { marginInlineEnd: 12 },
                }}
                onClick={close}
              />
            ))}
          </nav>
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
