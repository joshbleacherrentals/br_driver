/**
 * Typed table adapters for the three photo-bearing tables.
 *
 * Each adapter reads/writes the §3 queue columns through the Kysely-typed
 * wrappers — no raw SQL, no PowerSync `@powersync/attachments` recompute.
 *
 * The three tables differ in exactly two ways: the bucket-path column
 * (`photo_path` vs `InspectionPhotos`' `storage_path`) and whether their reads
 * are driver-scoped. Everything else — which statuses count as unresolved, how
 * parked rows are excluded, claim ordering and batching, the §14 stale sweep's
 * query — is identical, so it is written once in `makeAdapter` below and the
 * per-table differences are declared as data.
 *
 * §15 — the scoping half of that data comes from
 * `@/library/powersync/scoping`: `from` is an *already-scoped* query source, so
 * an adapter cannot be written that forgets to filter by owner. `DriverDocuments`
 * opts out through a named `{ kind: "none", reason }` rather than by leaving a
 * field off, so its lack of scoping reads as the decision it is.
 */

import type { PowerSyncDB } from "@/library/powersync/AppSchema";
import { db } from "@/library/powersync/db";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import {
  damageReportPhotosOf,
  driverDocumentsAll,
  getDriverScope,
  inspectionPhotosOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import type { ExpressionBuilder, SelectQueryBuilder } from "kysely";

import { isDueForFastRetry, isDueForRetry } from "../backoff";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
  type UploadStatus,
} from "../types";
import type {
  PhotoQueueMode,
  PhotoQueueTableAdapter,
  PhotoQueueTableName,
} from "./types";

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

/** The §3 queue columns, identical on all three tables. */
const QUEUE_COLUMNS = [
  "id",
  "upload_status",
  "gallery_asset_id",
  "attempts",
  "last_attempt_at",
  "last_error",
  "created_at",
] as const;

/**
 * The queue's own view of a photo row: the §3 bookkeeping columns plus both
 * bucket-path columns, which is the entire surface `makeAdapter` touches.
 *
 * A single `makeAdapter` body has to build queries for all three tables, and
 * Kysely gives no type that means "a builder over any one of these". The union
 * `SelectQueryBuilder<PowerSyncDB, "DamageReportPhotos" | ..., {}>` is not it:
 * a concrete builder is not assignable to it (the builders' output types differ
 * table by table), and it would also *widen* what may be selected, admitting
 * `thumbnail` or `caption` on tables that have neither.
 *
 * So the three concrete builders are narrowed to this view once, in
 * `asQueueSource` below. The narrowing is compile-time only and never reaches
 * SQL: the `FROM` clause is fixed by the `selectFrom` that already happened
 * inside `scopedFrom.ts`, and nothing here calls `selectFrom` again. What the
 * view describes is precisely the contract §3 says all three tables satisfy.
 */
type QueueColumnsView = {
  id: string;
  upload_status: string | null;
  gallery_asset_id: string | null;
  attempts: number | null;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string | null;
  photo_path: string | null;
  storage_path: string | null;
};

type QueueSource = SelectQueryBuilder<
  { photoQueueRow: QueueColumnsView },
  "photoQueueRow",
  {}
>;

/**
 * Narrows a real, already-scoped table builder to the shared queue view above.
 *
 * The one place the three tables become interchangeable, and the one place a
 * type assertion is needed to say so. Its input type is what keeps it honest:
 * only a builder over a genuine photo-queue table can be passed in.
 */
function asQueueSource<T extends PhotoQueueTableName>(
  builder: SelectQueryBuilder<PowerSyncDB, T, {}>,
): QueueSource {
  return builder as unknown as QueueSource;
}

/** The bucket-path column, per table. */
type PathColumn = "photo_path" | "storage_path";

/**
 * How an adapter's reads are scoped (§15), as a named choice rather than the
 * presence or absence of a filter.
 */
type AdapterScoping =
  | { kind: "owner"; from: (scope: DriverScope) => QueueSource }
  | { kind: "none"; reason: string; from: () => QueueSource };

type AdapterConfig = {
  table: PhotoQueueTableName;
  bucket: string;
  /** Insert-only buckets pass `false` (§10). */
  upsert: boolean;
  pathColumn: PathColumn;
  scoping: AdapterScoping;
};

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

