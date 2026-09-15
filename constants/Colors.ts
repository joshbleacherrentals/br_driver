/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

// ── Brand palette ──────────────────────────────────────────────────────────
/** Deep navy — headers, primary buttons, dark backgrounds */
export const DARK_BLUE = "#10365A";
/** Brand blue — active states, banners, section borders */
export const BRAND_BLUE = "#1D62A3";
/** iOS system blue — links, action buttons */
export const ACCENT_BLUE = "#0A84FF";
export const GREEN_ACCENT = "#328C61";
/** Secondary green accent — positive CTAs, badges, success-adjacent UI. */
export const BRAND_GREEN = GREEN_ACCENT;
/** Warning / pending upload */
export const WARNING_ORANGE = "#FF9500";
/** Error / failed upload */
export const DANGER_RED = "#FF3B30";

// ── Work tracker kinds ─────────────────────────────────────────────────────
// One colour per kind of work, so a driver can tell a haul from a repair from
// a site visit at a glance — on the trip card, in history, on the badge.
/** Trip — the blue the app already uses for hauling work. */
export const TRACKER_TRIP_BLUE = BRAND_BLUE;
/** Repair / Maintenance — burnt orange. */
export const TRACKER_REPAIR_ORANGE = "#C2410C";
/** Site Visit / Cleaning / Other — violet. */
export const TRACKER_SITE_VISIT_PURPLE = "#7C3AED";

// ── Screen backgrounds ─────────────────────────────────────────────────────
/** Default screen background — light mode */
export const SCREEN_BG_LIGHT = "#F2F2F7";
/** Default screen background — dark mode */
export const SCREEN_BG_DARK = "#000000";

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#fff",
    tint: tintColorLight,
    icon: "#687076",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#ECEDEE",
    background: "#151718",
    tint: tintColorDark,
    icon: "#9BA1A6",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
  },
  blue: "#405daa",
};
