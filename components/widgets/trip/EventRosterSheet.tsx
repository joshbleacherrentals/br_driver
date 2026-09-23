/**
 * "When are the other bleachers coming?" — the sheet behind a tappable
 * PICKUP / DROP-OFF heading.
 *
 * One row per bleacher the office booked into this leg's event, what the
 * driver bringing it is doing, since when, and a way to see the trailer on a
 * map when it carries a GPS unit. The driver reads this out to whoever asked,
 * so it says plainly when it does not know something rather than guessing.
 *
 * The event's name and dates sit at the top on purpose: which event a trip
 * belongs to is resolved by address matching, not recorded directly
 * (docs/specs/event-bleacher-roster.md §4), and on rare data-quality edge
 * cases it can still name the wrong one — a driver who can see the event
 * named can tell when that happened.
 */

import BottomSheetModal from "@/components/ui/BottomSheetModal";
import { typeScale } from "@/constants/theme";
import type { EventRoster, EventRosterEntry } from "@/hooks/db/useEventRoster";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useTheme } from "@/hooks/useTheme";
import { useTrackBleacher } from "@/hooks/useTrackBleacher";
import {
  describeFleetStatus,
  formatSinceChange,
} from "@/utils/eventRoster/describeFleetStatus";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type EventRosterSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** What this sheet is about: "Pickup" or "Drop-off". */
  legLabel: string;
  roster: EventRoster;
};

function formatEventDates(start: string, end: string | null): string {
  const format = (value: string) => {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const from = format(start);
  const to = end ? format(end) : null;
  return !to || to === from ? from : `${from} – ${to}`;
}

/** Clock time, so "12 min ago" can be checked against a watch. */
function formatClock(changedAt: string | null): string | null {
  if (!changedAt) return null;

  const at = new Date(changedAt);
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function RosterRow({
  entry,
  onTrack,
  tracking,
}: {
  entry: EventRosterEntry;
  onTrack: (deviceId: string | null) => void;
  tracking: boolean;
}) {
  const { theme } = useTheme();
  const now = useMinuteClock();
  const changedAt = entry.tracker?.statusChangedAt ?? null;
  const status = describeFleetStatus(entry.tracker?.status, {
    statusChangedAt: changedAt,
    driveMinutes: entry.tracker?.driveMinutes,
    now,
  });
  const since = formatSinceChange(changedAt, now);
  const clock = formatClock(changedAt);
  const toneColor =
    status.tone === "active"
      ? theme.warning
      : status.tone === "done"
        ? theme.textSecondary
        : theme.textTertiary;

  return (
    <View style={[styles.row, { borderBottomColor: theme.separator }]}>
      <View style={styles.rowText}>
        <Text style={[styles.bleacherLabel, { color: theme.textPrimary }]}>
          {entry.bleacherNumber ? `Bleacher #${entry.bleacherNumber}` : "Bleacher"}
          {entry.isMine ? (
            <Text style={[styles.mine, { color: theme.accent }]}>{"  yours"}</Text>
          ) : null}
        </Text>
        <Text style={[styles.status, { color: toneColor }]}>{status.label}</Text>
        {since ? (
          <Text style={[styles.since, { color: theme.textTertiary }]}>
            {clock ? `${clock} · ${since}` : since}
          </Text>
        ) : null}
      </View>

      {entry.linxupDeviceId ? (
        <TouchableOpacity
          style={[styles.trackButton, { borderColor: theme.accent }]}
          onPress={() => onTrack(entry.linxupDeviceId)}
          disabled={tracking}
          accessibilityRole="button"
          accessibilityLabel={`Track bleacher ${entry.bleacherNumber ?? ""} on a map`}
        >
          {tracking ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <>
              <Ionicons name="navigate-outline" size={14} color={theme.accent} />
              <Text style={[styles.trackText, { color: theme.accent }]}>Track</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function EventRosterSheet({
  visible,
  onClose,
  legLabel,
  roster,
}: EventRosterSheetProps) {
  const { theme } = useTheme();
  const { track, trackingDeviceId } = useTrackBleacher();
  const { event, entries } = roster;

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.header }]}>
          {legLabel}: bleachers at this event
        </Text>

        {event ? (
          <Text style={[styles.eventLine, { color: theme.textSecondary }]}>
            {event.eventName ?? "Untitled event"} ·{" "}
            {formatEventDates(event.eventStart, event.eventEnd)}
          </Text>
        ) : null}

        {entries.map((entry) => (
          <RosterRow
            key={entry.bleacherUuid}
            entry={entry}
            onTrack={track}
            tracking={trackingDeviceId === entry.linxupDeviceId}
          />
        ))}

        <Text style={[styles.footnote, { color: theme.textTertiary }]}>
          Statuses come from the other drivers&apos; trips as their phones last
          synced. For anything this does not answer, ask the office.
        </Text>
      </ScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 4 },
  title: { ...typeScale.headline, fontWeight: "700" },
  eventLine: { ...typeScale.footnote, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  bleacherLabel: { ...typeScale.subhead, fontWeight: "700" },
  mine: { ...typeScale.caption, fontWeight: "600" },
  status: { ...typeScale.footnote, fontWeight: "600" },
  since: { ...typeScale.caption },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 78,
    justifyContent: "center",
  },
  trackText: { ...typeScale.footnote, fontWeight: "600" },
  footnote: { ...typeScale.caption, marginTop: 12 },
});
