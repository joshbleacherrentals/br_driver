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
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/** Enough to recognise the damage; beyond that the strip stops being scannable. */
const MAX_THUMBNAILS = 4;

export type DamageReportCardProps = {
  report: DamageReportData;
  /** Text in the schema, digits in practice — accepted either way. */
  bleacherNumber?: string | number | null;
  /** Who filed it, when this device knows them. */
  authorLabel?: string | null;
  /** Base64 thumbnails — they sync with the row, so these work offline. */
  thumbnails?: string[];
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
  thumbnails = [],
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
  const shown = thumbnails.slice(0, MAX_THUMBNAILS);
  const overflow = thumbnails.length - shown.length;

  return (
    <TouchableOpacity
      testID="damage-report-card"
      style={[styles.card, selected && { borderColor: theme.accent }]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={styles.headerRow}>
        {selectable && (
          <TouchableOpacity
            testID="damage-report-card-checkbox"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            hitSlop={8}
            style={[
              styles.checkbox,
              selected && { backgroundColor: theme.accent, borderColor: theme.accent },
            ]}
            onPress={onToggleSelected}
          >
            {selected && (
              <Ionicons name="checkmark" size={14} color={theme.onAccent} />
            )}
          </TouchableOpacity>
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

      {shown.length > 0 && (
        <View style={styles.photoStrip}>
          {shown.map((uri, index) => (
            <Image
              key={`${report.id}-thumb-${index}`}
              source={{ uri }}
              style={styles.thumbnail}
              contentFit="cover"
            />
          ))}
          {overflow > 0 && (
            <View style={styles.overflowTile}>
              <Text style={styles.overflowText}>+{overflow}</Text>
            </View>
          )}
        </View>
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
    note: { ...typeScale.footnote, color: theme.textPrimary },
    photoStrip: { flexDirection: "row", gap: 6 },
    thumbnail: { width: 52, height: 52, borderRadius: radius.control },
    overflowTile: {
      width: 52,
      height: 52,
      borderRadius: radius.control,
      backgroundColor: theme.secondaryAccentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    overflowText: { ...typeScale.footnote, fontWeight: "700", color: theme.textPrimary },
    ackBadge: { alignSelf: "flex-start" },
  });
}
