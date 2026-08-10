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
  // No completed attempts yet — the very first try must not wait (§6).
  if (attempts <= 0) {
    return 0;
  }
  // After N failures wait BACKOFF_SCHEDULE_MS[N-1], plateauing at the last step
  // so the delay never grows without bound and never becomes "give up" (§6).
  const index = Math.min(attempts - 1, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[index];
}

/** Whether a row's backoff pause has elapsed and it may be attempted again. */
export function isDueForRetry(
  row: Pick<PhotoUploadRow, "attempts" | "last_attempt_at">,
  nowMs: number,
): boolean {
  // Never attempted — go immediately.
  if (!row.last_attempt_at) {
    return true;
  }
  const lastMs = Date.parse(row.last_attempt_at);
  if (Number.isNaN(lastMs)) {
    return true;
  }
  return nowMs - lastMs >= backoffDelayMs(row.attempts);
}
