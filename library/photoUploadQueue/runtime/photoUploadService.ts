/**
 * The custom photo upload queue, assembled.
 *
 * One serialized worker (§10) drives every photo table through its adapter.
 * For each claimed row it: marks `uploading`, reads the local file, runs one
 * timed upload attempt (§5), decides success on explicit evidence only (§9/§10)
 * — verifying against the bucket when the outcome is ambiguous — and persists
 * the resulting state. A row is never deleted or archived here; a failure just
 * leaves it retryable for the next pass (§3, §5).
 *
 * Retry cadence (§6) is timer-driven, never a busy loop: `triggerFast` opens a
 * short foreground window of quick retries; outside it, passes are spaced on a
 * background cadence. A permanently missing local file is parked (see
 * MISSING_LOCAL_FILE_ERROR) so it can neither hot-loop nor block other photos.
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
import { MISSING_LOCAL_FILE_ERROR, PHOTO_QUEUE_ADAPTERS } from "./tableAdapters";
import type { PhotoQueueMode, PhotoQueueTableAdapter } from "./types";

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

async function localFileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

async function readLocalFile(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
}

export type PhotoUploadService = {
  /** Foreground pass: retry hard, no backoff pauses (user is waiting). */
  triggerFast(): Promise<void>;
  /** Background pass: honour the §6 backoff schedule. */
  triggerBackoff(): Promise<void>;
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
  // Serialized worker ⇒ exactly one row is in flight, so a single ref safely
  // carries the owning adapter from `claimNextPendingRow` to `uploadRow`.
  let currentAdapter: PhotoQueueTableAdapter | null = null;

  const effectiveMode = (): PhotoQueueMode =>
    Date.now() < fastUntil ? "fast" : "backoff";

  const claimNextPendingRow = async (): Promise<PhotoUploadRow | null> => {
    const now = Date.now();
    const mode = effectiveMode();
    for (const adapter of PHOTO_QUEUE_ADAPTERS) {
      const row = await adapter.claimNext(mode, now);
      if (row) {
        currentAdapter = adapter;
        return row;
      }
    }
    currentAdapter = null;
    return null;
  };

  const evidenceFor = async (
    adapter: PhotoQueueTableAdapter,
    row: PhotoUploadRow,
    outcome: BucketUploadOutcome,
  ): Promise<UploadEvidence> => {
    const evidence: UploadEvidence = {
      apiConfirmed: outcome.kind === "confirmed",
      duplicatePathSignal: outcome.kind === "duplicate",
      bucketObjectExists: null,
    };
    // Only the ambiguous "already there?" case earns a real bucket lookup —
    // the duplicate signal alone never decides success (§10).
    if (needsBucketVerification(evidence)) {
      evidence.bucketObjectExists = await objectExistsInBucket(
        client,
        adapter.bucket,
        row.photo_path,
      );
    }
    return evidence;
  };

  const uploadRow = async (row: PhotoUploadRow): Promise<void> => {
    const adapter = currentAdapter;
    if (!adapter) {
      return;
    }

    // Mark the attempt as started before any I/O, so a mid-upload app kill
    // leaves a visible `uploading` row rather than a silent gap.
    await adapter.persist(applyUploadEvent(row, "attempt_started", nowIso()));

    // No local file to upload — and none recoverable by retrying. Park the row
    // (§6) so the worker stops burning passes on it; re-adding the photo clears
    // this and re-queues it. It is never archived or deleted (§3).
    if (!row.local_uri || !(await localFileExists(row.local_uri))) {
      await adapter.persist(
        applyUploadEvent(row, "attempt_failed", nowIso(), MISSING_LOCAL_FILE_ERROR),
      );
      return;
    }

    let data: ArrayBuffer;
    try {
      data = await readLocalFile(row.local_uri);
    } catch (error) {
      await adapter.persist(
        applyUploadEvent(row, "attempt_failed", nowIso(), stringifyError(error)),
      );
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
      await adapter.persist(applyUploadEvent(row, "upload_confirmed", nowIso()));
      return;
    }

    const event =
      outcome.kind === "timed_out" ? "attempt_timed_out" : "attempt_failed";
    const message =
      "error" in outcome ? stringifyError(outcome.error) : undefined;
    await adapter.persist(applyUploadEvent(row, event, nowIso(), message));
  };

  const worker = createUploadQueueWorker({ claimNextPendingRow, uploadRow });

  const countActionable = async (): Promise<number> => {
    let total = 0;
    for (const adapter of PHOTO_QUEUE_ADAPTERS) {
      total += await adapter.countActionable();
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
      void runPass();
    }, delay);
  };

  // One drain, then—if work the worker can still act on remains—arm the next
  // pass on a timer. This replaces the old busy `for(;;)` retry loop: a failing
  // row costs one attempt per spaced pass, not thousands per second.
  const runPass = async (): Promise<void> => {
    await worker.trigger();
    if ((await countActionable()) > 0) {
      scheduleNextPass();
    }
  };

  return {
    async triggerFast() {
      fastUntil = Date.now() + FAST_WINDOW_MS;
      clearScheduled();
      await runPass();
    },
    async triggerBackoff() {
      clearScheduled();
      await runPass();
    },
    get isRunning() {
      return worker.isRunning;
    },
    async countUnresolved() {
      let total = 0;
      for (const adapter of PHOTO_QUEUE_ADAPTERS) {
        total += await adapter.countUnresolved();
      }
      return total;
    },
  };
}
