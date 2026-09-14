/**
 * The annual inspection, as a driver needs it before hitching.
 *
 * Coloured by urgency rather than shown as a plain date: this is the one fact
 * on the page that can stop a bleacher going on the road, and the difference
 * between "due in four months" and "overdue by five days" should be legible
 * from arm's length, in a yard, without reading the numbers.
 */

import { ThemeColors, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type {
  AnnualInspectionStatus,
  AnnualInspectionTone,
} from "../utils/annualInspectionStatus";

const ICONS: Record<AnnualInspectionTone, keyof typeof Ionicons.glyphMap> = {
  ok: "shield-checkmark-outline",
  due_soon: "time-outline",
  overdue: "alert-circle-outline",
  missing: "help-circle-outline",
};

export default function AnnualInspectionCard({
  status,
}: {
  status: AnnualInspectionStatus;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const tint: Record<AnnualInspectionTone, string> = {
    ok: theme.success,
    due_soon: theme.warning,
    overdue: theme.danger,
    missing: theme.textTertiary,
  };

  const color = tint[status.tone];

  return (
    <View style={[styles.card, { borderColor: color }]}>
      <View style={styles.headline}>
        <Ionicons name={ICONS[status.tone]} size={20} color={color} />
        <Text style={[styles.headlineText, { color }]}>{status.headline}</Text>
      </View>

      <View style={styles.dates}>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>Last inspected</Text>
          <Text style={styles.dateValue}>{status.inspectedLabel}</Text>
        </View>
        <View style={styles.dateBlock}>
          <Text style={styles.dateLabel}>Next due</Text>
          <Text style={styles.dateValue}>{status.dueLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      padding: 14,
      gap: 12,
    },
    headline: { flexDirection: "row", alignItems: "center", gap: 8 },
    headlineText: { ...typeScale.callout, fontWeight: "700" },
    dates: { flexDirection: "row", gap: 16 },
    dateBlock: { flex: 1, gap: 2 },
    dateLabel: {
      ...typeScale.caption2,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: theme.textTertiary,
    },
    dateValue: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
    },
  });
