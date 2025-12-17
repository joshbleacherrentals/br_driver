import { cacheVersion } from "@/constants/cache";
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced } from "@/utils/supabase/supaLegend/config";
import { registerSyncedStore } from "@/utils/supabase/supaLegend/util";
import { computed, observable } from "@legendapp/state";
import { workTrackerInspections$ } from "./workTrackerInspections.store";

const inspectionPhotoUuids$ = computed<string[]>(() => {
  const inspections = workTrackerInspections$.get();
  if (!inspections) return [];

  const uuids = new Set<string>();

  Object.values(inspections).forEach((i) => {
    if (!i || i.deleted) return;
    if (i.inspection_uuid) uuids.add(i.inspection_uuid);
  });

  return Array.from(uuids);
});

export const inspectionPhotos$ = observable(
  customSynced({
    supabase,
    collection: "InspectionPhotos",
    fieldId: "inspection_photo_uuid",
    select: (from: any) => from.select("*"),
    filter: (q) => {
      const uuids = inspectionPhotoUuids$.get();
      if (!uuids.length) {
        return q.eq("inspection_uuid", "00000000-0000-0000-0000-000000000000");
      }
      return q.in("inspection_uuid", uuids);
    },
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    persist: {
      name: `inspectionPhotos_${cacheVersion}`,
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
    // waitFor: () => inspectionPhotoUuids$.get().length > 0,
  })
);

registerSyncedStore("inspectionPhotos", inspectionPhotos$);
