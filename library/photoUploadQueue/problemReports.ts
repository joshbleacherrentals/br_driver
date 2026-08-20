/**
 * §6 ("Banner behavior with multiple reports") — turns the flat list of photo
 * rows that still are not `uploaded` into the per-report shape the banner
 * counts.
 *
 * Pure by design: the DB read and the bucket verification live in the runtime
 * layer, and only their results are handed here.
 *
 * Two filters apply, and both matter:
 * 1. a photo only counts once its bucket object has been *verified* missing —
 *    §6.2 forbids bannering on an unverified local status;
 * 2. several photos of the same report collapse into one entry, because the
 *    banner counts reports ("N report(s)…"), not photos.
 */

import type { ProblemReport } from "./types";

/** One unresolved photo joined to the report that owns it. */
export type ProblemPhotoRow = {
  /** `DamageReportPhotos.id` — the key the verification pass reports back. */
  photo_id: string;
  /** `DamageReports.id` — the tap target (§6). */
  report_uuid: string;
  /** `DamageReports.created_at`; drives the newest → oldest ordering. */
  report_created_at: string | null;
};

/**
 * Collapses unresolved photos into one entry per report, keeping only those
 * whose object was confirmed missing from the bucket.
 *
 * A report with no `created_at` sorts as the oldest rather than being dropped —
 * a missing timestamp must never hide a photo that is genuinely lost.
 *
 * Returned newest → oldest so the result is stable to assert on; the banner
 * re-sorts anyway.
 */
export function toProblemReports(
  rows: readonly ProblemPhotoRow[],
  confirmedMissingPhotoIds: ReadonlySet<string>,
): ProblemReport[] {
  const newestByReport = new Map<string, string>();

  for (const row of rows) {
    if (!confirmedMissingPhotoIds.has(row.photo_id)) {
      continue;
    }
    const createdAt = row.report_created_at ?? "";
    const seen = newestByReport.get(row.report_uuid);
    // Same report can carry several problem photos — keep one entry, and the
    // most recent timestamp among them.
    if (seen === undefined || createdAt.localeCompare(seen) > 0) {
      newestByReport.set(row.report_uuid, createdAt);
    }
  }

  return [...newestByReport.entries()]
    .map(([reportUuid, createdAt]) => ({ reportUuid, createdAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
