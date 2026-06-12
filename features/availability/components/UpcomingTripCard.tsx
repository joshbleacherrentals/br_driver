import Card from "@/components/ui/Card";
import { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const SAVED_RED = "#EF4444";
const DOT_UPCOMING = "#FBBF24";

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDate();
  const s = ["th", "st", "nd", "rd"];
  const v = day % 100;
  const ord = s[(v - 20) % 10] || s[v] || s[0];
  return `${date.toLocaleDateString(undefined, { weekday: "short" })}, ${date.toLocaleDateString(undefined, { month: "short" })} ${day}${ord}`;
}

function formatStatus(status: string | null): string {
  if (!status) return "Pending";
  const map: Record<string, string> = {
    released: "Released",
    accepted: "Accepted",
    dest_pickup: "En Route",
    pickup_inspection: "At Pickup",
    dest_dropoff: "To Dropoff",
    dropoff_inspection: "At Dropoff",
  };
  return map[status] ?? status;
}

function ConflictBadge() {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => setExpanded((e) => !e)}
      style={styles.conflictBadge}
      activeOpacity={0.7}
    >
      <Ionicons name="warning" size={16} color={SAVED_RED} />
      {expanded && (
        <Text style={styles.conflictBadgeText}>
          Booked on an unavailable day — contact your account manager.
        </Text>
      )}
    </TouchableOpacity>
  );
}

interface Props {
  trip: WorkTracker;
  conflictDate: boolean;
}

export default function UpcomingTripCard({ trip, conflictDate }: Props) {
  const isDark = useColorScheme() === "dark";
  const metaColor = isDark ? "#7fb3d3" : "#6B7280";
  const textColor = isDark ? "#FFFFFF" : "#111827";

  return (
    <Card
      style={[
        styles.card,
        // conflictDate && {
        //   backgroundColor: isDark ? "#1f1a2e" : "#fff0f0",
        //   borderColor: SAVED_RED + "80",
        // },
      ]}
    >
      <View
        style={[
          styles.accent,
          { backgroundColor: conflictDate ? SAVED_RED : DOT_UPCOMING },
        ]}
      />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={[styles.date, { color: textColor }]}>
            {formatDisplayDate(trip.date!)}
          </Text>
          {conflictDate && <ConflictBadge />}
        </View>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={12} color={metaColor} />
          <Text style={[styles.meta, { color: metaColor }]}>
            {trip.pickup_time ?? "TBD"}
            {trip.dropoff_time ? ` → ${trip.dropoff_time}` : ""}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor: DOT_UPCOMING + "25",
            borderColor: DOT_UPCOMING + "55",
          },
        ]}
      >
        <Text style={[styles.statusBadgeText, { color: DOT_UPCOMING }]}>
          {formatStatus(trip.status)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 0,
    marginBottom: 8,
    overflow: "hidden",
    paddingRight: 14,
  },
  accent: { width: 4, alignSelf: "stretch", marginRight: 12 },
  body: { flex: 1, paddingVertical: 12, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  date: { fontSize: 14, fontWeight: "600" },
  meta: { fontSize: 12, fontWeight: "500" },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    marginLeft: 8,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  conflictBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "transparent",
    // borderRadius: 6,
    // paddingHorizontal: 6,
    paddingVertical: 2,
    // borderWidth: 1,
    // borderColor: "#ff0000",
  },
  conflictBadgeText: {
    fontSize: 11,
    color: "#ff0000",
    fontWeight: "500",
    maxWidth: 200,
  },
});
