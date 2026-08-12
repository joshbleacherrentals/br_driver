/**
 * §6 — the "1 minute → verify → banner" rule, assembled.
 *
 * Every app open / foreground transition runs one pass:
 *   1. unresolved photos exist ⇒ the worker gets a minute of fast retries, and
 *      the driver is told nothing;
 *   2. at the 60s mark, anything still not `uploaded` is checked directly
 *      against the bucket — the local status alone is never trusted;
 *   3. objects the bucket says are genuinely absent open the banner gate;
 *      objects that turn out to be present heal their own row to `uploaded`;
 *   4. the worker's fast window lapses on its own, dropping back to backoff.
 *
 * The decision at each step is `decideRecovery` (pure, spec-tested); this module
 * only supplies it with real numbers and carries out what it returns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { decideRecovery, FAST_RETRY_WINDOW_MS } from "../recovery";
import type { PhotoUploadRow } from "../types";
import { applyUploadEvent } from "../uploadStatus";
import { lookupBucketObject } from "./bucketUpload";
import type { PhotoUploadService } from "./photoUploadService";
import {
  clearRecoveryState,
  setConfirmedMissingPhotoIds,
} from "./recoveryStore";
import { PHOTO_QUEUE_ADAPTERS } from "./tableAdapters";
import type { PhotoQueueTableAdapter } from "./types";

/** Ceiling on bucket lookups per pass, per table — a check, not a crawl. */
const VERIFY_LIMIT_PER_TABLE = 50;

export type ForegroundRecovery = {
  /** Runs one §6 pass. Safe to call on every foreground; overlaps are ignored. */
  run(): void;
  /** Cancels a pending verification (sign-out, provider teardown). */
  dispose(): void;
};

export type ForegroundRecoveryDeps = {
  client: SupabaseClient;
  service: PhotoUploadService;
  /** Injectable for tests; defaults to every photo table the queue serves. */
  adapters?: readonly PhotoQueueTableAdapter[];
};

/**
 * A row is only a §6 candidate once it has actually failed an attempt. A photo
 * saved seconds ago is `pending` because the worker has not reached it yet, not
 * because anything went wrong — bannering it would contradict the copy ("photos
 * that failed to upload") and would fire during a perfectly healthy save.
 */
function hasFailedAtLeastOnce(row: PhotoUploadRow): boolean {
  return row.attempts > 0;
}

export function createForegroundRecovery(
  deps: ForegroundRecoveryDeps,
): ForegroundRecovery {
  const adapters = deps.adapters ?? PHOTO_QUEUE_ADAPTERS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let passInFlight = false;

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  /**
   * Step 2/3. Returns the ids the bucket confirms are absent. Rows the bucket
   * turns out to already hold are healed to `uploaded` here — that is the whole
   * point of §6.2, ruling out a false "failed" whose file actually landed.
   */
  const verifyAgainstBucket = async (): Promise<Set<string>> => {
    const confirmedMissing = new Set<string>();

    for (const adapter of adapters) {
      let rows: PhotoUploadRow[];
      try {
        rows = await adapter.listUnresolved(VERIFY_LIMIT_PER_TABLE);
      } catch {
        continue;
      }

      for (const row of rows.filter(hasFailedAtLeastOnce)) {
        if (!row.photo_path) {
          continue;
        }
        const presence = await lookupBucketObject(
          deps.client,
          adapter.bucket,
          row.photo_path,
        );

        if (presence === "present") {
          // Ground truth beats local state: the file is there, so the row is
          // done. Nothing is deleted — only the status catches up (§3, §6.2).
          try {
            await adapter.persist(
              applyUploadEvent(row, "upload_confirmed", new Date().toISOString()),
            );
          } catch {
            // A failed write just leaves the row retryable; never fatal.
          }
        } else if (presence === "absent") {
          confirmedMissing.add(row.id);
        }
        // "unknown" (offline, auth, rate limit) is not evidence of loss — the
        // photo stays silent and the next foreground pass asks again.
      }
    }

    return confirmedMissing;
  };

  const finishPass = async (startedAtMs: number): Promise<void> => {
    const decision = decideRecovery({
      elapsedMs: Date.now() - startedAtMs,
      unresolvedPhotoCount: await deps.service.countUnresolved(),
      bucketVerification: "not_run",
    });

    if (!decision.verifyBucket) {
      // Everything drained during the fast window — nothing left to tell.
      clearRecoveryState();
      return;
    }

    const confirmedMissing = await verifyAgainstBucket();

    // Only an affirmative "the bucket does not have this" counts as missing.
    // Everything else — healed rows, and lookups that could not run — resolves
    // the other way, so the banner needs positive evidence to appear (§6.2) and
    // an offline phone stays quiet.
    const verdict = decideRecovery({
      elapsedMs: Date.now() - startedAtMs,
      unresolvedPhotoCount: await deps.service.countUnresolved(),
      bucketVerification:
        confirmedMissing.size > 0 ? "confirmed_missing" : "confirmed_present",
    });

    if (verdict.showBanner) {
      setConfirmedMissingPhotoIds(confirmedMissing);
    } else {
      clearRecoveryState();
    }
  };

  return {
    run() {
      if (passInFlight) {
        return;
      }
      passInFlight = true;
      clearTimer();

      const startedAtMs = Date.now();

      void (async () => {
        try {
          const decision = decideRecovery({
            elapsedMs: 0,
            unresolvedPhotoCount: await deps.service.countUnresolved(),
            bucketVerification: "not_run",
          });

          if (decision.retryMode === "idle") {
            clearRecoveryState();
            passInFlight = false;
            return;
          }

          // Step 1 — a minute of quick retries before the driver is bothered.
          // `triggerFast` opens exactly that window and lapses into backoff on
          // its own, which is step 4.
          void deps.service.triggerFast();

          timer = setTimeout(() => {
            timer = null;
            void finishPass(startedAtMs).finally(() => {
              passInFlight = false;
            });
          }, FAST_RETRY_WINDOW_MS);
        } catch {
          passInFlight = false;
        }
      })();
    },

    dispose() {
      clearTimer();
      passInFlight = false;
    },
  };
}
