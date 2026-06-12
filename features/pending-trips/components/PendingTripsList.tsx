import { db } from "@/components/providers/SystemProvider";
import TripItem from "@/components/widgets/trip_item";
import { useAllBleachers } from "@/hooks/db/useBleacher";
import { useResolvedBleacherAddresses } from "@/hooks/db/useResolveAddress";
import { useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

const themes = {
  light: {
    emptyText: "#8E8E93",
  },
  dark: {
    emptyText: "#636366",
  },
};

export default function PendingTripsList() {
  const colorScheme = useColorScheme();
  const t = themes[colorScheme === "dark" ? "dark" : "light"];

  const workTrackers = useWorkTrackers().workTrackers;
  const { isProfileComplete } = useProfileCompletion();
  const { bleachers: allBleachersFleet } = useAllBleachers();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const resolvedAddresses = useResolvedBleacherAddresses(
    allBleachersFleet,
    today,
  );

  const bleacherOptions = useMemo(
    () =>
      allBleachersFleet
        .map((b) => ({
          uuid: b.id,
          bleacher_number: b.bleacher_number ?? "—",
          bleacher_rows: b.bleacher_rows ?? null,
          resolved_address: resolvedAddresses[b.id] ?? null,
          label: b.bleacher_rows ? `${b.bleacher_rows} rows` : undefined,
        }))
        .sort(
          (a, b) =>
            parseInt(String(a.bleacher_number)) -
            parseInt(String(b.bleacher_number)),
        ),
    [allBleachersFleet, resolvedAddresses],
  );

  const pendingTrips = useMemo(
    () => (workTrackers ?? []).filter((wt) => wt.status === "released"),
    [workTrackers],
  );

  const handleAccept = async (workTrackerId: string) => {
    if (!isProfileComplete) {
      Alert.alert(
        "Error",
        "Complete your profile before you can accept any trips",
      );
      return;
    }
    try {
      const now = new Date().toISOString();
      await executeTypedMutationVoid(
        db
          .updateTable("WorkTrackers")
          .set({ status: "accepted", accepted_at: now, updated_at: now })
          .where("id", "=", workTrackerId)
          .compile(),
      );
    } catch {
      Alert.alert("Error", "Failed to accept trip.");
    }
  };

  const handleSkip = async (workTrackerId: string) => {
    Alert.alert("Skip Trip", "Are you sure you want to skip this trip?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Skip",
        style: "destructive",
        onPress: async () => {
          try {
            await executeTypedMutationVoid(
              db
                .updateTable("WorkTrackers")
                .set({
                  status: "cancelled",
                  updated_at: new Date().toISOString(),
                })
                .where("id", "=", workTrackerId)
                .compile(),
            );
          } catch {
            Alert.alert("Error", "Failed to skip trip.");
          }
        },
      },
    ]);
  };

  const noop = async () => {};

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={pendingTrips}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <TripItem
          workTracker={item}
          bleacherOptions={bleacherOptions}
          onAccept={handleAccept}
          onStartTrip={noop}
          onSkip={handleSkip}
          onArrived={noop}
          onStartInspection={noop}
          onBleacherChange={() => {}}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="checkmark-circle-outline"
            size={40}
            color={t.emptyText}
          />
          <Text style={[styles.emptyText, { color: t.emptyText }]}>
            No pending trips
          </Text>
          <Text style={[styles.emptySubtext, { color: t.emptyText }]}>
            New trip assignments will appear here
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
  },
});
