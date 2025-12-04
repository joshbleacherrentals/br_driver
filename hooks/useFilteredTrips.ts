import { EnrichedWorkTracker } from "@/db/workTrackers";
import { getTodayAtMidnight, parseLocalDate } from "@/utils/dateUtils";
import { useMemo } from "react";

export type TripFilter = "upcoming" | "today" | "past";

export interface FilteredTrips {
  upcoming: EnrichedWorkTracker[];
  today: EnrichedWorkTracker[];
  past: EnrichedWorkTracker[];
}

export function useFilteredTrips(workTrackers: EnrichedWorkTracker[]): FilteredTrips {
  return useMemo(() => {
    const today = getTodayAtMidnight();
    const todayTime = today.getTime();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTime = tomorrow.getTime();

    const upcoming: EnrichedWorkTracker[] = [];
    const todayTrips: EnrichedWorkTracker[] = [];
    const past: EnrichedWorkTracker[] = [];

    for (const tracker of workTrackers) {
      if (!tracker.date) continue;

      const tripDate = parseLocalDate(tracker.date);
      const tripTime = tripDate.getTime();

      if (tripTime >= tomorrowTime) {
        upcoming.push(tracker);
      } else if (tripTime >= todayTime && tripTime < tomorrowTime) {
        todayTrips.push(tracker);
      } else {
        past.push(tracker);
      }
    }

    return { upcoming, today: todayTrips, past };
  }, [workTrackers]);
}
