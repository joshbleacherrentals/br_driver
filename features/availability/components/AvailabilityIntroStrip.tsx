import Card from "@/components/ui/Card";
import { ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text } from "react-native";

export default function AvailabilityIntroStrip() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Card style={styles.card}>
      <Ionicons name="calendar-outline" size={16} color={theme.accent} />
      <Text style={styles.text}>
        Tap a date to toggle unavailability.{" "}
        <Text style={{ color: theme.warning, fontWeight: "700" }}>Orange</Text>{" "}
        = unsaved,{" "}
        <Text style={{ color: theme.danger, fontWeight: "700" }}>red</Text> =
        saved.
      </Text>
    </Card>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    text: {
      ...typeScale.footnote,
      fontWeight: "400",
      flex: 1,
      color: theme.accent,
    },
  });
