/**
 * "View Damage Reports (N)" — the trips screen's way into a bleacher's known
 * damage.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * Sits under the inspection buttons on a trip. Two jobs: give the driver the
 * paper trail for damage that was already there before they touched the
 * bleacher, and make "this is already reported" visible before the urge to
 * report it again.
 *
 * Renders nothing at zero. A button that leads to an empty list costs a tap
 * made in a moving cab.
 */

import { radius, typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";

export default function ViewDamageReportsButton({
  count,
  onPress,
  style,
}: {
  count: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  if (count <= 0) return null;

  return (
    <TouchableOpacity
      testID="view-damage-reports"
      accessibilityRole="button"
      style={[styles.button, style]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Ionicons name="warning-outline" size={16} color={theme.danger} />
      <Text style={styles.label}>View Damage Reports ({count})</Text>
    </TouchableOpacity>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: theme.danger,
    },
    label: { ...typeScale.footnote, fontWeight: "600", color: theme.danger },
  });
}
