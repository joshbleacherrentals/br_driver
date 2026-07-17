import { db } from "@/components/providers/SystemProvider";
import InspectionScreen from "@/components/widgets/inspection";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import TripItem from "@/components/widgets/trip_item";
import { BRAND_BLUE } from "@/constants/Colors";
import { useAllBleachers } from "@/hooks/db/useBleacher";
import { useResolvedBleacherAddresses } from "@/hooks/db/useResolveAddress";
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
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

// ── Brand palette ──────────────────────────────────────────────────────────
const themes = {
  light: {
    bg: "#F2F2F7",
    headerBg: "#FFFFFF",
    headerText: "#111827",
    headerBorder: "#E5E7EB",
    card: "#FFFFFF",
    cardText: "#111827",
    cardSecondary: "#6B7280",
    toggleBg: "#E5E7EB",
    toggleActive: BRAND_BLUE,
    toggleText: "#6B7280",
    toggleTextActive: "#FFFFFF",
    badgeBg: "#1D4E89",
    badgeText: "#FFFFFF",
    weekHeaderBg: BRAND_BLUE,
    weekHeaderCurrent: "#1B548E",
    weekHeaderText: "#FFFFFF",
    weekSubText: "#BFDBFE",
    weekBodyBg: "#F0F4F8",
    emptyText: "#8E8E93",
    accentText: "#0A84FF",
    separator: "#F2F2F7",
    pickupLabel: "#8E8E93",
    currentBadgeBg: "#34C759",
  },
  dark: {
    bg: "#000000",
    headerBg: "#1C1C1E",
    headerText: "#FFFFFF",
    headerBorder: "#38383A",
    card: "#1C1C1E",
    cardText: "#FFFFFF",
    cardSecondary: "#8E8E93",
    toggleBg: "#2C2C2E",
    toggleActive: BRAND_BLUE,
    toggleText: "#8E8E93",
    toggleTextActive: "#FFFFFF",
    badgeBg: "#0A84FF",
    badgeText: "#FFFFFF",
    weekHeaderBg: "#1C1C1E",
    weekHeaderCurrent: "#1A3A5C",
    weekHeaderText: "#FFFFFF",
    weekSubText: "#93C5FD",
    weekBodyBg: "#111111",
    emptyText: "#636366",
    accentText: "#0A84FF",
    separator: "#2C2C2E",
    pickupLabel: "#8E8E93",
    currentBadgeBg: "#30D158",
  },
};

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
  const colorScheme = useColorScheme();
  const t = themes[colorScheme === "dark" ? "dark" : "light"];

  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [inspectionData, setInspectionData] = useState<{
    workTrackerId: string;
    bleacherUuid: string | null;
    type: InspectionType;
  } | null>(null);

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

  // ── Handlers (stable refs so memoized TripItem can skip re-renders) ──────

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

  const [pendingBleacherUuids, setPendingBleacherUuids] = React.useState<
    Record<string, string>
  >({});

  const handleBleacherChange = useCallback((
    workTrackerId: string,
    newBleacherUuid: string,
  ) => {
    setPendingBleacherUuids((prev) => ({
      ...prev,
      [workTrackerId]: newBleacherUuid,
    }));
  }, []);

  const handleStartInspection = useCallback(async (
    workTrackerId: string,
    bleacherUuid: string | null,
    type: "pickup" | "dropoff",
  ) => {
    if (bleacherUuid) {
      try {
        await executeTypedMutationVoid(
          db
            .updateTable("WorkTrackers")
            .set({
              bleacher_uuid: bleacherUuid,
              updated_at: new Date().toISOString(),
            })
            .where("id", "=", workTrackerId)
            .compile(),
        );
      } catch {
        Alert.alert(
          "Error",
          "Failed to save bleacher selection. Please try again.",
        );
        return;
      }
    }
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
    <View style={[styles.safeArea, { backgroundColor: t.bg }]}>
      <ProfileCompletionBanner />

      <ReleasedTripsBanner
        hasReleasedTrips={(workTrackers ?? []).some(
          (wt) => wt.status === "released",
        )}
      />

      {/* Toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: t.toggleBg }]}>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "today" && { backgroundColor: t.toggleActive },
          ]}
          onPress={() => setActiveTab("today")}
          activeOpacity={0.8}
        >
          <Ionicons
            name="today-outline"
            size={14}
            color={activeTab === "today" ? t.toggleTextActive : t.toggleText}
          />
          <Text
            style={[
              styles.toggleText,
              {
                color:
                  activeTab === "today" ? t.toggleTextActive : t.toggleText,
              },
            ]}
          >
            Today
          </Text>
          {todayCount > 0 && (
            <View style={[styles.badge, { backgroundColor: t.badgeBg }]}>
              <Text style={[styles.badgeText, { color: t.badgeText }]}>
                {todayCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "upcoming" && { backgroundColor: t.toggleActive },
          ]}
          onPress={() => setActiveTab("upcoming")}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="truck"
            size={14}
            color={activeTab === "upcoming" ? t.toggleTextActive : t.toggleText}
          />
          <Text
            style={[
              styles.toggleText,
              {
                color:
                  activeTab === "upcoming" ? t.toggleTextActive : t.toggleText,
              },
            ]}
          >
            Upcoming
          </Text>
          {upcomingCount > 0 && (
            <View style={[styles.badge, { backgroundColor: t.badgeBg }]}>
              <Text style={[styles.badgeText, { color: t.badgeText }]}>
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
              bleacherOptions={bleacherOptions}
              onAccept={handleAccept}
              onStartTrip={handleStartTrip}
              onSkip={handleSkip}
              onArrived={handleArrived}
              onStartInspection={handleStartInspection}
              onBleacherChange={handleBleacherChange}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons name="today-outline" size={40} color={t.emptyText} />
              <Text style={[styles.emptyText, { color: t.emptyText }]}>
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
              bleacherOptions={bleacherOptions}
              onAccept={handleAccept}
              onStartTrip={handleStartTrip}
              onSkip={handleSkip}
              onArrived={handleArrived}
              onStartInspection={handleStartInspection}
              onBleacherChange={handleBleacherChange}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={40} color={t.emptyText} />
              <Text style={[styles.emptyText, { color: t.emptyText }]}>
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
    fontSize: 24,
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
    fontSize: 14,
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
    fontSize: 11,
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
    fontSize: 14,
    textAlign: "center",
  },
  weekGroup: {
    marginBottom: 12,
  },
  weekHeader: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekHeaderContent: {
    flex: 1,
  },
  weekHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  weekSubText: {
    fontSize: 12,
  },
  currentBadge: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 10,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.4,
  },
  weekBody: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
    paddingTop: 2,
  },
  tripCard: {
    marginHorizontal: 10,
    marginTop: 8,
    borderRadius: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  tripCardHeaderLeft: {
    flex: 1,
  },
  tripCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 2,
  },
  tripCardDate: {
    fontSize: 13,
  },
  addressBlock: {
    marginBottom: 10,
  },
  addressLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  addressLabelText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addressText: {
    fontSize: 13,
    marginLeft: 18,
  },
  tripCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tripCardFooterText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
