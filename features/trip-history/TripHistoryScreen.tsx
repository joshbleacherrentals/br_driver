import Badge from "@/components/ui/Badge";
import HistoryTripCard from "./components/HistoryTripCard";
import { parseHistoryJson } from "./utils/parseHistoryJson";
import { useWorkTrackerTypes } from "@/hooks/db/useWorkTrackerTypes";
import { resolveWorkTrackerKind } from "@/utils/workTrackerKind";
import { ThemeColors, typeScale } from "@/constants/theme";
import { useBatchAddresses } from "@/hooks/db/useAddress";
import { useBatchBleachers } from "@/hooks/db/useBleacher";
import { WorkTracker, useWorkTrackers } from "@/hooks/db/useWorkTrackers";
import {
  buildWeekGroups,
  isDriverHistoryTracker,
  type WeekGroup,
} from "@/features/trip-history/utils/buildWeekGroups";
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
  const { types: workTrackerTypes } = useWorkTrackerTypes();
  const router = useRouter();

  const { workTrackers, isLoading } = useWorkTrackers();
  const [collapsedWeeks, setCollapsedWeeks] = useState<Record<string, boolean>>(
    {},
  );

  // Everything the driver has finished with — completed, declined, abandoned.
  const historyTrips = useMemo(
    () =>
      (workTrackers ?? []).filter((wt) => isDriverHistoryTracker(wt.status)),
    [workTrackers],
  );

  const weekGroups = useMemo<WeekGroup[]>(
    () => buildWeekGroups(historyTrips),
    [historyTrips],
  );

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

  // Finished trips carry their addresses in a snapshot — the Addresses rows
  // stop syncing once a trip is done. Only a trip finished offline, not yet
  // snapshotted by the server, still looks its addresses up live.
  const snapshots = useMemo(
    () =>
      new Map(
        historyTrips.map((trip) => [
          trip.id,
          parseHistoryJson(trip.history_json, trip.id),
        ]),
      ),
    [historyTrips],
  );

  const allAddressIds = useMemo(() => {
    const ids: (string | null)[] = [];
    historyTrips.forEach((trip) => {
      if (snapshots.get(trip.id)) return;
      ids.push(trip.pickup_address_uuid);
      ids.push(trip.dropoff_address_uuid);
    });
    return ids;
  }, [historyTrips, snapshots]);

  const allAddresses = useBatchAddresses(allAddressIds);

  /** A card's two addresses: the snapshot's, or the live rows while it has none. */
  const addressesFor = (trip: WorkTracker) => {
    const snapshot = snapshots.get(trip.id);
    if (snapshot) {
      return {
        pickupAddress: snapshot.pickupAddress,
        dropoffAddress: snapshot.dropoffAddress,
      };
    }
    const live = (id: string | null) =>
      id ? (allAddresses[id] ?? null) : null;
    return {
      pickupAddress: live(trip.pickup_address_uuid),
      dropoffAddress: live(trip.dropoff_address_uuid),
    };
  };
  const allBleachers = useBatchBleachers(
    historyTrips.map((wt) => wt.bleacher_uuid),
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
                    {group.trips.map((trip, index) => (
                      <HistoryTripCard
                        key={trip.id}
                        trip={trip}
                        kind={resolveWorkTrackerKind(
                          trip.work_tracker_type_uuid,
                          workTrackerTypes,
                        )}
                        bleacherNumber={
                          trip.bleacher_uuid
                            ? (allBleachers[trip.bleacher_uuid]
                                ?.bleacher_number ?? null)
                            : null
                        }
                        {...addressesFor(trip)}
                        payLabel={
                          // Handed-back work shows no figure: it pays nothing,
                          // and the week's total does not count it either.
                          trip.status === "completed" && trip.pay_cents
                            ? formatPay(trip.pay_cents)
                            : null
                        }
                        dateLabel={formatDate(trip.date)}
                        isLast={index === group.trips.length - 1}
                        theme={theme}
                        onPress={() =>
                          router.push({
                            pathname: "/completed-trip",
                            params: { workTrackerId: trip.id },
                          })
                        }
                      />
                    ))}
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
});
