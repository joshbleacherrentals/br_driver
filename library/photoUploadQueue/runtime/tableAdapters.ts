/**
 * Typed table adapters for the three photo-bearing tables.
 *
 * Each adapter reads/writes the §3 queue columns through the Kysely-typed
 * wrappers — no raw SQL, no PowerSync `@powersync/attachments` recompute. The
 * tables differ only in the bucket-path column (`photo_path` vs InspectionPhotos'
 * `storage_path`); everything else is shared through the helpers below.
 *
 * §15 — every read on `DamageReportPhotos`/`InspectionPhotos` is additionally
 * scoped to the signed-in driver. These tables sync to every authenticated
 * driver, so an unscoped read here is what let the queue retry, count and
 * banner another driver's photos.
 */

import { db } from "@/library/powersync/db";
import type { PowerSyncDB } from "@/library/powersync/AppSchema";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import type { ExpressionBuilder } from "kysely";

import { isDueForFastRetry, isDueForRetry } from "../backoff";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
  type UploadStatus,
} from "../types";
import { getCurrentDriverContext } from "./currentDriverContext";
import type { PhotoQueueMode, PhotoQueueTableAdapter } from "./types";

/**
 * Statuses the queue still owns work for. `uploaded` is terminal (§3), and
 * `uploading` is deliberately absent: a row mid-attempt must not be claimed a
 * second time. The cost of that exclusion — a row stranded in `uploading` when
 * its attempt dies — is covered by `listStaleUploading` + the §14 sweep, not by
 * widening this list.
 */
const UNRESOLVED_STATUSES: UploadStatus[] = ["pending", "failed"];
/** The mid-attempt status the §14 sweep reclaims from. */
const UPLOADING_STATUS: UploadStatus = "uploading";
/** How many candidates to pull per claim before filtering for eligibility. */
const CLAIM_BATCH = 25;

/** Re-exported for the adapters' existing consumers; defined in `../types`. */
export { MISSING_LOCAL_FILE_ERROR } from "../types";

/**
 * Shared columns every photo table carries under the queue design (§3). The
 * PowerSync/Kysely types make every column nullable regardless of the Postgres
 * NOT NULL constraints, so the mapping coalesces to the queue's non-null shape.
 */
