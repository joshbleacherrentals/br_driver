/**
 * Supabase Storage side of the custom photo upload queue.
 *
 * Wires the pure helpers (`resolveContentType`, `uploadWithTimeout`) to the real
 * Supabase client, and — critically for §9/§10 — never infers success from an
 * error string. A single attempt returns a structured outcome; the caller turns
 * that into `UploadEvidence` and, only when the outcome is ambiguous, asks
 * `lookupBucketObject` for the ground truth before committing `uploaded`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAlreadyInStorageError } from "@/utils/isAlreadyInStorageError";

import { resolveContentType } from "../contentType";
import type { BucketPresence } from "../types";
import { UPLOAD_TIMEOUT_MS, uploadWithTimeout } from "../uploadTimeout";

export type { BucketPresence };

const TIMEOUT_MESSAGE = "Upload timed out";

export type BucketUploadInput = {
  client: SupabaseClient;
  bucket: string;
  /** Object path within the bucket — doubles as the row's `photo_path` (§3). */
  path: string;
  data: ArrayBuffer;
  /** Insert-only buckets (damage-report-photos) pass `false` (§10). */
  upsert: boolean;
  timeoutMs?: number;
};

/**
 * The four ways a single attempt can end. `duplicate` and `timed_out` are kept
 * distinct from `failed` so the caller can react correctly: a duplicate means
 * "a previous attempt may have landed — go verify", a timeout is just another
 * retryable attempt (§5), and only `confirmed` is an explicit API success (§9).
 */
export type BucketUploadOutcome =
  | { kind: "confirmed" }
  | { kind: "duplicate"; error: unknown }
  | { kind: "timed_out"; error: unknown }
  | { kind: "failed"; error: unknown };

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === TIMEOUT_MESSAGE;
}

/** Runs exactly one upload attempt under the §5 deadline. */
export async function uploadToBucket(
  input: BucketUploadInput,
): Promise<BucketUploadOutcome> {
  try {
    await uploadWithTimeout(async (signal) => {
      const { error } = await input.client.storage
        .from(input.bucket)
        .upload(input.path, input.data, {
          contentType: resolveContentType(input.path),
          upsert: input.upsert,
        });
      // supabase-js resolves with `{ error }` instead of throwing.
      if (error) {
        throw error;
      }
      // If the deadline won the race the request is abandoned; surface it as a
      // timeout rather than a phantom success.
      if (signal.aborted) {
        throw new Error(TIMEOUT_MESSAGE);
      }
    }, input.timeoutMs ?? UPLOAD_TIMEOUT_MS);

    return { kind: "confirmed" };
  } catch (error) {
    if (isTimeoutError(error)) {
      return { kind: "timed_out", error };
    }
    if (isAlreadyInStorageError(error)) {
      return { kind: "duplicate", error };
    }
    return { kind: "failed", error };
  }
}

/**
 * Direct bucket lookup — the ground truth §6.2/§10 requires before a row may be
 * declared `uploaded`, or reported to the driver as lost, on anything less than
 * an explicit API answer.
 */
export async function lookupBucketObject(
  client: SupabaseClient,
  bucket: string,
  path: string,
): Promise<BucketPresence> {
  const slash = path.lastIndexOf("/");
  const prefix = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { search: name, limit: 100 });

    // An errored list says nothing about the object — offline, auth expired,
    // rate limited. Never downgrade that to "absent".
    if (error) {
      return "unknown";
    }
    return (data ?? []).some((object) => object.name === name)
      ? "present"
      : "absent";
  } catch {
    return "unknown";
  }
}
