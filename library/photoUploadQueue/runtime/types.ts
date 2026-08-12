/**
 * Runtime-side contract that binds the pure queue logic to a concrete synced
 * table. Each photo-bearing table (DamageReportPhotos, InspectionPhotos,
 * DriverDocuments) provides one adapter; the service in `photoUploadService.ts`
 * drives them all through the single serialized worker (§10).
 */

import type { PhotoUploadRow } from "../types";

/** `fast` ignores backoff (foreground, user waiting); `backoff` respects it. */
export type PhotoQueueMode = "fast" | "backoff";

export interface PhotoQueueTableAdapter {
  /** Synced table this adapter owns. */
  readonly table: string;
  /** Supabase Storage bucket the row's `photo_path` lives in. */
  readonly bucket: string;
  /** Insert-only buckets pass `false` (§10). */
  readonly upsert: boolean;

  /**
   * The oldest `pending`/`failed` row eligible to attempt right now under
   * `mode`, or `null` when the table has nothing to do. Never returns a row in
   * a terminal state — `uploaded` rows are invisible to the queue.
   */
  claimNext(mode: PhotoQueueMode, nowMs: number): Promise<PhotoUploadRow | null>;

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
   * parked because their local file is gone. Drives whether the queue keeps
   * scheduling retry passes, so a permanently-missing file never busy-loops.
   */
  countActionable(): Promise<number>;
}
