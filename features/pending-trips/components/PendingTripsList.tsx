import { db } from "@/components/providers/SystemProvider";
import TripItem from "@/components/widgets/trip_item";
import { useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo } from "react";
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

  const pendingTrips = useMemo(
    () => (workTrackers ?? []).filter((wt) => wt.status === "released"),
    [workTrackers],
  );

  const handleAccept = useCallback(async (workTrackerId: string) => {
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
  }, [isProfileComplete]);

  const handleSkip = useCallback(async (workTrackerId: string) => {
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
  }, []);

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={pendingTrips}
      keyExtractor={(item) => String(item.id)}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={5}
      removeClippedSubviews
      renderItem={({ item }) => (
        <TripItem
          workTracker={item}
          onAccept={handleAccept}
          onStartTrip={noop}
          onSkip={handleSkip}
          onArrived={noop}
          onStartInspection={noop}
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

const noop = async () => {};

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
