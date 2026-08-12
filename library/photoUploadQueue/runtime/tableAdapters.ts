/**
 * Typed table adapters for the three photo-bearing tables.
 *
 * Each adapter reads/writes the §3 queue columns through the Kysely-typed
 * wrappers — no raw SQL, no PowerSync `@powersync/attachments` recompute. The
 * tables differ only in the bucket-path column (`photo_path` vs InspectionPhotos'
 * `storage_path`); everything else is shared through the helpers below.
 */

import { db } from "@/components/providers/SystemProvider";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

import { isDueForFastRetry, isDueForRetry } from "../backoff";
import type { PhotoUploadRow, UploadStatus } from "../types";
import type { PhotoQueueMode, PhotoQueueTableAdapter } from "./types";

/** Statuses the queue still owns work for. `uploaded` is terminal (§3). */
const UNRESOLVED_STATUSES: UploadStatus[] = ["pending", "failed"];
/** How many candidates to pull per claim before filtering for eligibility. */
const CLAIM_BATCH = 25;

/**
 * `last_error` sentinel meaning the local file is gone: the background worker
 * physically cannot upload it, so it is *parked* — excluded from claims and from
 * the "actionable" count — until the user re-adds the photo (which clears this
 * and re-queues the row, §6). It still counts as unresolved for the banner.
 */
export const MISSING_LOCAL_FILE_ERROR = "LOCAL_FILE_MISSING";

/**
 * Shared columns every photo table carries under the queue design (§3). The
 * PowerSync/Kysely types make every column nullable regardless of the Postgres
 * NOT NULL constraints, so the mapping coalesces to the queue's non-null shape.
 */
type RawQueueRow = {
  id: string;
  upload_status: string | null;
  local_uri: string | null;
  gallery_asset_id: string | null;
  attempts: number | null;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string | null;
};

function toPhotoUploadRow(
  base: RawQueueRow,
  photoPath: string | null,
): PhotoUploadRow {
  return {
    id: base.id,
    photo_path: photoPath ?? "",
    upload_status: (base.upload_status ?? "pending") as UploadStatus,
    local_uri: base.local_uri,
    gallery_asset_id: base.gallery_asset_id,
    attempts: base.attempts ?? 0,
    last_attempt_at: base.last_attempt_at,
    last_error: base.last_error,
  };
}

/** The subset of columns the queue ever writes back (never the path/identity). */
function queueUpdateSet(row: PhotoUploadRow) {
  return {
    upload_status: row.upload_status,
    local_uri: row.local_uri,
    gallery_asset_id: row.gallery_asset_id,
    attempts: row.attempts,
    last_attempt_at: row.last_attempt_at,
    last_error: row.last_error,
  };
}

/**
 * First eligible row under the mode. `fast` uses a short cooldown so a failing
 * row can neither hot-loop nor starve the rest; `backoff` uses the §6 schedule.
 * Parked (missing-file) rows are never eligible.
 */
function firstEligible<
  T extends {
    attempts: number | null;
    last_attempt_at: string | null;
    last_error: string | null;
  },
>(rows: T[], mode: PhotoQueueMode, nowMs: number): T | null {
  for (const row of rows) {
    if (row.last_error === MISSING_LOCAL_FILE_ERROR) continue;
    const eligible =
      mode === "fast"
        ? isDueForFastRetry({ last_attempt_at: row.last_attempt_at }, nowMs)
        : isDueForRetry(
            {
              attempts: row.attempts ?? 0,
              last_attempt_at: row.last_attempt_at,
            },
            nowMs,
          );
    if (eligible) return row;
  }
  return null;
}

// ── DamageReportPhotos (bucket path column: photo_path) ─────────────────────

