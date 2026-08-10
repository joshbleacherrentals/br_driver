/**
 * The custom photo upload queue, assembled.
 *
 * One serialized worker (§10) drives every photo table through its adapter.
 * For each claimed row it: marks `uploading`, reads the local file, runs one
 * timed upload attempt (§5), decides success on explicit evidence only (§9/§10)
 * — verifying against the bucket when the outcome is ambiguous — and persists
 * the resulting state. A row is never deleted or archived here; a failure just
 * leaves it retryable for the next pass (§3, §5).
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
import { PHOTO_QUEUE_ADAPTERS } from "./tableAdapters";
import type { PhotoQueueMode, PhotoQueueTableAdapter } from "./types";

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
  let mode: PhotoQueueMode = "fast";
  // Serialized worker ⇒ exactly one row is in flight, so a single ref safely
  // carries the owning adapter from `claimNextPendingRow` to `uploadRow`.
  let currentAdapter: PhotoQueueTableAdapter | null = null;

  const claimNextPendingRow = async (): Promise<PhotoUploadRow | null> => {
    const now = Date.now();
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

    // No readable local file ⇒ this attempt failed. The row stays retryable and
    // the diagnostic is recorded — it is never archived or deleted (§3).
    if (!row.local_uri) {
      await adapter.persist(
        applyUploadEvent(row, "attempt_failed", nowIso(), "No local file reference"),
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

  return {
    async triggerFast() {
      mode = "fast";
      await worker.trigger();
    },
    async triggerBackoff() {
      mode = "backoff";
      await worker.trigger();
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
