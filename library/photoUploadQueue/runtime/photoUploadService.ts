/**
 * The custom photo upload queue, assembled.
 *
 * One worker run (§10) drives every photo table through its adapter, draining
 * through up to `MAX_CONCURRENT_UPLOADS` lanes at a time. For each claimed row
 * it: reads the local file, runs one timed upload attempt (§5), decides success
 * on explicit evidence only (§9/§10/§5.1) — verifying against the bucket when
 * the outcome is ambiguous, which now includes a timeout — and persists the
 * resulting state. A row is never deleted or archived here; a failure just
 * leaves it retryable for the next pass (§3, §5).
 *
 * Claiming is the queue's only exclusivity mechanism, so it is serialized
 * behind a lock (`withClaimLock`) and *reserves* the row it hands out by
 * persisting `attempt_started` inside that same critical section. Selecting a
 * row and marking it `uploading` are one indivisible app-level step; splitting
 * them would let two lanes pick up the same row, because `claimNext` is a plain
 * SELECT and nothing below the app layer serializes reads.
 *
 * Each pass has four stages, in this order:
 *
 *   1. **Parked sweep (§12, local only).** Rows parked with
 *      MISSING_LOCAL_FILE_ERROR are re-checked against the filesystem and
 *      un-parked if their file is actually present. Runs unconditionally — it
 *      never touches the network, so it works identically on a plane.
 *   2. **Stale-`uploading` sweep (§14, local only).** Rows stranded mid-attempt
 *      by a killed app or a failed write are reclaimed to `failed`, which is the
 *      only way they become claimable — and driver-visible — again.
 *   3. **Network gate (§13).** Connectivity is checked once for the whole pass.
 *      Offline, the upload attempt is skipped entirely rather than made and
 *      failed — a doomed attempt would otherwise ratchet `attempts` and the
 *      backoff schedule forward for no reason, and its network error must never
 *      be mistaken for "the local file is missing".
 *   4. **Drain.** The worker's lanes claim and upload eligible rows.
 *
 * Retry cadence (§6) is timer-driven, never a busy loop: `triggerFast` opens a
 * short foreground window of quick retries; outside it, passes are spaced on a
 * background cadence. The loop re-arms itself for as long as *anything* is
 * unresolved — including a permanently-parked row (§12) — which is what keeps
 * the sweep running periodically while the app is open. That is bounded by
 * construction: a parked row costs one local file check per spaced pass and no
 * network at all, so it can neither hot-loop nor block other photos.
 *
 * Every stage logs under the `[PhotoQueue]` tag (§13), so the whole retry cycle
 * is observable in the Metro / Xcode console.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decode as decodeBase64 } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";

import type { PhotoUploadRow, UploadEvidence } from "../types";
import { applyUploadEvent } from "../uploadStatus";
import {
  isUploadSuccessful,
  needsBucketVerification,
} from "../uploadSuccess";
import { createUploadQueueWorker } from "../worker";
import {
  BucketUploadOutcome,
  objectExistsInBucket,
  uploadToBucket,
} from "./bucketUpload";
import { localPhotoExists, localUriForPath } from "./localFile";
import { isNetworkAvailable } from "./networkState";
import { sweepParkedRows } from "./parkedRowSweep";
import { persistUploadEvent } from "./persistUploadEvent";
import { persistWithRetry } from "./persistWithRetry";
import { photoQueueLog } from "./photoQueueLog";
import { sweepStaleUploadingRows } from "./staleUploadingSweep";
import { MISSING_LOCAL_FILE_ERROR, PHOTO_QUEUE_ADAPTERS } from "./tableAdapters";
import type {
  ClaimedRow,
  PhotoQueueMode,
  PhotoQueueTableAdapter,
} from "./types";

/** §6: a save grants this long of quick foreground retries before backing off. */
const FAST_WINDOW_MS = 60_000;
/** Spacing between passes while inside the fast window. */
const FAST_RESCHEDULE_MS = 4_000;
/** Background cadence for retry passes once the fast window has closed. */
const BACKOFF_RESCHEDULE_MS = 60_000;

