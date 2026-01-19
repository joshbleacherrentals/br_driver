import { db } from "@/components/providers/SystemProvider";
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";
import { supabase } from "@/library/supabase/supabaseClient"; // adjust path if needed

// photoUploadService.ts
export async function uploadPendingPhotos() {
  const photos = await db
    .selectFrom("InspectionPhotos")
    .selectAll()
    .where("storage_path", "like", "file://%")
    .execute();

  for (const photo of photos) {
    if (!photo.storage_path) continue;

    try {
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(photo.storage_path, {
        encoding: 'base64',
      });

      // Convert to ArrayBuffer for Supabase upload
      const fileBuffer = decode(base64);

      const { data, error } = await supabase.storage
        .from("inspection-photos")
        .upload(
          `${photo.inspection_uuid}/${photo.id}.jpg`,
          fileBuffer,
          { contentType: "image/jpeg", upsert: true }
        );

      if (error) throw error;

      await db
        .updateTable("InspectionPhotos")
        .set({ storage_path: data.path })
        .where("id", "=", photo.id)
        .execute();
    } catch (error) {
      console.error("Upload failed:", error);
    }
  }
}