type RawQueueRow = {
  id: string;
  upload_status: string | null;
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

// ── §15 driver scoping ──────────────────────────────────────────────────────
//
// Both predicates are `WHERE EXISTS` rather than an `INNER JOIN`, deliberately:
//
//   1. They compose with the methods below without touching a single existing
//      `.select([...])`, `.orderBy(...)` or bare-column `.where(...)`. A join
//      would force every one of those columns to be re-qualified, turning a
//      scoping change into a rewrite of all twelve queries.
//   2. `EXISTS` cannot multiply the outer row set. That is load-bearing for
//      `InspectionPhotos`: the path to `WorkTrackers` is an OR over
//      `pre_inspection_uuid`/`post_inspection_uuid`, and nothing in the schema
//      makes it 1:1 — `WorkTrackerInspections` has no foreign key back to
//      `WorkTrackers`, the reference runs the other way. An inspection id
//      matched by two `WorkTrackers` rows would, under a join, duplicate its
//      photo inside `claimNext`'s candidate batch and inside
//      `listUnresolved`'s result. `EXISTS` answers yes-or-no, once.
//
// A NULL creator/driver needs no special case: SQL equality against NULL is
// never true, so an unattributed row simply fails the predicate.

/** `DamageReportPhotos` whose report was created by this user. */
function ownedByCurrentUser(
  eb: ExpressionBuilder<PowerSyncDB, "DamageReportPhotos">,
  userUuid: string,
) {
  return eb.exists(
    eb
      .selectFrom("DamageReports")
      .select("DamageReports.id")
      .whereRef(
        "DamageReports.id",
        "=",
        "DamageReportPhotos.damage_report_uuid",
      )
      .where("DamageReports.created_by_user_uuid", "=", userUuid),
  );
}

/** `InspectionPhotos` whose inspection is a leg of one of this driver's trips. */
function ownedByCurrentDriver(
  eb: ExpressionBuilder<PowerSyncDB, "InspectionPhotos">,
  driverUuid: string,
) {
  return eb.exists(
    eb
      .selectFrom("WorkTrackerInspections")
      .innerJoin("WorkTrackers", (join) =>
        join.on((eb2) =>
          eb2.or([
            eb2(
              "WorkTrackers.pre_inspection_uuid",
              "=",
              eb2.ref("WorkTrackerInspections.id"),
            ),
            eb2(
              "WorkTrackers.post_inspection_uuid",
              "=",
              eb2.ref("WorkTrackerInspections.id"),
            ),
          ]),
        ),
      )
      .select("WorkTrackerInspections.id")
      .whereRef(
        "WorkTrackerInspections.id",
        "=",
        "InspectionPhotos.inspection_uuid",
      )
      .where("WorkTrackers.driver_uuid", "=", driverUuid),
  );
}

// ── DamageReportPhotos (bucket path column: photo_path) ─────────────────────

const damageReportPhotosAdapter: PhotoQueueTableAdapter = {
  table: "DamageReportPhotos",
  bucket: "damage-report-photos",
  upsert: false,

  async claimNext(mode, nowMs) {
    const ctx = getCurrentDriverContext();
    if (!ctx) return null;

    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select([
        "id",
        "photo_path",
        "upload_status",
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
      .where((eb) => ownedByCurrentUser(eb, ctx.userUuid))
      .orderBy("created_at", "asc")
      .limit(CLAIM_BATCH)
      .execute();

    const row = firstEligible(rows, mode, nowMs);
    return row ? toPhotoUploadRow(row, row.photo_path) : null;
  },

  // Not scoped, on purpose: `persist` is only ever handed a row that a scoped
  // read above already returned, so re-checking ownership here would buy
  // nothing and cost a subquery on the hot write path.
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
    const ctx = getCurrentDriverContext();
    if (!ctx) return 0;

    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) => ownedByCurrentUser(eb, ctx.userUuid))
      .execute();
    return rows.length;
  },

  async countActionable() {
    const ctx = getCurrentDriverContext();
    if (!ctx) return 0;

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
      .where((eb) => ownedByCurrentUser(eb, ctx.userUuid))
      .execute();
    return rows.length;
  },

  async countParked() {
    const ctx = getCurrentDriverContext();
    if (!ctx) return 0;

    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where("last_error", "=", MISSING_LOCAL_FILE_ERROR)
      .where((eb) => ownedByCurrentUser(eb, ctx.userUuid))
      .execute();
    return rows.length;
  },

  async listUnresolved(limit) {
    const ctx = getCurrentDriverContext();
    if (!ctx) return [];

    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select([
        "id",
        "photo_path",
        "upload_status",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) => ownedByCurrentUser(eb, ctx.userUuid))
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => toPhotoUploadRow(row, row.photo_path));
  },

  async listStaleUploading(beforeIso, limit) {
    const ctx = getCurrentDriverContext();
    if (!ctx) return [];

    const rows = await db
      .selectFrom("DamageReportPhotos")
      .select([
        "id",
        "photo_path",
        "upload_status",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "=", UPLOADING_STATUS)
      .where((eb) =>
        eb.or([
          eb("last_attempt_at", "is", null),
          eb("last_attempt_at", "<", beforeIso),
        ]),
      )
      .where((eb) => ownedByCurrentUser(eb, ctx.userUuid))
      .orderBy("last_attempt_at", "asc")
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
    const ctx = getCurrentDriverContext();
    if (!ctx) return null;

    const rows = await db
      .selectFrom("InspectionPhotos")
      .select([
        "id",
        "storage_path",
        "upload_status",
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
      .where((eb) => ownedByCurrentDriver(eb, ctx.driverUuid))
      .orderBy("created_at", "asc")
      .limit(CLAIM_BATCH)
      .execute();

    const row = firstEligible(rows, mode, nowMs);
    return row ? toPhotoUploadRow(row, row.storage_path) : null;
  },

  // Unscoped for the same reason as `DamageReportPhotos.persist` above.
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
    const ctx = getCurrentDriverContext();
    if (!ctx) return 0;

    const rows = await db
      .selectFrom("InspectionPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) => ownedByCurrentDriver(eb, ctx.driverUuid))
      .execute();
    return rows.length;
  },

  async countActionable() {
    const ctx = getCurrentDriverContext();
    if (!ctx) return 0;

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
      .where((eb) => ownedByCurrentDriver(eb, ctx.driverUuid))
      .execute();
    return rows.length;
  },

  async countParked() {
    const ctx = getCurrentDriverContext();
    if (!ctx) return 0;

    const rows = await db
      .selectFrom("InspectionPhotos")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where("last_error", "=", MISSING_LOCAL_FILE_ERROR)
      .where((eb) => ownedByCurrentDriver(eb, ctx.driverUuid))
      .execute();
    return rows.length;
  },

  async listUnresolved(limit) {
    const ctx = getCurrentDriverContext();
    if (!ctx) return [];

    const rows = await db
      .selectFrom("InspectionPhotos")
      .select([
        "id",
        "storage_path",
        "upload_status",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where((eb) => ownedByCurrentDriver(eb, ctx.driverUuid))
      .orderBy("created_at", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => toPhotoUploadRow(row, row.storage_path));
  },

  async listStaleUploading(beforeIso, limit) {
    const ctx = getCurrentDriverContext();
    if (!ctx) return [];

    const rows = await db
      .selectFrom("InspectionPhotos")
      .select([
        "id",
        "storage_path",
        "upload_status",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "=", UPLOADING_STATUS)
      .where((eb) =>
        eb.or([
          eb("last_attempt_at", "is", null),
          eb("last_attempt_at", "<", beforeIso),
        ]),
      )
      .where((eb) => ownedByCurrentDriver(eb, ctx.driverUuid))
      .orderBy("last_attempt_at", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => toPhotoUploadRow(row, row.storage_path));
  },
};

// ── DriverDocuments (bucket path column: photo_path) ────────────────────────
//
// §15 deliberately does NOT scope this table. Its Postgres RLS is already
// owner-scoped server-side, so a device only ever holds its own driver's
// documents — the mis-attribution the other two adapters had is structurally
// impossible here, and adding a client-side filter would only duplicate a
// guarantee that already holds.

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

  async countParked() {
    const rows = await db
      .selectFrom("DriverDocuments")
      .select("id")
      .where("upload_status", "in", UNRESOLVED_STATUSES)
      .where("last_error", "=", MISSING_LOCAL_FILE_ERROR)
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

  async listStaleUploading(beforeIso, limit) {
    const rows = await db
      .selectFrom("DriverDocuments")
      .select([
        "id",
        "photo_path",
        "upload_status",
        "gallery_asset_id",
        "attempts",
        "last_attempt_at",
        "last_error",
        "created_at",
      ])
      .where("upload_status", "=", UPLOADING_STATUS)
      .where((eb) =>
        eb.or([
          eb("last_attempt_at", "is", null),
          eb("last_attempt_at", "<", beforeIso),
        ]),
      )
      .orderBy("last_attempt_at", "asc")
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
