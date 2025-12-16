// import { cacheVersion } from "@/constants/cache";
// import { supabase } from "@/utils/supabase/supabaseClient";
// import { customSynced, registerSyncedStore } from "@/utils/supabase/supaLegend/config";
// import { observable, observe } from "@legendapp/state";
// import { currentUser$ } from "./currentUser";

// // Helper to get the current user_id reactively
// const getUserId = () => {
//   const user = currentUser$.get();
//   // currentUser$ returns an object keyed by user_id, get first one
//   if (user && typeof user === "object") {
//     const userObj = Object.values(user)[0] as any;
//     return userObj?.user_id ?? -1;
//   }
//   return -1;
// };

// // The synced users collection
// export const currentDriver$ = observable(
//   customSynced({
//     supabase,
//     collection: "Drivers", // <-- must match Database["public"]["Tables"]
//     select: (from: any) => from.select("*"),
//     filter: (select) => select.eq("user_id", currentUser$.user_id.get()),
//     // mode: "set",
//     as: "value",
//     actions: ["read"],
//     realtime: true,
//     // Persist data and pending changes locally
//     persist: {
//       name: `currentDriver_${cacheVersion}`,
//       retrySync: true, // Persist pending changes and retry
//     },
//     waitFor: () => !!currentUser$.user_id.get(),
//   })
// );

// // Re-sync currentDriver when currentUser changes
// // observe(() => {
// //   const userId = getUserId();
// //   console.log("[currentDriver$] currentUser changed, user_id:", userId);
// //   if (userId !== -1) {
// //     const state = syncState(currentDriver$);
// //     if (state.sync) {
// //       console.log("[currentDriver$] Triggering re-sync for user_id:", userId);
// //       state.sync();
// //     }
// //   }
// // });

// observe(() => {
//   currentDriver$.get();
//   console.log("CurrentDriver updated:", currentDriver$.get());
// });

// registerSyncedStore("currentDriver", currentDriver$);
