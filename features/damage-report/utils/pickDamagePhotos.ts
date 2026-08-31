/**
 * Picking photos, and telling the driver what is happening while they arrive.
 *
 * A thirty-photo selection is not instant: every pick is normalised (HEIC →
 * JPEG, downscaled), copied out of the picker's temporary directory so it
 * survives until submit, and given a small preview for the grid. That is
 * seconds of work per batch. Handing the whole array back at the end meant the
 * screen sat unchanged the entire time, so the import now reports itself:
 *
 *  - `onProgress` fires with the total the moment the picker returns, then
 *    after each photo, so the caller can show "Adding 7 of 30".
 *  - `onPhoto` fires per photo, so tiles appear as they land instead of all at
 *    once at the end.
 *
 * The cap is applied here too, before any of that starts: trimming afterwards
 * would put tiles on screen only to take them away again.
 */

import {
  pickPhotosFromCamera,
  pickPhotosFromLibrary,
  type PickedPhoto,
} from "@/utils/pickPhotos";
import { makePreview } from "@/utils/makePreview";
import { persistPickerPhoto } from "@/utils/persistPickerPhoto";
import { admitPickedPhotos, type PhotoLimitState } from "@/utils/photoLimit";
import { Alert } from "react-native";
import type { DocumentPhoto } from "../types";

/**
 * A selection this size is well outside what these surfaces normally need (a
 * handful of photos), so it is worth a word of warning about time and storage.
 * Deliberately a nudge and not a cap — nothing *here* refuses a selection
 * beyond the caller's own `limit`.
 */
const LARGE_SELECTION_THRESHOLD = 40;

/**
 * How far the import has got. `done` counts photos *attempted*, not saved, so
 * the indicator always reaches the total the driver was shown rather than
 * stalling short of it when one pick could not be copied.
 *
 * `total` is `null` while the OS picker has not returned yet. That stretch is
 * real time — the picker exports every selected asset before it resolves, which
 * on a 25-photo selection is seconds — and it is time the app cannot count,
 * only acknowledge. Callers turn the indicator on with a `null` total the
 * moment the driver taps an add control, so the indicator is already on screen
 * behind the picker and the tap never looks ignored.
 */
export type PhotoImportProgress = { done: number; total: number | null };

export type PhotoImportOptions = {
  /** Called with `{ done: 0, total }` first, then after every photo. */
  onProgress?: (progress: PhotoImportProgress) => void;
  /** Called per photo, as soon as it is on disk and has its preview. */
  onPhoto?: (photo: DocumentPhoto) => void;
};

function warnAboutLargeSelection(count: number): void {
  Alert.alert(
    "That's a lot of photos",
    `You selected ${count} photos. Saving and uploading them will take a while ` +
      `and use a noticeable amount of storage on this phone. They will all be ` +
      `kept — just keep the app open while they upload.`,
  );
}

/**
 * Copy picked photos out of the picker's temporary location, so they survive
 * until the report is submitted, and build a small preview for each. Assets
 * that fail to copy are skipped rather than failing the whole selection.
 */
async function persistAll(
  picked: PickedPhoto[],
  options: PhotoImportOptions,
): Promise<DocumentPhoto[]> {
  if (picked.length === 0) return [];

  const photos: DocumentPhoto[] = [];
  options.onProgress?.({ done: 0, total: picked.length });

  for (let i = 0; i < picked.length; i++) {
    const photo = picked[i];
    try {
      const uri = await persistPickerPhoto(photo.uri, photo.ext);
      const saved: DocumentPhoto = {
        uri,
        // Best-effort: `null` just means the grid renders the original.
        previewUri: await makePreview(uri),
        isNew: true,
        ext: photo.ext,
        source: photo.source,
      };
      photos.push(saved);
      options.onPhoto?.(saved);
    } catch (err) {
      console.warn("[pickDamagePhotos] persist failed:", err);
    }
    options.onProgress?.({ done: i + 1, total: picked.length });
  }
  return photos;
}

export async function pickDamagePhotosFromCamera(
  options: PhotoImportOptions = {},
): Promise<DocumentPhoto[]> {
  return persistAll(await pickPhotosFromCamera(), options);
}

/**
 * @param options.limit The photo set's remaining headroom. It is handed to the
 *   OS picker as `selectionLimit`, so on iOS the driver is stopped inside the
 *   picker itself; the result is trimmed against it as well, because some
 *   Android pickers ignore the limit — and never silently, since dropping picks
 *   without saying so would leave the driver believing photos were attached
 *   that were not. Omitted means uncapped.
 */
export async function pickDamagePhotosFromLibrary(
  options: PhotoImportOptions & { limit?: PhotoLimitState } = {},
): Promise<DocumentPhoto[]> {
  const picked = await pickPhotosFromLibrary({
    selectionLimit: options.limit?.remaining,
    // Turn the indicator on the instant the picker hands back its assets, with
    // the count already in it. Normalising them (HEIC → JPEG, downscale) runs
    // before a single photo can be copied, and on a thirty-photo selection that
    // stretch alone is long enough to look like nothing happened.
    onSelected: (count) =>
      options.onProgress?.({
        done: 0,
        total: Math.min(count, options.limit?.remaining ?? count),
      }),
  });
  if (picked.length === 0) return [];

  const { kept, alert } = options.limit
    ? admitPickedPhotos(picked, options.limit)
    : { kept: picked, alert: null };
  if (alert) Alert.alert(alert.title, alert.message);

  if (kept.length > LARGE_SELECTION_THRESHOLD) {
    warnAboutLargeSelection(kept.length);
  }

  return persistAll(kept, options);
}
