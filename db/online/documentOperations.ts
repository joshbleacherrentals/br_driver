import { Database } from "@/database.types";
import { SupabaseClient } from "@supabase/supabase-js";

type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Upload a document file to Supabase storage
 */
export async function uploadDriverDocument(
  supabase: TypedSupabaseClient,
  file: { uri: string; type: string; name: string },
  driverId: number
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // Read file as array buffer (React Native doesn't have blob.arrayBuffer)
    const response = await fetch(file.uri);
    const blob = await response.blob();

    // Use FileReader to convert blob to ArrayBuffer in React Native
    const fileData = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result));
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });

    // Create a unique file path: {driverId}/{timestamp}_{filename}
    const timestamp = Date.now();
    const filePath = `${driverId}/${timestamp}_${file.name}`;

    console.log("Uploading file to:", filePath);

    const { data, error } = await supabase.storage
      .from("driver-documents")
      .upload(filePath, fileData, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Upload error:", error);
      throw error;
    }

    console.log("Upload successful:", data);
    return { success: true, path: data.path };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Delete a document file from Supabase storage
 */
export async function deleteDriverDocument(
  supabase: TypedSupabaseClient,
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.storage.from("driver-documents").remove([filePath]);

    if (error) {
      console.error("Delete error:", error);
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Delete error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get public URL for a driver document
 */
export function getDriverDocumentUrl(
  supabase: TypedSupabaseClient,
  filePath: string | null
): string | null {
  if (!filePath) return null;
  const { data } = supabase.storage.from("driver-documents").getPublicUrl(filePath);
  return data.publicUrl;
}
