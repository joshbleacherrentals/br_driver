import TripsListItem from "@/components/TripListItem";
import { EnrichedWorkTracker, fetchWorkTrackersForClerkUser } from "@/db/workTrackers";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TripsScreen() {
  const { isSignedIn, userId } = useAuth();
  const supabase = useClerkSupabaseClient();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["workTrackers", userId],
    enabled: !!isSignedIn && !!userId,
    queryFn: async () => {
      return await fetchWorkTrackersForClerkUser(supabase, userId);
    },
  });

  const workTrackers = (data?.workTrackers ?? []) as EnrichedWorkTracker[];

  function formatDateWithOrdinal(dateISO?: string | null) {
    if (!dateISO) return "";
    const d = new Date(dateISO);
    const day = d.getDate();
    const ord = (n: number) => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return (s as any)[(v - 20) % 10] || (s as any)[v] || s[0];
    };
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    const month = d.toLocaleDateString(undefined, { month: "short" });
    return `${weekday}, ${month} ${day}${ord(day)}`;
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>Upcoming Trips</Text>
        <View style={{ height: 8 }} />
        <Text onPress={() => refetch()} style={{ color: "#007AFF" }}>
          {isLoading || isRefetching ? "Refreshing…" : "Refresh"}
        </Text>
        {isError ? <Text style={{ color: "red" }}>{(error as Error)?.message}</Text> : null}
      </View>

      <FlatList
        contentContainerStyle={{ paddingBottom: 50 }}
        data={workTrackers}
        keyExtractor={(item) => String(item.work_tracker_id)}
        renderItem={({ item }) => {
          const pickupAddr = item.pickup_address
            ? `${item.pickup_address.street}, ${item.pickup_address.city}, ${
                item.pickup_address.state_province
              }${item.pickup_address.zip_postal ? " " + item.pickup_address.zip_postal : ""}`
            : undefined;
          const dropoffAddr = item.dropoff_address
            ? `${item.dropoff_address.street}, ${item.dropoff_address.city}, ${
                item.dropoff_address.state_province
              }${item.dropoff_address.zip_postal ? " " + item.dropoff_address.zip_postal : ""}`
            : undefined;
          const payStr =
            typeof item.pay_cents === "number" ? `$${(item.pay_cents / 100).toFixed(2)}` : "";
          const bleacherStr = item.bleacher?.bleacher_number
            ? `#${item.bleacher.bleacher_number}`
            : "";
          const headerTitle = [payStr, bleacherStr].filter(Boolean).join(" · ");
          const headerSubtitle = formatDateWithOrdinal(item.date);
          return (
            <TripsListItem
              headerTitle={headerTitle}
              headerSubtitle={headerSubtitle}
              pickupAddress={pickupAddr || "Pickup"}
              pickupTime={item.pickup_time || ""}
              pickupPoc={item.pickup_poc || ""}
              dropoffAddress={dropoffAddr || "Drop-off"}
              dropoffTime={item.dropoff_time || ""}
              dropoffPoc={item.dropoff_poc || ""}
              notes={item.notes || null}
              swipeable
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#666" }}>{isLoading ? "Loading…" : "No trips yet."}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
