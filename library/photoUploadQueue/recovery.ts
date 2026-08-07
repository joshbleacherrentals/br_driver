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
  // TODO(photo-queue): implement — placeholder banners without verifying.
  return {
    retryMode: "fast",
    verifyBucket: false,
    showBanner: state.unresolvedPhotoCount > 0,
  };
}
