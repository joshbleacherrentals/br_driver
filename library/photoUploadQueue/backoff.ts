/**
 * §6 — background backoff schedule: 30s → 1min → 5min → plateau.
 *
 * NOT IMPLEMENTED. Backoff limits how often the network is hit, never how many
 * attempts are allowed — attempts do not end (§6).
 */

import type { PhotoUploadRow } from "./types";

/** Pause after the 1st, 2nd and 3rd-or-later failed attempt, in ms. */
export const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 300_000] as const;

/**
 * Pause to wait before the next attempt, given how many attempts have already
 * been made for this row. Non-decreasing, and plateaus at the last step of
 * {@link BACKOFF_SCHEDULE_MS} — it never grows without bound and never
 * becomes "give up".
 */
export function backoffDelayMs(attempts: number): number {
  // TODO(photo-queue): implement — placeholder never waits.
  void attempts;
  return 0;
}

/** Whether a row's backoff pause has elapsed and it may be attempted again. */
export function isDueForRetry(
  row: Pick<PhotoUploadRow, "attempts" | "last_attempt_at">,
  nowMs: number,
): boolean {
  // TODO(photo-queue): implement — placeholder ignores the schedule entirely.
  void row;
  void nowMs;
  return true;
}
