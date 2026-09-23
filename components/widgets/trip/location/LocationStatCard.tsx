/** One label/value tile in the Live Location grid. */

import { monoFontFamily, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type LocationStatCardProps = {
  label: string;
  value: string;
  /** IDs and coordinates read better in a fixed-width font. */
  mono?: boolean;
  /** Take the whole row instead of half. */
  wide?: boolean;
  accessibilityLabel?: string;
};

export default function LocationStatCard({
  label,
  value,
  mono = false,
  wide = false,
  accessibilityLabel,
}: LocationStatCardProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        wide ? styles.wide : styles.half,
        { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
      ]}
      accessible
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
    >
      <Text style={[styles.label, { color: theme.textTertiary }]}>{label}</Text>
      <Text
        style={[
          styles.value,
          { color: theme.textPrimary },
          mono && { fontFamily: monoFontFamily },
        ]}
        numberOfLines={1}
        ellipsizeMode="middle"
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    gap: 4,
  },
  half: { flexBasis: "47%", flexGrow: 1 },
  wide: { flexBasis: "100%" },
  label: {
    ...typeScale.caption2,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: { ...typeScale.subhead, fontWeight: "600" },
});
