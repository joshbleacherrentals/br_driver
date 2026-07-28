import { ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useMemo } from "react";

/**
 * Build theme-aware styles once per theme change.
 *
 * Replaces the repeated `useMemo(() => makeStyles(theme), [theme])` boilerplate
 * (and the un-memoized `makeStyles(theme)` variant that rebuilt styles every
 * render).
 *
 * @example
 * const styles = useThemedStyles(makeStyles);
 * // ...
 * const makeStyles = (theme: ThemeColors) => StyleSheet.create({ ... });
 */
export function useThemedStyles<T>(factory: (theme: ThemeColors) => T): T {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
