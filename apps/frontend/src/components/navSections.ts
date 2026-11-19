export type NavIconKey =
  | "home"
  | "portfolio"
  | "workload"
  | "insights"
  | "projects"
  | "ost"
  | "usm"
  | "kano"
  | "raid"
  | "settings";

export type NavItem = {
  to: string;
  label: string;
  icon: NavIconKey;
  end?: boolean;
  pmOnly?: boolean;
};

export type NavSection = { id: string; title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    title: "Overview",
    items: [{ to: "/", label: "Home", icon: "home", end: true }],
  },
  {
    id: "insights",
    title: "Insights",
    items: [
      { to: "/workload", label: "Workload", icon: "workload" },
      { to: "/insights", label: "Insights", icon: "insights" },
    ],
  },
  {
    id: "delivery",
    title: "Projects",
    items: [
      { to: "/portfolio", label: "Portfolio", icon: "portfolio" },
      { to: "/projects", label: "Projects", icon: "projects" },
    ],
  },
  {
    id: "tools",
    title: "Agile & Discovery",
    items: [
      { to: "/ost", label: "Opportunity Solution Tree", icon: "ost" },
      { to: "/usm", label: "User Story Mapping", icon: "usm" },
      { to: "/kano", label: "Kano Request Tracker", icon: "kano" },
      { to: "/raid", label: "RAID Log", icon: "raid" },
    ],
  },
  {
    id: "admin",
    title: "Administration",
    items: [{ to: "/settings", label: "Settings", icon: "settings", pmOnly: true }],
  },
];

/** Filters items by role and drops sections left with no visible items. */
export function visibleSections(isPm: boolean): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.pmOnly || isPm),
  })).filter((s) => s.items.length > 0);
}
