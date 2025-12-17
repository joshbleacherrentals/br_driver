import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { registerSyncedStore } from "@/utils/supabase/supaLegend/util";
import { observable, syncState } from "@legendapp/state";
import { currentDriver$ } from "./drivers.store";

export const workTrackers$ = observable(
  customSynced({
    supabase,
    collection: "WorkTrackers", // <-- must match Database["public"]["Tables"]
    select: (from: any) =>
      from.select("*").neq("status", "draft").order("date", { ascending: true }),
    filter: (select) => select.eq("driver_id", currentDriver$.driver_id.get()),
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    persist: {
      name: `workTrackers_${cacheVersion}`,
      retrySync: true,
    },
    updatePartial: true,
    // changesSince: "all",
    retry: {
      infinite: true,
      backoff: "exponential",
      delay: 1000,
      maxDelay: 30000,
    },
    // waitFor: () => !!currentDriver$.driver_id.get(),
  })
);

registerSyncedStore("workTrackers", workTrackers$);

const wtState$ = syncState(workTrackers$);
export function acceptTrip(id: string) {
  workTrackers$[id].status.set("accepted");
}

// observe(() => {
//   const s = wtState$.get();
//   // console.log("[workTrackers syncState]", JSON.stringify(s, null, 2));
// });
