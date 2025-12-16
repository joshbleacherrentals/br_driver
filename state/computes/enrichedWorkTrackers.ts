import { Database } from "@/database.types";
import { computed, observe } from "@legendapp/state";
import { addresses$ } from "../stores/addresses.store";
import { bleachers$ } from "../stores/bleachers.store";
import { workTrackers$ } from "../stores/workTrackers.store";

// Base row types from database
type WorkTrackerRow = Database["public"]["Tables"]["WorkTrackers"]["Row"];
type AddressRow = Database["public"]["Tables"]["Addresses"]["Row"];
type BleacherRow = Database["public"]["Tables"]["Bleachers"]["Row"];

// Enriched type combining work tracker with related data
export type EnrichedWorkTracker = WorkTrackerRow & {
  pickup_address?: AddressRow;
  dropoff_address?: AddressRow;
  bleacher?: BleacherRow;
};

export const enrichedWorkTrackers$ = computed<EnrichedWorkTracker[]>(() => {
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
  const addressesByUuid = new Map<string, AddressRow>();
  if (addressesRaw) {
    Object.entries(addressesRaw).forEach(([uuid, addr]) => {
      if (addr && uuid) {
        addressesByUuid.set(uuid, addr as AddressRow);
      }
    });
  }
  console.log("[enrichedWorkTrackers$] addressesByUuid keys:", Array.from(addressesByUuid.keys()));

  // Index bleachers by bleacher_id for lookup
  const bleachersById = new Map<number, BleacherRow>();
  if (bleachersRaw) {
    Object.values(bleachersRaw).forEach((bl) => {
      if (bl?.bleacher_id != null) {
        bleachersById.set(bl.bleacher_id, bl as BleacherRow);
      }
    });
  }

  return Object.values(trackers)
    .filter((wt): wt is WorkTrackerRow => wt != null && !wt.deleted)
    .map((wt): EnrichedWorkTracker => {
      // Use UUID fields for address lookup
      const pickup_address = wt.pickup_address_uuid
        ? addressesByUuid.get(wt.pickup_address_uuid)
        : undefined;
      const dropoff_address = wt.dropoff_address_uuid
        ? addressesByUuid.get(wt.dropoff_address_uuid)
        : undefined;
      const bleacher = wt.bleacher_id ? bleachersById.get(wt.bleacher_id) : undefined;

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
