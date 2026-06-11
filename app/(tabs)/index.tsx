import { db } from "@/components/providers/SystemProvider";
import CompletedTrips from "@/components/widgets/completed_trip_item";
import InspectionScreen from "@/components/widgets/inspection";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import TripItem from "@/components/widgets/trip_item";
import { useBatchAddresses } from "@/hooks/db/useAddress";
import { useAllBleachers, useBatchBleachers } from "@/hooks/db/useBleacher";
import { useResolvedBleacherAddresses } from "@/hooks/db/useResolveAddress";
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ── Brand palette ──────────────────────────────────────────────────────────
const BRAND_BLUE = "#1D62A3";

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
type ActiveTab = "upcoming" | "history";

function getWeekStart(dateISO: string): Date {
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

function getWeekEnd(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function formatWeekRange(monday: Date, sunday: Date): string {
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const monthFmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "long" });
  const dayOrd = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };
  if (sameMonth) {
    return `${monthFmt(monday)} ${dayOrd(monday.getDate())} – ${dayOrd(sunday.getDate())}`;
  }
  return `${monthFmt(monday)} ${dayOrd(monday.getDate())} – ${monthFmt(sunday)} ${dayOrd(sunday.getDate())}`;
}

function getWeekKey(monday: Date): string {
  return monday.toISOString().split("T")[0];
}

function isCurrentWeek(monday: Date): boolean {
  const currentMonday = getWeekStart(new Date().toISOString().split("T")[0]);
  return getWeekKey(monday) === getWeekKey(currentMonday);
}

interface WeekGroup {
  key: string;
  label: string;
  monday: Date;
  sunday: Date;
  trips: WorkTracker[];
  totalPay: number;
  isCurrent: boolean;
}

