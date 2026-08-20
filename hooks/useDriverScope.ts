import {
  getDriverScope,
  subscribeDriverScope,
  type DriverScope,
} from "@/library/powersync/scoping/driverScope";
import { useSyncExternalStore } from "react";

/**
 * §15 — the signed-in driver's scope, reactively.
 *
 * The single resolver for "who is this device working for" lives in
 * `CurrentDriverScopePublisher.tsx` (Clerk user → `Users.id` → `Drivers.id`).
 * Every other consumer reads it from here instead of running that chain again,
 * so there is exactly one place the answer can come from and one moment it can
 * change.
 *
 * `null` until both ids resolve — including for a signed-in user who has a
 * `Users` row but no `Drivers` row (§15, "scoping requires both ids"). Callers
 * must treat `null` as "build no query yet", never as "read unscoped".
 */
export function useDriverScope(): DriverScope | null {
  return useSyncExternalStore(
    subscribeDriverScope,
    getDriverScope,
    getDriverScope,
  );
}
