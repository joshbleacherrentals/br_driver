/**
 * §14 — first layer of the "a write must not silently vanish" defence.
 *
 * Every queue state change is a local SQLite write through the typed Kysely
 * wrappers. Those writes are normally instant, but they are not guaranteed: the
 * same database is being written by PowerSync's own sync/crud machinery, and a
 * transient busy/locked error is entirely possible. Before §14 a single such
 * failure was terminal for that row's bookkeeping — the terminal `persist()`
 * inside `uploadRow` threw, the worker's bare `catch {}` swallowed it, and the
 * row was left in `uploading` forever: unclaimable, uncounted, and invisible to
 * the driver-facing banner.
 *
 * This helper is the cheap fix for the common case: try the write again, a
 * couple of times, a moment apart.
 *
 * DELIBERATELY NOT ERROR-CLASSIFIED. There is no "is this SQLITE_BUSY?" check
 * here, and adding one would be a mistake: the project runs op-sqlite natively
 * and the sql.js WASM adapter in dev/Expo Go, and the two surface errors in
 * different shapes, through a driver stack that is free to change them. A
 * brittle substring match would fail open in exactly the situation it exists
 * for. Retrying a genuinely non-transient error three times instead costs under
 * half a second and then rethrows, which the caller already handles.
 */

import { photoQueueLog } from "./photoQueueLog";

/** Total attempts, including the first. */
export const PERSIST_RETRY_ATTEMPTS = 3;
/** Pause before attempt 2, then before attempt 3. */
export const PERSIST_RETRY_DELAYS_MS = [100, 300];

export type PersistRetryOptions = {
  /** Human-readable identifier for the logs, e.g. `claim DriverDocuments 42`. */
  label: string;
  attempts?: number;
  delaysMs?: number[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn`, retrying any failure up to {@link PERSIST_RETRY_ATTEMPTS} times.
 * Resolves with the first successful result; rethrows the last error once the
 * attempts are exhausted.
 */
export async function persistWithRetry<T>(
  fn: () => Promise<T>,
  opts: PersistRetryOptions,
): Promise<T> {
  const attempts = opts.attempts ?? PERSIST_RETRY_ATTEMPTS;
  const delays = opts.delaysMs ?? PERSIST_RETRY_DELAYS_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      photoQueueLog.warn(
        `persist retry ${attempt}/${attempts} failed: ${opts.label}`,
        error,
      );
      if (attempt < attempts) {
        await sleep(delays[Math.min(attempt - 1, delays.length - 1)]);
      }
    }
  }

  throw lastError;
}
