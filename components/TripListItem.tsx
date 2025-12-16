import { acceptTrip } from "@/state/stores/workTrackers.store";
import { WorkTrackerStatus } from "@/types/workTracker";
import { openInMaps } from "@/utils/mapsUtils";
import {
  canAcceptTrip,
  canStartTrip,
  getStatusColor,
  getStatusLabel,
} from "@/utils/workTrackerUtils";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  legendStateUuid: string;
  status: WorkTrackerStatus;
  date: string;
  // Header
  headerTitle?: string; // e.g., $120.00 · Blch #12
  headerSubtitle?: string; // e.g., Mon, Jan 31st
  pickupAddress?: string;
  pickupTime?: string;
  pickupPoc?: string;
  dropoffAddress?: string;
  dropoffTime?: string;
  dropoffPoc?: string;
  notes?: string | null;
  onTripStart?: () => void; // Callback when trip is started (enters trip mode)
};

export default function TripsListItem({
  legendStateUuid,
  status,
  date,
  headerTitle,
  headerSubtitle,
  pickupAddress,
  pickupTime,
  pickupPoc,
  dropoffAddress,
  dropoffTime,
  dropoffPoc,
  notes,
  onTripStart,
}: Props) {
  const handleAccept = () => {
    acceptTrip(legendStateUuid);
  };

  const handleStart = () => {
    // startMutation.mutate();
  };

  const content = (
    <View style={styles.card}>
      {/* Status Badge */}
      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
        <Text style={styles.statusText}>{getStatusLabel(status)}</Text>
      </View>

      {/* Header */}
      {(headerTitle || headerSubtitle) && (
        <View style={{ marginBottom: 12 }}>
          {headerTitle ? <Text style={styles.headerTitle}>{headerTitle}</Text> : null}
          {headerSubtitle ? <Text style={styles.headerSubtitle}>{headerSubtitle}</Text> : null}
        </View>
      )}
      {/* Pickup */}
      <View style={styles.row}>
        <View style={styles.bullet} />
        <View style={styles.textContainer}>
          <Text style={styles.sectionLabel}>Pickup</Text>
          <TouchableOpacity
            onPress={() => pickupAddress && openInMaps(pickupAddress)}
            activeOpacity={0.7}
          >
            <Text style={styles.addressLink}>{pickupAddress || "No address"}</Text>
          </TouchableOpacity>
          {pickupTime && (
            <View style={styles.subRow}>
              {pickupTime ? <Text style={styles.subText}>Time: {pickupTime}</Text> : null}
            </View>
          )}
          {pickupPoc && (
            <View style={styles.subRow}>
              {pickupPoc ? <Text style={styles.subText}>POC: {pickupPoc}</Text> : null}
            </View>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Drop-off */}
      <View style={styles.row}>
        <View style={[styles.bullet, { backgroundColor: "#FF3B30" }]} />
        <View style={styles.textContainer}>
          <Text style={styles.sectionLabel}>Drop-off</Text>
          <TouchableOpacity
            onPress={() => dropoffAddress && openInMaps(dropoffAddress)}
            activeOpacity={0.7}
          >
            <Text style={styles.addressLink}>{dropoffAddress || "No address"}</Text>
          </TouchableOpacity>
          {dropoffTime && (
            <View style={styles.subRow}>
              {dropoffTime ? <Text style={styles.subText}>Time: {dropoffTime}</Text> : null}
            </View>
          )}
          {dropoffPoc && (
            <View style={styles.subRow}>
              {dropoffPoc ? <Text style={styles.subText}>POC: {dropoffPoc}</Text> : null}
            </View>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      {canAcceptTrip({ status, date } as any) && (
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={handleAccept}
          // disabled={acceptMutation.isPending}
        >
          {/* {acceptMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>Accept Trip</Text>
          )} */}
        </TouchableOpacity>
      )}

      {canStartTrip({ status, date } as any) && (
        <TouchableOpacity
          style={[styles.actionButton, styles.startButton]}
          onPress={handleStart}
          // disabled={startMutation.isPending}
        >
          {/* {startMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>Start Trip</Text>
          )} */}
        </TouchableOpacity>
      )}

      {/* Notes (stay at the very bottom) */}
      {notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );

  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3, // Android shadow
  },
  statusBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34C759", // green
    marginTop: 6,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  address: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  addressLink: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A84FF", // iOS link blue
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  dot: {
    fontSize: 14,
    color: "#bbb",
    marginHorizontal: 4,
  },
  subText: {
    fontSize: 14,
    color: "#444",
  },
  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 12,
  },
  actionButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    backgroundColor: "#34C759", // iOS green
  },
  startButton: {
    backgroundColor: "#0A84FF", // iOS blue
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  notesBox: {
    marginTop: 12,
    backgroundColor: "#F8F8F8",
    borderRadius: 8,
    padding: 10,
  },
  notesLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: "#333",
  },
});
