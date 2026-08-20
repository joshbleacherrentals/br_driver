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
 * reading `pending` would both write `uploading` and both upload. `claimLedger`
 * below enforces exactly the same guarantee at exactly the same scope, inside
 * the same lock, for free — and `claimNext` consults it, so a reserved row is
 * invisible to every subsequent claim just as a non-`pending` row was.
 *
 * THE LEDGER OUTLIVES THE ATTEMPT, BECAUSE THE READ CONNECTION LAGS THE WRITE
 * A reservation that is dropped the instant `persist()` resolves is dropped too
 * early. The SELECT behind `claimNext` runs on a *different* SQLite connection
 * than the write did — PowerSync/op-sqlite keeps one write-locked connection and
 * separate read-only ones — so for a short window after a commit the reader
 * still serves the pre-commit snapshot, in which the row is `pending` and
 * (having just been released) unreserved. The very next claim then handed the
 * same row straight back out and uploaded the same bytes a second time.
 *
 * So the ledger does not track "mid-flight"; it tracks *what this process last
 * wrote for the row*, and keeps that record after the attempt ends. For rows it
 * has itself written, that record — not the possibly-stale read — is what the
 * claim path believes: a row this process confirmed is never re-claimed, and a
 * row it just failed waits out its backoff against this process's own
 * `attempts`/`last_attempt_at`. It stays a purely in-memory, single-process
 * mechanism (§10) and still evaporates with the process, exactly as below.
 *
 * What the database write additionally bought was *durability* of the
 * reservation across process death — and that is the property §14 exists to
 * undo, not to preserve: an app killed mid-upload left a row stranded in
 * `uploading`, unclaimable and uncounted, for hours. An in-memory reservation
 * simply evaporates with the process; the row is still sitting at `pending` /
 * `failed` with its original `attempts`, so the next launch claims it again as
 * ordinary work. §14's sweep is kept regardless — devices in the field still
 * carry rows stranded by the old behaviour, and it is the only thing that
 * reclaims them. The same is true of the retained post-attempt records: they
 * only ever *narrow* what this process claims, so losing them costs nothing
 * beyond the redundant work the next launch would have done anyway.
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

