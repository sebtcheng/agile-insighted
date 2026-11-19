import { SegmentedControl } from "@mantine/core";
import type { ViewMode } from "../lib/viewMode";

const DATA = [
  { value: "card", label: "Cards" },
  { value: "table", label: "Table" },
];

/** Card / Table switch shared by the list-style panels. Controlled: the page owns the state. */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <SegmentedControl
      className="view-toggle"
      size="xs"
      radius={6}
      aria-label="View mode"
      data={DATA}
      value={value}
      onChange={(v) => onChange(v === "table" ? "table" : "card")}
      transitionDuration={120}
      transitionTimingFunction="cubic-bezier(0.2, 0, 0, 1)"
    />
  );
}
