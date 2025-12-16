// import { cacheVersion } from "@/constants/cache";
// import { supabase } from "@/utils/supabase/supabaseClient";
// import { customSynced, registerSyncedStore } from "@/utils/supabase/supaLegend/config";
// import { observable, observe } from "@legendapp/state";
// import { session$ } from "./session";

// // Helper to get clerkUserId reactively
// const getClerkUserId = () => session$.clerkUserId.get() || "";
// console.log("[currentUser$] module loaded");
// // The synced users collection
// export const currentUser$ = observable(
//   customSynced({
//     supabase,
//     collection: "Users", // <-- must match Database["public"]["Tables"]
//     select: (from: any) => from.select("*"),
//     filter: (q) => {
//       const clerkId = session$.clerkUserId.get();
//       if (!clerkId) return q.eq("user_id", -1); // guaranteed no rows
//       return q.eq("clerk_user_id", clerkId);
//     },
//     // mode: "set",
//     as: "value",
//     actions: ["read"],
//     realtime: true,
//     // Persist data and pending changes locally
//     persist: {
//       name: `currentUser_${cacheVersion}`,
//       retrySync: true, // Persist pending changes and retry
//     },
//     waitFor: () => !!session$.clerkUserId.get() != null,
//     onError: (error) => console.error("Synced Supabase error:", error),
//   })
// );

// // Re-sync currentUser when session.clerkUserId changes
// // observe(() => {
// //   const clerkUserId = getClerkUserId();
// //   console.log("[currentUser$] session.clerkUserId changed:", clerkUserId);
// //   if (clerkUserId) {
// //     const state = syncState(currentUser$);
// //     if (state.sync) {
// //       console.log("[currentUser$] Triggering re-sync for clerkUserId:", clerkUserId);
// //       state.sync();
// //     }
// //   }
// // });

// observe(() => {
//   const u = currentUser$.get();
//   console.log("CurrentUser updated:", u);
// });

// registerSyncedStore("currentUser", currentUser$);
