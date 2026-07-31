import Badge from "@/components/ui/Badge";
import { ThemeColors, elevation, typeScale } from "@/constants/theme";
import { useBatchAddresses } from "@/hooks/db/useAddress";
import { useBatchBleachers } from "@/hooks/db/useBleacher";
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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

function weekHeaderColor(
  theme: ThemeColors,
  scheme: "light" | "dark",
  isCurrent: boolean,
) {
  if (isCurrent) return theme.accent;
  return scheme === "dark" ? theme.surface : theme.header;
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function TripHistoryScreen() {
  const { theme, scheme } = useTheme();
  const router = useRouter();

  const { workTrackers, isLoading } = useWorkTrackers();
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

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "Trip History",
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.textPrimary,
          }}
        />
        <View
          style={[
            styles.safeArea,
            {
              backgroundColor: theme.background,
              justifyContent: "center",
              alignItems: "center",
            },
          ]}
        >
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textTertiary }]}>
            Loading trips...
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Trip History",
          headerShown: true,
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.textPrimary,
        }}
      />
      <View style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={weekGroups}
          keyExtractor={(item) => item.key}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="time-outline"
                size={40}
                color={theme.textTertiary}
              />
              <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
                Completed trips will appear here once you finish your deliveries
              </Text>
            </View>
          )}
          renderItem={({ item: group }) => {
            const collapsed = isCollapsed(group.key, group.isCurrent);
            const headerBg = weekHeaderColor(theme, scheme, group.isCurrent);
            const headerSubText = theme.onAccent + "CC";

            return (
              <View style={styles.weekGroup}>
                <TouchableOpacity
                  onPress={() => toggleWeek(group.key, group.isCurrent)}
                  style={[
                    styles.weekHeader,
                    {
                      backgroundColor: headerBg,
                      borderBottomLeftRadius: collapsed ? 12 : 0,
                      borderBottomRightRadius: collapsed ? 12 : 0,
                    },
                  ]}
                >
                  <View style={styles.weekHeaderContent}>
                    <Text
                      style={[
                        styles.weekHeaderTitle,
                        { color: theme.onAccent },
                      ]}
                    >
                      {group.label}
                    </Text>
                    <Text
                      style={[styles.weekSubText, { color: headerSubText }]}
                    >
                      {group.trips.length}{" "}
                      {group.trips.length === 1 ? "trip" : "trips"}
                      {group.totalPay > 0
                        ? `  ·  ${formatPay(group.totalPay)}`
                        : ""}
                    </Text>
                  </View>
                  {group.isCurrent && (
                    <Badge
                      label="THIS WEEK"
                      color={theme.success}
                      variant="solid"
                      uppercase
                      style={styles.currentBadgeSpacing}
                    />
                  )}
                  <Ionicons
                    name={collapsed ? "chevron-down" : "chevron-up"}
                    size={18}
                    color={headerSubText}
                  />
                </TouchableOpacity>

                {!collapsed && (
                  <View
                    style={[
                      styles.weekBody,
                      { backgroundColor: theme.surfaceElevated },
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
                          onPress={() =>
                            router.push({
                              pathname: "/completed-trip",
                              params: { workTrackerId: trip.id },
                            })
                          }
                          style={[
                            styles.tripCard,
                            {
                              backgroundColor: theme.surface,
                              marginBottom: isLast ? 10 : 0,
                              ...elevation(theme, "card"),
                            },
                          ]}
                        >
                          <View style={styles.tripCardHeader}>
                            <View style={styles.tripCardHeaderLeft}>
                              <Text
                                style={[
                                  styles.tripCardTitle,
                                  { color: theme.textPrimary },
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
                                  { color: theme.textSecondary },
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
                                color={theme.textTertiary}
                              />
                              <Text
                                style={[
                                  styles.addressLabelText,
                                  { color: theme.textTertiary },
                                ]}
                              >
                                Pickup
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.addressText,
                                { color: theme.textPrimary },
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
                                color={theme.textTertiary}
                              />
                              <Text
                                style={[
                                  styles.addressLabelText,
                                  { color: theme.textTertiary },
                                ]}
                              >
                                Dropoff
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.addressText,
                                { color: theme.textPrimary },
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
                              { borderTopColor: theme.separator },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tripCardFooterText,
                                { color: theme.accent },
                              ]}
                            >
                              View full details and inspections
                            </Text>
                            <Ionicons
                              name="arrow-forward"
                              size={14}
                              color={theme.accent}
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  loadingText: { marginTop: 12, ...typeScale.subhead },
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
  emptyText: { ...typeScale.subhead, textAlign: "center" },
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
  weekHeaderTitle: { ...typeScale.subhead, fontWeight: "700", marginBottom: 2 },
  weekSubText: { ...typeScale.caption },
  currentBadgeSpacing: { marginRight: 10 },
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
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  tripCardHeaderLeft: { flex: 1 },
  tripCardTitle: { ...typeScale.body, fontWeight: "700", marginBottom: 2 },
  tripCardDate: { ...typeScale.footnote },
  addressBlock: { marginBottom: 10 },
  addressLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  addressLabelText: {
    ...typeScale.caption2,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addressText: { ...typeScale.footnote, marginLeft: 18 },
  tripCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tripCardFooterText: { ...typeScale.footnote, fontWeight: "600" },
});
