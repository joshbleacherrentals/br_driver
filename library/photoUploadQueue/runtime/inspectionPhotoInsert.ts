/**
 * The one way this app creates an `InspectionPhotos` row — a photo taken during
 * an inspection, or an extra added by a repair.
 *
 * A new row enters the custom upload queue as `pending` with no attempts, and
 * needs a `created_at`: the queue orders its claims by it
 * (`runtime/tableAdapters.ts`), so a row without one has no position at all.
 *
 * `created_by_driver_uuid` is the photo's sync key and its queue ownership
 * (docs/specs/sync-bucket-limit.md §4). It is null only if the driver scope
 * isn't published yet; Postgres fills it from the trip in that case.
 */

import { db } from "@/library/powersync/db";
import { getDriverScope } from "@/library/powersync/scoping/driverScope";

export function inspectionPhotoInsert(row: {
  id: string;
  inspectionUuid: string;
  storagePath: string;
  createdAt: string;
}) {
  return db
    .insertInto("InspectionPhotos")
    .values({
      id: row.id,
      inspection_uuid: row.inspectionUuid,
      storage_path: row.storagePath,
      created_by_driver_uuid: getDriverScope()?.driverUuid ?? null,
      upload_status: "pending",
      attempts: 0,
      created_at: row.createdAt,
    })
    .compile();
}
