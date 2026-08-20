/**
 * The one place that writes `PhotoUploadStatus` — the device-local table the §3
 * bookkeeping columns moved to (see `library/powersync/AppSchema.ts`).
 *
 * THE INVARIANT EVERYTHING HERE RESTS ON
 * **A missing status row IS the fresh state**: `pending`, zero attempts, never
 * attempted, no error. Every read coalesces to exactly that
 * (`tableAdapters.ts`), so no insert path has to remember to seed a row, and an
 * upgrade from the old schema — where the local table starts empty — reads as
 * "every photo is pending" rather than "every photo is in an unknown state".
 *
 * Two consequences follow, and they are why this module has the shape it does:
 *
 * - {@link replacePhotoUploadStatusWrites} is a DELETE followed by an INSERT
 *   rather than an upsert. It is only ever handed a *complete* row, so there is
 *   nothing to merge; and `ON CONFLICT`/`INSERT OR REPLACE` would be resolved
 *   against a PowerSync *view* (local-only tables are views over
 *   `ps_data_local__…` with INSTEAD OF triggers), where conflict handling
 *   depends on the outer clause propagating into the trigger body. Delete-then-
 *   insert needs no such guarantee and behaves identically on a plain table.
 * - {@link patchPhotoUploadStatusWrite} is a bare UPDATE with no insert
 *   fallback. Its two callers (manual Retry, photo repair) reset a row to
 *   exactly the fresh state — so when there is no row to update, the row is
 *   already in the state being asked for and the no-op is the correct outcome.
 *
 * Statements are returned compiled rather than executed, because several callers
 * must run them inside a transaction they already own (`applyPhotoRepair`).
 */

import type { CompiledQuery } from "kysely";

import { db } from "@/library/powersync/db";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

import type { PhotoUploadRow } from "../types";

/** The queue columns a manual reset writes; deliberately not the whole row. */
export type PhotoUploadStatusPatch = {
  upload_status: string;
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
};

/**
 * Statements that make `row.id`'s bookkeeping exactly `row`'s.
 *
 * The DELETE is a no-op the first time a photo is ever persisted, which is the
 * common case: rows are not seeded when the photo is created.
 */
export function replacePhotoUploadStatusWrites(
  row: PhotoUploadRow,
): CompiledQuery<unknown>[] {
  return [
    db.deleteFrom("PhotoUploadStatus").where("id", "=", row.id).compile(),
    db
      .insertInto("PhotoUploadStatus")
      .values({
        id: row.id,
        upload_status: row.upload_status,
        gallery_asset_id: row.gallery_asset_id,
        attempts: row.attempts,
        last_attempt_at: row.last_attempt_at,
        last_error: row.last_error,
      })
      .compile(),
  ];
}

/** Applies `patch` to an existing status row, leaving any other column alone. */
export function patchPhotoUploadStatusWrite(
  id: string,
  patch: PhotoUploadStatusPatch,
): CompiledQuery<unknown> {
  return db
    .updateTable("PhotoUploadStatus")
    .set(patch)
    .where("id", "=", id)
    .compile();
}

/**
 * Drops the bookkeeping for photo rows that no longer exist.
 *
 * Only `applyPhotoRepair` deletes photo rows (§3's single exception), and the
 * status row has to go with them: ids are not reused, so a left-behind row would
 * be unreachable forever.
 */
export function forgetPhotoUploadStatusWrite(
  ids: readonly string[],
): CompiledQuery<unknown> {
  return db
    .deleteFrom("PhotoUploadStatus")
    .where("id", "in", [...ids])
    .compile();
}

/**
 * Runs {@link replacePhotoUploadStatusWrites} for callers with no transaction of
 * their own — the queue's `persist`, on every attempt.
 *
 * Deliberately NOT wrapped in a write transaction. The queue persists once per
 * photo per attempt, and a transaction here would take the write lock a second
 * time on the hottest path in the drain this whole change exists to speed up.
 * The only interruptible window it buys is between the DELETE and the INSERT,
 * and losing that race leaves the row with no bookkeeping — which reads as
 * "pending, never attempted", so the photo is re-attempted rather than lost.
 * That is the same direction every other default here fails in.
 */
export async function replacePhotoUploadStatus(
  row: PhotoUploadRow,
): Promise<void> {
  for (const statement of replacePhotoUploadStatusWrites(row)) {
    await executeTypedMutationVoid(statement);
  }
}
