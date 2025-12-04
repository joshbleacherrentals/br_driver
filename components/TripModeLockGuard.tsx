import { fetchWorkTrackersForClerkUser } from "@/db/workTrackers";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { isTripInProgress } from "@/utils/workTrackerUtils";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

/**
 * Global guard that redirects to trip mode if there's an active trip
 * Prevents users from accessing other screens while a trip is in progress
 */
export default function TripModeLockGuard() {
  const { userId, isSignedIn } = useAuth();
  const supabase = useClerkSupabaseClient();
  const router = useRouter();
  const segments = useSegments();

  const { data, isLoading } = useQuery({
    queryKey: ["workTrackers", userId],
    enabled: !!isSignedIn && !!userId,
    queryFn: async () => {
      return await fetchWorkTrackersForClerkUser(supabase, userId);
    },
    refetchInterval: 10000, // Check every 10 seconds for active trips
  });

  useEffect(() => {
    if (!isSignedIn || isLoading) return;

    const workTrackers = data?.workTrackers ?? [];
    const inProgressTrip = workTrackers.find((t) => isTripInProgress(t));

    // Check if we're already on the trip-mode screen for this trip
    const isOnTripMode = segments[0] === "trip-mode";
    const currentTripId = (segments as string[])[1];

    if (inProgressTrip) {
      // If not on trip mode, or on wrong trip, redirect
      if (!isOnTripMode || currentTripId !== String(inProgressTrip.work_tracker_id)) {
        router.replace(`/trip-mode/${inProgressTrip.work_tracker_id}`);
      }
    }
  }, [data, isLoading, isSignedIn, segments, router]);

  return null; // This component doesn't render anything
}
