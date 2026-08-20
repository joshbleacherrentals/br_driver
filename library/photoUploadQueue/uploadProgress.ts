/**
 * §7 — progress for the "don't close the app, photos are uploading" modal.
 *
 * The bar counts how many of N photos have actually reached the bucket, so the
 * only status that advances it is `uploaded` — the state the queue writes after
 * an explicit confirmation (§9/§10). A row that is `pending`, `uploading` or
 * `failed` has not landed yet and must not be counted as progress.
 */

import type { UploadStatus } from "./types";

export type UploadProgress = {
  /** Photos attached to this report. */
  total: number;
  /** Photos confirmed in the bucket. */
  uploaded: number;
  /** 0…1, for the progress bar. Zero photos reads as no progress to draw. */
  ratio: number;
  /**
   * Every photo has landed — the modal closes itself (§7). Vacuously true with
   * no photos, so an empty report can never pin the modal open.
   */
  complete: boolean;
};

/** Derives the §7 progress from the live `upload_status` of a report's photos. */
export function deriveUploadProgress(
  statuses: readonly (UploadStatus | string | null)[],
): UploadProgress {
  const total = statuses.length;
  const uploaded = statuses.filter((status) => status === "uploaded").length;

  return {
    total,
    uploaded,
    ratio: total > 0 ? uploaded / total : 0,
    complete: uploaded >= total,
  };
}
