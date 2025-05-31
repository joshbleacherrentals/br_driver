import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function TripsListItem({
  pickup = "123 Main St, Springfield",
  dropoff = "456 Oak Ave, Shelbyville",
  driveTime = "25 min",
  distance = "18.2 mi",
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.bullet} />
        <View style={styles.textContainer}>
          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.location}>{pickup}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <View style={[styles.bullet, { backgroundColor: "#FF3B30" }]} />
        <View style={styles.textContainer}>
          <Text style={styles.label}>Drop-off</Text>
          <Text style={styles.location}>{dropoff}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaText}>{driveTime}</Text>
        <Text style={styles.metaText}>•</Text>
        <Text style={styles.metaText}>{distance}</Text>
      </View>
    </View>
  );
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
  label: {
    fontSize: 12,
    color: "#888",
    marginBottom: 2,
  },
  location: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111",
  },
  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 12,
  },
  meta: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    fontSize: 14,
    color: "#666",
  },
});
