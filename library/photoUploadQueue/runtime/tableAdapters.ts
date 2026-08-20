/**
 * Typed table adapters for the three photo-bearing tables.
 *
 * Each adapter reads/writes the §3 queue columns through the Kysely-typed
 * wrappers — no raw SQL, no PowerSync `@powersync/attachments` recompute.
 *
 * The three tables differ in exactly three ways: the bucket-path column
 * (`photo_path` vs `InspectionPhotos`' `storage_path`), whether their reads are
 * driver-scoped, and where their §3 bookkeeping is stored — on the synced row
 * itself, or (for `DamageReportPhotos`) in the local-only `PhotoUploadStatus`
 * table, so status churn never enters PowerSync's `ps_crud` outbox — apart from
 * a single mirrored `uploaded` per photo, which is the one thing the server
 * cannot infer for itself (`syncedUploadStatusMirror.ts`). Everything
 * else — which statuses count as unresolved, how parked rows are excluded, claim
 * ordering and batching, the §14 stale sweep's query — is identical, so it is
 * written once in `makeAdapter` below and the per-table differences are declared
 * as data.
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

import {
  backoffWindows,
  FAST_RETRY_SPACING_MS,
  isDueForFastRetry,
  isDueForRetry,
} from "../backoff";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
  type UploadStatus,
} from "../types";
import { isTerminalUploadStatus } from "../uploadStatus";
import { replacePhotoUploadStatus } from "./photoUploadStatusStore";
import { mirrorTerminalUploadStatus } from "./syncedUploadStatusMirror";
import type {
  PhotoQueueMode,
  PhotoQueueTableAdapter,
  PhotoQueueTableName,
} from "./types";

/**
 * Statuses the queue still owns work for. `uploaded` is terminal (§3), and
 * `uploading` is deliberately absent.
 *
 * The queue no longer *writes* `uploading`: a mid-attempt reservation lives in
 * the service's in-memory claim ledger (§10, `photoUploadService.ts`) instead of
 * being persisted and synced. But the status stays excluded here, because rows
 * stranded in it by the previous behaviour are still on drivers' devices, and
 * claiming one would race an attempt that may or may not exist. Reclaiming them
 * is `listStaleUploading` + the §14 sweep's job, not this list's.
 */
const UNRESOLVED_STATUSES: UploadStatus[] = ["pending", "failed"];
/** The legacy mid-attempt status the §14 sweep reclaims from. */
const UPLOADING_STATUS: UploadStatus = "uploading";
/** How many candidates to pull per claim before filtering for eligibility. */
const CLAIM_BATCH = 25;

/** Re-exported for the adapters' existing consumers; defined in `../types`. */
export { MISSING_LOCAL_FILE_ERROR } from "../types";

/**
 * What a fresh, never-touched photo looks like to the queue.
 *
 * `DamageReportPhotos`' bookkeeping lives in the local-only `PhotoUploadStatus`
 * table, and a row is only created there the first time the queue persists an
 * outcome (`photoUploadStatusStore.ts`). Every read therefore left-joins and
 * coalesces the absent row to these values, so "no bookkeeping yet" and "saved a
 * moment ago, pending" are the same state — which is also what makes the upgrade
 * from the old synced-column schema re-attempt in-flight photos instead of
 * silently dropping them.
 */
const FRESH_STATUS: UploadStatus = "pending";
const FRESH_ATTEMPTS = 0;

/** The §3 queue columns, as every read projects them. */
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

/**
 * `DamageReportPhotos` joined to its device-local bookkeeping (§3), projected
 * into exactly the shared queue view above.
 *
 * A derived table rather than a bare join, for two reasons. `id` exists on both
 * sides, so every `select("id")` downstream would be ambiguous SQL; and the
 * coalescing of an absent status row happens once, here, instead of every
 * predicate in this file having to spell out "…or the row has no bookkeeping
 * yet". Downstream code goes on referring to plain `upload_status`/`attempts`,
 * unaware there was ever a join — which is why `claimNext`, the counts and the
 * §14 sweep needed no per-table branching.
 *
 * The subquery is opened on the *scoped* source (§15), so the ownership
 * predicate is applied inside it and cannot be dropped by anything layered on
 * top. SQLite flattens the whole shape back into one query.
 */
