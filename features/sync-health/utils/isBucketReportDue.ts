/** At most one bucket-count report per six hours while the app stays open. */
export const BUCKET_REPORT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type LastBucketReport = { driverId: string; atMs: number };

/**
 * Whether the app should write its bucket count now.
 *
 * `last` is this launch's previous report (in memory, not the DB), so the first
 * finished sync after every launch reports. After that, one report per
 * interval — a report's own upload triggers another sync, and without this it
 * would keep feeding itself.
 */
export function isBucketReportDue(
  last: LastBucketReport | null,
  driverId: string,
  nowMs: number,
): boolean {
  if (!last || last.driverId !== driverId) return true;
  const elapsed = nowMs - last.atMs;
  // A clock moved backwards past the last report means the elapsed time is
  // unknown; report rather than stay silent for hours.
  return elapsed < 0 || elapsed >= BUCKET_REPORT_INTERVAL_MS;
}
