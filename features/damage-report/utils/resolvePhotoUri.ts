import { localUriForPath } from "@/library/photoUploadQueue";
import * as FileSystem from "expo-file-system/legacy";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const BUCKET = "damage-report-photos";

export async function resolvePhotoUri(photoPath: string): Promise<string> {
  try {
    const localUri = localUriForPath(photoPath);
    const { exists } = await FileSystem.getInfoAsync(localUri);
    if (exists) return localUri;
  } catch {
    // fall through to remote URL
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${photoPath}`;
}
