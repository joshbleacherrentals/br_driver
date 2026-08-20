/**
 * §3 — `upload_status` state machine.
 *
 * Source of truth: docs/custom-photo-upload-queue.en.md §3 and §5.
 * The state vocabulary is exactly `pending`/`uploading`/`uploaded`/`failed` —
 * there is deliberately no archived/deleted state, because a stray "archive"
 * transition is what caused the permanent photo loss this queue exists to fix.
 */

import type { PhotoUploadRow, UploadEvent, UploadStatus } from "./types";

/** `uploaded` is the only terminal state — §3, §5 ("timeout ≠ stop trying"). */
export function isTerminalUploadStatus(status: UploadStatus): boolean {
  return status === "uploaded";
}

/**
 * Pure transition. Once a row is `uploaded` it stays `uploaded` for every
 * event; `failed` and timeouts return the row to a retryable state.
 */
export function nextUploadStatus(
  current: UploadStatus,
  event: UploadEvent,
): UploadStatus {
  // Terminal: a confirmed upload can never be undone by a later event (§3).
  if (isTerminalUploadStatus(current)) {
    return current;
  }

  switch (event) {
    // Retained as part of §3's vocabulary, but no longer applied by the queue:
    // the mid-attempt reservation moved into the service's in-memory claim
    // ledger (§10), so no `uploading` row is written any more. Rows already
    // stuck in that status on real devices are reclaimed by the §14 sweep,
    // which is the only reason the status still exists at all.
    case "attempt_started":
      return "uploading";
    case "upload_confirmed":
      return "uploaded";
    case "attempt_failed":
    case "attempt_timed_out":
      // §5 — a timeout is just another failed attempt, never a give-up.
      return "failed";
    // §5.1/§9 — nothing was learned, so nothing is claimed: a row that was
    // `pending` stays `pending`, one that was `failed` stays `failed`. Moving
    // it to `failed` would tell the driver about a failure the queue has no
    // evidence for.
    case "attempt_inconclusive":
      return current;
    case "retry_requested":
    // §12 — the sweep proved the local file is there after all, so the row is
    // retryable exactly as if the driver had asked for it themselves.
    case "local_file_recovered":
      return "pending";
  }
}

/**
 * Applies a transition plus the §3 bookkeeping columns (`attempts`,
 * `last_attempt_at`, `last_error`).
 *
 * Must return the SAME row identity: no row is ever deleted or archived as a
 * side effect, and `gallery_asset_id` is never cleared — the local original
 * outlives the upload (§2, §3, §4).
 */
export function applyUploadEvent(
  row: PhotoUploadRow,
  event: UploadEvent,
  nowIso: string,
  errorMessage?: string,
): PhotoUploadRow {
  const next: PhotoUploadRow = {
    ...row,
    upload_status: nextUploadStatus(row.upload_status, event),
  };

  switch (event) {
    case "attempt_started":
      next.last_attempt_at = nowIso;
      break;

    case "attempt_failed":
    case "attempt_timed_out":
      // §3 — `attempts` counts completed-but-unsuccessful attempts; it is the
      // sole input to the backoff schedule, so it increments here and nowhere
      // else. A timeout is one such attempt too.
      next.attempts = row.attempts + 1;
      next.last_attempt_at = nowIso;
      next.last_error =
        errorMessage ??
        (event === "attempt_timed_out" ? "Upload timed out" : row.last_error);
      break;

    case "upload_confirmed":
      // §10 — clear stale diagnostics once the object is safely in the bucket.
      next.last_attempt_at = nowIso;
      next.last_error = null;
      break;

    case "attempt_inconclusive":
      // §5.1/§9 — the timestamp, and only the timestamp. `attempts` is the sole
      // input to backoff and must count *completed-but-unsuccessful* attempts;
      // this attempt is neither. `last_error` is left exactly as it was, since
      // no error was established. Stamping the time is what keeps the row from
      // being re-claimed on the very next pass.
      next.last_attempt_at = nowIso;
      break;

    case "retry_requested":
      // A user-driven reset to `pending`; the next `attempt_started` stamps the
      // timing. `attempts` is preserved so backoff history is not lost.
      break;

    case "local_file_recovered":
      // §12 — un-parking is a correction of a stale diagnosis, not an attempt:
      // clearing `last_error` is what returns the row to the claim path. Timing
      // and `attempts` are deliberately untouched, so a healed row rejoins the
      // backoff schedule exactly where it left off instead of jumping the queue.
      next.last_error = null;
      break;
  }

  return next;
}
