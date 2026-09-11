/**
 * One finished job in the history list.
 *
 * A driver scanning months of work needs to tell a haul from a repair from a
 * site visit without opening anything, so the card carries the kind's colour
 * down its left edge and names the kind on a badge. The stops follow the same
 * rule as the live trip card: two for a trip, one for everything else — a
 * finished repair never had a pick up to show.
 */
import WorkTrackerKindBadge from "@/components/widgets/trip/WorkTrackerKindBadge";
import { workTrackerKindColor } from "@/constants/workTrackerKinds";
import { elevation, typeScale, type ThemeColors } from "@/constants/theme";
import type { AddressData } from "@/hooks/db/useAddress";
import type { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { buildTripStops } from "@/utils/tripStops";
import type { WorkTrackerKind } from "@/utils/workTrackerKind";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type HistoryTripCardProps = {
  trip: WorkTracker;
  kind: WorkTrackerKind;
  bleacherNumber: string | null;
  pickupAddress: AddressData | null;
  dropoffAddress: AddressData | null;
  payLabel: string | null;
  dateLabel: string;
  isLast: boolean;
  theme: ThemeColors;
  onPress: () => void;
};

function HistoryTripCard({
  trip,
  kind,
  bleacherNumber,
  pickupAddress,
  dropoffAddress,
  payLabel,
  dateLabel,
  isLast,
  theme,
  onPress,
}: HistoryTripCardProps) {
  const kindColor = workTrackerKindColor(kind, theme);
  const stops = buildTripStops({
    kind,
    workTracker: trip,
    pickupAddress,
    dropoffAddress,
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderLeftColor: kindColor,
          marginBottom: isLast ? 10 : 0,
          ...elevation(theme, "card"),
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {bleacherNumber ? `Bleacher #${bleacherNumber}` : "Trip"}
            {bleacherNumber && payLabel ? " – " : ""}
            {payLabel ?? ""}
          </Text>
          <Text style={[styles.date, { color: theme.textSecondary }]}>
            {dateLabel}
          </Text>
          <View style={styles.badgeRow}>
            <WorkTrackerKindBadge kind={kind} theme={theme} />
          </View>
        </View>
      </View>

      <View style={styles.addressBlock}>
        {stops.map((stop, index) => (
          <View key={stop.key} style={index > 0 ? styles.stopSpacing : null}>
            <View style={styles.addressLabel}>
              <Ionicons
                name="location-outline"
                size={13}
                color={theme.textTertiary}
              />
              <Text
                style={[styles.addressLabelText, { color: theme.textTertiary }]}
              >
                {stop.title}
              </Text>
            </View>
            <Text style={[styles.addressText, { color: theme.textPrimary }]}>
              {stop.address}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.footer, { borderTopColor: theme.separator }]}>
        <Text style={[styles.footerText, { color: theme.accent }]}>
          View full details and inspections
        </Text>
        <Ionicons name="arrow-forward" size={14} color={theme.accent} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  headerLeft: { flex: 1 },
  title: { ...typeScale.body, fontWeight: "700", marginBottom: 2 },
  date: { ...typeScale.footnote },
  badgeRow: { marginTop: 6 },
  addressBlock: { marginBottom: 10 },
  stopSpacing: { marginTop: 8 },
  addressLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  addressLabelText: {
    ...typeScale.caption2,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addressText: { ...typeScale.footnote, marginLeft: 18 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  footerText: { ...typeScale.footnote, fontWeight: "600" },
});

export default HistoryTripCard;
