/**
 * Caps a picked photo at 1080×1920 before it is written to disk.
 *
 * A modern phone camera hands back a 12-megapixel, 3–5 MB file. Nothing
 * downstream needs that: damage evidence and inspection photos are reviewed on
 * a screen, and thirty of them per report is the normal case, not the extreme
 * one — so every megabyte is paid three times over, in device storage, in the
 * upload queue's time on a truck's cell signal, and in the bucket.
 *
 * The rule is deliberately orientation-agnostic and one-directional:
 *
 *  - a photo that already fits inside 1080×1920 — in either orientation — is
 *    **left completely alone**. Not resized, not re-encoded. A low-resolution
 *    photo is already a poor-quality one; running it through another JPEG pass
 *    would strictly subtract from it and save nothing worth having.
 *  - anything larger is scaled down until it fits, preserving aspect ratio.
 *
 * For library picks this is the only compression pass — the picker is no longer
 * asked for a `quality`, precisely so that it does not re-encode 25 assets
 * before it returns (see `pickPhotos.ts`). A camera capture still arrives at
 * `quality: 0.8`, making this its second pass; acceptable only because it
 * follows a resample, which discards the first pass's artefacts along with the
 * pixels they lived on. That is also why the small-photo case must stay a true
 * no-op: there is no resample there to hide behind.
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/** The long edge of the cap — the 1920 in "1080×1920" / "1920×1080". */
export const MAX_LONG_EDGE = 1920;
/** The short edge of the cap — the 1080. */
export const MAX_SHORT_EDGE = 1080;

/** Matches the camera's own `quality: 0.8`, so neither pass is the weak link. */
const COMPRESS_QUALITY = 0.8;

/**
 * The resize this photo needs, or `null` when it already fits.
 *
 * Pure and separated from the manipulator call because this is the whole
 * decision: everything else in this file is plumbing. Only a width is returned
 * — `expo-image-manipulator` derives the height from it and keeps the aspect
 * ratio, which is exactly what we want and strictly better than rounding both
 * edges ourselves and hoping they stay proportional.
 */
export function planDownscale(
  width: number,
  height: number,
): { width: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);

  // Both constraints must hold, so the tighter one wins.
  const scale = Math.min(
    MAX_LONG_EDGE / longEdge,
    MAX_SHORT_EDGE / shortEdge,
    1,
  );
  if (scale >= 1) return null;

  // Never round down to zero: a pathologically thin image (say 8000×2) still
  // has to come out as a real, non-empty picture.
  return { width: Math.max(1, Math.round(width * scale)) };
}

/**
 * Scales `uri` down to fit the cap, if it does not already.
 *
 * Returns `null` when nothing was done — either the photo already fits, its
 * dimensions are unknown, or the manipulator could not read it. A `null` is a
 * "keep the original" instruction, never an error: for evidence photos, a file
 * that is larger than we would like beats a file that is missing, so every
 * failure mode here degrades to the untouched original.
 *
 * The output is always JPEG, which means a HEIC capture that needs downscaling
 * gets its format conversion for free in the same pass, instead of being
 * decoded and re-encoded twice (see `convertToJpegIfNeeded`).
 */
export async function downscalePhotoIfNeeded(
  uri: string,
  dimensions: { width?: number; height?: number } | undefined,
): Promise<{ uri: string; ext: string } | null> {
  const { width, height } = dimensions ?? {};
  // Unknown dimensions: the only way to learn them is to decode the photo,
  // which is the cost we are trying to avoid. Leaving it alone is the
  // conservative miss — it keeps a photo too big, it never mangles one.
  if (width === undefined || height === undefined) return null;

  const plan = planDownscale(width, height);
  if (!plan) return null;

  try {
    const result = await manipulateAsync(uri, [{ resize: plan }], {
      compress: COMPRESS_QUALITY,
      format: SaveFormat.JPEG,
    });
    return { uri: result.uri, ext: "jpg" };
  } catch (error) {
    console.warn(
      "[downscalePhoto] could not downscale, keeping original:",
      error,
    );
    return null;
  }
}
