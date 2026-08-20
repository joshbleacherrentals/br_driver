/**
 * One logging tag for the whole upload queue (§12/§13).
 *
 * Wraps `DebugLogger` — which already mirrors every entry to `console` — so the
 * retry cycle is observable in the Metro / Xcode console during manual testing,
 * *and* ends up in the in-app copyable log a driver can send from the field.
 *
 * Every line comes out prefixed `[PhotoQueue]`, so the whole cycle can be
 * followed with a single filter and nothing else has to agree on a string.
 */

import { DebugLogger } from "@/library/debug/DebugLogger";

export const PHOTO_QUEUE_LOG_TAG = "PhotoQueue";

export const photoQueueLog = {
  info: (message: string, data?: unknown) =>
    DebugLogger.info(PHOTO_QUEUE_LOG_TAG, message, data),
  warn: (message: string, data?: unknown) =>
    DebugLogger.warn(PHOTO_QUEUE_LOG_TAG, message, data),
  /**
   * Reserved for the cases where the queue's own last-resort guard failed —
   * e.g. the guaranteed-failed fallback write in `persistUploadEvent.ts` could
   * not land either, leaving a row stuck `uploading` until the staleness sweep
   * reclaims it (§14). Everything recoverable stays at `warn`.
   */
  error: (message: string, data?: unknown) =>
    DebugLogger.error(PHOTO_QUEUE_LOG_TAG, message, data),
};
