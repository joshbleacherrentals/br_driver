import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type TripFilter = "upcoming" | "today" | "past";

interface TripsSegmentedControlProps {
  selected: TripFilter;
  onSelect: (filter: TripFilter) => void;
  counts: {
    upcoming: number;
    today: number;
    past: number;
  };
}

export default function TripsSegmentedControl({
  selected,
  onSelect,
  counts,
}: TripsSegmentedControlProps) {
  const segments: { key: TripFilter; label: string; count: number }[] = [
    { key: "past", label: "Past", count: counts.past },
    { key: "today", label: "Today", count: counts.today },
    { key: "upcoming", label: "Upcoming", count: counts.upcoming },
  ];

  return (
    <View style={styles.container}>
      {segments.map((segment) => (
        <Pressable
          key={segment.key}
          style={[styles.segment, selected === segment.key && styles.segmentSelected]}
          onPress={() => onSelect(segment.key)}
        >
          <Text
            style={[styles.segmentText, selected === segment.key && styles.segmentTextSelected]}
          >
            {segment.label}
          </Text>
          {segment.count > 0 && (
            <View
              style={[
                styles.badge,
                selected === segment.key ? styles.badgeSelected : styles.badgeDefault,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  selected === segment.key ? styles.badgeTextSelected : styles.badgeTextDefault,
                ]}
              >
                {segment.count}
              </Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#F0F0F0",
    borderRadius: 10,
    padding: 2,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  segmentSelected: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
  },
  segmentTextSelected: {
    color: "#000",
    fontWeight: "600",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeDefault: {
    backgroundColor: "#D0D0D0",
  },
  badgeSelected: {
    backgroundColor: "#007AFF",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  badgeTextDefault: {
    color: "#666",
  },
  badgeTextSelected: {
    color: "#FFFFFF",
  },
});
