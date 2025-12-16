import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { computed, observable, observe } from "@legendapp/state";
import { workTrackers$ } from "./workTrackers.store";

const addressUuids$ = computed<string[]>(() => {
  const trackers = workTrackers$.get();
  if (!trackers) return [];

  const uuids = new Set<string>();

  Object.values(trackers as any).forEach((wt: any) => {
    if (!wt || wt.deleted) return;
    if (wt.pickup_address_uuid) uuids.add(wt.pickup_address_uuid);
    if (wt.dropoff_address_uuid) uuids.add(wt.dropoff_address_uuid);
  });

  //   console.log("[workTrackerAddressUuids$] Extracted UUIDs:", Array.from(uuids));
  return Array.from(uuids);
});

export const addresses$ = observable(
  customSynced({
    supabase,
    collection: "Addresses",
    select: (from: any) => {
      const uuids = addressUuids$.get();
      //   console.log("[workTrackerAddresses$] SELECT called with uuids:", uuids);
      return from.select("*");
    },
    filter: (q) => {
      const uuids = addressUuids$.get();
      //   console.log("[workTrackerAddresses$] FILTER called with uuids:", uuids);

      // Before WorkTrackers load, ask for impossible UUID => 0 rows.
      if (!uuids.length) {
        // console.log("[workTrackerAddresses$] No uuids, filtering to impossible UUID");
        return q.eq("legend_state_uuid", "00000000-0000-0000-0000-000000000000");
      }

      //   console.log("[workTrackerAddresses$] Filtering IN legend_state_uuid:", uuids);
      return q.in("legend_state_uuid", uuids);
    },
    actions: ["read"],
    changesSince: "all",
    realtime: true,
    persist: {
      name: `addresses_uuid_${cacheVersion}`,
      retrySync: true,
    },
    waitFor: () => addressUuids$.get().length > 0,
  })
);

observe(() => {
  addresses$.get();
  console.log("addresses$ updated:", addresses$.get());
});
