/**
 * §14 — second layer of the "a write must not silently vanish" defence.
 *
 * {@link persistWithRetry} handles the transient case. This module handles what
 * is left: the write that still will not land after every retry, at the exact
 * moment a row is mid-attempt and therefore sitting in `uploading`.
 *
 * A lost terminal write loses the *record* of the attempt: the row keeps
 * whatever `attempts` and `last_error` it had before, so a success is forgotten
 * and a failure is not counted against backoff. So when a terminal persist
 * fails for good, we take one more shot at the only outcome that is always safe
 * to record: mark the attempt *failed*. `failed` is retryable, countable, and
 * visible — strictly better than the truth being lost, even when the specific
 * event we wanted to record was `upload_confirmed` (a wrongly-`failed` row
 * costs one redundant attempt that the §5.1 verification then resolves).
 *
 * If even that fallback cannot be written, there is nothing further this layer
 * can do: it logs at `error` and reports `false` to the caller, which then
 * keeps its in-memory claim on the row so the unrecordable attempt cannot be
 * repeated in a loop.
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
   * rather than throwing. Every terminal write in `uploadRow` sets this: an
   * attempt whose result vanishes is the one unacceptable outcome. Callers
   * writing a row that is *not* mid-attempt pass false and handle the throw
   * themselves.
   */
  guaranteedFailedFallback: boolean;
};

/**
 * Applies `event` to `row` and persists it, with retries and — when asked — a
 * guaranteed `failed` fallback. With `guaranteedFailedFallback: true` this
 * never throws, so callers need no try/catch of their own.
 *
 * Returns whether *some* outcome reached the database: `true` for the real
 * event or for the fallback, `false` only when both are unwritable. The caller
 * needs that answer because the claim reservation is now held in memory
 * (`photoUploadService.ts`) — a row whose outcome could not be recorded is
 * unchanged in the database and would otherwise be re-claimed immediately, so
 * the service keeps its reservation instead of releasing it.
 */
export async function persistUploadEvent(
  adapter: PhotoQueueTableAdapter,
  row: PhotoUploadRow,
  event: UploadEvent,
  nowIso: string,
  errorMessage: string | undefined,
  opts: PersistUploadEventOptions,
): Promise<boolean> {
  const nextRow = applyUploadEvent(row, event, nowIso, errorMessage);

  try {
    await persistWithRetry(() => adapter.persist(nextRow), {
      label: `${opts.label} persist(${event})`,
    });
    return true;
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
    return true;
  } catch (fallbackError) {
    photoQueueLog.error(
      `guaranteed-failed fallback ALSO failed: ${opts.label} — the row is ` +
        `unchanged in the database; the caller holds its claim for the rest ` +
        `of the session so it cannot be re-attempted in a loop`,
      fallbackError,
    );
    return false;
  }
}