const damageReportPhotosAdapter: PhotoQueueTableAdapter = {
  table: "DamageReportPhotos",
  bucket: "damage-report-photos",
  upsert: false,

  async claimNext(mode, nowMs) {
    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select([
        "id",
        "photo_path",
        "upload_status",
        "local_uri",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) =>
        eb.or([
          eb("last_error", "is", null),
          eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
        ]),
      )
      .orderBy("created_at", "asc")
      .limit(CLAIM_BATCH)
      .execute();

    const row = firstEligible(rows, mode, nowMs);
    return row ? toPhotoUploadRow(row, row.photo_path) : null;
  },

  async persist(row) {
    await executeTypedMutationVoid(
      db
        .updateTable("DamageReportPhotos")
        .set(queueUpdateSet(row))
        .where("id", "=", row.id)
        .compile(),
    );
  },

  async countUnresolved() {
    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .execute();
    return rows.length;
  },

  async countActionable() {
    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) =>
        eb.or([
          eb("last_error", "is", null),
          eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
        ]),
      )
      .execute();
    return rows.length;
  },

  async listUnresolved(limit) {
    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select([
        "id",
        "photo_path",
        "upload_status",
        "local_uri",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => toPhotoUploadRow(row, row.photo_path));
  },
};

// ── InspectionPhotos (bucket path column: storage_path) ─────────────────────

const inspectionPhotosAdapter: PhotoQueueTableAdapter = {
  table: "InspectionPhotos",
  bucket: "inspection-photos",
  upsert: true,

  async claimNext(mode, nowMs) {
    const rows = await db
      .selectFrom("InspectionPhotos")
      .select([
        "id",
        "storage_path",
        "upload_status",
        "local_uri",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) =>
        eb.or([
          eb("last_error", "is", null),
          eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
        ]),
      )
      .orderBy("created_at", "asc")
      .limit(CLAIM_BATCH)
      .execute();

    const row = firstEligible(rows, mode, nowMs);
    return row ? toPhotoUploadRow(row, row.storage_path) : null;
  },

  async persist(row) {
    await executeTypedMutationVoid(
      db
        .updateTable("InspectionPhotos")
        .set(queueUpdateSet(row))
        .where("id", "=", row.id)
        .compile(),
    );
  },

  async countUnresolved() {
    const rows = await db
      .selectFrom("InspectionPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .execute();
    return rows.length;
  },

  async countActionable() {
    const rows = await db
      .selectFrom("InspectionPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) =>
        eb.or([
          eb("last_error", "is", null),
          eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
        ]),
      )
      .execute();
    return rows.length;
  },

  async listUnresolved(limit) {
    const rows = await db
      .selectFrom("InspectionPhotos")
      .select([
        "id",
        "storage_path",
        "upload_status",
        "local_uri",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => toPhotoUploadRow(row, row.storage_path));
  },
};

// ── DriverDocuments (bucket path column: photo_path) ────────────────────────

const driverDocumentsAdapter: PhotoQueueTableAdapter = {
  table: "DriverDocuments",
  bucket: "driver-documents",
  upsert: true,

  async claimNext(mode, nowMs) {
    const rows = await db
      .selectFrom("DriverDocuments")
      .select([
        "id",
        "photo_path",
        "upload_status",
        "local_uri",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) =>
        eb.or([
          eb("last_error", "is", null),
          eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
        ]),
      )
      .orderBy("created_at", "asc")
      .limit(CLAIM_BATCH)
      .execute();

    const row = firstEligible(rows, mode, nowMs);
    return row ? toPhotoUploadRow(row, row.photo_path) : null;
  },

  async persist(row) {
    await executeTypedMutationVoid(
      db
        .updateTable("DriverDocuments")
        .set(queueUpdateSet(row))
        .where("id", "=", row.id)
        .compile(),
    );
  },

  async countUnresolved() {
    const rows = await db
      .selectFrom("DriverDocuments")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .execute();
    return rows.length;
  },

  async countActionable() {
    const rows = await db
      .selectFrom("DriverDocuments")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) =>
        eb.or([
          eb("last_error", "is", null),
          eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
        ]),
      )
      .execute();
    return rows.length;
  },

  async listUnresolved(limit) {
    const rows = await db
      .selectFrom("DriverDocuments")
      .select([
        "id",
        "photo_path",
        "upload_status",
        "local_uri",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => toPhotoUploadRow(row, row.photo_path));
  },
};

/** All photo tables the queue serves, in claim priority order. */
export const PHOTO_QUEUE_ADAPTERS: readonly PhotoQueueTableAdapter[] = [
  damageReportPhotosAdapter,
  inspectionPhotosAdapter,
  driverDocumentsAdapter,
];
