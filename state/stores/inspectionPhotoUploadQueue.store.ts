import { cacheVersion } from "@/constants/cache";
import { persistPluginLocal } from "@/utils/supabase/supaLegend/persistPlugin";
import { observable } from "@legendapp/state";
import { syncObservable } from "@legendapp/state/sync";

export type PhotoQueueItem = {
  inspection_photo_uuid: string;
  inspection_uuid: string;
  local_path: string; // file://... in app storage
  mime: string; // image/jpeg etc
  attempts: number;
  status: "queued" | "uploading" | "error";
  last_error?: string;
};

export const inspectionPhotoUploadQueue$ = observable<Record<string, PhotoQueueItem>>({});

syncObservable(inspectionPhotoUploadQueue$, {
  persist: {
    name: `inspectionPhotoUploadQueue_${cacheVersion}`,
    plugin: persistPluginLocal,
  },
});
