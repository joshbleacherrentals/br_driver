import { db } from "@/components/providers/SystemProvider";
import { ThemeColors, typeScale } from "@/constants/theme";
import TripItem from "@/components/widgets/trip_item";
import { useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { useAcceptTrip } from "@/hooks/useAcceptTrip";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { todayISODate } from "@/utils/documentExpiry";
import type { WithdrawalAction } from "@/utils/tripWithdrawal";
import { withdrawTracker } from "@/utils/withdrawTracker";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

export default function PendingTripsList({
  onLeave,
}: {
  /** Close the sheet this list lives in, when navigating away from it. */
  onLeave?: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const workTrackers = useWorkTrackers().workTrackers;
  const { acceptTrip, blockFor, openFix } = useAcceptTrip({
    beforeNavigate: onLeave,
  });

  const pendingTrips = useMemo(
    () => (workTrackers ?? []).filter((wt) => wt.status === "released"),
    [workTrackers],
  );

  const handleAccept = useCallback(
    async (workTrackerId: string) => {
      const trip = workTrackers?.find((wt) => wt.id === workTrackerId);
      await acceptTrip(workTrackerId, trip?.date ?? todayISODate());
    },
    [acceptTrip, workTrackers],
  );

  const handleWithdraw = useCallback(
    async (workTrackerId: string, action: WithdrawalAction) => {
      try {
        await withdrawTracker(workTrackerId, action);
      } catch {
        Alert.alert("Error", "Failed to decline. Please try again.");
      }
    },
    [],
  );

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
          acceptBlockReason={
            blockFor(item.date ?? todayISODate())?.shortReason ?? null
          }
          onFixBlock={() => openFix(item.date ?? todayISODate())}
          onAccept={handleAccept}
          onStartTrip={noop}
          onSkip={handleSkip}
          onWithdraw={handleWithdraw}
          onArrived={noop}
          onCompleteJob={noop}
          onStartInspection={noop}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="checkmark-circle-outline"
            size={40}
            color={theme.textTertiary}
          />
          <Text style={styles.emptyText}>No pending trips</Text>
          <Text style={styles.emptySubtext}>
            New trip assignments will appear here
          </Text>
        </View>
      )}
    />
  );
}

const noop = async () => {};

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
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
      ...typeScale.body,
      fontWeight: "600",
      color: theme.textTertiary,
    },
    emptySubtext: {
      ...typeScale.subhead,
      color: theme.textTertiary,
    },
  });
