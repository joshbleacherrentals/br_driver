// hooks/useEnrichedWorkTrackers.ts
import { workTrackerAddresses$ } from "@/db/workTrackerAddresses";
import { workTrackers$ } from "@/db/workTrackers";
import { Address, EnrichedWorkTracker, WorkTracker } from "@/types/workTracker";

/**
 * Hook that assembles enriched work trackers by joining
 * workTrackers with their related addresses.
 *
 * Sync status (loading, errors) is handled globally by SyncStatusIndicator.
 */
export function useEnrichedWorkTrackers(): EnrichedWorkTracker[] {
  // Read raw collections from Legend State
  const trackersObj = workTrackers$.get() as Record<string, WorkTracker & any> | undefined;
  const addressesObj = workTrackerAddresses$.get() as Record<string, Address & any> | undefined;

  const trackers = trackersObj ?? {};
  const addresses = addressesObj ?? {};

  // Index addresses by their numeric IDs for fast lookup
  const addressesById: Record<number, Address> = {};
  Object.values(addresses).forEach((addr: any) => {
    if (!addr || addr.deleted) return;
    if (addr.address_id != null) {
      addressesById[addr.address_id] = addr as Address;
    }
  });

  // Build enriched work trackers
  const enrichedTrackers: EnrichedWorkTracker[] = Object.values(trackers)
    .filter((t: any) => !!t && !t.deleted)
    .map((t: any) => {
      const pickup_address =
        t.pickup_address_id != null ? addressesById[t.pickup_address_id] : undefined;
      const dropoff_address =
        t.dropoff_address_id != null ? addressesById[t.dropoff_address_id] : undefined;

      return {
        ...(t as WorkTracker),
        pickup_address,
        dropoff_address,
      };
    });

  return enrichedTrackers;
}
