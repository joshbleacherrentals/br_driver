// import { fetchWorkTrackersForClerkUser } from "@/db/online/workTrackers";
import { useEnrichedWorkTrackers } from "@/hooks/useEnrichedWorkTrackers";
import { isTripInProgress } from "@/utils/workTrackerUtils";
import { useAuth } from "@clerk/clerk-expo";
import { observer } from "@legendapp/state/react";
import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

/**
 * Global guard that redirects to trip mode if there's an active trip
 * Prevents users from accessing other screens while a trip is in progress
 */
function TripModeLockGuardInner() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const workTrackers = useEnrichedWorkTrackers();

  useEffect(() => {
    if (!isSignedIn) return;

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
  }, [isSignedIn, segments, router, workTrackers]);

  return null; // This component doesn't render anything
}

export default observer(TripModeLockGuardInner);
