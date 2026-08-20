/**
 * §6/§7 — "is the queue currently working, and how far has it got".
 *
 * The §6 banner answers a different question ("which photos are *lost*"), and
 * deliberately only counts photos the bucket was asked about and confirmed
 * missing. That is the right gate for an alarm and the wrong one for progress:
 * a driver who has just submitted a report wants to see the count fall while
 * everything is going fine, long before anything could be called a problem.
 *
 * So this derives progress from the live local status alone, with no recovery
 * gate involved, and is kept pure so the counting rules can be asserted without
 * a database or a render.
 *
 * WHAT "X of Y" MEANS
 * Y is **not** every photo the driver owns. An unresolved report whose photos
 * all landed weeks ago would otherwise inflate both halves forever ("38 of 40"
 * on a fresh two-photo submit). Y is the photos of the reports that still have
 * work in flight — the batch the queue is actually busy with — so a fresh
 * report reads "0 of 2" and a finished one drops out of the count entirely.
 */

import { MISSING_LOCAL_FILE_ERROR } from "./types";

/**
 * One damage-report photo joined to its owning report and its §3 bookkeeping.
 *
 * A superset of {@link ProblemPhotoRow} on purpose: one driver-scoped query
 * feeds both the progress counts and the §6 problem-report list, rather than
 * two reactive queries watching the same two tables.
 */
export type UploadActivityRow = {
  /** `DamageReportPhotos.id`. */
  photo_id: string;
  /** `DamageReports.id`. */
  report_uuid: string;
  /** `DamageReports.created_at`; only the §6 half uses it. */
  report_created_at: string | null;
  /**
   * `PhotoUploadStatus.upload_status`, or `null` when the queue has never
   * persisted an outcome for this photo — which means the same thing as
   * `pending` (see `hooks/db/useDamageReportPhotos.ts`).
   */
  upload_status: string | null;
  /** `PhotoUploadStatus.last_error`; `LOCAL_FILE_MISSING` means parked (§12). */
  last_error: string | null;
};

export type UploadActivity = {
  /** Photos belonging to reports that still have work in flight. */
  total: number;
  /** Of those, how many the bucket has confirmed. */
  uploaded: number;
  /** Of those, how many the queue is still working on. */
  inFlight: number;
};

export const EMPTY_UPLOAD_ACTIVITY: UploadActivity = {
  total: 0,
  uploaded: 0,
  inFlight: 0,
};

/**
 * Statuses the §6 problem list may still be interested in — everything that is
 * not a confirmed upload, minus the mid-attempt reservation.
 *
 * Kept as a predicate, and applied in JS, because the single shared query has
 * to return uploaded rows too (they are the numerator of the progress count).
 * The row set this admits is exactly the one the old SQL-side filter produced.
 */
export function isUnresolvedUploadStatus(status: string | null): boolean {
  return status === null || status === "pending" || status === "failed";
}

/**
 * "The queue is still going to act on this photo."
 *
 * `failed` counts: §5 is explicit that a failure is never a give-up, and the
 * worker re-claims the row after its backoff. The one exception is a *parked*
 * row (§12) — its local file is gone, so no amount of waiting will upload it,
 * and treating it as in-flight would pin the progress banner open forever on a
 * photo only the driver can fix. Parked rows are the §6 banner's business.
 */
export function isUploadInFlight(row: UploadActivityRow): boolean {
  const status = row.upload_status;
  if (status === null || status === "pending" || status === "uploading") {
    return true;
  }
  return status === "failed" && row.last_error !== MISSING_LOCAL_FILE_ERROR;
}

/**
 * Counts the current upload batch: the photos of every report that still has at
 * least one photo in flight.
 */
export function deriveUploadActivity(
  rows: readonly UploadActivityRow[],
): UploadActivity {
  const busyReports = new Set<string>();
  for (const row of rows) {
    if (isUploadInFlight(row)) {
      busyReports.add(row.report_uuid);
    }
  }

  if (busyReports.size === 0) {
    return EMPTY_UPLOAD_ACTIVITY;
  }

  let total = 0;
  let uploaded = 0;
  let inFlight = 0;

  for (const row of rows) {
    if (!busyReports.has(row.report_uuid)) continue;
    total += 1;
    if (row.upload_status === "uploaded") uploaded += 1;
    if (isUploadInFlight(row)) inFlight += 1;
  }

  return { total, uploaded, inFlight };
}
