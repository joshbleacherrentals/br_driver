import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { observable, observe } from "@legendapp/state";
import { session$ } from "../session/session";

export const currentUser$ = observable(
  customSynced({
    supabase,
    collection: "Users", // <-- must match Database["public"]["Tables"]
    select: (from: any) => from.select("*"),
    filter: (q) => {
      const clerkId = session$.clerkUserId.get();
      if (!clerkId) return q.eq("user_id", -1); // guaranteed no rows
      return q.eq("clerk_user_id", clerkId);
    },
    // mode: "set",
    as: "value",
    actions: ["read"],
    realtime: true,
    // Persist data and pending changes locally
    persist: {
      name: `currentUser_${cacheVersion}`,
      retrySync: true, // Persist pending changes and retry
    },
    waitFor: () => !!session$.clerkUserId.get() != null,
    onError: (error) => console.error("Synced Supabase error:", error),
  })
);

console.log("CurrentUser store initialized");

observe(() => {
  const u = currentUser$.get();
  console.log("CurrentUser updated:", u);
});
