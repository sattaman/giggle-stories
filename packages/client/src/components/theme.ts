// One bright, friendly look for the whole app.

import { Platform } from "react-native";

export const colours = {
  background: "#FFF6E5",
  card: "#FFFFFF",
  ink: "#2B2257",
  inkSoft: "#6B6394",
  primary: "#7B5CFF",
  primaryDark: "#5638D8",
  go: "#22B07D",
  goDark: "#16855E",
  record: "#FF5A5F",
  recordDark: "#D63C42",
  sun: "#FFC53D",
  soft: "#EEE8FF",
  softDark: "#CFC3FF",
  line: "#EADFCB",
} as const;

export const radius = { card: 28, button: 40, pill: 999 } as const;

/** Rounded, chunky type where the platform has it. */
export const fonts = {
  heading: Platform.select({
    web: '"Arial Rounded MT Bold", "Nunito", ui-rounded, "Trebuchet MS", system-ui, sans-serif',
    ios: "System",
    default: "sans-serif",
  }),
  body: Platform.select({
    web: 'ui-rounded, "Nunito", "Trebuchet MS", system-ui, sans-serif',
    ios: "System",
    default: "sans-serif",
  }),
};

/** Minimum touch target for small hands. */
export const TOUCH = 64;

export const MAX_WIDTH = 760;

/** RN 0.76+ supports CSS box-shadow on every platform. */
export const cardShadow = { boxShadow: "0 6px 0 rgba(43, 34, 87, 0.08), 0 12px 24px rgba(43, 34, 87, 0.10)" } as const;
