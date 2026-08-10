import type { PhotoSource } from "@/library/photoUploadQueue";
import { convertToJpegIfNeeded } from "@/utils/convertToJpeg";
import { persistPickerPhoto } from "@/utils/persistPickerPhoto";
import type { DocumentPhoto } from "../types";

/** Convert + persist a picker asset to cache; returns a lightweight DocumentPhoto. */
export async function persistDamagePhoto(
  tempUri: string,
  source: PhotoSource,
): Promise<DocumentPhoto> {
  const converted = await convertToJpegIfNeeded(tempUri);
  const persisted = await persistPickerPhoto(converted.uri, converted.ext);
  return { uri: persisted, isNew: true, ext: converted.ext, source };
}