const formatPay = (cents: number) => `$${(cents / 100).toFixed(2)}`;

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

  const [activeTab, setActiveTab] = useState<ActiveTab>("upcoming");
  const [inspectionData, setInspectionData] = useState<{
    workTrackerId: string;
    bleacherUuid: string | null;
    type: InspectionType;
  } | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<WorkTracker | null>(null);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>(
    {},
  );

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

  const logo = require("../../assets/images/adaptive-icon.png");

  const completedTrips = useMemo(
    () => (workTrackers ?? []).filter((t) => t.status === "completed"),
    [workTrackers],
  );

  const weekGroups = useMemo<WeekGroup[]>(() => {
    const groups: Record<string, WeekGroup> = {};
    completedTrips.forEach((trip) => {
      if (!trip.date) return;
      const monday = getWeekStart(trip.date);
      const key = getWeekKey(monday);
      if (!groups[key]) {
        const sunday = getWeekEnd(monday);
        groups[key] = {
          key,
          label: formatWeekRange(monday, sunday),
          monday,
          sunday,
          trips: [],
          totalPay: 0,
          isCurrent: isCurrentWeek(monday),
        };
      }
      groups[key].trips.push(trip);
      groups[key].totalPay += trip.pay_cents ?? 0;
    });
    return Object.values(groups)
      .sort((a, b) => b.monday.getTime() - a.monday.getTime())
      .map((g) => ({
        ...g,
        trips: [...g.trips].sort((a, b) =>
          (b.date ?? "").localeCompare(a.date ?? ""),
        ),
      }));
  }, [completedTrips]);

  const isCollapsed = (key: string, isCurrent: boolean) => {
    if (key in collapsedWeeks) return collapsedWeeks[key];
    return !isCurrent;
  };

  const toggleWeek = (key: string, isCurrent: boolean) => {
    setCollapsedWeeks((prev) => ({
      ...prev,
      [key]: !isCollapsed(key, isCurrent),
    }));
  };

  const allAddressIds = useMemo(() => {
    const ids: (string | null)[] = [];
    completedTrips.forEach((trip) => {
      ids.push(trip.pickup_address_uuid);
      ids.push(trip.dropoff_address_uuid);
    });
    return ids;
  }, [completedTrips]);

  const allAddresses = useBatchAddresses(allAddressIds);
  const allBleachers = useBatchBleachers(
    completedTrips.map((t) => t.bleacher_uuid),
  );

  // ── Handlers (unchanged) ────────────────────────────────────────────────

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

  const handleStartTrip = async (workTrackerId: string) => {
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
  };

  const handleArrived = async (workTrackerId: string, arrivedAt: string) => {
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
  };

  const [pendingBleacherUuids, setPendingBleacherUuids] = React.useState<
    Record<string, string>
  >({});

  const handleBleacherChange = (
    workTrackerId: string,
    newBleacherUuid: string,
  ) => {
    setPendingBleacherUuids((prev) => ({
      ...prev,
      [workTrackerId]: newBleacherUuid,
    }));
  };

  const handleStartInspection = async (
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
  };

  const handleSkip = async (workTrackerId: string) => {
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
  };

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

  if (selectedTrip) {
    return (
      <CompletedTrips
        workTracker={selectedTrip}
        onClose={() => setSelectedTrip(null)}
      />
    );
  }

  // ── Derived counts ──────────────────────────────────────────────────────

  const upcomingCount = (workTrackers ?? []).filter(
    (wt) =>
      wt.status !== "completed" &&
      wt.status !== "cancelled" &&
      wt.status !== "draft",
  ).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: t.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: t.headerBg, borderBottomColor: t.headerBorder },
        ]}
      >
        <Image source={logo} style={styles.logo} />
        <Text style={[styles.headerTitle, { color: t.headerText }]}>
          Trips
        </Text>
        <View style={styles.logoSpacer} />
      </View>

      <ProfileCompletionBanner />

      {/* Toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: t.toggleBg }]}>
        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "upcoming" && {
              backgroundColor: t.toggleActive,
            },
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
              { color: activeTab === "upcoming" ? t.toggleTextActive : t.toggleText },
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

        <TouchableOpacity
          style={[
            styles.toggleBtn,
            activeTab === "history" && {
              backgroundColor: t.toggleActive,
            },
          ]}
          onPress={() => setActiveTab("history")}
          activeOpacity={0.8}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={activeTab === "history" ? t.toggleTextActive : t.toggleText}
          />
          <Text
            style={[
              styles.toggleText,
              { color: activeTab === "history" ? t.toggleTextActive : t.toggleText },
            ]}
          >
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Upcoming Trips ── */}
      {activeTab === "upcoming" && (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={workTrackers?.filter((wt) => wt.status !== "completed")}
          keyExtractor={(item) => String(item.id)}
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

      {/* ── Trip History ── */}
      {activeTab === "history" && (
        <FlatList
          contentContainerStyle={styles.historyListContent}
          data={weekGroups}
          keyExtractor={(item) => item.key}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={40} color={t.emptyText} />
              <Text style={[styles.emptyText, { color: t.emptyText }]}>
                Completed trips will appear here once you finish your deliveries
              </Text>
            </View>
          )}
          renderItem={({ item: group }) => {
            const collapsed = isCollapsed(group.key, group.isCurrent);
            return (
              <View style={styles.weekGroup}>
                <TouchableOpacity
                  onPress={() => toggleWeek(group.key, group.isCurrent)}
                  style={[
                    styles.weekHeader,
                    {
                      backgroundColor: group.isCurrent
                        ? t.weekHeaderCurrent
                        : t.weekHeaderBg,
                      borderBottomLeftRadius: collapsed ? 12 : 0,
                      borderBottomRightRadius: collapsed ? 12 : 0,
                    },
                  ]}
                >
                  <View style={styles.weekHeaderContent}>
                    <Text
                      style={[
                        styles.weekHeaderTitle,
                        { color: t.weekHeaderText },
                      ]}
                    >
                      {group.label}
                    </Text>
                    <Text style={[styles.weekSubText, { color: t.weekSubText }]}>
                      {group.trips.length}{" "}
                      {group.trips.length === 1 ? "trip" : "trips"}
                      {group.totalPay > 0
                        ? `  ·  ${formatPay(group.totalPay)}`
                        : ""}
                    </Text>
                  </View>
                  {group.isCurrent && (
                    <View
                      style={[
                        styles.currentBadge,
                        { backgroundColor: t.currentBadgeBg },
                      ]}
                    >
                      <Text style={styles.currentBadgeText}>THIS WEEK</Text>
                    </View>
                  )}
                  <Ionicons
                    name={collapsed ? "chevron-down" : "chevron-up"}
                    size={18}
                    color={t.weekSubText}
                  />
                </TouchableOpacity>

                {!collapsed && (
                  <View
                    style={[
                      styles.weekBody,
                      { backgroundColor: t.weekBodyBg },
                    ]}
                  >
                    {group.trips.map((trip, index) => {
                      const pickupAddress = trip.pickup_address_uuid
                        ? allAddresses[trip.pickup_address_uuid]
                        : null;
                      const dropoffAddress = trip.dropoff_address_uuid
                        ? allAddresses[trip.dropoff_address_uuid]
                        : null;
                      const bleacher = trip.bleacher_uuid
                        ? allBleachers[trip.bleacher_uuid]
                        : null;
                      const isLast = index === group.trips.length - 1;

                      return (
                        <TouchableOpacity
                          key={trip.id}
                          onPress={() => setSelectedTrip(trip)}
                          style={[
                            styles.tripCard,
                            {
                              backgroundColor: t.card,
                              marginBottom: isLast ? 10 : 0,
                            },
                          ]}
                        >
                          <View style={styles.tripCardHeader}>
                            <View style={styles.tripCardHeaderLeft}>
                              <Text
                                style={[
                                  styles.tripCardTitle,
                                  { color: t.cardText },
                                ]}
                              >
                                {bleacher
                                  ? `Bleacher #${bleacher.bleacher_number}`
                                  : "Trip"}
                                {bleacher && trip.pay_cents ? " – " : ""}
                                {trip.pay_cents
                                  ? formatPay(trip.pay_cents)
                                  : ""}
                              </Text>
                              <Text
                                style={[
                                  styles.tripCardDate,
                                  { color: t.cardSecondary },
                                ]}
                              >
                                {formatDate(trip.date)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.addressBlock}>
                            <View style={styles.addressLabel}>
                              <Ionicons
                                name="location-outline"
                                size={13}
                                color={t.pickupLabel}
                              />
                              <Text
                                style={[
                                  styles.addressLabelText,
                                  { color: t.pickupLabel },
                                ]}
                              >
                                Pickup
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.addressText,
                                { color: t.cardText },
                              ]}
                            >
                              {pickupAddress
                                ? pickupAddress.street
                                : "No address"}
                            </Text>

                            <View
                              style={[
                                styles.addressLabel,
                                { marginTop: 8 },
                              ]}
                            >
                              <Ionicons
                                name="location-outline"
                                size={13}
                                color={t.pickupLabel}
                              />
                              <Text
                                style={[
                                  styles.addressLabelText,
                                  { color: t.pickupLabel },
                                ]}
                              >
                                Dropoff
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.addressText,
                                { color: t.cardText },
                              ]}
                            >
                              {dropoffAddress
                                ? dropoffAddress.street
                                : "No address"}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.tripCardFooter,
                              { borderTopColor: t.separator },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tripCardFooterText,
                                { color: t.accentText },
                              ]}
                            >
                              View full details and inspections
                            </Text>
                            <Ionicons
                              name="arrow-forward"
                              size={14}
                              color={t.accentText}
                            />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
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
