/** Linxup's status word (Moving / Stopped / Idle) as a coloured pill. */

import { typeScale, type ThemeColors } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import {
  linxupStatusTone,
  type LinxupStatusTone,
} from "@/utils/eventRoster/linxupStatusTone";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

function toneColor(tone: LinxupStatusTone, theme: ThemeColors): string {
  switch (tone) {
    case "success":
      return theme.success;
    case "warning":
      return theme.warning;
    case "info":
      return theme.accent;
    default:
      return theme.textTertiary;
  }
}

export default function LocationStatusBadge({ status }: { status: string }) {
  const { theme } = useTheme();
  const color = toneColor(linxupStatusTone(status), theme);

  return (
    <View
      style={[styles.badge, { borderColor: color }]}
      accessibilityLabel={`Tracker status: ${status}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { ...typeScale.footnote, fontWeight: "600" },
});
