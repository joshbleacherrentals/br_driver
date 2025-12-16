// import { cacheVersion } from "@/constants/cache";
// import { supabase } from "@/utils/supabase/supabaseClient";
// import { customSynced, registerSyncedStore } from "@/utils/supabase/supaLegend";
// import { observable, observe } from "@legendapp/state";
// import { currentDriver$ } from "./currentDriver";

// // Helper to get the current driver_id reactively
// const getDriverId = () => {
//   const driver = currentDriver$.get();
//   // currentDriver$ returns an object keyed by driver_id, get first one
//   if (driver && typeof driver === "object") {
//     const driverObj = Object.values(driver)[0] as any;
//     return driverObj?.driver_id ?? -1;
//   }
//   return -1;
// };

// // The synced users collection
// export const workTrackers$ = observable(
//   customSynced({
//     supabase,
//     collection: "WorkTrackers", // <-- must match Database["public"]["Tables"]
//     select: (from: any) =>
//       from.select("*").neq("status", "draft").order("date", { ascending: true }),
//     filter: (select) => select.eq("driver_id", currentDriver$.driver_id.get()),
//     actions: ["read", "create", "update", "delete"],
//     realtime: true,
//     persist: {
//       name: `workTrackers_${cacheVersion}`,
//       retrySync: true,
//     },
//     retry: {
//       infinite: true,
//       backoff: "exponential",
//       delay: 1000,
//       maxDelay: 30000,
//     },
//     waitFor: () => !!currentDriver$.driver_id.get(),
//     onError: (error) => console.error("Synced Supabase error:", error),
//   })
// );

// observe(() => {
//   workTrackers$.get();
//   console.log("WorkTrackers updated:", workTrackers$.get());
// });

// registerSyncedStore("workTrackers", workTrackers$);
