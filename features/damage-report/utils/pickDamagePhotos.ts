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
 * A selection this size is well outside what a damage report normally needs
 * (a handful of photos; ~30 at the very top end), so it is worth a word of
 * warning about time and storage. Deliberately a nudge and not a cap: nothing
 * here refuses the selection, because a driver who genuinely photographed forty
 * points of damage must still be able to submit all forty.
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

export async function pickDamagePhotosFromLibrary(): Promise<DocumentPhoto[]> {
  const picked = await pickPhotosFromLibrary();
  if (picked.length > LARGE_SELECTION_THRESHOLD) {
    warnAboutLargeSelection(picked.length);
  }
  return persistAll(picked);
}
