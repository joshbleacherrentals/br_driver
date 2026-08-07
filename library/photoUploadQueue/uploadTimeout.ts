/**
 * §5 — per-request timeout via `AbortSignal`.
 *
 * NOT IMPLEMENTED. The placeholder passes a signal that is never aborted, so a
 * hung request would hang forever — the exact failure mode §5 describes.
 */

/**
 * Upload request deadline. §5 asks for "a relatively short limit (e.g. 30-45s)"
 * because Supabase Storage's own default is ~5 minutes, far too long for a
 * driver standing there waiting.
 */
export const UPLOAD_TIMEOUT_MS = 35_000;

/**
 * Runs a single upload attempt under an `AbortSignal` deadline.
 *
 * Contract (§5):
 * - `run` receives the signal and must pass it to the request;
 * - if the deadline passes first, the signal aborts and the returned promise
 *   rejects;
 * - a timeout is NOT "stop trying" — the caller leaves the row in a retryable
 *   state, so no timer here may ever mark a row permanently done.
 */
export function uploadWithTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<T> {
  // TODO(photo-queue): implement — placeholder applies no deadline at all.
  void timeoutMs;
  return run(new AbortController().signal);
}
