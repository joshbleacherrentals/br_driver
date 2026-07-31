import {
  ThemeContext,
  ThemeContextValue,
} from "@/components/providers/ThemeProvider";
import { ColorScheme, ThemeColors } from "@/constants/theme";
import { useContext } from "react";

/** Semantic colors for modal forms / edit screens. */
export type FormTheme = {
  bg: string;
  card: string;
  border: string;
  text: string;
  inputBg: string;
  placeholder: string;
  accent: string;
  onAccent: string;
  secondaryAccent: string;
  onSecondaryAccent: string;
  textTertiary: string;
  danger: string;
  separator: string;
};

function buildFormTheme(theme: ThemeColors): FormTheme {
  return {
    bg: theme.background,
    card: theme.surface,
    border: theme.border,
    text: theme.textPrimary,
    inputBg: theme.surfaceElevated,
    placeholder: theme.textTertiary,
    accent: theme.accent,
    onAccent: theme.onAccent,
    secondaryAccent: theme.secondaryAccent,
    onSecondaryAccent: theme.onSecondaryAccent,
    textTertiary: theme.textTertiary,
    danger: theme.danger,
    separator: theme.separator,
  };
}

/**
 * Access the active theme tokens and theme controls.
 *
 * @example
 * const { theme } = useTheme();
 * <View style={{ backgroundColor: theme.surface }} />
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <AppThemeProvider>");
  }
  return ctx;
}

/** Theme tokens mapped for profile edit modals and form fields. */
export function useFormTheme(): {
  theme: ThemeColors;
  scheme: ColorScheme;
  form: FormTheme;
} {
  const { theme, scheme } = useTheme();
  return { theme, scheme, form: buildFormTheme(theme) };
}
