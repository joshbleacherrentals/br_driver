/**
 * One damage report, as a card.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * Shared by three screens — the reports list, the checklist a driver picks
 * from instead of filing a duplicate, and the trips screen's view of a
 * bleacher — because the judgement all three support is the same one: "is this
 * the damage I am looking at, and does anyone already know about it?"
 *
 * That is why the note and the photo strip are on the card rather than behind
 * a tap. A severity badge cannot answer it; a photo usually can.
 */

import Badge from "@/components/ui/Badge";
import FixedBadge from "@/components/widgets/FixedBadge";
import { radius, typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import type { DamageReportData } from "@/hooks/db/useDamageReport";
import { useTheme } from "@/hooks/useTheme";
import { severityColors, severityLabel, worstSeverity } from "@/utils/damageSeverity";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type DamageReportCardProps = {
  report: DamageReportData;
  /** Text in the schema, digits in practice — accepted either way. */
  bleacherNumber?: string | number | null;
  /** Who filed it, when this device knows them. */
  authorLabel?: string | null;
  /** How many drivers have confirmed this report. */
  ackCount?: number;
  selectable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  onToggleSelected?: () => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DamageReportCard({
  report,
  bleacherNumber,
  authorLabel,
  ackCount = 0,
  selectable = false,
  selected = false,
  onPress,
  onToggleSelected,
}: DamageReportCardProps) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const severity = worstSeverity(report.seat_damage, report.haul_damage);
  const colors = severityColors(theme, severity);

  // Tapping the card is the frequent gesture — in a selection list that is
  // ticking, not opening. Opening is the deliberate one, so it gets its own
  // control rather than stealing the whole surface; without a checkbox there is
  // nothing to tick and the card opens instead.
  return (
    <TouchableOpacity
      testID="damage-report-card"
      accessibilityRole={selectable ? "checkbox" : "button"}
      accessibilityState={selectable ? { checked: selected } : undefined}
      style={[styles.card, selected && { borderColor: theme.accent }]}
      activeOpacity={0.7}
      onPress={selectable ? onToggleSelected : onPress}
    >
      <View style={styles.headerRow}>
        {selectable && (
          <View
            testID="damage-report-card-checkbox"
            style={[
              styles.checkbox,
              selected && { backgroundColor: theme.accent, borderColor: theme.accent },
            ]}
          >
            {selected && (
              <Ionicons name="checkmark" size={14} color={theme.onAccent} />
            )}
          </View>
        )}

        <View style={styles.headerText}>
          <Text style={styles.title}>
            {bleacherNumber != null ? `Bleacher #${bleacherNumber}` : "Damage report"}
          </Text>
          <Text style={styles.meta}>
            {formatDate(report.created_at)}
            {authorLabel ? ` · by ${authorLabel}` : ""}
          </Text>
        </View>

        <View style={styles.headerBadges}>
          <FixedBadge fixedByDriver={report.fixed_by_driver} />

          <View
            style={[
              styles.severityPill,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
          >
            <Ionicons name="warning" size={12} color={colors.text} />
            <Text style={[styles.severityText, { color: colors.text }]}>
              {severityLabel(severity)}
            </Text>
          </View>
        </View>
      </View>

      {!!report.note && (
        <Text style={styles.note} numberOfLines={2}>
          {report.note}
        </Text>
      )}

      {selectable && (
        <TouchableOpacity
          testID="damage-report-card-open"
          accessibilityRole="button"
          accessibilityLabel="Open damage report"
          hitSlop={10}
          style={styles.openButton}
          onPress={onPress}
        >
          <Ionicons name="eye-outline" size={16} color={theme.accent} />
          <Text style={styles.openText}>Open report</Text>
        </TouchableOpacity>
      )}

      {ackCount > 0 && (
        <Badge
          label={`Confirmed by ${ackCount} ${ackCount === 1 ? "driver" : "drivers"}`}
          color={theme.accent}
          icon="people-outline"
          style={styles.ackBadge}
        />
      )}
    </TouchableOpacity>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 8,
    },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: { flex: 1, gap: 2 },
    title: { ...typeScale.subhead, fontWeight: "700", color: theme.header },
    meta: { ...typeScale.caption, color: theme.textSecondary },
    headerBadges: { flexDirection: "row", alignItems: "center", gap: 6 },
    severityPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    severityText: { ...typeScale.caption2, fontWeight: "700" },
    // Full width and a real tap target: beside the badges it was both hard to
    // see and hard to hit.
    openButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: radius.control,
      borderWidth: 1,
      borderColor: theme.accent,
    },
    openText: { ...typeScale.footnote, fontWeight: "700", color: theme.accent },
    note: { ...typeScale.footnote, color: theme.textPrimary },
    ackBadge: { alignSelf: "flex-start" },
  });
}
