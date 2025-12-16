// // state/session.ts
// import { cacheVersion } from "@/constants/cache";
// import { supabase } from "@/utils/supabase/supabaseClient";
// import { customSynced } from "@/utils/supabase/supaLegend/config";
// import { observable, observe } from "@legendapp/state";

// export const session$ = observable<{
//   clerkUserId: string | null;
// }>({
//   clerkUserId: null,
// });

// observe(() => {
//   const s = session$.get();
//   console.log("Session updated:", s);
// });

// // registerSyncedStore("session", session$);
