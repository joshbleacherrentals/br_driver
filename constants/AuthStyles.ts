import { ColorScheme, ThemeColors, themes } from "@/constants/theme";
import { ColorSchemeName, StyleSheet } from "react-native";

/** @deprecated Use `theme.header` from `useTheme()` instead. */
export const PRIMARY = themes.light.header;
/** @deprecated Use `theme.accent` from `useTheme()` instead. */
export const PRIMARY_LIGHT = themes.light.accent;

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    formContainer: {
      marginTop: 72,
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 24,
      shadowColor: theme.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 5,
      borderWidth: 1,
      borderColor: theme.border,
    },
    headerContainer: {
      alignItems: "center",
      marginBottom: 32,
    },
    title: {
      fontSize: 28,
      fontWeight: "bold",
      color: theme.textPrimary,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 15,
      color: theme.textSecondary,
      marginTop: 10,
      lineHeight: 22,
      textAlign: "center",
    },
    form: {
      width: "100%",
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.textPrimary,
      marginBottom: 8,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 16,
      fontSize: 16,
      backgroundColor: theme.surfaceElevated,
      color: theme.textPrimary,
    },
    button: {
      backgroundColor: theme.accent,
      borderRadius: 8,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 28,
      elevation: 6,
    },
    buttonText: {
      color: theme.onAccent,
      fontSize: 16,
      fontWeight: "600",
      letterSpacing: 0.3,
    },
    textButton: {
      marginTop: 20,
      alignItems: "center",
      padding: 8,
    },
    textButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.accent,
    },
  });

const authStyles = {
  light: createStyles(themes.light),
  dark: createStyles(themes.dark),
};

export const styles = authStyles.light;
export const darkStyles = authStyles.dark;

export const getAuthStyles = (scheme: ColorSchemeName | string | null) =>
  scheme === "dark" ? authStyles.dark : authStyles.light;

export type { ColorScheme };
