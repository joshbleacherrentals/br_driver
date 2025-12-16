// import { cacheVersion } from "@/constants/cache";
// import { supabase } from "@/utils/supabase/supabaseClient";
// import { customSynced, registerSyncedStore } from "@/utils/supabase/supaLegend";
// import { computed, observable, observe, syncState } from "@legendapp/state";
// import { session$ } from "./session";
// import { workTrackers$ } from "./workTrackers";

// // DEBUG: Test Supabase AFTER auth is ready
// observe(() => {
//   const clerkUserId = session$.clerkUserId.get();

//   // Only run once auth is established
//   if (!clerkUserId) {
//     console.log("[DEBUG] Waiting for auth before testing Supabase...");
//     return;
//   }

//   console.log("[DEBUG] Auth ready, testing Supabase Addresses table...");

//   (async () => {
//     // Test 1: Can we query the table at all?
//     const { data: allAddresses, error: allError } = await supabase
//       .from("Addresses")
//       .select("address_id, street, city")
//       .limit(5);

//     if (allError) {
//       console.log("[DEBUG] Error querying Addresses table:", allError.message);
//       console.log("[DEBUG] This is likely an RLS issue");
//     } else {
//       console.log("[DEBUG] Sample addresses from table:", allAddresses);
//       console.log(
//         "[DEBUG] Address IDs available:",
//         allAddresses?.map((a) => a.address_id)
//       );
//     }

//     // Test 2: Specific query for IDs 2 and 299
//     const { data: specificAddresses, error: specificError } = await supabase
//       .from("Addresses")
//       .select("*")
//       .in("address_id", [2, 299]);

//     if (specificError) {
//       console.log("[DEBUG] Error querying specific IDs:", specificError.message);
//     } else {
//       console.log("[DEBUG] Addresses for IDs [2, 299]:", specificAddresses?.length, "rows");
//       specificAddresses?.forEach((a) => console.log("[DEBUG] Found:", a.address_id, a.street));
//     }
//   })();
// });

// // Extract UUIDs from work trackers for address lookup
// const workTrackerAddressUuids$ = computed<string[]>(() => {
//   const trackers = workTrackers$.get();
//   if (!trackers) return [];

//   const uuids = new Set<string>();

//   Object.values(trackers as any).forEach((wt: any) => {
//     if (!wt || wt.deleted) return;
//     if (wt.pickup_address_uuid) uuids.add(wt.pickup_address_uuid);
//     if (wt.dropoff_address_uuid) uuids.add(wt.dropoff_address_uuid);
//   });

//   console.log("[workTrackerAddressUuids$] Extracted UUIDs:", Array.from(uuids));
//   return Array.from(uuids);
// });

// // The synced addresses collection - filtered by UUIDs from work trackers
// export const workTrackerAddresses$ = observable(
//   customSynced({
//     supabase,
//     collection: "Addresses",
//     select: (from: any) => {
//       const uuids = workTrackerAddressUuids$.get();
//       console.log("[workTrackerAddresses$] SELECT called with uuids:", uuids);
//       return from.select("*");
//     },
//     filter: (q) => {
//       const uuids = workTrackerAddressUuids$.get();
//       console.log("[workTrackerAddresses$] FILTER called with uuids:", uuids);

//       // Before WorkTrackers load, ask for impossible UUID => 0 rows.
//       if (!uuids.length) {
//         console.log("[workTrackerAddresses$] No uuids, filtering to impossible UUID");
//         return q.eq("legend_state_uuid", "00000000-0000-0000-0000-000000000000");
//       }

//       console.log("[workTrackerAddresses$] Filtering IN legend_state_uuid:", uuids);
//       return q.in("legend_state_uuid", uuids);
//     },
//     actions: ["read"],
//     realtime: true,
//     persist: {
//       name: `driverAddresses_uuid_${cacheVersion}`,
//       retrySync: true,
//     },
//     waitFor: () => workTrackerAddressUuids$.get().length > 0,
//   })
// );

// observe(() => {
//   workTrackerAddresses$.get();
//   console.log("workTrackerAddresses$ updated:", workTrackerAddresses$.get());
// });

// let lastAddressUuids: string = "";
// observe(() => {
//   const uuids = workTrackerAddressUuids$.get();
//   const uuidsKey = JSON.stringify(uuids.sort());
//   console.log("workTrackerAddressUuids$ updated:", uuids);
//   if (uuidsKey !== lastAddressUuids && uuids.length > 0) {
//     lastAddressUuids = uuidsKey;
//     const state = syncState(workTrackerAddresses$);
//     if (state.sync) {
//       console.log("[workTrackerAddresses$] Triggering re-sync for address UUIDs:", uuids);
//       state.sync();
//     }
//   }
// });

// registerSyncedStore("workTrackerAddresses", workTrackerAddresses$);
