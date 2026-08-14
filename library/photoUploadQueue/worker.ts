/**
 * §10 — one worker for the whole queue, with bounded concurrency.
 *
 * There is still exactly one run at a time (overlapping `trigger()` calls join
 * the single in-flight run), and still exactly one gatekeeper deciding who gets
 * a row. What changed is that the run drains through a small pool of lanes
 * instead of a single cursor, so a report's photos travel together rather than
 * queueing behind each other's timeout budget.
 */

import type { PhotoUploadRow } from "./types";

/**
 * How many uploads may be in flight at once.
 *
 * Three, because a typical damage report has ~3 photos: the goal is a full
 * report's photos uploading roughly together, not trickling in behind each
 * other's ~35s timeout budget. It is deliberately global (not per table): the
 * limit exists to bound concurrent network + memory use on a phone, and that
 * cost does not care which table a row came from.
 */
export const MAX_CONCURRENT_UPLOADS = 3;

export type UploadQueueWorkerDeps<TItem = PhotoUploadRow> = {
  /**
   * Hands back the next item awaiting upload, or `null` once the queue is
   * drained. MUST be claim-exclusive: it is called concurrently by every lane,
   * and no item may ever be handed to two of them (the service serializes
   * claim-and-reserve behind a lock to guarantee exactly that).
   */
  claimNextPendingRow: () => Promise<TItem | null>;
  /**
   * Uploads exactly one claimed item. Called concurrently with itself, up to
   * {@link MAX_CONCURRENT_UPLOADS} times — but never twice for the same item,
   * because a claimed item is reserved before it is handed out.
   */
  uploadRow: (item: TItem) => Promise<void>;
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
 * Builds the queue worker. Multiple photos in one report are processed by this
 * same single run — up to {@link MAX_CONCURRENT_UPLOADS} at a time — never by
 * parallel independent runs (§10).
 */
export function createUploadQueueWorker<TItem = PhotoUploadRow>(
  deps: UploadQueueWorkerDeps<TItem>,
): UploadQueueWorker {
  let running = false;
  let inFlight: Promise<void> | null = null;

  /**
   * One lane of the pool: claim → upload → repeat until the queue hands back
   * nothing. Lanes are independent, which is the whole point — a slow or stuck
   * row occupies its own lane and the others keep claiming past it.
   */
  const runLane = async (): Promise<void> => {
    for (;;) {
      const item = await deps.claimNextPendingRow();
      if (!item) {
        break;
      }
      try {
        await deps.uploadRow(item);
      } catch {
        // §5/§6 — attempts never truly end, so a single failing row must not
        // wedge its lane and strand every photo behind it. The row keeps its
        // retryable status (set by the caller) and is picked up on a later
        // pass; here we just move on to the next one.
        //
        // Every persist inside `uploadRow` is self-guarding (§14), so this
        // should now catch approximately nothing — it stays as the last-resort
        // net that keeps an unforeseen throw from killing a lane.
      }
    }
  };

  const drain = async (): Promise<void> => {
    try {
      // A sliding window, not batches: each lane claims again the moment it is
      // free, so the pool stays full until the queue is genuinely empty.
      await Promise.allSettled(
        Array.from({ length: MAX_CONCURRENT_UPLOADS }, () => runLane()),
      );
    } finally {
      running = false;
      inFlight = null;
    }
  };

  return {
    trigger(): Promise<void> {
      // Overlapping triggers join the single in-flight run instead of starting
      // a second one — the serialized run §10 requires. Exclusivity between the
      // lanes of that run comes from claim reservation, not from running one
      // row at a time.
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
