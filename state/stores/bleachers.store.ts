import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { registerSyncedStore } from "@/utils/supabase/supaLegend/util";
import { computed, observable, observe, syncState } from "@legendapp/state";
import { workTrackers$ } from "./workTrackers.store";

const bleacherIds$ = computed<number[]>(() => {
  const trackers = workTrackers$.get();
  if (!trackers) return [];

  const ids = new Set<number>();

  Object.values(trackers as any).forEach((wt: any) => {
    if (!wt || wt.deleted) return;
    if (wt.bleacher_id != null) ids.add(wt.bleacher_id);
  });

  return Array.from(ids);
});

const bleacherKey$ = computed(() => bleacherIds$.get().slice().sort().join(","));

// The synced users collection
export const bleachers$ = observable(
  customSynced({
    supabase,
    collection: "Bleachers",
    select: (from: any) => from.select("*"),
    filter: (q: any) => {
      const ids = bleacherIds$.get();
      console.log("[bleachers$] filter called with ids:", ids);

      // Before WorkTrackers load, ask for an impossible id => 0 rows.
      if (!ids.length) {
        return q.eq("bleacher_id", -1);
      }

      return q.in("bleacher_id", ids);
    },
    actions: ["read"],
    realtime: true,
    changesSince: "all",
    persist: {
      name: `driverBleachers_${cacheVersion}}`,
      retrySync: true,
    },
    waitFor: () => bleacherIds$.get().length > 0,
  })
);

registerSyncedStore("bleachers", bleachers$);

const bleachersSync = syncState(bleachers$);
observe(() => {
  const key = bleacherIds$.get();
  if (!key) return;
  console.log("[bleachers] query key changed:", key);
  bleachersSync.sync();
});

observe(() => {
  bleachers$.get();
  console.log("bleachers$ updated:", bleachers$.get());
});
