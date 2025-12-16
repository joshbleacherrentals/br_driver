import { inspectionPhotos$ } from "@/state/stores/inspectionPhotos.store";
import { supabase } from "@/utils/supabase/supabaseClient";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system";
import { inspectionPhotoUploadQueue$ } from "../stores/inspectionPhotoUploadQueue.store";

let started = false;

function guessMimeFromPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
}

async function uploadFileToStorage(localPath: string, storagePath: string, mime: string) {
  const resp = await fetch(localPath);
  const arrayBuffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error } = await supabase.storage
    .from("inspection-photos")
    .upload(storagePath, bytes, { contentType: mime, upsert: false });

  if (error) throw error;
}

async function processQueueOnce() {
  const queue = inspectionPhotoUploadQueue$.get() || {};
  const entries = Object.entries(queue);

  for (const [key, item] of entries) {
    if (!item || item.status === "uploading") continue;

    // Mark uploading (local-first)
    inspectionPhotoUploadQueue$[key].status.set("uploading");
    inspectionPhotos$[key].upload_status.set("uploading");
    inspectionPhotos$[key].last_error.set(null);

    try {
      const mime = item.mime || guessMimeFromPath(item.local_path);
      const storagePath = `inspections/${item.inspection_uuid}/${item.inspection_photo_uuid}.jpg`;

      await uploadFileToStorage(item.local_path, storagePath, mime);

      // Update row (local). Legend will sync this update.
      inspectionPhotos$[key].storage_path.set(storagePath);
      inspectionPhotos$[key].upload_status.set("uploaded");
      inspectionPhotos$[key].last_error.set(null);

      // Remove from queue + delete local file
      inspectionPhotoUploadQueue$[key].delete();

      try {
        await FileSystem.deleteAsync(item.local_path, { idempotent: true });
      } catch {
        // ok
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);

      inspectionPhotoUploadQueue$[key].status.set("error");
      inspectionPhotoUploadQueue$[key].attempts.set((item.attempts ?? 0) + 1);
      inspectionPhotoUploadQueue$[key].last_error.set(msg);

      inspectionPhotos$[key].upload_status.set("error");
      inspectionPhotos$[key].last_error.set(msg);
    }
  }
}

export function startInspectionPhotoUploadWorker() {
  if (started) return;
  started = true;

  // Kick once on start
  processQueueOnce().catch(() => {});

  // Re-run whenever connectivity changes to online
  NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      processQueueOnce().catch(() => {});
    }
  });
}
