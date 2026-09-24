/**
 * A stop's heading — PICKUP / DROP-OFF — as the way into that event's roster.
 *
 * The heading *is* the affordance, the same bargain `PayAmount` strikes with
 * the pay figure: the word already names the thing the sheet is about, so a
 * separate button would compete with it for the same meaning. Tinted fill plus
 * a chevron is what makes it read as tappable; the plain word with a chevron
 * does not.
 *
 * With one bleacher at the event — or no event resolved at all, which is what
 * a run to or from storage looks like — there is nothing to open, so it
 * renders as the plain heading it has always been.
 */

import EventRosterSheet from "@/components/widgets/trip/EventRosterSheet";
import { useEventRoster } from "@/hooks/db/useEventRoster";
import { useTheme } from "@/hooks/useTheme";
import type { TripLeg } from "@/utils/eventRoster/buildEventRoster";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type StopRosterHeadingProps = {
  /** `PICKUP`, `DROP-OFF`, `LOCATION` … whatever the stop calls itself. */
  title: string;
  leg: TripLeg;
  /** This leg's resolved event — `pickup_event_uuid` / `dropoff_event_uuid`, computed server-side. Null means no event (a run to storage). */
  eventUuid: string | null;
  workTrackerId: string;
  /** The caller's own heading typography, so each screen keeps its scale. */
  textStyle?: object;
};

/** One bleacher is just this trip; a roster starts to answer questions at two. */
const MIN_ROSTER_SIZE = 2;

export default function StopRosterHeading({
  title,
  leg,
  eventUuid,
  workTrackerId,
  textStyle,
}: StopRosterHeadingProps) {
  const { theme } = useTheme();
  const [visible, setVisible] = React.useState(false);
  const roster = useEventRoster(leg, eventUuid, workTrackerId);

  const hasRoster = roster.entries.length >= MIN_ROSTER_SIZE;

  if (!hasRoster) {
    return <Text style={[styles.plainTitle, { color: theme.textPrimary }, textStyle]}>{title}</Text>;
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.chip, { backgroundColor: theme.accentSoft }]}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${title}. See the ${roster.entries.length} bleachers at this event`}
      >
        <Ionicons name="list-outline" size={13} color={theme.accent} />
        <Text style={[styles.chipTitle, { color: theme.accent }, textStyle]}>{title}</Text>
        <View style={[styles.count, { backgroundColor: theme.accent }]}>
          <Text style={[styles.countText, { color: theme.onAccent }]}>
            {roster.entries.length}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={13} color={theme.accent} />
      </TouchableOpacity>

      {visible ? (
        <EventRosterSheet
          visible={visible}
          onClose={() => setVisible(false)}
          legLabel={leg === "pickup" ? "Pickup" : "Drop-off"}
          roster={roster}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  plainTitle: { fontSize: 13, lineHeight: 18, fontWeight: "700", letterSpacing: 0.5 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 20,
    // Never wider than the space the stop header leaves it.
    flexShrink: 1,
  },
  chipTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  count: {
    minWidth: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
  },
  countText: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
});
