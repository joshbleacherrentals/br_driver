/**
 * Local file persistence for the custom photo upload queue.
 *
 * Every captured/picked photo is written to a stable location under the app's
 * document directory, keyed by its bucket path. The path is deterministic
 * from `photo_path` alone, so any consumer — the upload worker, a renderer,
 * a repair flow — can recompute the local copy's URI live, without storing or
 * trusting a persisted absolute path anywhere. Nothing here ever deletes a
 * file — the §2/§3 guarantee that the local original outlives the upload.
 */

import * as FileSystem from "expo-file-system/legacy";

const QUEUE_DIR = "photo-upload-queue";

/** Deterministic local URI for a bucket path (`photo_path` / `storage_path`). */
export function localUriForPath(bucketPath: string): string {
  return `${FileSystem.documentDirectory}${QUEUE_DIR}/${bucketPath}`;
}

/** Whether the local copy for this bucket path still exists on device. */
export async function localPhotoExists(bucketPath: string): Promise<boolean> {
  const { exists } = await FileSystem.getInfoAsync(localUriForPath(bucketPath));
  return exists;
}

/**
 * Writes base64 image/PDF data to the stable local path and returns its URI,
 * for callers that need it immediately (e.g. to save a copy to the gallery).
 */
export async function writeLocalPhoto(
  base64: string,
  bucketPath: string,
): Promise<string> {
  const uri = localUriForPath(bucketPath);
  const parentDir = uri.substring(0, uri.lastIndexOf("/"));
  const info = await FileSystem.getInfoAsync(parentDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
  }
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}
