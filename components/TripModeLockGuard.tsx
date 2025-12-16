// import { fetchWorkTrackersForClerkUser } from "@/db/online/workTrackers";
import { workTrackers$ } from "@/state/stores/workTrackers.store";
import { observer } from "@legendapp/state/react";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";

/**
 * Global guard that redirects to trip mode if there's an active trip
 * Prevents users from accessing other screens while a trip is in progress
 */
export const TripModeLockGuard = observer(() => {
  const router = useRouter();
  const pathname = usePathname();
  const lastNavigatedTo = useRef<string | null>(null);

  const wts = workTrackers$.get();

  // Find active trip directly without useMemo (observer handles reactivity)
  let activeTripId: number | null = null;
  if (wts) {
    const active = Object.values(wts).find(
      (wt) => wt && !wt.deleted && wt.status === "in_progress"
    );
    activeTripId = active?.work_tracker_id ?? null;
  }

  useEffect(() => {
    if (!activeTripId) {
      lastNavigatedTo.current = null;
      return;
    }

    const target = `/trip-mode/${activeTripId}`;

    // Avoid replace loops: skip if already there or just navigated there
    if (pathname === target || lastNavigatedTo.current === target) {
      return;
    }

    lastNavigatedTo.current = target;
    router.replace(target);
  }, [activeTripId, pathname, router]);

  return null;
});
