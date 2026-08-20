/**
 * §14 — reclaiming rows stranded in `upload_status = 'uploading'`.
 *
 * `uploading` means "an attempt is happening right now". Nothing else in the
 * queue looks at it: `UNRESOLVED_STATUSES` in `tableAdapters.ts` is
 * `['pending','failed']`, so `claimNext`, `countUnresolved`, `countActionable`,
 * `countParked` and `listUnresolved` all skip an `uploading` row — and so does
 * the driver-facing banner query in `usePhotoUploadOverlay.ts`. That is correct
 * while the attempt really is in flight, and catastrophic once it isn't: a row
 * whose process died mid-attempt (app killed, or the terminal write itself
 * failing) stays `uploading` forever, unclaimable and unmentioned. Rows two
 * days stale were observed on a real device.
 *
 * This sweep is the backstop for that, layered *under* the persist-retry and
 * guaranteed-failed fallback in `persistUploadEvent.ts`: those two stop the
 * problem being created, this one clears whatever slipped through anyway
 * (including everything created before §14 shipped).
 *
 * Two deliberate choices:
 *   - **Reuses `attempt_timed_out`, no new event.** That event already means
 *     precisely "a real attempt happened, its outcome is unknown, treat it as
 *     failed and retryable, and count it against backoff" — which is exactly
 *     the situation. (Contrast `local_file_recovered`, which needed its own
 *     event because its semantics genuinely differ: it is a correction of a bad
 *     diagnosis and must *not* spend an attempt.)
 *   - **Never reclaims a row this process is actively uploading.** The service
 *     tracks its own in-flight rows and passes that lookup in; a long upload on
 *     a slow connection must not be yanked out from under itself, however stale
 *     its `last_attempt_at` looks.
 *
 * Like the §12 parked sweep it never throws: a table that errors is skipped and
 * retried next pass.
 */

import type { PhotoUploadRow } from "../types";
import { applyUploadEvent } from "../uploadStatus";
import { UPLOAD_TIMEOUT_MS } from "../uploadTimeout";
import { persistWithRetry } from "./persistWithRetry";
import { photoQueueLog } from "./photoQueueLog";
import type { PhotoQueueTableAdapter, PhotoQueueTableName } from "./types";

/**
 * How stale an `uploading` row must be before it is assumed abandoned.
 *
 * Three times the §5 per-request deadline. One times it would race the very
 * attempt it is meant to protect (clock skew, a persist that lands late, a
 * request that finishes just past the deadline); much more than three would
 * leave genuinely-stuck rows invisible to the driver for longer than necessary.
 * At ~105s it is comfortably past any attempt that is still legitimately alive,
 * while still resolving well inside a single foreground session.
 */
export const STALE_UPLOADING_THRESHOLD_MS = 3 * UPLOAD_TIMEOUT_MS;

/** `last_error` written on a reclaimed row, distinct from a real attempt error. */
export const STALE_UPLOADING_ERROR =
  "Upload interrupted (stale uploading row reclaimed)";

/** Ceiling on rows reclaimed per table per pass — mirrors §12's sweep limit. */
export const STALE_SWEEP_LIMIT_PER_TABLE = 50;

export type StaleUploadingSweepTableResult = {
  table: PhotoQueueTableName;
  /** Rows moved out of `uploading` and back into the retryable population. */
  reclaimed: number;
  /** Stale-looking rows left alone because this process is still uploading them. */
  skippedInFlight: number;
};

export type StaleUploadingSweepResult = {
  reclaimed: number;
  skippedInFlight: number;
  /** Only tables that actually had a stale `uploading` row this pass. */
  perTable: StaleUploadingSweepTableResult[];
};

export type StaleUploadingSweepOptions = {
  nowMs?: number;
  thresholdMs?: number;
  /**
   * Never reclaim a row this process's own worker currently has reserved and
   * in-flight, no matter how stale it looks (`isRowInFlight` in
   * `photoUploadService.ts`).
   */
  isInFlight?: (table: string, rowId: string) => boolean;
};

export async function sweepStaleUploadingRows(
  adapters: readonly PhotoQueueTableAdapter[],
  options: StaleUploadingSweepOptions = {},
): Promise<StaleUploadingSweepResult> {
  const nowMs = options.nowMs ?? Date.now();
  const thresholdMs = options.thresholdMs ?? STALE_UPLOADING_THRESHOLD_MS;
  const beforeIso = new Date(nowMs - thresholdMs).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const perTable: StaleUploadingSweepTableResult[] = [];
  let reclaimed = 0;
  let skippedInFlight = 0;

  for (const adapter of adapters) {
    const result = await sweepTable(adapter, beforeIso, nowIso, options.isInFlight);
    if (result.reclaimed === 0 && result.skippedInFlight === 0) {
      continue;
    }
    perTable.push({ table: adapter.table, ...result });
    reclaimed += result.reclaimed;
    skippedInFlight += result.skippedInFlight;
  }

  return { reclaimed, skippedInFlight, perTable };
}

async function sweepTable(
  adapter: PhotoQueueTableAdapter,
  beforeIso: string,
  nowIso: string,
  isInFlight: StaleUploadingSweepOptions["isInFlight"],
): Promise<{ reclaimed: number; skippedInFlight: number }> {
  // No cheap count gate here, unlike the §12 sweep: the WHERE clause is already
  // maximally selective (one status, one timestamp bound) and LIMITed, so a
  // single query per table per pass — almost always returning zero rows — is
  // cheaper than a count plus a query.
  let rows: PhotoUploadRow[];
  try {
    rows = await adapter.listStaleUploading(beforeIso, STALE_SWEEP_LIMIT_PER_TABLE);
  } catch (error) {
    photoQueueLog.warn(`stale-sweep: ${adapter.table} list failed`, error);
    return { reclaimed: 0, skippedInFlight: 0 };
  }

  let reclaimed = 0;
  let skippedInFlight = 0;

  for (const row of rows) {
    if (isInFlight?.(adapter.table, row.id)) {
      skippedInFlight += 1;
      continue;
    }

    try {
      await persistWithRetry(
        () =>
          adapter.persist(
            applyUploadEvent(row, "attempt_timed_out", nowIso, STALE_UPLOADING_ERROR),
          ),
        { label: `stale-sweep ${adapter.table} ${row.id}` },
      );
      reclaimed += 1;
      photoQueueLog.warn(
        `stale-sweep: reclaimed ${adapter.table} ${row.id} — stuck 'uploading' ` +
          `since ${row.last_attempt_at ?? "never"}, back to failed/retryable`,
        { photo_path: row.photo_path, attempts: row.attempts },
      );
    } catch (error) {
      // The row stays `uploading`; the next pass tries the write again.
      photoQueueLog.warn(
        `stale-sweep: reclaim write failed for ${adapter.table} ${row.id}`,
        error,
      );
    }
  }

  return { reclaimed, skippedInFlight };
}
