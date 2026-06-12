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
export const GREEN_ACCENT = "#3A8B61";

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
