/**
 * One stop on a trip card: where to be, when, who to ask for, what to do.
 *
 * A trip renders two of these — a pick up and a drop off. Repair /
 * Maintenance and Site Visit / Cleaning / Other work renders one, with no
 * pick up / drop off wording anywhere in it. Which is which is decided in
 * `buildTripStops`; this component only draws what it is handed.
 */
import { ContactButton } from "@/components/widgets/contactSheet";
import { typeScale, type ThemeColors } from "@/constants/theme";
import type { TripStop } from "@/utils/tripStops";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type TripStopSectionProps = {
  stop: TripStop;
  theme: ThemeColors;
  /** Trip status + acceptance, which gate the POC's phone number. */
  status: string | null;
  acceptedAt: string | null;
  onOpenMaps: (query: string | null) => void;
};

function TripStopSection({
  stop,
  theme,
  status,
  acceptedAt,
  onOpenMaps,
}: TripStopSectionProps) {
  return (
    <View style={styles.stopSection}>
      <View style={styles.stopHeader}>
        <View style={styles.stopHeaderLeft}>
          <Ionicons name="location" size={16} color={theme.accent} />
          <Text style={[styles.locationLabel, { color: theme.textPrimary }]}>
            {stop.title}
          </Text>
        </View>
        <View style={styles.stopHeaderRight}>
          {!!stop.time && (
            <Text style={[styles.timeText, { color: theme.textPrimary }]}>
              {stop.time}
            </Text>
          )}
          <ContactButton
            contactId={stop.contactUuid}
            status={status}
            acceptedAt={acceptedAt}
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={() => onOpenMaps(stop.mapsQuery)}
        activeOpacity={0.7}
      >
        <Text style={[styles.addressText, { color: theme.accent }]}>
          {stop.address}
        </Text>
      </TouchableOpacity>

      {!!stop.poc && (
        <Text style={[styles.detailText, { color: theme.textSecondary }]}>
          POC: {stop.poc}
        </Text>
      )}

      {!!stop.flag && (
        <View style={styles.flagRow}>
          <Ionicons name="construct-outline" size={14} color={theme.warning} />
          <Text style={[styles.flagText, { color: theme.warning }]}>
            {stop.flag}
          </Text>
        </View>
      )}

      {!!stop.instructions && (
        <View
          style={[
            styles.instructionsBox,
            {
              backgroundColor: theme.accentSoft,
              borderLeftColor: theme.accent,
            },
          ]}
        >
          <Text style={[styles.instructionsLabel, { color: theme.accent }]}>
            {stop.instructionsLabel}
          </Text>
          <Text style={[styles.instructionsText, { color: theme.textPrimary }]}>
            {stop.instructions}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stopSection: { marginBottom: 8 },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  stopHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  stopHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  locationLabel: {
    ...typeScale.footnote,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  timeText: { ...typeScale.subhead, fontWeight: "600" },
  addressText: {
    ...typeScale.subhead,
    fontWeight: "600",
    marginBottom: 4,
  },
  detailText: { ...typeScale.footnote, marginTop: 2 },
  flagRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  flagText: { ...typeScale.footnote, fontWeight: "600" },
  instructionsBox: {
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  instructionsLabel: {
    ...typeScale.caption2,
    fontWeight: "700",
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  instructionsText: { ...typeScale.footnote },
});

export default TripStopSection;
