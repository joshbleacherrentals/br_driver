/**
 * §14 — second layer of the "a write must not silently vanish" defence.
 *
 * {@link persistWithRetry} handles the transient case. This module handles what
 * is left: the write that still will not land after every retry, at the exact
 * moment a row is mid-attempt and therefore sitting in `uploading`.
 *
 * `uploading` is the one status nothing can reclaim on its own — it is not an
 * unresolved status, so `claimNext` skips it, the counts skip it, and the
 * driver-facing banner query skips it. A row left there is stuck and silent.
 * So when a terminal persist fails for good, we take one more shot at the only
 * outcome that is always safe to record: mark the attempt *failed*. `failed` is
 * retryable, countable, and visible — strictly better than the truth being
 * lost, even when the specific event we wanted to record was `upload_confirmed`
 * (a wrongly-`failed` row costs one redundant attempt that the §5.1
 * verification then resolves; a stuck `uploading` row costs a lost photo).
 *
 * If even that fallback cannot be written, there is nothing further this layer
 * can do: it logs at `error` and returns, and the staleness sweep
 * (`staleUploadingSweep.ts`) picks the row up later as the final backstop.
 */

import type { PhotoUploadRow, UploadEvent } from "../types";
import { applyUploadEvent } from "../uploadStatus";
import { persistWithRetry } from "./persistWithRetry";
import { photoQueueLog } from "./photoQueueLog";
import type { PhotoQueueTableAdapter } from "./types";

/** `last_error` recorded when the real outcome could not be persisted at all. */
export const PERSIST_FALLBACK_ERROR =
  "Upload attempt result could not be saved after retries";

export type PersistUploadEventOptions = {
  /** Human-readable identifier for the logs, e.g. `DamageReportPhotos 42`. */
  label: string;
  /**
   * When true, an exhausted retry budget falls back to writing `attempt_failed`
   * rather than throwing. Every terminal write in `uploadRow` sets this: the
   * row is `uploading` at that point, so leaving it is the one unacceptable
   * outcome. Callers writing a row that is *not* mid-attempt pass false and
   * handle the throw themselves.
   */
  guaranteedFailedFallback: boolean;
};

/**
 * Applies `event` to `row` and persists it, with retries and — when asked — a
 * guaranteed `failed` fallback. With `guaranteedFailedFallback: true` this
 * never throws, so callers need no try/catch of their own.
 */
export async function persistUploadEvent(
  adapter: PhotoQueueTableAdapter,
  row: PhotoUploadRow,
  event: UploadEvent,
  nowIso: string,
  errorMessage: string | undefined,
  opts: PersistUploadEventOptions,
): Promise<void> {
  const nextRow = applyUploadEvent(row, event, nowIso, errorMessage);

  try {
    await persistWithRetry(() => adapter.persist(nextRow), {
      label: `${opts.label} persist(${event})`,
    });
    return;
  } catch (error) {
    photoQueueLog.warn(
      `persist retries exhausted: ${opts.label} (${event})`,
      error,
    );
    if (!opts.guaranteedFailedFallback) throw error;
  }

  try {
    const fallbackRow = applyUploadEvent(
      row,
      "attempt_failed",
      nowIso,
      PERSIST_FALLBACK_ERROR,
    );
    await adapter.persist(fallbackRow);
    photoQueueLog.warn(`guaranteed-failed fallback applied: ${opts.label}`);
  } catch (fallbackError) {
    photoQueueLog.error(
      `guaranteed-failed fallback ALSO failed: ${opts.label} — row may remain ` +
        `stuck in 'uploading' until the staleness sweep reclaims it`,
      fallbackError,
    );
  }
}
