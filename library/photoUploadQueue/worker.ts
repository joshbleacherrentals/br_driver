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
  // TODO(photo-queue): implement — placeholder never touches the queue.
  void deps;
  return {
    trigger: async () => {},
    get isRunning() {
      return false;
    },
  };
}
