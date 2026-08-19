/**
 * §5 — per-request timeout via `AbortSignal`.
 *
 * A timeout is not a verdict: see §5.1 and `uploadSuccess.ts`. The deadline
 * here ends *our wait*, and the row stays retryable — the storage SDK never
 * forwards the signal to its own `fetch`, so the request may still be landing.
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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Upload timed out"));
    }, timeoutMs);
  });

  // Whichever settles first wins; clearing the timer means a request that beat
  // the deadline is never aborted late, and no dangling timer leaks (§5).
  return Promise.race([run(controller.signal), deadline]).finally(() => {
    clearTimeout(timer);
  });
}
