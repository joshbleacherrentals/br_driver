import { BRAND_BLUE } from "@/constants/Colors";
import { useBatchAddresses } from "@/hooks/db/useAddress";
import { useBatchBleachers } from "@/hooks/db/useBleacher";
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CompletedTrips from "./components/CompletedTripItem";

// ── Themes ────────────────────────────────────────────────────────────────────
const themes = {
  light: {
    bg: "#F2F2F7",
    card: "#FFFFFF",
    cardText: "#111827",
    cardSecondary: "#6B7280",
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
    headerBg: "#FFFFFF",
    headerText: "#111827",
  },
  dark: {
    bg: "#000000",
    card: "#1C1C1E",
    cardText: "#FFFFFF",
    cardSecondary: "#8E8E93",
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
    headerBg: "#1C1C1E",
    headerText: "#FFFFFF",
  },
};

// ── Utility helpers ───────────────────────────────────────────────────────────
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

// ── Screen ────────────────────────────────────────────────────────────────────
export default function TripHistoryScreen() {
  const colorScheme = useColorScheme();
  const t = themes[colorScheme === "dark" ? "dark" : "light"];

  const { workTrackers, isLoading } = useWorkTrackers();
  const [selectedTrip, setSelectedTrip] = useState<WorkTracker | null>(null);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>(
    {},
  );

  const completedTrips = useMemo(
    () => (workTrackers ?? []).filter((wt) => wt.status === "completed"),
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
    completedTrips.map((wt) => wt.bleacher_uuid),
  );

  if (selectedTrip) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <CompletedTrips
          workTracker={selectedTrip}
          onClose={() => setSelectedTrip(null)}
        />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Trip History",
            headerStyle: { backgroundColor: t.headerBg },
            headerTintColor: t.headerText,
          }}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.safeArea,
            {
              backgroundColor: t.bg,
              justifyContent: "center",
              alignItems: "center",
            },
          ]}
        >
          <ActivityIndicator size="large" color={BRAND_BLUE} />
          <Text style={[styles.loadingText, { color: t.emptyText }]}>
            Loading trips...
          </Text>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Trip History",
          headerStyle: { backgroundColor: t.headerBg },
          headerTintColor: t.headerText,
        }}
      />
      <SafeAreaView
        edges={["bottom"]}
        style={[styles.safeArea, { backgroundColor: t.bg }]}
      >
        <FlatList
          contentContainerStyle={styles.listContent}
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
                    <Text
                      style={[styles.weekSubText, { color: t.weekSubText }]}
                    >
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
                    style={[styles.weekBody, { backgroundColor: t.weekBodyBg }]}
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
                              style={[styles.addressLabel, { marginTop: 8 }]}
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
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingText: { marginTop: 12, fontSize: 14 },
  listContent: {
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
  emptyText: { fontSize: 14, textAlign: "center" },
  weekGroup: { marginBottom: 12 },
  weekHeader: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  weekHeaderContent: { flex: 1 },
  weekHeaderTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  weekSubText: { fontSize: 12 },
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
  tripCardHeaderLeft: { flex: 1 },
  tripCardTitle: { fontSize: 17, fontWeight: "700", marginBottom: 2 },
  tripCardDate: { fontSize: 13 },
  addressBlock: { marginBottom: 10 },
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
  addressText: { fontSize: 13, marginLeft: 18 },
  tripCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tripCardFooterText: { fontSize: 13, fontWeight: "600" },
});
