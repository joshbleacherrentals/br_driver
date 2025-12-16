import { PRIMARY, PRIMARY_LIGHT } from "@/constants/AuthStyles";
import { activeTrip$ } from "@/state/session/activeTrip";
import { openInMaps } from "@/utils/mapsUtils";
import { useSelector } from "@legendapp/state/react";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface TripLocationCardProps {
  type: "pickup" | "dropoff";
  onStartInspection: () => void;
}

export default function TripLocationCard({ type, onStartInspection }: TripLocationCardProps) {
  const activeTrip = useSelector(() => activeTrip$.get());

  if (!activeTrip) return null;

  const isPickup = type === "pickup";
  const stepNumber = isPickup ? 1 : 2;
  const title = isPickup ? "Pickup Location" : "Drop-off Location";
  const inspectionLabel = isPickup ? "Start Pre-Trip Inspection" : "Start Post-Trip Inspection";

  // Get the right address based on type
  const addressData = isPickup ? activeTrip.pickup_address : activeTrip.dropoff_address;
  const address = addressData
    ? `${addressData.street}, ${addressData.city}, ${addressData.state_province}${
        addressData.zip_postal ? " " + addressData.zip_postal : ""
      }`
    : "";
  const time = isPickup ? activeTrip.pickup_time : activeTrip.dropoff_time;
  const poc = isPickup ? activeTrip.pickup_poc : activeTrip.dropoff_poc;

  // Inspection status
  const hasPreTripInspection = !!activeTrip.pre_inspection_id;
  const hasPostTripInspection = !!activeTrip.post_inspection_id;
  const inspectionCompleted = isPickup ? hasPreTripInspection : hasPostTripInspection;
  const inspectionDisabled = !isPickup && !hasPreTripInspection;

  return (
    <View style={[styles.card, inspectionDisabled && styles.cardDisabled]}>
      {/* Completion Badge */}
      {inspectionCompleted && (
        <View style={styles.completedBadge}>
          <Text style={styles.completedText}>
            ✓ {type === "pickup" ? "Pre-Trip" : "Post-Trip"} Complete
          </Text>
        </View>
      )}

      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.stepIndicator, inspectionDisabled && styles.stepDisabled]}>
          <Text style={styles.stepNumber}>{stepNumber}</Text>
        </View>
        <Text style={[styles.cardTitle, inspectionDisabled && styles.textDisabled]}>{title}</Text>
      </View>

      {/* Address */}
      <TouchableOpacity
        onPress={() => address && openInMaps(address)}
        activeOpacity={0.7}
        disabled={inspectionDisabled}
      >
        <Text style={[styles.addressLink, inspectionDisabled && styles.textDisabled]}>
          {address || "No address"}
        </Text>
      </TouchableOpacity>

      {/* Details */}
      {time && (
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, inspectionDisabled && styles.textDisabled]}>Time:</Text>
          <Text style={[styles.detailText, inspectionDisabled && styles.textDisabled]}>{time}</Text>
        </View>
      )}
      {poc && (
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, inspectionDisabled && styles.textDisabled]}>
            Contact:
          </Text>
          <Text style={[styles.detailText, inspectionDisabled && styles.textDisabled]}>{poc}</Text>
        </View>
      )}

      {/* Inspection Button */}
      {!inspectionCompleted && (
        <TouchableOpacity
          style={[styles.button, inspectionDisabled ? styles.buttonDisabled : styles.buttonPrimary]}
          onPress={onStartInspection}
          disabled={inspectionDisabled}
        >
          <Text style={[styles.buttonText, inspectionDisabled && styles.buttonTextDisabled]}>
            {inspectionLabel}
          </Text>
        </TouchableOpacity>
      )}

      {/* Disabled Message */}
      {inspectionDisabled && (
        <Text style={styles.disabledMessage}>Complete pickup inspection first</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  completedBadge: {
    backgroundColor: "#E8F8F0",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    alignItems: "center",
  },
  completedText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#34C759",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  stepIndicator: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepDisabled: {
    backgroundColor: "#CBD5E1",
  },
  stepNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  textDisabled: {
    color: "#94A3B8",
  },
  addressLink: {
    fontSize: 16,
    fontWeight: "600",
    color: PRIMARY_LIGHT,
    marginBottom: 16,
    lineHeight: 24,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
    width: 80,
  },
  detailText: {
    fontSize: 15,
    color: "#1E293B",
    flex: 1,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  buttonPrimary: {
    backgroundColor: PRIMARY,
  },
  buttonDisabled: {
    backgroundColor: "#E2E8F0",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  buttonTextDisabled: {
    color: "#94A3B8",
  },
  disabledMessage: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
});
