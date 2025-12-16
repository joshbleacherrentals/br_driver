// app/TripModeGate.tsx
import { activeTrip$ } from "@/state/session/activeTrip";
import { useSelector } from "@legendapp/state/react";
import { Redirect, usePathname, useRootNavigationState } from "expo-router";

export function TripModeGate() {
  const navState = useRootNavigationState();
  const pathname = usePathname();
  const activeTrip = useSelector(() => activeTrip$.get());

  if (!navState?.key) return null;

  const inTripMode = pathname.startsWith("/trip-mode");
  const hasActiveTrip = !!activeTrip;

  // If a trip becomes active (insert/update via realtime), jump in immediately
  if (hasActiveTrip && !inTripMode) {
    return <Redirect href="/trip-mode" />;
  }

  // If trip ends while user is in trip mode, kick them back out
  if (!hasActiveTrip && inTripMode) {
    return <Redirect href="/(tabs)" />;
  }

  return null;
}
