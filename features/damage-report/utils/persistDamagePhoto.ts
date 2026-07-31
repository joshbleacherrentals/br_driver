import { convertToJpegIfNeeded } from "@/utils/convertToJpeg";
import { persistPickerPhoto } from "@/utils/persistPickerPhoto";
import type { DocumentPhoto } from "../types";

/** Convert + persist a picker asset to cache; returns a lightweight DocumentPhoto. */
export async function persistDamagePhoto(
  tempUri: string,
): Promise<DocumentPhoto> {
  const converted = await convertToJpegIfNeeded(tempUri);
  const persisted = await persistPickerPhoto(converted.uri, converted.ext);
  return { uri: persisted, isNew: true, ext: converted.ext };
}
