import { ColorSchemeName, StyleSheet } from "react-native";

// Primary brand colors requested
export const PRIMARY = "#10365A"; // deep brand blue
export const PRIMARY_LIGHT = "#1d62a3"; // lighter accent for hover/focus/shadows

// Palettes for light & dark
const lightPalette = {
  background: "#ffffff",
  surface: "#F8FAFC", // subtle background for inputs
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textEmphasis: "#334155",
  border: "#E2E8F0",
  buttonBg: PRIMARY_LIGHT,
  buttonShadow: PRIMARY_LIGHT,
  inputText: "#1E293B",
  focusOutline: PRIMARY_LIGHT,
};

const darkPalette = {
  background: "#081e33", // deep navy background for container
  surface: "#0F2A45", // elevated surface for inputs
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textEmphasis: "#CBD5E1",
  border: "#1d3d5b",
  buttonBg: PRIMARY_LIGHT,
  buttonShadow: PRIMARY_LIGHT,
  inputText: "#E2E8F0",
  focusOutline: PRIMARY_LIGHT,
};

type Palette = typeof lightPalette;

const createStyles = (p: Palette) =>
  StyleSheet.create({
    formContainer: {
      marginTop: 72,
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      backgroundColor: p.background,
      borderRadius: 16,
      padding: 24,
      shadowColor: p.buttonShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 5,
      borderWidth: 1,
      borderColor: p.border,
    },
    headerContainer: {
      alignItems: "center",
      marginBottom: 32,
    },
    title: {
      fontSize: 28,
      fontWeight: "bold",
      color: p.textPrimary,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 15,
      color: p.textSecondary,
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
      color: p.textEmphasis,
      marginBottom: 8,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 8,
      paddingHorizontal: 16,
      fontSize: 16,
      backgroundColor: p.surface,
      color: p.inputText,
    },
    button: {
      backgroundColor: p.buttonBg,
      borderRadius: 8,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 28,
      //   shadowColor: p.buttonShadow,
      //   shadowOffset: { width: 0, height: 3 },
      //   shadowOpacity: 0.35,
      //   shadowRadius: 6,
      elevation: 6,
    },
    buttonText: {
      color: "#ffffff",
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
      color: PRIMARY_LIGHT,
    },
  });

// Maintain existing named export for light styles for backward compatibility
export const styles = createStyles(lightPalette);
export const darkStyles = createStyles(darkPalette);

export const getAuthStyles = (scheme: ColorSchemeName | string | null) =>
  scheme === "dark" ? darkStyles : styles;