function damageReportPhotoQueueRows(scope: DriverScope): QueueSource {
  return db.selectFrom(
    damageReportPhotosOf(scope)
      .leftJoin(
        "PhotoUploadStatus",
        "PhotoUploadStatus.id",
        "DamageReportPhotos.id",
      )
      .select((eb) => [
        "DamageReportPhotos.id as id",
        "DamageReportPhotos.photo_path as photo_path",
        "DamageReportPhotos.created_at as created_at",
        "PhotoUploadStatus.gallery_asset_id as gallery_asset_id",
        "PhotoUploadStatus.last_attempt_at as last_attempt_at",
        "PhotoUploadStatus.last_error as last_error",
        eb.fn
          .coalesce("PhotoUploadStatus.upload_status", eb.val(FRESH_STATUS))
          .as("upload_status"),
        eb.fn
          .coalesce("PhotoUploadStatus.attempts", eb.val(FRESH_ATTEMPTS))
          .as("attempts"),
      ])
      .as("photoQueueRow"),
  ) as unknown as QueueSource;
}

/**
 * Where a table's §3 bookkeeping is stored, and therefore what `persist` writes.
 *
 * `DamageReportPhotos` is `local-only`: its status columns were moved off the
 * synced table precisely so a drain of hundreds of photos stops filling
 * PowerSync's `ps_crud` outbox and starving the driver's real writes and
 * incoming checkpoints behind it.
 *
 * `mirrorTerminalUploadStatus` is the deliberate exception to that, and only
 * ever an *additional* write: when — and only when — a row reaches the terminal
 * `uploaded` state, its completion is also stamped once onto the synced photo
 * row, because the server has no other way to tell an uploaded photo from one
 * whose row synced ahead of its file. See
 * `runtime/syncedUploadStatusMirror.ts`. Every intermediate state stays local,
 * so the outbox sees at most one entry per photo for its whole lifetime rather
 * than one per attempt. A local-only table with `mirrorTerminalTo: null` would
 * be purely local; today there is no such table.
 *
 * The other two are still `synced`, and that is a scope decision rather than an
 * oversight: `DriverDocuments` holds three rows per driver, and `InspectionPhotos`
 * has not been migrated yet. Both would benefit from the same move; neither is
 * the volume that caused the stall.
 */
type PhotoQueueBookkeeping =
  | { kind: "local-only"; mirrorTerminalTo: "DamageReportPhotos" | null }
  | { kind: "synced"; table: "InspectionPhotos" | "DriverDocuments" };

/**
 * Writes the queue columns back to the synced table that still carries them.
 *
 * Switched rather than parameterised so Kysely keeps checking each table's
 * columns against the generated schema (same reasoning as `requeuePhotoRows`).
 */
