import { ThemeContext } from "@/components/providers/ThemeProvider";
import { useContext, useEffect, useState } from "react";
import {
  ColorSchemeName,
  useColorScheme as useRNColorScheme,
} from "react-native";

/**
 * Web variant. Prefers the app theme preference from <AppThemeProvider>; falls
 * back to the OS scheme once hydrated (needed for static rendering).
 */
export function useColorScheme(): ColorSchemeName {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const ctx = useContext(ThemeContext);
  const colorScheme = useRNColorScheme();

  if (ctx) return ctx.scheme;
  if (hasHydrated) return colorScheme;
  return "light";
}
