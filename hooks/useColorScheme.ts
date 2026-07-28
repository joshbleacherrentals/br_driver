import { ThemeContext } from "@/components/providers/ThemeProvider";
import { useContext } from "react";
import {
  ColorSchemeName,
  useColorScheme as useRNColorScheme,
} from "react-native";

/**
 * Resolved color scheme in effect.
 *
 * Reads the app theme preference (System / Light / Dark) from
 * <AppThemeProvider>, so a manual override applies everywhere this hook is
 * used. Falls back to the raw OS scheme if no provider is mounted.
 */
export function useColorScheme(): ColorSchemeName {
  const ctx = useContext(ThemeContext);
  const system = useRNColorScheme();
  return ctx ? ctx.scheme : system;
}