/** Not parked for a missing local file (§12). */
function notParked(
  eb: ExpressionBuilder<{ photoQueueRow: QueueColumnsView }, "photoQueueRow">,
) {
  return eb.or([
    eb("last_error", "is", null),
    eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
  ]);
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

/**
 * Builds one table's adapter from its differences.
 *
 * Every method resolves its source first. For a scoped table that resolution
 * can fail — no driver established yet (§15) — and when it does the method
 * answers with its empty result (`null`, `0`, `[]`) *without querying at all*.
 * That single early return is what makes an unresolved scope structurally
 * unable to degrade into an unscoped read, for every method at once.
 */
function makeAdapter(config: AdapterConfig): PhotoQueueTableAdapter {
  const { table, bucket, upsert, pathColumn, scoping } = config;

  const source = (): QueueSource | null => {
    if (scoping.kind === "none") return scoping.from();
    const scope = getDriverScope();
    return scope ? scoping.from(scope) : null;
  };

  /** Full queue row + the table's bucket-path column. */
  const selectRow = (q: QueueSource) =>
    q.select([...QUEUE_COLUMNS, pathColumn]);

  const toRow = (
    row: RawQueueRow & Partial<Record<PathColumn, string | null>>,
  ) => toPhotoUploadRow(row, row[pathColumn] ?? null);

  return {
    table,
    bucket,
    upsert,

    async claimNext(mode, nowMs) {
      const q = source();
      if (!q) return null;

      const rows = await selectRow(q)
        .where("upload_status", "in", UNRESOLVED_STATUSES)
        .where(notParked)
        .orderBy("created_at", "asc")
        .limit(CLAIM_BATCH)
        .execute();

      const row = firstEligible(rows, mode, nowMs);
      return row ? toRow(row) : null;
    },

    // Not scoped, on purpose (§15): `persist` is only ever handed a row that a
    // scoped read above already returned, so re-checking ownership here would
    // buy nothing and cost a subquery on the hot write path.
    async persist(row) {
      await executeTypedMutationVoid(
        db
          .updateTable(table)
          .set(queueUpdateSet(row))
          .where("id", "=", row.id)
          .compile(),
      );
    },

    async countUnresolved() {
      const q = source();
      if (!q) return 0;

      const rows = await q
        .select("id")
        .where("upload_status", "in", UNRESOLVED_STATUSES)
        .execute();
      return rows.length;
    },

    async countActionable() {
      const q = source();
      if (!q) return 0;

      const rows = await q
        .select("id")
        .where("upload_status", "in", UNRESOLVED_STATUSES)
        .where(notParked)
        .execute();
      return rows.length;
    },

    async countParked() {
      const q = source();
      if (!q) return 0;

      const rows = await q
        .select("id")
        .where("upload_status", "in", UNRESOLVED_STATUSES)
        .where("last_error", "=", MISSING_LOCAL_FILE_ERROR)
        .execute();
      return rows.length;
    },

    async listUnresolved(limit) {
      const q = source();
      if (!q) return [];

      const rows = await selectRow(q)
        .where("upload_status", "in", UNRESOLVED_STATUSES)
        .orderBy("created_at", "asc")
        .limit(limit)
        .execute();
      return rows.map(toRow);
    },

    async listStaleUploading(beforeIso, limit) {
      const q = source();
      if (!q) return [];

      const rows = await selectRow(q)
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
      return rows.map(toRow);
    },
  };
}

/** All photo tables the queue serves, in claim priority order. */
export const PHOTO_QUEUE_ADAPTERS: readonly PhotoQueueTableAdapter[] = [
  makeAdapter({
    table: "DamageReportPhotos",
    bucket: "damage-report-photos",
    upsert: false,
    pathColumn: "photo_path",
    scoping: {
      kind: "owner",
      from: (scope) => asQueueSource(damageReportPhotosOf(scope)),
    },
  }),
  makeAdapter({
    table: "InspectionPhotos",
    bucket: "inspection-photos",
    upsert: true,
    pathColumn: "storage_path",
    scoping: {
      kind: "owner",
      from: (scope) => asQueueSource(inspectionPhotosOf(scope)),
    },
  }),
  makeAdapter({
    table: "DriverDocuments",
    bucket: "driver-documents",
    upsert: true,
    pathColumn: "photo_path",
    scoping: {
      kind: "none",
      reason:
        "§15 — DriverDocuments' Postgres RLS is already owner-scoped " +
        "server-side, so a device only ever holds its own driver's documents. " +
        "A client-side filter would duplicate a guarantee that already holds.",
      from: () => asQueueSource(driverDocumentsAll()),
    },
  }),
];
