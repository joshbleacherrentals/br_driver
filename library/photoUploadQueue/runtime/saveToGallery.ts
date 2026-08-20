/**
 * Gallery duplication for camera-captured photos (design doc §4).
 *
 * When the app itself just *created* a file (camera), that file is the only
 * copy until we persist it. Copying it into the device photo library moves the
 * original outside any app-managed cache — nothing the app does (or a queue bug
 * does) can delete it. Files that were *picked* from an existing source
 * (photo library, Files/PDF) already live in permanent storage, so they are
 * never duplicated (see `saveToGalleryIfCamera`).
 *
 * This is a best-effort safety backup: it must never throw and never block the
 * capture flow or the upload queue. A denied permission or a save failure is
 * logged and swallowed — the local `documentDirectory` copy still protects
 * against the data-loss bug on its own.
 */

import * as MediaLibrary from "expo-media-library";

/** Source of a captured/picked file — only "camera" is duplicated to gallery. */
export type PhotoSource = "camera" | "library" | "file";

let cachedGranted = false;

/**
 * Ensures write-only ("add photos") permission. Write-only keeps the OS prompt
 * minimal — we only ever add, never read the user's library. Cached once
 * granted so repeated captures don't re-prompt.
 */
async function ensureAddPermission(): Promise<boolean> {
  if (cachedGranted) return true;
  const current = await MediaLibrary.getPermissionsAsync(true);
  if (current.status === "granted") {
    cachedGranted = true;
    return true;
  }
  if (!current.canAskAgain) return false;
  const requested = await MediaLibrary.requestPermissionsAsync(true);
  cachedGranted = requested.status === "granted";
  return cachedGranted;
}

/**
 * Copies a local file into the device photo library iff it came from the
 * camera. No-op (returns false) for library/file sources and for any failure.
 * Returns true only when a copy was actually written to the gallery.
 */
export async function saveToGalleryIfCamera(
  localUri: string,
  source: PhotoSource | undefined,
): Promise<boolean> {
  if (source !== "camera") return false;
  try {
    if (!(await ensureAddPermission())) return false;
    await MediaLibrary.saveToLibraryAsync(localUri);
    return true;
  } catch (err) {
    console.warn("[saveToGallery] gallery copy failed (non-fatal):", err);
    return false;
  }
}
