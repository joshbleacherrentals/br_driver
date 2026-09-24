/**
 * "Last Updated", at the top of Live Location — the first thing a driver reads,
 * because it decides whether the rest of the screen can be trusted: a pin from
 * five minutes ago and a pin from two days ago look identical on a map.
 * Refreshes every minute; the exact time is in the accessibility label.
 */

import { radius, typeScale } from "@/constants/theme";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useTheme } from "@/hooks/useTheme";
import { formatLastUpdated } from "@/utils/eventRoster/linxupDisplay";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function LocationFreshness({
  updatedAtMs,
}: {
  updatedAtMs: number | undefined;
}) {
  const { theme } = useTheme();
  const now = useMinuteClock();
  const lastUpdated = formatLastUpdated(updatedAtMs, now);
  const exactTime =
    updatedAtMs !== undefined ? new Date(updatedAtMs).toLocaleString() : null;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.accentSoft, borderColor: theme.accent },
      ]}
      accessible
      accessibilityLabel={
        lastUpdated
          ? `Last updated ${lastUpdated}, at ${exactTime}`
          : "The tracker did not say when it last reported"
      }
    >
      <Ionicons name="time-outline" size={26} color={theme.accent} />
      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          Last Updated
        </Text>
        <Text style={[styles.value, { color: theme.textPrimary }]}>
          {lastUpdated ?? "Unknown"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  text: { flex: 1 },
  label: {
    ...typeScale.caption2,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: { ...typeScale.title3, fontWeight: "700" },
});
