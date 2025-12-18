import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { registerSyncedStore } from "@/utils/supabase/supaLegend/util";
import { observable, observe, syncState } from "@legendapp/state";
import { currentDriver$ } from "./drivers.store";

export const workTrackers$ = observable(
  customSynced({
    supabase,
    collection: "WorkTrackers",
    select: (from: any) =>
      from.select("*").neq("status", "draft").order("date", { ascending: true }),
    filter: (select: any) => select.eq("driver_id", currentDriver$.driver_id.get()),
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    persist: {
      name: `workTrackers_${cacheVersion}`,
      retrySync: true,
    },
    updatePartial: true,
    changesSince: "last-sync",
    retry: {
      infinite: true,
      backoff: "exponential",
      delay: 1000,
      maxDelay: 30000,
    },
    waitFor: () => !!currentDriver$.driver_id.get(),
  })
);

registerSyncedStore("workTrackers", workTrackers$);

const wtState$ = syncState(workTrackers$);
export function acceptTrip(id: string) {
  workTrackers$[id].status.set("accepted");
  // workTrackers$[id].updated_at.set(new Date().toISOString());
}

observe(() => {
  const trackers = workTrackers$.get();
  if (!trackers) return [];
  const statuses = new Set<string>();
  Object.values(trackers).forEach((wt) => {
    if (!wt || wt.deleted) return;
    if (wt.status) statuses.add(wt.status);
  });
  //array from
  const arr = Array.from(statuses);
  console.log("[workTrackers] status changed:", arr);
});
