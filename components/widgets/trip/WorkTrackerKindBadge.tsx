/**
 * What kind of work this is, at a glance: a coloured pill with the kind's own
 * icon and name.
 *
 * Trips are the bulk of a driver's list, so a repair or a site visit has to
 * announce itself — the two are shaped differently (one stop, one inspection)
 * and a driver reading a card as a haul when it is a cleaning visit turns up
 * with a truck they did not need.
 */
import {
  WORK_TRACKER_KIND_ICON,
  WORK_TRACKER_KIND_LABEL,
  workTrackerKindColor,
} from "@/constants/workTrackerKinds";
import { typeScale, type ThemeColors } from "@/constants/theme";
import type { WorkTrackerKind } from "@/utils/workTrackerKind";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

function WorkTrackerKindBadge({
  kind,
  theme,
}: {
  kind: WorkTrackerKind;
  theme: ThemeColors;
}) {
  const color = workTrackerKindColor(kind, theme);

  return (
    <View
      style={[
        styles.pill,
        { borderColor: color, backgroundColor: color + "14" },
      ]}
      accessibilityRole="text"
      accessibilityLabel={WORK_TRACKER_KIND_LABEL[kind]}
    >
      <Ionicons name={WORK_TRACKER_KIND_ICON[kind]} size={13} color={color} />
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {WORK_TRACKER_KIND_LABEL[kind]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  label: {
    ...typeScale.caption2,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});

export default WorkTrackerKindBadge;
