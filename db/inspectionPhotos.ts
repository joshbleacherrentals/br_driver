import { InspectionPhoto } from "@/types/inspectionPhoto";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upload a photo to Supabase Storage and create a record in InspectionPhotos table
 */
export async function uploadInspectionPhoto(
  supabase: SupabaseClient,
  inspectionId: number,
  fileUri: string,
  caption?: string
): Promise<InspectionPhoto> {
  console.log("uploadInspectionPhoto called:", { inspectionId, fileUri, caption });

  // Generate a unique filename with timestamp and random component
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9); // 7 random chars
  const extension = fileUri.split(".").pop() || "jpg";
  const filename = `${timestamp}-${random}.${extension}`;
  const storagePath = `inspections/${inspectionId}/${filename}`;

  console.log("Generated storage path:", storagePath);

  // Read the file - React Native uses different approach than web
  const response = await fetch(fileUri);
  const arrayBuffer = await response.arrayBuffer();
  const fileData = new Uint8Array(arrayBuffer);

  console.log("File data size:", fileData.length, "bytes");

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("inspection-photos") // Make sure this bucket exists in Supabase
    .upload(storagePath, fileData, {
      contentType: `image/${extension}`,
      upsert: false,
    });

  console.log("Storage upload result:", { uploadData, uploadError });

  if (uploadError) {
    throw new Error(`Failed to upload photo: ${uploadError.message}`);
  }

  // Create a record in InspectionPhotos table
  const { data, error: dbError } = await supabase
    .from("InspectionPhotos")
    .insert({
      inspection_id: inspectionId,
      storage_path: storagePath,
      caption: caption || null,
    })
    .select()
    .single();

  console.log("Database insert result:", { data, dbError });

  if (dbError) {
    // If database insert fails, try to clean up the uploaded file
    await supabase.storage.from("inspection-photos").remove([storagePath]);
    throw new Error(`Failed to save photo record: ${dbError.message}`);
  }

  console.log("Photo uploaded successfully:", data);
  return data as InspectionPhoto;
}

/**
 * Get all photos for an inspection
 */
export async function getInspectionPhotos(
  supabase: SupabaseClient,
  inspectionId: number
): Promise<InspectionPhoto[]> {
  const { data, error } = await supabase
    .from("InspectionPhotos")
    .select("*")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch inspection photos: ${error.message}`);
  }

  return data as InspectionPhoto[];
}

/**
 * Get a public URL for a photo
 */
export function getPhotoPublicUrl(supabase: SupabaseClient, storagePath: string): string {
  const { data } = supabase.storage.from("inspection-photos").getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Delete a photo from storage and database
 */
export async function deleteInspectionPhoto(
  supabase: SupabaseClient,
  photoId: number,
  storagePath: string
): Promise<void> {
  // Delete from storage first
  const { error: storageError } = await supabase.storage
    .from("inspection-photos")
    .remove([storagePath]);

  if (storageError) {
    console.error("Failed to delete photo from storage:", storageError);
  }

  // Delete from database
  const { error: dbError } = await supabase
    .from("InspectionPhotos")
    .delete()
    .eq("photo_id", photoId);

  if (dbError) {
    throw new Error(`Failed to delete photo record: ${dbError.message}`);
  }
}

/**
 * Update photo caption
 */
export async function updatePhotoCaption(
  supabase: SupabaseClient,
  photoId: number,
  caption: string
): Promise<void> {
  const { error } = await supabase
    .from("InspectionPhotos")
    .update({ caption })
    .eq("photo_id", photoId);

  if (error) {
    throw new Error(`Failed to update photo caption: ${error.message}`);
  }
}
