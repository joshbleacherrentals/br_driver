/**
 * §12 — un-parking rows whose local file turned out to be there after all.
 *
 * A row parked with {@link MISSING_LOCAL_FILE_ERROR} is invisible to
 * `claimNext`, by design: the worker must not burn passes on a file that isn't
 * coming back. The cost of that design is that a row parked on a *wrong*
 * verdict — as happened while the queue still trusted a stored `local_uri`
 * absolute path across an iOS container rotation — used to stay parked forever,
 * fixable only by the driver manually re-adding the photo.
 *
 * This sweep is the correction. It re-asks the one question parking was based
 * on, using the same deterministic, live-recomputed check `uploadRow` itself
 * uses (`localPhotoExists`), and hands any row that passes back to the queue via
 * `local_file_recovered`. It is deliberately cheap enough to run at the head of
 * every pass, forever:
 *   - a table with nothing parked costs one `countParked()` and no file I/O;
 *   - a genuinely-missing row costs exactly one local `getInfoAsync` per pass;
 *   - nothing here ever touches the network, so it works identically offline.
 */

import { MISSING_LOCAL_FILE_ERROR, type PhotoUploadRow } from "../types";
import { applyUploadEvent } from "../uploadStatus";
import { localPhotoExists } from "./localFile";
import { photoQueueLog } from "./photoQueueLog";
import type { PhotoQueueTableAdapter, PhotoQueueTableName } from "./types";

/**
 * Ceiling on rows examined per table, per pass. Mirrors the §6.2 verification
 * ceiling (`VERIFY_LIMIT_PER_TABLE` in `foregroundRecovery.ts`) — a sweep, not
 * a crawl. A backlog larger than this drains over consecutive passes, which is
 * exactly what the indefinite reschedule (§12) guarantees will happen.
 */
export const SWEEP_LIMIT_PER_TABLE = 50;

export type ParkedRowSweepTableResult = {
  table: PhotoQueueTableName;
  /** Rows un-parked this pass — back to `pending`, `last_error` cleared. */
  healed: number;
  /** Rows re-checked and still genuinely missing their local file. */
  stillParked: number;
};

export type ParkedRowSweepResult = {
  healed: number;
  stillParked: number;
  /** Only tables that actually had parked rows this pass. */
  perTable: ParkedRowSweepTableResult[];
};

/**
 * Re-examines every currently-parked row across the given adapters and heals
 * the ones whose file is present. Never throws: a table that cannot be read
 * this pass is simply skipped and re-tried on the next one.
 */
export async function sweepParkedRows(
  adapters: readonly PhotoQueueTableAdapter[],
): Promise<ParkedRowSweepResult> {
  const perTable: ParkedRowSweepTableResult[] = [];
  let healed = 0;
  let stillParked = 0;

  for (const adapter of adapters) {
    const result = await sweepTable(adapter);
    if (result.healed === 0 && result.stillParked === 0) {
      continue;
    }
    perTable.push({ table: adapter.table, ...result });
    healed += result.healed;
    stillParked += result.stillParked;
  }

  return { healed, stillParked, perTable };
}

async function sweepTable(
  adapter: PhotoQueueTableAdapter,
): Promise<{ healed: number; stillParked: number }> {
  // Cheap gate first: the overwhelmingly common case is nothing parked at all,
  // and it must cost one COUNT and zero filesystem calls.
  let parkedCount: number;
  try {
    parkedCount = await adapter.countParked();
  } catch (error) {
    photoQueueLog.warn(`sweep: ${adapter.table} count failed`, error);
    return { healed: 0, stillParked: 0 };
  }
  if (parkedCount === 0) {
    return { healed: 0, stillParked: 0 };
  }

  let rows: PhotoUploadRow[];
  try {
    rows = await adapter.listUnresolved(SWEEP_LIMIT_PER_TABLE);
  } catch (error) {
    photoQueueLog.warn(`sweep: ${adapter.table} list failed`, error);
    return { healed: 0, stillParked: 0 };
  }

  let healed = 0;
  let stillParked = 0;

  // `listUnresolved` deliberately includes non-parked rows (§6.2 uses it too);
  // only the parked ones are this sweep's business.
  for (const row of rows.filter(isParked)) {
    if (!row.photo_path) {
      stillParked += 1;
      continue;
    }

    let exists: boolean;
    try {
      exists = await localPhotoExists(row.photo_path);
    } catch {
      // A failed filesystem probe is not evidence the file is back. Leave the
      // row exactly as it is and ask again next pass.
      stillParked += 1;
      continue;
    }

    if (!exists) {
      stillParked += 1;
      continue;
    }

    try {
      await adapter.persist(
        applyUploadEvent(row, "local_file_recovered", new Date().toISOString()),
      );
      healed += 1;
      photoQueueLog.info(
        `sweep: healed ${adapter.table} ${row.id} — local file present, un-parked`,
        { photo_path: row.photo_path, attempts: row.attempts },
      );
    } catch (error) {
      // The row stays parked; the next pass tries the write again.
      stillParked += 1;
      photoQueueLog.warn(
        `sweep: heal write failed for ${adapter.table} ${row.id}`,
        error,
      );
    }
  }

  return { healed, stillParked };
}

function isParked(row: PhotoUploadRow): boolean {
  return row.last_error === MISSING_LOCAL_FILE_ERROR;
}
