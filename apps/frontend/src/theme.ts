import { createTheme } from "@mantine/core";

/**
 * The single place for styling decisions. It is the default Mantine theme for now, so the whole app can be
 * restyled later by changing this file (and DESIGN.md) without touching screens.
 */
export const theme = createTheme({
  fontFamily: `"Public Sans", system-ui, sans-serif`,
  fontFamilyMonospace: `"IBM Plex Mono", system-ui, sans-serif`,
  headings: { fontFamily: `"Plus Jakarta Sans", system-ui, sans-serif` },
});

/** Semantic colors used by badges so every screen agrees on what a color means. */
export const STATUS_COLOR = {
  todo: "gray",
  in_progress: "blue",
  in_review: "grape",
  done: "green",
} as const;
export const PRIORITY_COLOR = {
  low: "gray",
  medium: "blue",
  high: "orange",
  urgent: "red",
} as const;
export const HEALTH_COLOR = { on_track: "green", at_risk: "yellow", off_track: "red" } as const;
export const SPRINT_COLOR = { planning: "gray", active: "blue", completed: "green" } as const;
