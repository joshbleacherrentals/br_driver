/**
 * A small on-disk preview of a picked photo, for grid rendering.
 *
 * The picker hands back a full-resolution capture — several megabytes on disk,
 * and tens of megabytes once decoded into a bitmap. Rendering thirty of those
 * into 100×100 tiles is what made the damage-report form's memory use scale
 * with the *original* photo size rather than with what is on screen.
 *
 * Two deliberate choices:
 *  - a **file**, not base64. A base64 preview would live in React state for as
 *    long as the form is open, which is the same leak in a different costume.
 *  - written next to the picker's own copy in the cache directory, because a
 *    preview is disposable: losing it costs a re-render, never a photo. The
 *    original that must survive is copied into the upload queue's directory
 *    separately (`copyLocalPhoto`).
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/** Wide enough for a retina 100pt tile, small enough to be a rounding error. */
const PREVIEW_WIDTH = 320;
const PREVIEW_QUALITY = 0.6;

/**
 * Returns a preview file URI, or `null` if one could not be produced (e.g. a
 * format the manipulator cannot read). Callers fall back to the original URI,
 * so a failure costs memory, never a photo.
 */
export async function makePreview(uri: string): Promise<string | null> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: PREVIEW_WIDTH } }],
      { compress: PREVIEW_QUALITY, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch (error) {
    console.warn("[makePreview] could not build preview:", error);
    return null;
  }
}
