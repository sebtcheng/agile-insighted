import { createTheme, type MantineColorsTuple } from "@mantine/core";

/**
 * The single place for styling decisions, mapped from docs/112026_logpose_ui_spec.pdf (LogPose nautical spec).
 * Each palette is anchored on a spec color at the shade Mantine uses for filled (6/7) and light (0/1) variants.
 */
const coral: MantineColorsTuple = [
  "#FFE3DB", // Coral Tint
  "#FFD3C6",
  "#FFB6A2",
  "#FF977D",
  "#FF8164",
  "#FF7454",
  "#FF6B4A", // Coral Sail
  "#FF6B4A",
  "#C2412A", // Coral Text
  "#9E3220",
];
const sea: MantineColorsTuple = [
  "#DFF3F1", // Sea Mist
  "#C8EAE7",
  "#A6DCD8",
  "#7CC6C1", // Shallows
  "#4FA8A9",
  "#2E8C92",
  "#13747D", // Ocean Teal
  "#13606A", // Teal Text
  "#0B4F57", // Status Text
  "#083B41",
];
const sun: MantineColorsTuple = [
  "#FFF1CC", // Sun Tint
  "#FFE9B3",
  "#FFDE8E",
  "#FFD372",
  "#FFCC63",
  "#FFC857", // Sunshine
  "#FFC857",
  "#B07A1F", // Brass
  "#8A5A12", // Brass Text
  "#6B4510", // Pending Text
];
const navy: MantineColorsTuple = [
  "#E8F5F3", // App Ground
  "#D3DEE6",
  "#A9BACB",
  "#7D93AA",
  "#55677D", // Placeholder
  "#3F5670", // Muted
  "#1F3A57", // Text 2
  "#0B2545", // Deep Navy
  "#0B2545",
  "#061527",
];

export const theme = createTheme({
  primaryColor: "coral",
  primaryShade: 6,
  defaultRadius: 10,
  black: "#0B2545",
  white: "#FFFFFF",
  colors: { coral, sea, sun, navy },
  radius: { xs: "6px", sm: "6px", md: "10px", lg: "14px", xl: "22px" },
  spacing: { xs: "8px", sm: "12px", md: "16px", lg: "24px", xl: "32px" },
  components: {
    Paper: { defaultProps: { radius: "xl", shadow: "none" } },
    Card: { defaultProps: { radius: "xl", withBorder: true, shadow: "none", padding: "lg" } },
    Modal: {
      defaultProps: {
        radius: "xl",
        overlayProps: { blur: 2, backgroundOpacity: 0.45, color: "#0B2545" },
      },
    },
    Drawer: {
      defaultProps: { overlayProps: { blur: 2, backgroundOpacity: 0.45, color: "#0B2545" } },
    },
    Button: { defaultProps: { radius: "md" } },
    TextInput: { defaultProps: { radius: "md" } },
    Select: { defaultProps: { radius: "md" } },
    Badge: { defaultProps: { radius: "xl" } },
    Alert: { defaultProps: { radius: "lg" } },
  },
  fontFamily: "var(--font-body)",
  fontFamilyMonospace: "var(--font-mono)",
  fontSizes: { xs: "0.75rem", sm: "0.875rem", md: "1rem", lg: "1.0625rem", xl: "1.375rem" },
  lineHeights: { xs: "1.4", sm: "1.45", md: "1.5", lg: "1.5", xl: "1.45" },
  headings: {
    fontFamily: "var(--font-display)",
    fontWeight: "900",
    sizes: {
      h1: { fontSize: "2.875rem", lineHeight: "1.05" },
      h2: { fontSize: "1.75rem", lineHeight: "1.15" },
      h3: { fontSize: "1.125rem", lineHeight: "1.3" },
      h4: { fontSize: "1rem", lineHeight: "1.4" },
      h5: { fontSize: "0.875rem", lineHeight: "1.4" },
      h6: { fontSize: "0.75rem", lineHeight: "1.4" },
    },
  },
});

/** Semantic colors used by badges so every screen agrees on what a color means. */
export const STATUS_COLOR = {
  todo: "navy",
  in_progress: "sea",
  in_review: "sun",
  done: "sea",
} as const;
export const PRIORITY_COLOR = {
  low: "navy",
  medium: "sea",
  high: "sun",
  urgent: "coral",
} as const;
export const HEALTH_COLOR = { on_track: "sea", at_risk: "sun", off_track: "coral" } as const;
export const SPRINT_COLOR = { planning: "navy", active: "sea", completed: "sun" } as const;
