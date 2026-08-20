import {
  pickPhotosFromCamera,
  pickPhotosFromLibrary,
  type PickedPhoto,
} from "@/utils/pickPhotos";
import { makePreview } from "@/utils/makePreview";
import { persistPickerPhoto } from "@/utils/persistPickerPhoto";
import { Alert } from "react-native";
import type { DocumentPhoto } from "../types";

/**
 * A selection this size is well outside what these surfaces normally need (a
 * handful of photos), so it is worth a word of warning about time and storage.
 * Deliberately a nudge and not a cap — nothing *here* refuses a selection.
 *
 * Both callers do have a hard cap (`MAX_PHOTOS`, `@/utils/photoLimit`), but it
 * is applied by the caller, which passes its remaining headroom as
 * `selectionLimit`. A caller that passes none is uncapped, and this warning is
 * then the only thing standing in its way.
 */
const LARGE_SELECTION_THRESHOLD = 40;

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
async function persistAll(picked: PickedPhoto[]): Promise<DocumentPhoto[]> {
  const photos: DocumentPhoto[] = [];
  for (const photo of picked) {
    try {
      const uri = await persistPickerPhoto(photo.uri, photo.ext);
      photos.push({
        uri,
        // Best-effort: `null` just means the grid renders the original.
        previewUri: await makePreview(uri),
        isNew: true,
        ext: photo.ext,
        source: photo.source,
      });
    } catch (err) {
      console.warn("[pickDamagePhotos] persist failed:", err);
    }
  }
  return photos;
}

export async function pickDamagePhotosFromCamera(): Promise<DocumentPhoto[]> {
  return persistAll(await pickPhotosFromCamera());
}

/**
 * @param options.selectionLimit Cap handed to the OS picker, so the driver is
 *   stopped at the report's remaining headroom inside the picker itself rather
 *   than being told afterwards that some picks were dropped. Omitted means no
 *   cap (inspection photo questions).
 */
export async function pickDamagePhotosFromLibrary(options?: {
  selectionLimit?: number;
}): Promise<DocumentPhoto[]> {
  const picked = await pickPhotosFromLibrary({
    selectionLimit: options?.selectionLimit,
  });
  if (picked.length > LARGE_SELECTION_THRESHOLD) {
    warnAboutLargeSelection(picked.length);
  }
  return persistAll(picked);
}