async function persistSyncedStatus(
  table: "InspectionPhotos" | "DriverDocuments",
  row: PhotoUploadRow,
): Promise<void> {
  switch (table) {
    case "InspectionPhotos":
      await executeTypedMutationVoid(
        db
          .updateTable("InspectionPhotos")
          .set(queueUpdateSet(row))
          .where("id", "=", row.id)
          .compile(),
      );
      return;
    case "DriverDocuments":
      await executeTypedMutationVoid(
        db
          .updateTable("DriverDocuments")
          .set(queueUpdateSet(row))
          .where("id", "=", row.id)
          .compile(),
      );
      return;
  }
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
  bookkeeping: PhotoQueueBookkeeping;
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

type QueueExpressionBuilder = ExpressionBuilder<
  { photoQueueRow: QueueColumnsView },
  "photoQueueRow"
>;

/** Not parked for a missing local file (§12). */
function notParked(eb: QueueExpressionBuilder) {
  return eb.or([
    eb("last_error", "is", null),
    eb("last_error", "!=", MISSING_LOCAL_FILE_ERROR),
  ]);
}

/**
 * Retry-eligibility, in SQL rather than in JS after the fact.
 *
 * WHY THIS IS SQL AND NOT A `.filter()`
 * `claimNext` used to take the `CLAIM_BATCH` oldest unresolved rows and only
 * then look for one whose backoff had elapsed. `LIMIT` therefore ran *before*
 * eligibility: if the 25 oldest rows had all just been attempted — precisely
 * what happens after a burst of failures, since they fail together and are the
 * oldest together — the claim returned `null` while hundreds of eligible rows
 * sat further back in the queue. The lane broke, the pass ended, and throughput
 * collapsed with the queue nowhere near drained. Raising the concurrency limit
 * could not have helped: every lane looks through the same starved window.
 *
 * Expressing the predicate in SQL puts `LIMIT` back where it belongs — after
 * filtering — so the batch is 25 *candidates*, not 25 rows that might all be
 * ineligible.
 *
 * Cutoffs are compared as ISO-8601 UTC strings, which sort lexicographically in
 * the same order as the instants they denote; every writer of these columns
 * uses `new Date().toISOString()`. `firstEligible` still re-checks in JS, so
 * SQL is only ever required to be no *narrower* than the real predicate.
 */
function retryEligible(
  eb: QueueExpressionBuilder,
  mode: PhotoQueueMode,
  nowMs: number,
) {
  const neverAttempted = eb("last_attempt_at", "is", null);

  if (mode === "fast") {
    // §6 — fast mode skips the schedule but keeps a floor on re-attempt
    // spacing, so one instantly-failing row can neither hot-loop nor starve
    // the rest.
    return eb.or([
      neverAttempted,
      eb(
        "last_attempt_at",
        "<=",
        new Date(nowMs - FAST_RETRY_SPACING_MS).toISOString(),
      ),
    ]);
  }

  return eb.or([
    neverAttempted,
    ...backoffWindows(nowMs).map((window) => {
      const dueBy = new Date(window.dueAtOrBeforeMs).toISOString();
      const attemptsInBand =
        window.minAttempts === 0
          ? // `attempts` is nullable in the PowerSync schema, and the queue
            // reads a NULL as 0 (`toPhotoUploadRow`); SQL comparisons would
            // drop such a row instead.
            eb.or([
              eb("attempts", "is", null),
              eb("attempts", "<=", window.maxAttempts ?? 0),
            ])
          : window.maxAttempts === null
            ? eb("attempts", ">=", window.minAttempts)
            : eb.and([
                eb("attempts", ">=", window.minAttempts),
                eb("attempts", "<=", window.maxAttempts),
              ]);

      return eb.and([attemptsInBand, eb("last_attempt_at", "<=", dueBy)]);
    }),
  ]);
}

/**
 * Claim priority: never-attempted rows first, then oldest first within each
 * group.
 *
 * The second half is the obvious one — FIFO among peers. The first half is what
 * keeps a driver's *current* work responsive: a report saved right now, with
 * the driver standing there watching the §7 progress modal, must not queue
 * behind a thousand-row backlog left over from previous sessions that is
 * already grinding through its backoff schedule. `last_attempt_at IS NULL`
 * means "the queue has never tried this", which is exactly the population that
 * has a person waiting on it.
 *
 * This used to happen by accident. `created_at` was never written on insert, so
 * a freshly-saved photo carried `NULL` — and SQLite sorts NULL first under
 * `ORDER BY created_at ASC`. Fresh photos did jump the queue, but only because
 * their timestamp was missing; the moment `created_at` started being written
 * (which it had to, for `ORDER BY created_at` to mean anything at all) that
 * behaviour would have silently inverted into strict FIFO, burying every new
 * report behind the backlog. Stating the priority explicitly is what lets both
 * facts be true at once.
 *
 * `IS NULL` yields 1/0 in SQLite, so `DESC` puts the never-attempted group
 * first. Expressed through the expression builder rather than a raw SQL string,
 * per the project's typed-DB rule.
 */
function claimPriority<Q extends QueueSource>(q: Q): Q {
  return q
    .orderBy((eb) => eb("last_attempt_at", "is", null), "desc")
    .orderBy("created_at", "asc") as Q;
}

/**
 * First eligible row under the mode. `fast` uses a short cooldown so a failing
 * row can neither hot-loop nor starve the rest; `backoff` uses the §6 schedule.
 * Parked (missing-file) rows are never eligible, and neither is a row the
 * caller has already reserved (§10 — the claim ledger lives in memory, so SQL
 * cannot see it).
 */
function firstEligible<
  T extends {
    id: string;
    attempts: number | null;
    last_attempt_at: string | null;
    last_error: string | null;
  },
>(
  rows: T[],
  mode: PhotoQueueMode,
  nowMs: number,
  isReserved?: (rowId: string) => boolean,
): T | null {
  for (const row of rows) {
    if (row.last_error === MISSING_LOCAL_FILE_ERROR) continue;
    if (isReserved?.(row.id)) continue;
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
  const { table, bucket, upsert, pathColumn, scoping, bookkeeping } = config;

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

  /**
   * A count answered by SQL, not by materialising every matching row and taking
   * its `.length`. The counts run on every pass and feed the §6 banner; the old
   * shape pulled one row object per unresolved photo across the bridge purely
   * to discard it.
   */
  const countRows = async (
    narrow: (q: QueueSource) => QueueSource,
  ): Promise<number> => {
    const q = source();
    if (!q) return 0;

    const row = await narrow(q)
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();
    return Number((row as { count?: number | string } | undefined)?.count ?? 0);
  };

  return {
    table,
    bucket,
    upsert,

    async claimNext(mode, nowMs, isReserved) {
      const q = source();
      if (!q) return null;

      const rows = await claimPriority(
        selectRow(q)
          .where("upload_status", "in", UNRESOLVED_STATUSES)
          .where(notParked)
          .where((eb) => retryEligible(eb, mode, nowMs)),
      )
        .limit(CLAIM_BATCH)
        .execute();

      // Kept as a safety net, not as the filter. The SQL above is authoritative
      // for *which rows the LIMIT sees*; this re-checks the winner against the
      // one canonical implementation of the schedule, so the two can never
      // silently diverge — an over-broad predicate is caught here, and only an
      // over-narrow one could lose a row.
      //
      // The reservation filter is different in kind: it is the one predicate
      // that CANNOT be pushed into SQL, because the claim ledger is in memory
      // (§10). It costs nothing to apply here — at most `MAX_CONCURRENT_UPLOADS
      // - 1` of the `CLAIM_BATCH` candidates can be reserved.
      const row = firstEligible(rows, mode, nowMs, isReserved);
      return row ? toRow(row) : null;
    },

    // Not scoped, on purpose (§15): `persist` is only ever handed a row that a
    // scoped read above already returned, so re-checking ownership here would
    // buy nothing and cost a subquery on the hot write path.
    //
    // For a `local-only` table this write does not reach `ps_crud` at all, which
    // is the entire point: a status transition is device bookkeeping, and used
    // to queue one CRUD operation per photo per attempt ahead of the driver's
    // real writes.
    //
    // The single exception is the terminal one. `uploaded` is also mirrored onto
    // the synced photo row, once, because it is the only fact about an upload
    // the server has any use for — and the only one it cannot infer, since the
    // photo row itself syncs long before its file does. Ordering is local first:
    // the local-only table is what every read in this file consults, so it is
    // the one that must be true even if the process dies between the two writes.
    async persist(row) {
      if (bookkeeping.kind === "local-only") {
        await replacePhotoUploadStatus(row);
        if (
          bookkeeping.mirrorTerminalTo &&
          isTerminalUploadStatus(row.upload_status)
        ) {
          await mirrorTerminalUploadStatus(row.id);
        }
        return;
      }
      await persistSyncedStatus(bookkeeping.table, row);
    },

    async countUnresolved() {
      return countRows((q) =>
        q.where("upload_status", "in", UNRESOLVED_STATUSES),
      );
    },

    async countActionable() {
      return countRows((q) =>
        q.where("upload_status", "in", UNRESOLVED_STATUSES).where(notParked),
      );
    },

    async countParked() {
      return countRows((q) =>
        q
          .where("upload_status", "in", UNRESOLVED_STATUSES)
          .where("last_error", "=", MISSING_LOCAL_FILE_ERROR),
      );
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
      from: (scope) => damageReportPhotoQueueRows(scope),
    },
    bookkeeping: { kind: "local-only", mirrorTerminalTo: "DamageReportPhotos" },
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
    bookkeeping: { kind: "synced", table: "InspectionPhotos" },
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
    bookkeeping: { kind: "synced", table: "DriverDocuments" },
  }),
];
