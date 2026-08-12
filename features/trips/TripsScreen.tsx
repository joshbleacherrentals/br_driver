import { db } from "@/components/providers/SystemProvider";
import { typeScale } from "@/constants/theme";
import InspectionScreen from "@/components/widgets/inspection";
import DocExpiryWarningBanner from "@/components/widgets/DocExpiryWarningBanner";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import PhotoUploadIssueBanner from "@/components/widgets/PhotoUploadIssueBanner";
import TripItem from "@/components/widgets/trip_item";
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { todayISODate } from "@/utils/documentExpiry";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ReleasedTripsBanner from "./components/ReleasedTripsBanner";

// ── Utility helpers ────────────────────────────────────────────────────────

type InspectionType = "pickup" | "dropoff";
type ActiveTab = "today" | "upcoming";

function formatDate(dateISO?: string | null) {
  if (!dateISO) return "Date not set";
  try {
    const d = new Date(dateISO + "T00:00:00");
    const day = d.getDate();
    const s = ["th", "st", "nd", "rd"];
    const v = day % 100;
    const ord = s[(v - 20) % 10] || s[v] || s[0];
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    const month = d.toLocaleDateString(undefined, { month: "short" });
    return `${weekday}, ${month} ${day}${ord}`;
  } catch {
    return "Invalid date";
  }
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function TripsScreen() {
  const { theme, scheme } = useTheme();
  const toggleTrackBg = theme.trackFill;

  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [inspectionData, setInspectionData] = useState<{
    workTrackerId: string;
    bleacherUuid: string | null;
    type: InspectionType;
  } | null>(null);

  const workTrackers = useWorkTrackers().workTrackers;
  const { getAcceptBlockReason } = useProfileCompletion();

  const today = useMemo(() => todayISODate(), []);

  // ── Handlers (stable refs so memoized TripItem can skip re-renders) ──────

  const handleAccept = useCallback(async (workTrackerId: string) => {
    const trip = workTrackers?.find((wt) => wt.id === workTrackerId);
    const blockReason = getAcceptBlockReason(trip?.date ?? today);
    if (blockReason) {
      Alert.alert("Cannot accept trip", blockReason);
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
  }, [getAcceptBlockReason, today, workTrackers]);

  const handleStartTrip = useCallback(async (workTrackerId: string) => {
    Alert.alert("Start Trip", "Ready to start this trip?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Start",
        onPress: async () => {
          try {
            const now = new Date().toISOString();
            await executeTypedMutationVoid(
              db
                .updateTable("WorkTrackers")
                .set({
                  status: "dest_pickup",
                  started_at: now,
                  updated_at: now,
                })
                .where("id", "=", workTrackerId)
                .compile(),
            );
          } catch {
            Alert.alert("Error", "Failed to start trip. Please try again.");
          }
        },
      },
    ]);
  }, []);

  const handleArrived = useCallback(async (workTrackerId: string, _arrivedAt: string) => {
    const currentTrip = workTrackers?.find((t) => t.id === workTrackerId);
    const isAtPickup = currentTrip?.status === "dest_pickup";

    Alert.alert(
      "Arrived",
      `Have you arrived at the ${isAtPickup ? "pickup" : "drop-off"} location?`,
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Yes, I've Arrived",
          onPress: async () => {
            try {
              const newStatus = isAtPickup
                ? "pickup_inspection"
                : "dropoff_inspection";
              await executeTypedMutationVoid(
                db
                  .updateTable("WorkTrackers")
                  .set({
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                  })
                  .where("id", "=", workTrackerId)
                  .compile(),
              );
            } catch {
              Alert.alert(
                "Error",
                "Failed to update inspection status. Please try again.",
              );
            }
          },
        },
      ],
    );
  }, [workTrackers]);

  const handleStartInspection = useCallback((
    workTrackerId: string,
    bleacherUuid: string | null,
    type: "pickup" | "dropoff",
  ) => {
    setInspectionData({ workTrackerId, bleacherUuid, type });
  }, []);

  const handleSkip = useCallback(async (workTrackerId: string) => {
    Alert.alert(
      "Skip Trip",
      "Are you sure you want to skip this trip? This will move it to the end of your queue.",
      [
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
              Alert.alert("Error", "Failed to skip trip. Please try again.");
            }
          },
        },
      ],
    );
  }, []);

  const handleInspectionComplete = async (workTrackerId: string) => {
    try {
      const currentTrip = workTrackers?.find((t) => t.id === workTrackerId);
      const isAtPickup = currentTrip?.status === "pickup_inspection";
      const newStatus = isAtPickup ? "dest_dropoff" : "completed";
      const now = new Date().toISOString();
      setInspectionData(null);
      const fields =
        newStatus === "completed"
          ? { status: newStatus, completed_at: now, updated_at: now }
          : { status: newStatus, updated_at: now };
      await executeTypedMutationVoid(
        db
          .updateTable("WorkTrackers")
          .set(fields)
          .where("id", "=", workTrackerId)
          .compile(),
      );
    } catch {
      Alert.alert("Error", "Failed to complete inspection. Please try again.");
    }
  };

  // ── Sub-screens ──────────────────────────────────────────────────────────

  if (inspectionData) {
    return (
      <InspectionScreen
        workTrackerId={inspectionData.workTrackerId}
        inspectionType={inspectionData.type}
        bleacherUuid={inspectionData.bleacherUuid}
        onComplete={() => {
          void handleInspectionComplete(inspectionData.workTrackerId);
        }}
        onCancel={() => setInspectionData(null)}
      />
    );
  }

  // ── Derived counts ──────────────────────────────────────────────────────

  const activeStatuses = (wt: WorkTracker) =>
    wt.status !== "completed" && wt.status !== "draft";

  const todayCount = (workTrackers ?? []).filter(
    (wt) => activeStatuses(wt) && (wt.date == null || wt.date <= today),
  ).length;

  const upcomingCount = (workTrackers ?? []).filter(
    (wt) => activeStatuses(wt) && wt.date != null && wt.date > today,
  ).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ProfileCompletionBanner />
      <PhotoUploadIssueBanner />
      <DocExpiryWarningBanner />

      <ReleasedTripsBanner
        hasReleasedTrips={(workTrackers ?? []).some(
          (wt) => wt.status === "released",
        )}
      />

      {/* Toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: toggleTrackBg }]}>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "today" && { backgroundColor: theme.accent },
          ]}
          onPress={() => setActiveTab("today")}
          activeOpacity={0.8}
        >
          <Ionicons
            name="today-outline"
            size={14}
            color={
              activeTab === "today" ? theme.onAccent : theme.textTertiary
            }
          />
          <Text
            style={[
              styles.toggleText,
              {
                color:
                  activeTab === "today" ? theme.onAccent : theme.textTertiary,
              },
            ]}
          >
            Today
          </Text>
          {todayCount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.header }]}>
              <Text style={[styles.badgeText, { color: theme.onAccent }]}>
                {todayCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "upcoming" && { backgroundColor: theme.accent },
          ]}
          onPress={() => setActiveTab("upcoming")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="truck"
            size={14}
            color={
              activeTab === "upcoming" ? theme.onAccent : theme.textTertiary
            }
          />
          <Text
            style={[
              styles.toggleText,
              {
                color:
                  activeTab === "upcoming"
                    ? theme.onAccent
                    : theme.textTertiary,
              },
            ]}
          >
            Upcoming
          </Text>
          {upcomingCount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.header }]}>
              <Text style={[styles.badgeText, { color: theme.onAccent }]}>
                {upcomingCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      {/* ── Today Trips ── */}
      {activeTab === "today" && (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={(workTrackers ?? [])
            .filter(
              (wt) =>
                activeStatuses(wt) && (wt.date == null || wt.date <= today),
            )
            .sort(
              (a, b) =>
                (a.date ?? "").localeCompare(b.date ?? "") ||
                a.id.localeCompare(b.id),
            )}
          keyExtractor={(item) => String(item.id)}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }) => (
            <TripItem
              workTracker={item}
              onAccept={handleAccept}
              onStartTrip={handleStartTrip}
              onSkip={handleSkip}
              onArrived={handleArrived}
              onStartInspection={handleStartInspection}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="today-outline"
                size={40}
                color={theme.textTertiary}
              />
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                No trips for today
              </Text>
            </View>
          )}
        />
      )}
      {/* ── Upcoming Trips ── */}
      {activeTab === "upcoming" && (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={(workTrackers ?? [])
            .filter(
              (wt) => activeStatuses(wt) && wt.date != null && wt.date > today,
            )
            .sort(
              (a, b) =>
                (a.date ?? "").localeCompare(b.date ?? "") ||
                a.id.localeCompare(b.id),
            )}
          keyExtractor={(item) => String(item.id)}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }) => (
            <TripItem
              workTracker={item}
              onAccept={handleAccept}
              onStartTrip={handleStartTrip}
              onSkip={handleSkip}
              onArrived={handleArrived}
              onStartInspection={handleStartInspection}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="calendar-outline"
                size={40}
                color={theme.textTertiary}
              />
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                No upcoming trips
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logo: {
    width: 45,
    height: 45,
  },
  logoSpacer: {
    width: 45,
    height: 45,
  },
  headerTitle: {
    ...typeScale.title2,
    fontWeight: "700",
    letterSpacing: 0.3,
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },
  toggleContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleText: {
    ...typeScale.subhead,
    fontWeight: "600",
  },
  badge: {
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    ...typeScale.caption2,
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 50,
    paddingTop: 8,
  },
  historyListContent: {
    paddingBottom: 50,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  emptyContainer: {
    padding: 16,
    alignItems: "center",
    marginTop: 40,
    gap: 12,
  },
  emptyText: {
    ...typeScale.subhead,
    textAlign: "center",
  },
});
