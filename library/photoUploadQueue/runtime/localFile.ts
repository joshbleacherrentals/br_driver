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
 * Writes base64 image/PDF data to the stable local path and returns its URI.
 *
 * For callers that genuinely hold *bytes* — a freshly encoded image, a
 * generated document. A caller that already has a file on disk wants
 * {@link copyLocalPhoto} instead: base64 is a ~1.35x-sized JS string, and
 * routing a multi-megabyte photo through one only to decode it straight back to
 * disk is pure heap pressure with nothing to show for it.
 */
export async function writeLocalPhoto(
  base64: string,
  bucketPath: string,
): Promise<string> {
  const uri = localUriForPath(bucketPath);
  await ensureParentDir(uri);
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

/**
 * Copies an existing local file straight to the queue's stable path, without
 * routing its bytes through the JS heap.
 *
 * The damage-report save loop used to do `readAsBase64` → `writeLocalPhoto` for
 * every photo — a plain file copy performed as a multi-megabyte string
 * round-trip, sequentially, while the driver waited. `FileSystem.copyAsync` is
 * the same operation at zero JS-heap cost, and is what `persistPickerPhoto`
 * already uses one step earlier in the same pipeline.
 */
export async function copyLocalPhoto(
  fromUri: string,
  bucketPath: string,
): Promise<string> {
  const uri = localUriForPath(bucketPath);
  await ensureParentDir(uri);
  await FileSystem.copyAsync({ from: fromUri, to: uri });
  return uri;
}

async function ensureParentDir(uri: string): Promise<void> {
  const parentDir = uri.substring(0, uri.lastIndexOf("/"));
  const info = await FileSystem.getInfoAsync(parentDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
  }
}
