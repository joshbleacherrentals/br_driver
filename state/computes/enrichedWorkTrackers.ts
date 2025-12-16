import { computed, observe } from "@legendapp/state";
import { addresses$ } from "../stores/addresses.store";
import { bleachers$ } from "../stores/bleachers.store";
import { workTrackers$ } from "../stores/workTrackers.store";

export const enrichedWorkTrackers$ = computed(() => {
  const trackers = workTrackers$.get();
  const addressesRaw = addresses$.get();
  const bleachersRaw = bleachers$.get();

  console.log("[enrichedWorkTrackers$] Computing with:", {
    trackersCount: trackers ? Object.keys(trackers).length : 0,
    addressesCount: addressesRaw ? Object.keys(addressesRaw).length : 0,
    bleachersCount: bleachersRaw ? Object.keys(bleachersRaw).length : 0,
  });

  if (!trackers) return [];

  // Addresses are already keyed by legend_state_uuid (the fieldId used in customSynced)
  // So we can use the raw addressesRaw directly as a UUID lookup
  const addressesByUuid: Record<string, any> = {};
  if (addressesRaw) {
    Object.entries(addressesRaw as any).forEach(([uuid, addr]: [string, any]) => {
      if (addr && uuid) {
        addressesByUuid[uuid] = addr;
      }
    });
  }
  console.log("[enrichedWorkTrackers$] addressesByUuid keys:", Object.keys(addressesByUuid));

  // Index bleachers by bleacher_id for lookup
  const bleachersById: Record<number, any> = {};
  if (bleachersRaw) {
    Object.values(bleachersRaw as any).forEach((bl: any) => {
      if (bl?.bleacher_id != null) {
        bleachersById[bl.bleacher_id] = bl;
      }
    });
  }

  return Object.values(trackers as any)
    .filter((wt: any) => wt && !wt.deleted)
    .map((wt: any) => {
      // Use UUID fields for address lookup
      const pickup_address = wt.pickup_address_uuid
        ? addressesByUuid[wt.pickup_address_uuid] ?? undefined
        : undefined;
      const dropoff_address = wt.dropoff_address_uuid
        ? addressesByUuid[wt.dropoff_address_uuid] ?? undefined
        : undefined;
      const bleacher = wt.bleacher_id ? bleachersById[wt.bleacher_id] ?? undefined : undefined;

      console.log("[enrichedWorkTrackers$] Lookup for wt", wt.work_tracker_id, {
        pickup_address_uuid: wt.pickup_address_uuid,
        foundPickup: !!pickup_address,
        dropoff_address_uuid: wt.dropoff_address_uuid,
        foundDropoff: !!dropoff_address,
      });

      return {
        ...wt,
        pickup_address,
        dropoff_address,
        bleacher,
      };
    });
});

observe(() => {
  enrichedWorkTrackers$.get();
  console.log("Enriched WorkTrackers updated:", enrichedWorkTrackers$.get());
});
