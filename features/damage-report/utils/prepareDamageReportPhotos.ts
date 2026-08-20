/**
 * Phase 1 of saving a damage report: get every new photo onto disk, and report
 * honestly how it went.
 *
 * Separate from the database writes on purpose. A damage report may never end
 * up with zero photos — it *is* the evidence — so the "could anything be saved?"
 * question has to be settled before a single row exists. Callers that write
 * other rows first (the inspection screen) run this before those writes too, so
 * a doomed damage report cannot strand a half-finished inspection.
 */

import { randomUUID } from "expo-crypto";

import type { DocumentPhoto } from "../types";
import {
  preparePhoto,
  type PhotoPrepFailure,
  type PreparedPhoto,
} from "./preparePhoto";

/** How far the prep loop has got. `saved` is the number actually on disk. */
export type PhotoPrepProgress = {
  /** Photos the loop has finished with, successfully or not. */
  attempted: number;
  /**
   * Photos genuinely written to this device. Shown to the driver, because
   * "3 of 5 saved" must not count the two that failed — the old counter was
   * the loop index, so it always reached the total no matter what happened.
   */
  saved: number;
  total: number;
};

/** Everything phase 2 needs, plus what phase 1 could not do. */
export type DamageReportDraft = {
  /** Minted here: photo paths are keyed by it, so it exists before any row. */
  damageId: string;
  photos: PreparedPhoto[];
  failures: PhotoPrepFailure[];
};

export type PrepareDamageReportPhotosResult =
  | { ok: true; draft: DamageReportDraft }
  /** The driver cancelled mid-loop. Nothing has been written; nothing to undo. */
  | { ok: false; reason: "aborted" }
  /**
   * Every photo failed. The report must NOT be created: an empty damage report
   * is worse than none — it looks like a completed submission while carrying no
   * evidence at all, and the driver has no way to tell.
   */
  | { ok: false; reason: "all_photos_failed"; failures: PhotoPrepFailure[] };

export type PrepareDamageReportPhotosInput = {
  photos: DocumentPhoto[];
  /** When true, abort mid-loop (e.g. the driver cancelled the progress modal). */
  shouldAbort?: () => boolean;
  onPhotoProgress?: (progress: PhotoPrepProgress) => void;
};

export async function prepareDamageReportPhotos(
  input: PrepareDamageReportPhotosInput,
): Promise<PrepareDamageReportPhotosResult> {
  const damageId = randomUUID();
  const newPhotos = input.photos.filter((photo) => photo.isNew && photo.uri);

  const prepared: PreparedPhoto[] = [];
  const failures: PhotoPrepFailure[] = [];

  input.onPhotoProgress?.({ attempted: 0, saved: 0, total: newPhotos.length });

  for (let i = 0; i < newPhotos.length; i++) {
    if (input.shouldAbort?.()) {
      return { ok: false, reason: "aborted" };
    }

    try {
      const result = await preparePhoto(newPhotos[i], damageId, i);
      if (result.ok) {
        prepared.push(result.prepared);
      } else {
        failures.push(result.failure);
        console.warn(
          "[prepareDamageReportPhotos] photo prep failed:",
          result.failure,
        );
      }
    } catch (error) {
      // `preparePhoto` reports its own known failures; this is the net for an
      // unforeseen throw, so one bad photo still cannot end the loop.
      failures.push({
        reason: "copy_failed",
        uri: newPhotos[i].uri ?? "",
        error,
      });
      console.warn("[prepareDamageReportPhotos] unexpected prep error:", error);
    }

    input.onPhotoProgress?.({
      attempted: i + 1,
      saved: prepared.length,
      total: newPhotos.length,
    });
  }

  if (prepared.length === 0 && newPhotos.length > 0) {
    return { ok: false, reason: "all_photos_failed", failures };
  }

  return { ok: true, draft: { damageId, photos: prepared, failures } };
}
