/**
 * Manual "Retry" for photo rows the queue has parked or backed off.
 *
 * Resets exactly the queue columns (§3) and hands the row back to the worker —
 * nothing is deleted, and `photo_path` is never touched, so every reference to
 * the row (a report's grid, an inspection's `answers_json`, `Drivers.*_path`)
 * stays valid.
 *
 * A row whose local file is gone is reported back as `needReAdd` instead: there
 * is physically nothing to send, so re-queueing it would only burn attempts. The
 * driver has to supply a new photo (see `applyPhotoRepair`).
 */

import { db, photoUploadService } from "@/components/providers/SystemProvider";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

import { localPhotoExists } from "./localFile";
import type { PhotoQueueTableName } from "./types";

export type RequeueTarget = {
  id: string;
  /** `photo_path` / `storage_path` — the deterministic local copy's key. */
  bucketPath: string | null;
};

export type RequeueResult = {
  /** Rows handed back to the worker. */
  retried: number;
  /** Rows with no local file left — only a new photo can fix these. */
  needReAdd: number;
};

/** The queue columns a manual retry resets, and only those. */
const REQUEUED = {
  upload_status: "pending",
  attempts: 0,
  last_attempt_at: null,
  last_error: null,
} as const;

async function requeueOne(
  table: PhotoQueueTableName,
  id: string,
): Promise<void> {
  // Switched rather than parameterised so Kysely keeps checking each table's
  // columns against the generated schema.
  switch (table) {
    case "DamageReportPhotos":
      await executeTypedMutationVoid(
        db
          .updateTable("DamageReportPhotos")
          .set(REQUEUED)
          .where("id", "=", id)
          .compile(),
      );
      return;
    case "InspectionPhotos":
      await executeTypedMutationVoid(
        db
          .updateTable("InspectionPhotos")
          .set(REQUEUED)
          .where("id", "=", id)
          .compile(),
      );
      return;
    case "DriverDocuments":
      await executeTypedMutationVoid(
        db
          .updateTable("DriverDocuments")
          .set(REQUEUED)
          .where("id", "=", id)
          .compile(),
      );
      return;
  }
}

/**
 * Re-queues every target whose local file still exists, then kicks the worker
 * into its fast window — the driver just asked, so they are waiting (§6).
 */
export async function requeuePhotoRows(
  table: PhotoQueueTableName,
  targets: readonly RequeueTarget[],
): Promise<RequeueResult> {
  let retried = 0;
  let needReAdd = 0;

  for (const target of targets) {
    if (!target.bucketPath || !(await localPhotoExists(target.bucketPath))) {
      needReAdd += 1;
      continue;
    }
    await requeueOne(table, target.id);
    retried += 1;
  }

  if (retried > 0) {
    void photoUploadService?.triggerFast();
  }

  return { retried, needReAdd };
}
