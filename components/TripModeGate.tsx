// app/TripModeGate.tsx
import { activeTripId$ } from "@/state/session/activeTrip";
import { useValue } from "@legendapp/state/react";
import { Redirect, usePathname, useRootNavigationState } from "expo-router";

export function TripModeGate() {
  const navState = useRootNavigationState();
  const pathname = usePathname();
  const activeTripId = useValue(activeTripId$); // tracks changes automatically :contentReference[oaicite:1]{index=1}

  // Wait until the navigation container is ready
  if (!navState?.key) return null;

  const inTripMode = pathname.startsWith("/trip-mode");
  const target = activeTripId ? `/trip-mode` : null;

  // If a trip becomes active (insert/update via realtime), jump in immediately
  if (target && pathname !== target) {
    return <Redirect href={target} />;
  }

  // If trip ends while user is in trip mode, kick them back out
  if (!target && inTripMode) {
    return <Redirect href="/(tabs)" />;
  }

  return null;
}
