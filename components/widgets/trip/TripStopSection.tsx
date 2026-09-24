/**
 * One stop on a trip card: where to be, when, who to ask for, what to do.
 *
 * A trip renders two of these — a pick up and a drop off. Repair /
 * Maintenance and Site Visit / Cleaning / Other work renders one, with no
 * pick up / drop off wording anywhere in it. Which is which is decided in
 * `buildTripStops`; this component only draws what it is handed.
 */
import { ContactButton } from "@/components/widgets/contactSheet";
import StopRosterHeading from "@/components/widgets/trip/StopRosterHeading";
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
  /**
   * What the heading needs to open this leg's event roster — both of the
   * tracker's resolved events (pickup and drop-off use different events, see
   * the spec) and its own id. Omitted, the heading stays the plain label it
   * has always been.
   */
  roster?: {
    pickupEventUuid: string | null;
    dropoffEventUuid: string | null;
    workTrackerId: string;
  };
  onOpenMaps: (query: string | null) => void;
};

function TripStopSection({
  stop,
  theme,
  status,
  acceptedAt,
  roster,
  onOpenMaps,
}: TripStopSectionProps) {
  return (
    <View style={styles.stopSection}>
      <View style={styles.stopHeader}>
        <View style={styles.stopHeaderLeft}>
          <Ionicons name="location" size={16} color={theme.accent} />
          {roster ? (
            <StopRosterHeading
              title={stop.title}
              // A repair or a site visit has one stop, written into the
              // drop-off columns — so its event is the one it is heading to.
              leg={stop.key === "pickup" ? "pickup" : "dropoff"}
              eventUuid={stop.key === "pickup" ? roster.pickupEventUuid : roster.dropoffEventUuid}
              workTrackerId={roster.workTrackerId}
              textStyle={styles.locationLabel}
            />
          ) : (
            <Text style={[styles.locationLabel, { color: theme.textPrimary }]}>
              {stop.title}
            </Text>
          )}
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
    // The heading is a tappable pill once its event has a roster, which is
    // wider than the bare word it replaces. Together with a time range and the
    // Contact button that can exceed one line, so the right-hand group wraps
    // underneath instead of being pushed off the edge of the card.
    flexWrap: "wrap",
    rowGap: 6,
  },
  // `minWidth: 0` is what actually lets the pill shrink — without it a flex
  // child refuses to go below its content width and overflows the row.
  stopHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  stopHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
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
