import {
  pickPhotosFromCamera,
  pickPhotosFromLibrary,
  type PickedPhoto,
} from "@/utils/pickPhotos";
import { persistPickerPhoto } from "@/utils/persistPickerPhoto";
import type { DocumentPhoto } from "../types";

/**
 * Copy picked photos out of the picker's temporary location, so they survive
 * until the report is submitted. Assets that fail to copy are skipped rather
 * than failing the whole selection.
 */
async function persistAll(picked: PickedPhoto[]): Promise<DocumentPhoto[]> {
  const photos: DocumentPhoto[] = [];
  for (const photo of picked) {
    try {
      photos.push({
        uri: await persistPickerPhoto(photo.uri, photo.ext),
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
  return persistAll(await pickPhotosFromLibrary());
}