import { isDueForFastRetry, isDueForRetry } from "../backoff";
import type { BucketPresence, PhotoUploadRow, UploadEvidence } from "../types";
import { attemptVerdict, needsBucketVerification } from "../uploadSuccess";
import { createUploadQueueWorker } from "../worker";
import {
  BucketUploadOutcome,
  lookupBucketObject,
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

/**
 * §10 — how long a *confirmed* claim-ledger entry is kept after this process
 * wrote it, before the entry may be dropped.
 *
 * The ledger only exists to out-vote a stale read: for a short window after a
 * commit, `claimNext`'s read connection still serves the pre-commit snapshot
 * (see the module header). Once that window has passed, an entry whose record
 * says `uploaded` has no job left — the real row now reads back `uploaded`,
 * which is invisible to `claimNext` by construction — so keeping it is pure
 * growth. Without this the map grew linearly with every photo the process had
 * ever handled.
 *
 * The lag was measured on device in the tens of milliseconds, worst case
 * ~130ms; 5s is ~38x that, and well under {@link BACKOFF_RESCHEDULE_MS}, so an
 * entry can never outlive a whole idle pass cycle. If the lag is ever measured
 * materially higher than ~130ms, this number is the thing to revisit.
 *
 * Only entries meeting ALL of "not in flight", "record is the confirmed
 * terminal state `uploaded`" and "record older than this" are evicted; a
 * `pending`/`failed` record is doing live work (it holds this process's real
 * `attempts`/`last_attempt_at` against a stale read) and is never evicted on a
 * timer, nor is the §14 "claim held for the session" case, which stays
 * `inFlight` on purpose.
 */
export const LEDGER_CONFIRMED_ENTRY_TTL_MS = 5_000;

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
   * How many rows this service currently holds a claim-ledger record for.
   *
   * Purely an observability seam. Eviction of a confirmed entry is by design
   * behaviourally invisible — the row reads back `uploaded` whether or not the
   * entry is still there — so boundedness cannot be asserted from the outside
   * any other way (§10).
   */
  readonly claimLedgerSize: number;
  /**
   * Retires this instance. Idempotent, and part of the type on purpose: a
   * service that cannot be retired is a service that lives forever.
   *
   * The pass loop re-arms itself on a timer for as long as anything is
   * unresolved, and nothing about that timer depends on the instance still
   * being reachable from React. A superseded instance therefore kept claiming
   * rows, kept uploading through a stale Supabase client and kept its whole
   * retained graph (client, `claimLedger`, closures) alive for the rest of the
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
   * What this service knows about one row, from having handled it itself.
   *
   * `written` is the whole point of the ledger surviving the attempt: it is the
   * row exactly as this process last persisted it, and it is authoritative over
   * anything `claimNext` reads back, because the read connection can still be
   * serving a pre-commit snapshot (see the module header).
   */
  type ClaimLedgerEntry = {
    /** A lane is mid-attempt on this row right now. */
    inFlight: boolean;
    /** The row as this process last wrote it; `null` before the first write. */
    written: PhotoUploadRow | null;
    /**
     * When `written` was recorded (ms since epoch); `null` while there is no
     * record. Only used to age out confirmed entries — see
     * {@link LEDGER_CONFIRMED_ENTRY_TTL_MS}.
     */
    writtenAtMs: number | null;
  };

  /**
   * The claim ledger, keyed `table:id`. This IS the exclusivity mechanism
   * (§10) — see the module header for why it replaced the `uploading` status
   * write rather than merely shadowing it, and why entries outlive the attempt
   * that created them.
   *
   * Three readers:
   *   - `claimNextPendingRow`, so neither a reserved row nor one this process
   *     has already resolved is ever handed to another lane;
   *   - the §14 staleness sweep, so it can never reclaim a row out from under a
   *     slow-but-live attempt;
   *   - the §6 recovery pass, for the same reason.
   *
   * The latter two ask only about `inFlight` — "is a lane working on this right
   * now" — which is what `isRowInFlight` still answers, and only that.
   */
  const claimLedger = new Map<string, ClaimLedgerEntry>();
  const ledgerKey = (table: string, rowId: string): string =>
    `${table}:${rowId}`;
  const ledgerEntry = (table: string, rowId: string): ClaimLedgerEntry => {
    const key = ledgerKey(table, rowId);
    const existing = claimLedger.get(key);
    if (existing) return existing;
    const created: ClaimLedgerEntry = {
      inFlight: false,
      written: null,
      writtenAtMs: null,
    };
    claimLedger.set(key, created);
    return created;
  };
  const isRowInFlight = (table: string, rowId: string): boolean =>
    claimLedger.get(ledgerKey(table, rowId))?.inFlight === true;

  /**
   * Drops the ledger entries that have finished being useful, so the map is
   * bounded by the work in flight rather than by everything the process has
   * ever handled (§10).
   *
   * Deliberately surgical rather than a `clear()`: the three conditions below
   * are exactly the case where the entry provably has no remaining job. Any
   * entry still `pending`/`failed`, still in flight, or written too recently
   * for the read connection to have demonstrably caught up is left alone —
   * dropping one of those would reintroduce the read-after-write re-claim this
   * ledger exists to prevent.
   */
  const evictSettledLedgerEntries = (nowMs: number): void => {
    for (const [key, entry] of claimLedger) {
      // A lane is mid-attempt — including §14's deliberately-held claim.
      if (entry.inFlight) continue;
      // Not the confirmed terminal state: `pending`/`failed` records still hold
      // this process's real attempts/backoff against a stale read, and a
      // claimed-but-never-written entry has nothing to age.
      if (entry.written === null || entry.writtenAtMs === null) continue;
      if (entry.written.upload_status !== "uploaded") continue;
      if (nowMs - entry.writtenAtMs < LEDGER_CONFIRMED_ENTRY_TTL_MS) continue;
      claimLedger.delete(key);
    }
  };

  /**
   * Whether this process must not hand `rowId` out right now, judged against
   * its own record rather than the row the claim query returned.
   *
   * Three ways to be blocked, and the last two are what the read-after-write
   * lag makes necessary:
   *   - a lane is mid-attempt on it;
   *   - this process already confirmed it, so re-uploading it is pure waste no
   *     matter how `pending` the reader still thinks it looks;
   *   - this process recorded an attempt whose backoff has not elapsed yet,
   *     measured against the `attempts`/`last_attempt_at` it actually wrote.
   *     A stale read would show the *previous* attempt's timing and let the row
   *     straight back through.
   */
  const isClaimBlocked = (
    table: string,
    rowId: string,
    mode: PhotoQueueMode,
    nowMs: number,
  ): boolean => {
    const entry = claimLedger.get(ledgerKey(table, rowId));
    if (!entry) return false;
    if (entry.inFlight) return true;

    const written = entry.written;
    // Claimed but never written: an attempt that ended without recording
    // anything holds nothing against the row.
    if (!written) return false;
    if (written.upload_status === "uploaded") return true;

    return !(mode === "fast"
      ? isDueForFastRetry(written, nowMs)
      : isDueForRetry(written, nowMs));
  };

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
          isClaimBlocked(adapter.table, rowId, mode, now),
        );
        if (!row) continue;

        // Reserve it before releasing the lock. Nothing is written: the ledger
        // is the reservation (see the module header), so this cannot fail, and
        // the claim path performs no database write at all.
        ledgerEntry(adapter.table, row.id).inFlight = true;
        return { row, adapter };
      }

      return null;
    });

  /**
   * The evidence for one attempt, plus the raw tri-state answer the bucket
   * lookup gave (`null` when no lookup was warranted).
   *
   * The two are separate because they answer different questions: the evidence
   * decides success, for which `absent` and `unknown` are the same non-answer;
   * the presence decides whether a non-success may be *recorded as a failure*,
   * for which they are opposites (§5.1).
   */
  type AttemptEvidence = {
    evidence: UploadEvidence;
    presence: BucketPresence | null;
  };

  const evidenceFor = async (
    adapter: PhotoQueueTableAdapter,
    row: PhotoUploadRow,
    outcome: BucketUploadOutcome,
  ): Promise<AttemptEvidence> => {
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
    if (!needsBucketVerification(evidence)) {
      return { evidence, presence: null };
    }

    const presence = await lookupBucketObject(
      client,
      adapter.bucket,
      row.photo_path,
    );
    evidence.bucketObjectExists = presence === "present";
    return { evidence, presence };
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
        {
          label,
          guaranteedFailedFallback: true,
          // The ledger records what actually landed, which is not always the
          // event we asked for (§14's fallback writes `failed` instead). That
          // record is what the next claim trusts over the read connection.
          onPersisted: (persisted) => {
            const entry = ledgerEntry(adapter.table, row.id);
            entry.written = persisted;
            entry.writtenAtMs = Date.now();
          },
        },
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

      const { evidence, presence } = await evidenceFor(adapter, row, outcome);
      const verdict = attemptVerdict(evidence, presence);

      if (verdict === "confirmed") {
        await persist("upload_confirmed");
        photoQueueLog.info(
          `uploaded: ${label} → ${adapter.bucket}/${row.photo_path}`,
        );
        return;
      }

      // §5.1/§9 — the bucket rejected the write because something is already at
      // this path, and the verifying lookup could not answer. Recording a
      // failed attempt here would ratchet backoff and show the driver an error
      // on the strength of evidence that was never gathered; only the timestamp
      // moves, so the row is retried on a later pass rather than the next one.
      if (verdict === "inconclusive") {
        await persist("attempt_inconclusive");
        photoQueueLog.warn(
          `inconclusive: ${label} — object already at ${adapter.bucket}/` +
            `${row.photo_path}, but the bucket lookup could not answer. ` +
            `Row left retryable at attempt ${row.attempts}; nothing recorded.`,
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
        // Only the reservation is released. The `written` record stays — it is
        // what keeps the next claim from re-uploading this row on a stale read
        // (see the module header).
        ledgerEntry(adapter.table, row.id).inFlight = false;
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

    // §10 — age out the confirmed ledger records from earlier passes before
    // this one claims anything, so the map tracks concurrently-active work
    // rather than the whole session's history. Done here, at a pass boundary,
    // because it is the one point where no lane is mid-claim.
    evictSettledLedgerEntries(startedAtMs);

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
    get claimLedgerSize() {
      return claimLedger.size;
    },
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
