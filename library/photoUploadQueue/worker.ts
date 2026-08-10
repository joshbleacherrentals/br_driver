/**
 * §10 — one active worker for the whole queue.
 *
 * NOT IMPLEMENTED. The placeholder is an inert worker that processes nothing.
 */

import type { PhotoUploadRow } from "./types";

export type UploadQueueWorkerDeps = {
  /**
   * Hands back the next row awaiting upload, or `null` once the queue is
   * drained. Never returns the same row to two concurrent runs.
   */
  claimNextPendingRow: () => Promise<PhotoUploadRow | null>;
  /** Uploads exactly one row. Must never be invoked in parallel with itself. */
  uploadRow: (row: PhotoUploadRow) => Promise<void>;
};

export type UploadQueueWorker = {
  /**
   * Kicks the queue. Safe to call concurrently and repeatedly: overlapping
   * calls join the single in-flight run instead of starting a second one
   * (§10 — "just an `isRunning` flag or a serialized promise chain").
   */
  trigger: () => Promise<void>;
  /** Whether a run is currently in progress. */
  readonly isRunning: boolean;
};

/**
 * Builds the single serialized queue worker. Multiple photos in one report are
 * processed sequentially by this same worker, not by parallel runs (§10).
 */
export function createUploadQueueWorker(
  deps: UploadQueueWorkerDeps,
): UploadQueueWorker {
  let running = false;
  let inFlight: Promise<void> | null = null;

  const drain = async (): Promise<void> => {
    try {
      for (;;) {
        const row = await deps.claimNextPendingRow();
        if (!row) {
          break;
        }
        try {
          await deps.uploadRow(row);
        } catch {
          // §5/§6 — attempts never truly end, so a single failing row must not
          // wedge the queue and strand every photo behind it. The row keeps its
          // retryable status (set by the caller) and is picked up on a later
          // pass; here we just move on to the next one.
        }
      }
    } finally {
      running = false;
      inFlight = null;
    }
  };

  return {
    trigger(): Promise<void> {
      // Overlapping triggers join the single in-flight run instead of starting
      // a second one — the serialized worker §10 requires.
      if (!running) {
        running = true;
        inFlight = drain();
      }
      return inFlight ?? Promise.resolve();
    },
    get isRunning(): boolean {
      return running;
    },
  };
}
