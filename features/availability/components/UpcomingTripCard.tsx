import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { ThemeColors, typeScale } from "@/constants/theme";
import { WorkTracker } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

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

function ConflictBadge({ dangerColor }: { dangerColor: string }) {
  const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      onPress={() => setExpanded((e) => !e)}
      style={styles.conflictBadge}
      activeOpacity={0.7}
    >
      <Ionicons name="warning" size={16} color={dangerColor} />
      {expanded && (
        <Text style={[styles.conflictBadgeText, { color: dangerColor }]}>
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
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const accentColor = conflictDate ? theme.danger : theme.warning;

  return (
    <Card style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.date}>{formatDisplayDate(trip.date!)}</Text>
          {conflictDate && <ConflictBadge dangerColor={theme.danger} />}
        </View>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={12} color={theme.textSecondary} />
          <Text style={styles.meta}>
            {trip.pickup_time ?? "TBD"}
            {trip.dropoff_time ? ` → ${trip.dropoff_time}` : ""}
          </Text>
        </View>
      </View>
      <Badge
        label={formatStatus(trip.status)}
        color={theme.warning}
        style={styles.statusBadgeSpacing}
      />
    </Card>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
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
    date: { ...typeScale.subhead, fontWeight: "600", color: theme.textPrimary },
    meta: { ...typeScale.caption, fontWeight: "400", color: theme.textSecondary },
    statusBadgeSpacing: { marginLeft: 8 },
    conflictBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "transparent",
      paddingVertical: 2,
    },
    conflictBadgeText: {
      ...typeScale.caption2,
      fontWeight: "400",
      maxWidth: 200,
    },
  });
