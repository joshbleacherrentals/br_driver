import { computed } from "@legendapp/state";
import { EnrichedWorkTracker, enrichedWorkTrackers$ } from "../computes/enrichedWorkTrackers";

/**
 * Returns the currently active (in_progress) enriched work tracker, or null if none.
 * This is a computed observable that automatically updates when workTrackers$ changes.
 */
export const activeTrip$ = computed<EnrichedWorkTracker | null>(() => {
  const enrichedTrackers = enrichedWorkTrackers$.get();

  if (!enrichedTrackers || enrichedTrackers.length === 0) return null;

  // Find the first in_progress trip
  const activeTrip = enrichedTrackers.find((wt) => wt.status === "in_progress");

  return activeTrip ?? null;
});
