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
 * behind a lock (`withClaimLock`) and *reserves* the row it hands out inside
 * that same critical section. Selecting a row and reserving it are one
 * indivisible app-level step; splitting them would let two lanes pick up the
 * same row, because `claimNext` is a plain SELECT and nothing below the app
 * layer serializes reads.
 *
 * THE RESERVATION IS IN MEMORY, NOT A DATABASE WRITE (§10, §14)
 * It used to be `upload_status = 'uploading'`, persisted before the upload and
 * overwritten by the terminal outcome afterwards. That cost a synced write per
 * photo per attempt: `DamageReportPhotos` et al. are ordinary PowerSync tables,
 * so every reservation became a CRUD operation queued for Postgres. At ~87
 * photos/minute during a drain that doubled the queue's CRUD production to
 * ~174 ops/min against ~55-76 ops/min of throughput, and the resulting backlog
 * — peaking at 7.5 minutes — delayed *every other write the driver made*, since
 * PowerSync uploads its CRUD queue strictly in order.
 *
 * Nothing was bought with it. §10 scopes claim exclusivity to one process, and
 * a local SQLite status column never provided more than that: two processes
 * reading `pending` would both write `uploading` and both upload. `inFlightRows`
 * below enforces exactly the same guarantee at exactly the same scope, inside
 * the same lock, for free — and `claimNext` consults it, so a reserved row is
 * invisible to every subsequent claim just as a non-`pending` row was.
 *
 * What the database write additionally bought was *durability* of the
 * reservation across process death — and that is the property §14 exists to
 * undo, not to preserve: an app killed mid-upload left a row stranded in
 * `uploading`, unclaimable and uncounted, for hours. An in-memory reservation
 * simply evaporates with the process; the row is still sitting at `pending` /
 * `failed` with its original `attempts`, so the next launch claims it again as
 * ordinary work. §14's sweep is kept regardless — devices in the field still
 * carry rows stranded by the old behaviour, and it is the only thing that
 * reclaims them.
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

