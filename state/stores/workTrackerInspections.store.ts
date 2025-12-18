import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { registerSyncedStore } from "@/utils/supabase/supaLegend/util";
import { computed, observable } from "@legendapp/state";
import { workTrackers$ } from "./workTrackers.store";

const inspectionUuids$ = computed<string[]>(() => {
  const trackers = workTrackers$.get();
  if (!trackers) return [];

  const uuids = new Set<string>();

  Object.values(trackers as any).forEach((wt: any) => {
    if (!wt || wt.deleted) return;
    if (wt.pre_inspection_uuid) uuids.add(wt.pre_inspection_uuid);
    if (wt.post_inspection_uuid) uuids.add(wt.post_inspection_uuid);
  });

  //   console.log("[workTrackerAddressUuids$] Extracted UUIDs:", Array.from(uuids));
  return Array.from(uuids);
});

export const workTrackerInspections$ = observable(
  customSynced({
    supabase,
    collection: "WorkTrackerInspections",
    fieldId: "inspection_uuid",
    select: (from: any) => from.select("*"),
    filter: (q: any) => {
      const uuids = inspectionUuids$.get();
      //   if (!uuids.length) {
      //     return q.eq("inspection_uuid", "00000000-0000-0000-0000-000000000000");
      //   }
      return q.in("inspection_uuid", uuids);
    },
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    persist: {
      name: `workTrackerInspections_${cacheVersion}`,
      retrySync: true,
    },
    updatePartial: true,
    changesSince: "all",
    retry: {
      infinite: true,
      backoff: "exponential",
      delay: 1000,
      maxDelay: 30000,
    },
    waitFor: () => inspectionUuids$.get().length > 0,
  })
);

registerSyncedStore("workTrackerInspections", workTrackerInspections$);
