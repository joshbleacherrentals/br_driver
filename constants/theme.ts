/**
 * Semantic theme tokens — the single source of truth for app colors.
 *
 * Components should read colors through `useTheme()` (see hooks/useTheme.ts),
 * never hardcode hex. Each token has a light + dark value.
 *
 */

import {
  DANGER_RED,
  DARK_BLUE,
  GREEN_ACCENT,
  WARNING_ORANGE,
} from "@/constants/Colors";
import { ViewStyle } from "react-native";

export type ColorScheme = "light" | "dark";

/** Semantic color roles. Add a role here (not a raw hex in a component). */
export interface ThemeColors {
  // ── Grounds ──────────────────────────────────────────────
  /** Grouped screen background (behind cards). */
  background: string;
  /** Card / list-row / sheet background. */
  surface: string;
  /** Nested surface that sits on top of `surface`. */
  surfaceElevated: string;

  // ── Text ─────────────────────────────────────────────────
  /** Primary reading text. */
  textPrimary: string;
  /** Secondary / meta text (subtitles, timestamps). */
  textSecondary: string;
  /** Tertiary text (placeholders, disabled). */
  textTertiary: string;

  // ── Lines ────────────────────────────────────────────────
  /** Hairline row divider. */
  separator: string;
  /** Control / card border. */
  border: string;

  // ── Brand / accent ───────────────────────────────────────
  /** Primary accent — active states, links, primary buttons. */
  accent: string;
  /** Accent at low opacity — icon chips, pills, selected fills. */
  accentSoft: string;
  /** Text / icon rendered on top of `accent`. */
  onAccent: string;
  /** Large titles / brand headers. */
  header: string;
  /** Secondary accent — positive actions, highlights, badges. */
  secondaryAccent: string;
  /** Secondary accent at low opacity — chips, pills, icon fills. */
  secondaryAccentSoft: string;
  /** Text / icon on top of `secondaryAccent`. */
  onSecondaryAccent: string;

  // ── Status ───────────────────────────────────────────────
  success: string;
  warning: string;
  danger: string;

  // ── Misc ─────────────────────────────────────────────────
  /** Modal / drawer scrim. */
  overlay: string;
  /** Subtle drop shadow — cards, list rows (pair with shadowOpacity ~0.06–0.12). */
  shadow: string;
  /** Prominent drop shadow — FAB, floating pills, toasts (pair with shadowOpacity ~0.2–0.35). */
  shadowStrong: string;
  /** Segmented control / toggle track fill (iOS system gray). */
  trackFill: string;
}

const light: ThemeColors = {
  background: "#EEF1F5",
  surface: "#FFFFFF",
  surfaceElevated: "#FBFCFE",

  textPrimary: "#12202E",
  textSecondary: "#5E6B7A",
  textTertiary: "#8A97A6",

  separator: "rgba(16,54,90,0.12)",
  border: "rgba(16,54,90,0.10)",

  accent: "#405DAA",
  accentSoft: "rgba(64,93,170,0.12)",
  onAccent: "#FFFFFF",
  header: DARK_BLUE, // #10365A

  secondaryAccent: GREEN_ACCENT, // #328C61
  secondaryAccentSoft: "rgba(50,140,97,0.12)",
  onSecondaryAccent: "#FFFFFF",

  success: GREEN_ACCENT, // #328C61
  warning: WARNING_ORANGE, // #FF9500
  danger: DANGER_RED, // #FF3B30

  overlay: "rgba(16,32,46,0.40)",

  shadow: "#000000",
  shadowStrong: "#000000",
  trackFill: "rgba(118,118,128,0.12)",
};

const dark: ThemeColors = {
  background: "#0B0F14",
  surface: "#161C24",
  surfaceElevated: "#1C242E",

  textPrimary: "#EDF1F6",
  textSecondary: "#8A97A6",
  textTertiary: "#6B7787",

  separator: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",

  accent: "#405DAA",
  accentSoft: "rgba(64,93,170,0.16)",
  onAccent: "#FFFFFF",
  header: "#405DAA",

  secondaryAccent: GREEN_ACCENT, // #328C61
  secondaryAccentSoft: "rgba(50,140,97,0.16)",
  onSecondaryAccent: "#FFFFFF",

  success: GREEN_ACCENT, // #328C61
  warning: "#FF9F0A",
  danger: "#FF453A",

  overlay: "rgba(0,0,0,0.50)",

  shadow: "#000000",
  shadowStrong: "#000000",
  trackFill: "rgba(118,118,128,0.24)",
};

export const themes: Record<ColorScheme, ThemeColors> = { light, dark };

// ── Shared, scheme-independent design tokens ────────────────
/** Corner radii — controls 12 · cards 16 · sheets 22. */
export const radius = { control: 12, card: 16, sheet: 22, pill: 999 } as const;

/** Elevation levels — cards sit low, floating UI (FAB, hero, toasts) sits high. */
export type ElevationLevel = "card" | "raised" | "floating";

const ELEVATION_SPECS: Record<
  ElevationLevel,
  Omit<ViewStyle, "shadowColor">
> = {
  card: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  raised: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },
  floating: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};

/**
 * Theme-aware drop shadow. Spread into a style: `{ ...elevation(theme, "card") }`.
 * Uses `theme.shadow` for cards and `theme.shadowStrong` for raised/floating.
 */
export function elevation(
  theme: ThemeColors,
  level: ElevationLevel = "card",
): ViewStyle {
  return {
    shadowColor: level === "card" ? theme.shadow : theme.shadowStrong,
    ...ELEVATION_SPECS[level],
  };
}

/**
 * Type scale (pt) — iOS system defaults, approved. `fontSize` + `lineHeight`.
 *
 * Spread a role to set size + line-height: `{ ...typeScale.body, color }`.
 * Weight is set by the caller per the 400/600/700 rule — the commented value
 * is the role's default weight, use it unless the element is emphasized.
 */
export const typeScale = {
  largeTitle: { fontSize: 34, lineHeight: 41 }, // 700
  title1: { fontSize: 28, lineHeight: 34 }, // 700
  title2: { fontSize: 22, lineHeight: 28 }, // 700
  title3: { fontSize: 20, lineHeight: 25 }, // 600
  headline: { fontSize: 17, lineHeight: 22 }, // 600
  body: { fontSize: 17, lineHeight: 22 }, // 400
  callout: { fontSize: 16, lineHeight: 21 }, // 400
  subhead: { fontSize: 15, lineHeight: 20 }, // 400
  footnote: { fontSize: 13, lineHeight: 18 }, // 400
  caption: { fontSize: 12, lineHeight: 16 }, // 600
  caption2: { fontSize: 11, lineHeight: 13 }, // 700
} as const;
