/**
 * §3 — `upload_status` state machine.
 *
 * NOT IMPLEMENTED. See docs/custom-photo-upload-queue.en.md §3 and §5.
 * The bodies below are deliberately-wrong placeholders so the specification
 * tests fail as assertion diffs rather than import errors.
 */

import type { PhotoUploadRow, UploadEvent, UploadStatus } from "./types";

/** `uploaded` is the only terminal state — §3, §5 ("timeout ≠ stop trying"). */
export function isTerminalUploadStatus(status: UploadStatus): boolean {
  // TODO(photo-queue): implement — placeholder claims nothing is terminal.
  void status;
  return false;
}

/**
 * Pure transition. Once a row is `uploaded` it stays `uploaded` for every
 * event; `failed` and timeouts return the row to a retryable state.
 */
export function nextUploadStatus(
  current: UploadStatus,
  event: UploadEvent,
): UploadStatus {
  // TODO(photo-queue): implement — placeholder ignores both inputs.
  void current;
  void event;
  return "pending";
}

/**
 * Applies a transition plus the §3 bookkeeping columns (`attempts`,
 * `last_attempt_at`, `last_error`).
 *
 * Must return the SAME row identity: no row is ever deleted or archived as a
 * side effect, and `local_uri` / `gallery_asset_id` are never cleared — the
 * local original outlives the upload (§2, §3, §4).
 */
export function applyUploadEvent(
  row: PhotoUploadRow,
  event: UploadEvent,
  nowIso: string,
  errorMessage?: string,
): PhotoUploadRow {
  // TODO(photo-queue): implement — placeholder returns the row untouched.
  void event;
  void nowIso;
  void errorMessage;
  return row;
}
