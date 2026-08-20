/**
 * One picked photo → one file at the upload queue's stable local path.
 *
 * Deliberately does no database work. A damage report may never end up with
 * zero photos, so "can these photos be saved at all?" has to be answerable
 * *before* anything is written — see `prepareDamageReportPhotos.ts`, which runs
 * this over the whole selection, and `createDamageReport.ts`, which only writes
 * rows once the answer is yes.
 */

import { copyLocalPhoto, saveToGalleryIfCamera } from "@/library/photoUploadQueue";
import { generateThumbnail } from "@/utils/generateThumbnail";
import * as FileSystem from "expo-file-system/legacy";

import type { DocumentPhoto } from "../types";

/**
 * Why a photo could not be prepared. Every case is per-photo and recoverable by
 * the driver (re-add the photo), which is why they are reported rather than
 * thrown — one unreadable pick must not discard the other twenty-nine.
 */
export type PhotoPrepFailure =
  | { reason: "file_missing"; uri: string }
  | { reason: "copy_failed"; uri: string; error: unknown };

/** A photo that is on disk under `photoPath`, ready for its queue row. */
export type PreparedPhoto = {
  /** Bucket path — also the key the local copy is recomputed from (§3). */
  photoPath: string;
  /** Small base64 preview for list rendering; best-effort, never fatal. */
  thumbnail: string | null;
};

export type PhotoPrepResult =
  | { ok: true; prepared: PreparedPhoto }
  | { ok: false; failure: PhotoPrepFailure };

export async function preparePhoto(
  photo: DocumentPhoto,
  damageId: string,
  index: number,
): Promise<PhotoPrepResult> {
  const uri = photo.uri;
  if (!uri) {
    return { ok: false, failure: { reason: "file_missing", uri: "" } };
  }

  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) {
    return { ok: false, failure: { reason: "file_missing", uri } };
  }

  const ext = photo.ext ?? "jpg";
  const photoPath = `${damageId}/photo_${index}_${Date.now()}.${ext}`;

  let localUri: string;
  try {
    // A direct file copy — never a base64 round-trip through the JS heap. See
    // `copyLocalPhoto`'s doc comment.
    localUri = await copyLocalPhoto(uri, photoPath);
  } catch (error) {
    return { ok: false, failure: { reason: "copy_failed", uri, error } };
  }

  // Best-effort, and deliberately after the copy: a report with a photo but no
  // thumbnail renders a placeholder, while a report with a thumbnail and no
  // file has lost the evidence.
  let thumbnail: string | null = null;
  try {
    thumbnail = await generateThumbnail(uri);
  } catch (error) {
    console.warn("[preparePhoto] thumbnail failed:", error);
  }

  // Camera captures are the app's only copy until now — duplicate to the
  // gallery as a safety backup (§4). Best-effort; never blocks the save.
  void saveToGalleryIfCamera(localUri, photo.source);

  return { ok: true, prepared: { photoPath, thumbnail } };
}
