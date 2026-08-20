/**
 * §6 — background backoff schedule: 30s → 1min → 5min → plateau.
 *
 * Backoff limits how often the network is hit, never how many attempts are
 * allowed — attempts do not end (§6).
 */

import type { PhotoUploadRow } from "./types";

/** Pause after the 1st, 2nd and 3rd-or-later failed attempt, in ms. */
export const BACKOFF_SCHEDULE_MS = [30_000, 60_000, 300_000] as const;

/**
 * Minimum gap between two attempts on the *same* row in fast/foreground mode.
 * Fast mode skips the backoff schedule so a waiting user sees quick progress —
 * but not zero, so a single instantly-failing row can never hot-loop the worker
 * or starve the other photos. It is a floor on re-attempt spacing, not a cap on
 * how many attempts happen (§5/§6).
 */
export const FAST_RETRY_SPACING_MS = 4_000;

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

/**
 * One `attempts` band of {@link BACKOFF_SCHEDULE_MS}, expressed as data.
 *
 * Exists so backoff eligibility can be asked *of the database* instead of being
 * re-derived in TypeScript over an already-`LIMIT`ed batch of candidates. The
 * schedule itself stays defined exactly once, here; `tableAdapters.ts` only
 * translates these bands into SQL predicates.
 */
export type BackoffWindow = {
  /** Lowest `attempts` value in this band. 0 also covers a NULL `attempts`. */
  minAttempts: number;
  /** Highest, or `null` for the open-ended plateau band. */
  maxAttempts: number | null;
  /**
   * A row in this band is due when its `last_attempt_at` is at or before this
   * instant (ms since epoch).
   */
  dueAtOrBeforeMs: number;
};

/**
 * {@link isDueForRetry}, restated as a set of `(attempts band, cutoff)` pairs a
 * query can filter on. A row is due for a background retry iff it matches any
 * one of them, or has never been attempted at all.
 *
 * Kept exhaustive by construction: one band per step of the schedule plus the
 * "not yet attempted once" band, with the last step open-ended because
 * {@link backoffDelayMs} plateaus there.
 */
export function backoffWindows(nowMs: number): BackoffWindow[] {
  const lastIndex = BACKOFF_SCHEDULE_MS.length - 1;

  return [
    // No completed attempt yet — the first try must not wait (§6). No cutoff
    // can hold it back, so the band's cutoff is `now` itself.
    { minAttempts: 0, maxAttempts: 0, dueAtOrBeforeMs: nowMs },
    ...BACKOFF_SCHEDULE_MS.map((delayMs, index) => ({
      minAttempts: index + 1,
      maxAttempts: index === lastIndex ? null : index + 1,
      dueAtOrBeforeMs: nowMs - delayMs,
    })),
  ];
}

/**
 * Fast-mode eligibility: a never-attempted row goes immediately; an
 * already-attempted one must wait {@link FAST_RETRY_SPACING_MS}. This is what
 * makes a hot loop impossible — the row that just failed cannot be re-claimed on
 * the very next iteration, so the worker always drains and stops instead of
 * spinning on one row.
 */
export function isDueForFastRetry(
  row: Pick<PhotoUploadRow, "last_attempt_at">,
  nowMs: number,
): boolean {
  if (!row.last_attempt_at) {
    return true;
  }
  const lastMs = Date.parse(row.last_attempt_at);
  if (Number.isNaN(lastMs)) {
    return true;
  }
  return nowMs - lastMs >= FAST_RETRY_SPACING_MS;
}