import type { PhotoUploadRow, UploadEvidence } from "../types";
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
import { getDriverScope } from "@/library/powersync/scoping/driverScope";
import { localPhotoExists, readLocalPhotoBytes } from "./localFile";
import { isNetworkAvailable } from "./networkState";
import { sweepParkedRows } from "./parkedRowSweep";
import { persistUploadEvent } from "./persistUploadEvent";
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
  /**
   * Whether this service currently holds a claim reservation on a row.
   *
   * Public because the reservation is no longer written to the database, so the
   * database can no longer answer the question. Two consumers need it: the §14
   * stale sweep (never reclaim a row a live lane is still uploading) and the §6
   * recovery pass (never bucket-verify — and so never banner or overwrite — a
   * row an upload is mid-attempt on).
   */
  isRowInFlight(table: string, rowId: string): boolean;
  /**
   * Retires this instance. Idempotent, and part of the type on purpose: a
   * service that cannot be retired is a service that lives forever.
   *
   * The pass loop re-arms itself on a timer for as long as anything is
   * unresolved, and nothing about that timer depends on the instance still
   * being reachable from React. A superseded instance therefore kept claiming
   * rows, kept uploading through a stale Supabase client and kept its whole
   * retained graph (client, `inFlightRows`, closures) alive for the rest of the
   * session — the memory-retention bug behind RAM staying elevated long after
   * every visible upload had finished.
   *
   * After `dispose()`: no new claim is handed out, no new pass is scheduled and
   * no trigger does anything. Uploads already in flight are deliberately NOT
   * cancelled — their terminal `persist` still runs, so no row is ever lost
   * mid-attempt (§5, "never lose a row"); the lanes simply drain and end.
   *
   * `serviceRegistry.ts` owns the call, not the caller — see the note there.
   */
  dispose(): void;
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
   * Set once by `dispose()`, never cleared. Read at every point where this
   * instance could otherwise acquire new work or a new timer — the claim, the
   * scheduler and the three public entry points — so retirement is a property
   * of the instance rather than something the caller has to keep enforcing.
   */
  let disposed = false;

  /**
   * Serializes claim-and-reserve. Every lane's claim queues behind the previous
   * one, so "pick a row, reserve it" is atomic from the app's point of view
   * even though `claimNext` is a plain SELECT underneath.
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
   * The claim ledger: rows this service has reserved and is still uploading,
   * keyed `table:id`. This IS the exclusivity mechanism (§10) — see the module
   * header for why it replaced the `uploading` status write rather than merely
   * shadowing it.
   *
   * Three readers:
   *   - `claimNextPendingRow`, so a reserved row is never handed to a second
   *     lane;
   *   - the §14 staleness sweep, so it can never reclaim a row out from under a
   *     slow-but-live attempt;
   *   - the §6 recovery pass, for the same reason.
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
      // A retired instance hands out nothing. Checked inside the lock, so a
      // dispose that lands mid-pass cannot race a claim that is already
      // deciding; the lanes then break on `null` and the run ends by itself.
      if (disposed) return null;

      const now = Date.now();
      const mode = effectiveMode();

      for (const adapter of PHOTO_QUEUE_ADAPTERS) {
        // Rows this service already holds are excluded by the adapter itself,
        // so "nothing eligible here" genuinely means nothing eligible — cheap,
        // bounded, move on. This is the ONLY reason to keep scanning.
        const row = await adapter.claimNext(mode, now, (rowId) =>
          isRowInFlight(adapter.table, rowId),
        );
        if (!row) continue;

        // Reserve it before releasing the lock. Nothing is written: the ledger
        // is the reservation (see the module header), so this cannot fail, and
        // the claim path performs no database write at all.
        inFlightRows.add(inFlightKey(adapter.table, row.id));
        return { row, adapter };
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
   * Uploads one already-reserved row. The row arrives exactly as the database
   * holds it — the claim reserves in memory and writes nothing — so this only
   * ever writes a terminal outcome.
   *
   * Every one of those terminal writes goes through `persistUploadEvent` with
   * the guaranteed-`failed` fallback (§14), so none of them needs its own
   * try/catch. `recorded` tracks whether one of them actually landed, because
   * that is now what decides when the reservation may be released.
   */
  const uploadRow = async ({ row, adapter }: ClaimedRow): Promise<void> => {
    const label = `${adapter.table} ${row.id}`;
    /** `null` until a terminal write is attempted; then whether it landed. */
    let outcomeWritten: boolean | null = null;
    const persist = async (
      event: Parameters<typeof persistUploadEvent>[2],
      errorMessage?: string,
    ) => {
      outcomeWritten = await persistUploadEvent(
        adapter,
        row,
        event,
        nowIso(),
        errorMessage,
        { label, guaranteedFailedFallback: true },
      );
    };

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
        data = await readLocalPhotoBytes(row.photo_path);
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
      // Released once the outcome is on record — which is every path except the
      // one where §14's retries AND its guaranteed-`failed` fallback both fail
      // to write. There the database still holds the row exactly as it was
      // (`pending`/`failed`, original `attempts`), so releasing would hand it
      // straight back to the next lane and re-upload the same photo in a tight
      // loop, forever, with backoff never advancing because nothing can record
      // an attempt. Keeping the reservation parks it for the rest of the
      // session instead; a relaunch drops the ledger and retries it as ordinary
      // work. Note this leaves NO stuck row behind — unlike the `uploading`
      // write it replaces, whose equivalent failure stranded the row in the
      // database itself for hours.
      //
      // An unforeseen throw still releases: `outcomeWritten` is only `false`
      // when a terminal write was attempted and demonstrably failed.
      if (outcomeWritten !== false) {
        inFlightRows.delete(inFlightKey(adapter.table, row.id));
      } else {
        photoQueueLog.error(
          `holding claim on ${label} for this session — its outcome could not ` +
            `be written at all (§14). The row is untouched and retryable; the ` +
            `next launch will claim it again.`,
        );
      }
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
    // The line that makes an orphaned instance mortal. Without it this timer
    // re-arms unconditionally whenever anything is unresolved, forever, keeping
    // the instance and everything it closes over alive for the whole session.
    if (disposed) return;
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
   *
   * It also re-arms while the §15 driver context is still unset, because every
   * count is scoped to that context and reports 0 without it. Treating that 0
   * as "nothing to do" is how the loop used to die on launch: `SystemProvider`
   * resolves the ids reactively (Clerk user → `Users` → `Drivers`), so the
   * first pass after launch or a reconnect routinely runs before they exist,
   * and once the timer was not re-armed nothing ever armed it again for the
   * rest of the session. Bounded the same way as the parked-row case: the extra
   * passes are the same spaced timer, and they stop as soon as the context
   * resolves and the count becomes real.
   */
  const runPass = async (trigger: PhotoQueuePassTrigger): Promise<void> => {
    if (disposed) return;

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
    // §15 — every count is scoped to the signed-in driver, and an adapter with
    // no driver context answers 0 without looking at the database at all. Read
    // the context here so a zero can be told apart from a zero that only means
    // "not knowable yet".
    const contextReady = getDriverScope() !== null;
    photoQueueLog.info(
      `pass end — trigger=${trigger}, online=${online}, ` +
        `unresolved=${unresolved}, contextReady=${contextReady}, ` +
        `took ${Date.now() - startedAtMs}ms`,
    );

    // The two ways a pass can end with nothing to show for itself look
    // identical in the count and are opposites in the log, because only one of
    // them is allowed to stop the loop.
    if (unresolved === 0) {
      photoQueueLog.info(
        contextReady
          ? "pass idle — nothing unresolved for this driver; loop stands down " +
              "until the next save, foreground or network edge"
          : "pass idle (unverified) — unresolved=0 only because no driver " +
              "context is established yet (§15 gates every count to 0 until " +
              "SystemProvider resolves Users→Drivers); re-arming so the loop " +
              "is still alive when it does",
      );
    }

    // A zero taken while the context is still resolving is not evidence that
    // there is no work — it is the absence of evidence either way, and letting
    // it stop the loop is what silently killed every retry for a whole session.
    // Keeping the timer armed rides the existing 4s-fast / 60s-backoff cadence,
    // so this costs one extra spaced pass, and only during startup.
    if (unresolved > 0 || !contextReady) {
      scheduleNextPass();
    }
  };

  return {
    async triggerFast(trigger = "photo-saved") {
      if (disposed) return;
      fastUntil = Date.now() + FAST_WINDOW_MS;
      clearScheduled();
      await runPass(trigger);
    },
    async triggerBackoff(trigger = "backoff-timer") {
      if (disposed) return;
      clearScheduled();
      await runPass(trigger);
    },
    get isRunning() {
      return worker.isRunning;
    },
    countUnresolved,
    isRowInFlight,
    dispose() {
      if (disposed) return;
      disposed = true;
      // Nothing to await: lanes still uploading finish their attempt and
      // persist its outcome (§5/§14), then break on the next `null` claim.
      clearScheduled();
      photoQueueLog.info("service disposed — no further claims or passes");
    },
  };
}
