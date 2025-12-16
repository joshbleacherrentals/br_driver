import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { observable, observe } from "@legendapp/state";
import { currentUser$ } from "./users.store";

export const currentDriver$ = observable(
  customSynced({
    supabase,
    collection: "Drivers", // <-- must match Database["public"]["Tables"]
    select: (from: any) => from.select("*"),
    filter: (select) => select.eq("user_id", currentUser$.user_id.get()),
    // mode: "set",
    as: "value",
    actions: ["read"],
    realtime: true,
    // Persist data and pending changes locally
    persist: {
      name: `currentDriver_${cacheVersion}`,
      retrySync: true, // Persist pending changes and retry
    },
    waitFor: () => !!currentUser$.user_id.get(),
  })
);

observe(() => {
  currentDriver$.get();
  console.log("CurrentDriver updated:", currentDriver$.get());
});
