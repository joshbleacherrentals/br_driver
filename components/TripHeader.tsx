import { PRIMARY } from "@/constants/AuthStyles";
import { activeTrip$ } from "@/state/session/activeTrip";
import { formatPayment } from "@/utils/workTrackerUtils";
import { useSelector } from "@legendapp/state/react";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function TripHeader() {
  const activeTrip = useSelector(() => activeTrip$.get());

  if (!activeTrip) return null;

  const payAmount = formatPayment(activeTrip.pay_cents);
  const bleacherNumber = activeTrip.bleacher?.bleacher_number
    ? `Bleacher #${activeTrip.bleacher.bleacher_number}`
    : "";
  const notes = activeTrip.notes;

  return (
    <View style={styles.container}>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          {payAmount ? <Text style={styles.payAmount}>{payAmount}</Text> : null}
        </View>
        <Text style={styles.bleacherNumber}>{`Deliver ${bleacherNumber}`}</Text>

        {/* Driver Notes - integrated into the same card */}
        {notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Driver Notes</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
  },
  payAmount: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  bleacherNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#E2E8F0",
  },
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E2E8F0",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: 15,
    color: "#fff",
    lineHeight: 22,
  },
});
