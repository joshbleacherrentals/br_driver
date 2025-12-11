import TripsList from "@/components/TripsList";
import TripsSegmentedControl from "@/components/TripsSegmentedControl";
import { EnrichedWorkTracker, fetchWorkTrackersForClerkUser } from "@/db/online/workTrackers";
import { TripFilter, useFilteredTrips } from "@/hooks/useFilteredTrips";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TripsScreen() {
  const { isSignedIn, userId } = useAuth();
  const supabase = useClerkSupabaseClient();
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<TripFilter>("today");

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["workTrackers", userId],
    enabled: !!isSignedIn && !!userId,
    queryFn: async () => {
      return await fetchWorkTrackersForClerkUser(supabase, userId);
    },
  });

  const workTrackers = (data?.workTrackers ?? []) as EnrichedWorkTracker[];
  const filteredTrips = useFilteredTrips(workTrackers);

  const handleTripStart = (workTrackerId: number) => {
    router.push(`/trip-mode/${workTrackerId}`);
  };

  const currentTrips = filteredTrips[selectedFilter];

  const getEmptyMessage = () => {
    switch (selectedFilter) {
      case "today":
        return "No trips scheduled for today.";
      case "upcoming":
        return "No upcoming trips.";
      case "past":
        return "No past trips.";
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>Trips</Text>
        <View style={{ height: 8 }} />
        <Text onPress={() => refetch()} style={{ color: "#007AFF" }}>
          {isLoading || isRefetching ? "Refreshing…" : "Refresh"}
        </Text>
        {isError ? <Text style={{ color: "red" }}>{(error as Error)?.message}</Text> : null}
      </View>

      <TripsSegmentedControl
        selected={selectedFilter}
        onSelect={setSelectedFilter}
        counts={{
          upcoming: filteredTrips.upcoming.length,
          today: filteredTrips.today.length,
          past: filteredTrips.past.length,
        }}
      />

      <TripsList
        trips={currentTrips}
        isLoading={isLoading}
        emptyMessage={getEmptyMessage()}
        onTripStart={handleTripStart}
      />
    </SafeAreaView>
  );
}
