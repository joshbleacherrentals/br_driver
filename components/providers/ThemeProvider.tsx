/**
 * App-wide theme provider.
 *
 * Holds the user's theme *preference* (System / Light / Dark), persists it with
 * expo-secure-store, and resolves it against the OS scheme into a concrete
 * `scheme` + `theme` (token set). Everything downstream — including the shared
 * `useColorScheme()` hook — reads from here, so a manual override takes effect
 * across the whole app.
 */

import { ColorScheme, ThemeColors, themes } from "@/constants/theme";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme as useRNColorScheme } from "react-native";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "theme_mode";
const VALID_MODES: ThemeMode[] = ["system", "light", "dark"];

export interface ThemeContextValue {
  /** User preference. */
  mode: ThemeMode;
  /** Resolved scheme actually in effect. */
  scheme: ColorScheme;
  /** Active token set for `scheme`. */
  theme: ThemeColors;
  /** Change + persist the preference. */
  setMode: (mode: ThemeMode) => void;
  /** False until the persisted preference has loaded. */
  isReady: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export default function AppThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemScheme = useRNColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [isReady, setIsReady] = useState(false);

  // Load persisted preference once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (active && stored && VALID_MODES.includes(stored as ThemeMode)) {
          setModeState(stored as ThemeMode);
        }
      } catch {
        // Non-fatal — fall back to "system".
      } finally {
        if (active) setIsReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    // Fire-and-forget persist; UI must not block on storage.
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }, []);

  const resolvedSystem: ColorScheme = systemScheme === "dark" ? "dark" : "light";
  const scheme: ColorScheme = mode === "system" ? resolvedSystem : mode;

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, theme: themes[scheme], setMode, isReady }),
    [mode, scheme, setMode, isReady],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
