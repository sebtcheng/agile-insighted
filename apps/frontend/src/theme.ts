import { createTheme } from "@mantine/core";

/**
 * The single place for styling decisions. It is the default Mantine theme for now, so the whole app can be
 * restyled later by changing this file (and DESIGN.md) without touching screens.
 */
export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 6,
  components: {
    Paper: { defaultProps: { radius: "md", shadow: "xs" } },
    Card: { defaultProps: { radius: "md", withBorder: true, shadow: "xs" } },
    Modal: { defaultProps: { radius: "md", overlayProps: { blur: 4, backgroundOpacity: 0.55 } } },
    Drawer: { defaultProps: { overlayProps: { blur: 4, backgroundOpacity: 0.55 } } },
    Button: { defaultProps: { radius: "md" } },
    TextInput: { defaultProps: { radius: "md" } },
    Select: { defaultProps: { radius: "md" } },
    Badge: { defaultProps: { radius: "xl" } },
  },
  colors: {
    brand: [
      "#eef2ff",
      "#e0e7ff",
      "#c7d2fe",
      "#a5b4fc",
      "#818cf8",
      "#6366f1",
      "#4f46e5",
      "#4338ca",
      "#3730a3",
      "#312e81",
    ],
  },
  fontFamily: "var(--font-body)",
  fontFamilyMonospace: "var(--font-mono)",
  fontSizes: { xs: "0.75rem", sm: "0.8125rem", md: "0.9375rem", lg: "1.0625rem", xl: "1.375rem" },
  lineHeights: { xs: "1.4", sm: "1.45", md: "1.55", lg: "1.5", xl: "1.4" },
  headings: {
    fontFamily: "var(--font-display)",
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "1.875rem", lineHeight: "1.15" },
      h2: { fontSize: "1.375rem", lineHeight: "1.2" },
      h3: { fontSize: "1.0625rem", lineHeight: "1.3" },
      h4: { fontSize: "0.9375rem", lineHeight: "1.4" },
      h5: { fontSize: "0.8125rem", lineHeight: "1.4" },
      h6: { fontSize: "0.6875rem", lineHeight: "1.4" },
    },
  },
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
