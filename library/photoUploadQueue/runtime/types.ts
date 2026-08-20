/**
 * Runtime-side contract that binds the pure queue logic to a concrete synced
 * table. Each photo-bearing table (DamageReportPhotos, InspectionPhotos,
 * DriverDocuments) provides one adapter; the service in `photoUploadService.ts`
 * drives them all through the single boundedly-concurrent worker (§10).
 */

import type { PhotoUploadRow } from "../types";

/** `fast` ignores backoff (foreground, user waiting); `backoff` respects it. */
export type PhotoQueueMode = "fast" | "backoff";

/** The synced tables that carry the §3 queue columns. */
export type PhotoQueueTableName =
  | "DamageReportPhotos"
  | "InspectionPhotos"
  | "DriverDocuments";

export interface PhotoQueueTableAdapter {
  /** Synced table this adapter owns. */
  readonly table: PhotoQueueTableName;
  /** Supabase Storage bucket the row's `photo_path` lives in. */
  readonly bucket: string;
  /** Insert-only buckets pass `false` (§10). */
  readonly upsert: boolean;

  /**
   * The highest-priority `pending`/`failed` row eligible to attempt right now
   * under `mode`, or `null` when the table has nothing to do. Never returns a
   * row in a terminal state — `uploaded` rows are invisible to the queue.
   *
   * `isReserved` is the caller's in-memory claim ledger (§10). Since the
   * reservation is no longer a status write, a row an upload lane is already
   * working on still looks `pending`/`failed` to SQL, and this predicate is
   * what keeps it from being handed to a second lane.
   */
  claimNext(
    mode: PhotoQueueMode,
    nowMs: number,
    isReserved?: (rowId: string) => boolean,
  ): Promise<PhotoUploadRow | null>;

  /** Persists the queue columns (§3 bookkeeping) back for this row id. */
  persist(row: PhotoUploadRow): Promise<void>;

  /** Count of rows still not `uploaded` — feeds the recovery/banner pass (§6). */
  countUnresolved(): Promise<number>;

  /**
   * The rows behind {@link countUnresolved}, so the §6 recovery pass can check
   * each one against the bucket. Unlike `claimNext` this deliberately includes
   * rows parked for a missing local file: those are the likeliest to be
   * genuinely lost, and are exactly what the driver needs telling about.
   * Bounded — a verification pass must not fan out unboundedly.
   */
  listUnresolved(limit: number): Promise<PhotoUploadRow[]>;

  /**
   * Count of unresolved rows the worker can still act on — i.e. excluding those
   * parked because their local file is gone.
   */
  countActionable(): Promise<number>;

  /**
   * The complement of {@link countActionable}: unresolved rows currently parked
   * for a missing local file. A cheap gate for the §12 sweep, so a table with
   * nothing parked costs one COUNT and no filesystem work at all.
   */
  countParked(): Promise<number>;

  /**
   * §14 — rows stuck in `uploading` whose `last_attempt_at` is older than
   * `beforeIso` (a null `last_attempt_at` counts as maximally stale). These are
   * invisible to every other query here on purpose: `uploading` is not an
   * unresolved status, so `claimNext`/`countUnresolved`/`listUnresolved` all
   * skip them — which is exactly how a row interrupted mid-attempt used to
   * become permanently unreclaimable. Oldest first, and bounded.
   */
  listStaleUploading(beforeIso: string, limit: number): Promise<PhotoUploadRow[]>;
}

/**
 * A row the claim step has already reserved (in the service's in-memory claim
 * ledger — §10) plus the adapter that owns it.
 *
 * Threaded by value from claim straight into the upload, rather than parked in
 * a module-level "current adapter" ref: with several lanes claiming
 * concurrently, shared claim state would let one lane read the adapter another
 * lane just wrote.
 */
export type ClaimedRow = {
  row: PhotoUploadRow;
  adapter: PhotoQueueTableAdapter;
};