function nowIso(): string {
  return new Date().toISOString();
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function readLocalFile(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

/**
 * Why a pass is running. Carried through to the logs only (§13) — nothing
 * branches on it — so the console shows whether a given pass came from a save,
 * a foreground/reconnect recovery, the driver tapping Retry, or the timer.
 */
export type PhotoQueuePassTrigger =
  | "photo-saved"
  | "manual-retry"
  | "foreground-recovery"
  | "network-restored"
  | "backoff-timer";

export type PhotoUploadService = {
  /** Foreground pass: retry hard, no backoff pauses (user is waiting). */
  triggerFast(trigger?: PhotoQueuePassTrigger): Promise<void>;
  /** Background pass: honour the §6 backoff schedule. */
  triggerBackoff(trigger?: PhotoQueuePassTrigger): Promise<void>;
  /** Whether a run is currently in progress. */
  readonly isRunning: boolean;
  /** Total rows still not `uploaded`, across every photo table (§6). */
  countUnresolved(): Promise<number>;
};

export function createPhotoUploadService(
  client: SupabaseClient,
): PhotoUploadService {
  // Fast mode is time-boxed (§6): it lasts until this timestamp, then passes
  // fall back to the backoff schedule automatically. A stuck row can no longer
  // pin the queue in fast mode forever.
  let fastUntil = 0;
  let scheduled: ReturnType<typeof setTimeout> | null = null;

  /**
   * Serializes claim-and-reserve. Every lane's claim queues behind the previous
   * one, so "pick a row, mark it `uploading`" is atomic from the app's point of
   * view even though `claimNext` is a plain SELECT underneath.
   */
  let claimChain: Promise<unknown> = Promise.resolve();
  function withClaimLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = claimChain.then(fn, fn);
    claimChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Rows this service has reserved and is still uploading, keyed `table:id`.
   * The §14 staleness sweep consults it so it can never reclaim a row out from
   * under a slow-but-live attempt.
   */
  const inFlightRows = new Set<string>();
  const inFlightKey = (table: string, rowId: string): string =>
    `${table}:${rowId}`;
  const isRowInFlight = (table: string, rowId: string): boolean =>
    inFlightRows.has(inFlightKey(table, rowId));

  const effectiveMode = (): PhotoQueueMode =>
    Date.now() < fastUntil ? "fast" : "backoff";

  /**
   * Picks the next eligible row across the tables in priority order and
   * reserves it, both inside one critical section. Returns the reserved row
   * together with its adapter — never via shared state, which several lanes
   * would race on.
   */
  const claimNextPendingRow = (): Promise<ClaimedRow | null> =>
    withClaimLock(async () => {
      const now = Date.now();
      const mode = effectiveMode();

      for (const adapter of PHOTO_QUEUE_ADAPTERS) {
        // Nothing eligible in this table — cheap, bounded, move on. This is the
        // ONLY reason to keep scanning.
        const row = await adapter.claimNext(mode, now);
        if (!row) continue;

        // Reserve it before releasing the lock. Marking the attempt started
        // here also means a mid-upload app kill leaves a visible `uploading`
        // row rather than a silent gap (§14 then reclaims it).
        const marked = applyUploadEvent(row, "attempt_started", nowIso());
        try {
          await persistWithRetry(() => adapter.persist(marked), {
            label: `claim ${adapter.table} ${row.id}`,
          });
        } catch (error) {
          // Tight-loop guard. The reservation write failed even after retries,
          // which means the database itself is unhappy — trying two more
          // tables' reservation writes in this same call would very likely fail
          // too, for no benefit. Give up on the whole claim instead: the lane's
          // loop breaks on `null`, the row is left exactly as it was, and the
          // existing pass cadence (4s fast / 60s backoff) brings it back. That
          // spaced timer is the codebase's standing answer to hot-looping; this
          // path deliberately adds no cooldown mechanism of its own.
          photoQueueLog.warn(
            `claim reservation failed after retries, deferring to next pass: ` +
              `${adapter.table} ${row.id}`,
            error,
          );
          return null;
        }

        inFlightRows.add(inFlightKey(adapter.table, marked.id));
        return { row: marked, adapter };
      }

      return null;
    });

  const evidenceFor = async (
    adapter: PhotoQueueTableAdapter,
    row: PhotoUploadRow,
    outcome: BucketUploadOutcome,
  ): Promise<UploadEvidence> => {
    const evidence: UploadEvidence = {
      apiConfirmed: outcome.kind === "confirmed",
      duplicatePathSignal: outcome.kind === "duplicate",
      // §5.1 — our deadline fired, but the storage SDK never forwarded the
      // abort to the request, so the upload may be landing server-side as we
      // speak. Ambiguous, exactly like a duplicate-path signal.
      timedOutSignal: outcome.kind === "timed_out",
      bucketObjectExists: null,
    };
    // Only the ambiguous "did it land anyway?" cases earn a real bucket lookup;
    // neither ambiguous signal ever decides success on its own (§10, §5.1).
    if (needsBucketVerification(evidence)) {
      evidence.bucketObjectExists = await objectExistsInBucket(
        client,
        adapter.bucket,
        row.photo_path,
      );
    }
    return evidence;
  };

  /**
   * Uploads one already-reserved row. The `attempt_started` write happened in
   * the claim step, so this starts from a row that is already `uploading` and
   * only ever writes a terminal outcome.
   *
   * Every one of those terminal writes goes through `persistUploadEvent` with
   * the guaranteed-`failed` fallback (§14), so none of them needs its own
   * try/catch and none of them can leave the row stranded in `uploading`.
   */
  const uploadRow = async ({ row, adapter }: ClaimedRow): Promise<void> => {
    const label = `${adapter.table} ${row.id}`;
    const persist = (
      event: Parameters<typeof persistUploadEvent>[2],
      errorMessage?: string,
    ) =>
      persistUploadEvent(adapter, row, event, nowIso(), errorMessage, {
        label,
        guaranteedFailedFallback: true,
      });

    try {
      photoQueueLog.info(`attempt: ${label}`, {
        photo_path: row.photo_path,
        attempts: row.attempts,
        bucket: adapter.bucket,
      });

      // No local file to upload — and none recoverable by retrying. Park the
      // row (§6) so the worker stops burning passes on it; re-adding the photo
      // clears this and re-queues it. It is never archived or deleted (§3). The
      // path is always recomputed live from `photo_path` + the current document
      // directory — never trusted from a stored column — so container drift
      // between when the row was written and now can't produce a false miss.
      if (!(await localPhotoExists(row.photo_path))) {
        await persist("attempt_failed", MISSING_LOCAL_FILE_ERROR);
        photoQueueLog.warn(
          `parked: ${label} — no local file at ${row.photo_path} (§12 sweep will re-check every pass)`,
        );
        return;
      }

      let data: ArrayBuffer;
      try {
        data = await readLocalFile(localUriForPath(row.photo_path));
      } catch (error) {
        await persist("attempt_failed", stringifyError(error));
        photoQueueLog.warn(`failed: ${label} — local read error`, error);
        return;
      }

      const outcome = await uploadToBucket({
        client,
        bucket: adapter.bucket,
        path: row.photo_path,
        data,
        upsert: adapter.upsert,
      });

      const evidence = await evidenceFor(adapter, row, outcome);

      if (isUploadSuccessful(evidence)) {
        await persist("upload_confirmed");
        photoQueueLog.info(
          `uploaded: ${label} → ${adapter.bucket}/${row.photo_path}`,
        );
        return;
      }

      const event =
        outcome.kind === "timed_out" ? "attempt_timed_out" : "attempt_failed";
      const message =
        "error" in outcome ? stringifyError(outcome.error) : undefined;
      await persist(event, message);
      photoQueueLog.warn(
        `failed: ${label} — ${outcome.kind}${message ? ` (${message})` : ""}; ` +
          `attempt ${row.attempts + 1}, will retry`,
      );
    } finally {
      // Released however this ended — success, failure, or an unforeseen throw
      // — so a crashed attempt can never permanently shield its row from the
      // §14 sweep.
      inFlightRows.delete(inFlightKey(adapter.table, row.id));
    }
  };

  const worker = createUploadQueueWorker({ claimNextPendingRow, uploadRow });

  const countUnresolved = async (): Promise<number> => {
    let total = 0;
    for (const adapter of PHOTO_QUEUE_ADAPTERS) {
      total += await adapter.countUnresolved();
    }
    return total;
  };

  const clearScheduled = (): void => {
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
  };

  const scheduleNextPass = (): void => {
    if (scheduled) return;
    const delay =
      Date.now() < fastUntil ? FAST_RESCHEDULE_MS : BACKOFF_RESCHEDULE_MS;
    scheduled = setTimeout(() => {
      scheduled = null;
      void runPass("backoff-timer");
    }, delay);
  };

  /**
   * One sweep + one drain, then — if anything at all is still unresolved — arm
   * the next pass on a timer.
   *
   * The re-arm condition is deliberately `countUnresolved`, not
   * `countActionable`: a row parked for a missing local file is exactly the row
   * the §12 sweep needs to keep re-examining, so the loop has to stay alive for
   * it. That is affordable precisely because the sweep is bounded and offline —
   * this is still not the old busy `for(;;)` loop, just a spaced timer that
   * outlives the actionable work.
   */
  const runPass = async (trigger: PhotoQueuePassTrigger): Promise<void> => {
    const startedAtMs = Date.now();
    const mode = effectiveMode();
    photoQueueLog.info(`pass start — trigger=${trigger}, mode=${mode}`);

    // §12 — local only, so it runs whether or not there is a network.
    const sweep = await sweepParkedRows(PHOTO_QUEUE_ADAPTERS);
    if (sweep.healed > 0 || sweep.stillParked > 0) {
      photoQueueLog.info(
        `pass sweep — healed ${sweep.healed}, still parked ${sweep.stillParked}`,
        sweep.perTable,
      );
    }

    // §14 — also local only, and cheap enough (one selective, LIMITed query per
    // table, almost always empty) to run on every pass rather than only on the
    // foreground/reconnect triggers. Rows this pass's own lanes are uploading
    // are excluded by `isRowInFlight`.
    const staleSweep = await sweepStaleUploadingRows(PHOTO_QUEUE_ADAPTERS, {
      isInFlight: isRowInFlight,
    });
    if (staleSweep.reclaimed > 0) {
      photoQueueLog.info(
        `pass stale-sweep — reclaimed ${staleSweep.reclaimed}`,
        staleSweep.perTable,
      );
    }

    // §13 — one connectivity check for the whole pass, never per row.
    const online = await isNetworkAvailable();
    if (online) {
      await worker.trigger();
    } else {
      photoQueueLog.info(
        "pass gate — offline, skipping upload attempts (sweep still ran; " +
          "no attempt is burned and no backoff is advanced)",
      );
    }

    const unresolved = await countUnresolved();
    photoQueueLog.info(
      `pass end — trigger=${trigger}, online=${online}, ` +
        `unresolved=${unresolved}, took ${Date.now() - startedAtMs}ms`,
    );

    if (unresolved > 0) {
      scheduleNextPass();
    }
  };

  return {
    async triggerFast(trigger = "photo-saved") {
      fastUntil = Date.now() + FAST_WINDOW_MS;
      clearScheduled();
      await runPass(trigger);
    },
    async triggerBackoff(trigger = "backoff-timer") {
      clearScheduled();
      await runPass(trigger);
    },
    get isRunning() {
      return worker.isRunning;
    },
    countUnresolved,
  };
}
