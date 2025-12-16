// import { cacheVersion } from "@/constants/cache";
// import { supabase } from "@/utils/supabase/supabaseClient";
// import { customSynced, registerSyncedStore } from "@/utils/supabase/supaLegend";
// import { computed, observable, observe } from "@legendapp/state";
// import { workTrackers$ } from "./workTrackers";

// const workTrackerBleacherIds$ = computed<number[]>(() => {
//   const trackers = workTrackers$.get();
//   if (!trackers) return [];

//   const ids = new Set<number>();

//   Object.values(trackers as any).forEach((wt: any) => {
//     if (!wt || wt.deleted) return;
//     if (wt.bleacher_id != null) ids.add(wt.bleacher_id);
//   });

//   return Array.from(ids);
// });

// // The synced users collection
// export const workTrackerBleachers$ = observable(
//   customSynced({
//     supabase,
//     collection: "Bleachers",
//     select: (from: any) => from.select("*"),
//     filter: (q) => {
//       const ids = workTrackerBleacherIds$.get();

//       // Before WorkTrackers load, ask for an impossible id => 0 rows.
//       if (!ids.length) {
//         return q.eq("bleacher_id", -1);
//       }

//       return q.in("bleacher_id", ids);
//     },
//     actions: ["read"],
//     realtime: true,
//     persist: {
//       name: `driverBleachers_${cacheVersion}`,
//       retrySync: true,
//     },
//   })
// );

// observe(() => {
//   workTrackerBleachers$.get();
//   console.log("workTrackerBleachers$ updated:", workTrackerBleachers$.get());
// });

// registerSyncedStore("workTrackerBleachers", workTrackerBleachers$);
