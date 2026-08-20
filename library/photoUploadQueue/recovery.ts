/**
 * §6 — the "1 minute → banner" rule for the background recovery pass.
 *
 * NOT IMPLEMENTED. The placeholder shows the banner immediately and skips
 * verification — the two things §6 explicitly forbids.
 */

import type { ForegroundRecoveryState, RecoveryDecision } from "./types";

/**
 * On every app open / foreground transition the worker gets this long of fast
 * retries with no backoff pauses before the driver is bothered (§6).
 */
export const FAST_RETRY_WINDOW_MS = 60_000;

/**
 * Decides what the recovery pass does at a given point after foregrounding.
 *
 * Contract (§6):
 * 1. Inside the fast-retry window — retry fast, never verify, never banner.
 * 2. At/after the window with photos still unresolved — verify against the
 *    bucket first; the banner may not appear on an unverified guess.
 * 3. Only once verification confirms the object is genuinely missing does the
 *    banner appear, and the worker falls back to normal backoff.
 */
export function decideRecovery(
  state: ForegroundRecoveryState,
): RecoveryDecision {
  // Nothing outstanding — the pass has no work to do.
  if (state.unresolvedPhotoCount <= 0) {
    return { retryMode: "idle", verifyBucket: false, showBanner: false };
  }

  // Step 1 — inside the fast-retry window: retry hard, stay silent, no lookup.
  if (state.elapsedMs < FAST_RETRY_WINDOW_MS) {
    return { retryMode: "fast", verifyBucket: false, showBanner: false };
  }

  // Past the window: the banner may never appear on an unverified guess (§6.2).
  switch (state.bucketVerification) {
    case "not_run":
      // Step 2 — verify directly against the bucket before showing anything.
      return { retryMode: "fast", verifyBucket: true, showBanner: false };
    case "confirmed_present":
      // The file actually landed; the local status just lagged — no banner.
      return { retryMode: "backoff", verifyBucket: false, showBanner: false };
    case "confirmed_missing":
      // Step 3/4 — genuinely missing: banner, then normal background backoff.
      return { retryMode: "backoff", verifyBucket: false, showBanner: true };
  }
}
