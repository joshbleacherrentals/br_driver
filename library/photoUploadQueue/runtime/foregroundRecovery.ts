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
 * only supplies it with real numbers and carries out what it returns. "Real" is
 * the load-bearing word: the counts are §15-scoped to the signed-in driver, so
 * before that context exists they are not numbers at all, and the one verdict
 * that ends the pass early — `idle`, which clears the driver's recovery state —
 * is never taken on one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { decideRecovery, FAST_RETRY_WINDOW_MS } from "../recovery";
import type { PhotoUploadRow } from "../types";
import { applyUploadEvent } from "../uploadStatus";
import { lookupBucketObject } from "./bucketUpload";
import { getDriverScope } from "@/library/powersync/scoping/driverScope";
import { isNetworkAvailable } from "./networkState";
import { photoQueueLog } from "./photoQueueLog";
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

    // §13 — a bucket lookup on an offline phone can only answer "unknown", so
    // it is pure cost. Bail out *without* clearing: an offline pass is not
    // evidence the problem went away, so whatever the driver is already being
    // shown must survive untouched until a pass can actually verify.
    if (!(await isNetworkAvailable())) {
      photoQueueLog.info(
        "recovery — offline, skipping bucket verification (existing banner/recovery state left as is)",
      );
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
          // §15 — the count below is scoped to the signed-in driver, and an
          // adapter with no driver context answers 0 outright. `run()` fires on
          // every `connect()` — launch, token refresh, JWT-expiry reconnect —
          // which is exactly when `SystemProvider` is still resolving those ids
          // (Clerk user → `Users` → `Drivers`), so this pass regularly races
          // them. Sampled *before* the count, so an "idle" verdict is only ever
          // trusted when the count that produced it could see this driver's
          // rows in the first place.
          const contextReady = getDriverScope() !== null;

          const decision = decideRecovery({
            elapsedMs: 0,
            unresolvedPhotoCount: await deps.service.countUnresolved(),
            bucketVerification: "not_run",
          });

          if (decision.retryMode === "idle" && contextReady) {
            photoQueueLog.info(
              "recovery — nothing unresolved for this driver; pass ends here",
            );
            clearRecoveryState();
            passInFlight = false;
            return;
          }

          if (decision.retryMode === "idle") {
            // Deliberately NOT `clearRecoveryState()`. That is a destructive
            // act — it drops the banner verdict the driver is entitled to — and
            // it must never be taken on a 0 that nothing was in a position to
            // verify. Falling through to the fast path instead costs one
            // recovery window and settles the question honestly: by the time
            // `finishPass` runs, `FAST_RETRY_WINDOW_MS` later, the ids have
            // long since resolved and its own counts are real.
            photoQueueLog.info(
              "recovery — unresolved=0 but no driver context yet (§15); " +
                "leaving recovery state alone and proceeding to the fast-retry " +
                "window, which re-counts for real at the 60s mark",
            );
          }

          // Step 1 — a minute of quick retries before the driver is bothered.
          // `triggerFast` opens exactly that window and lapses into backoff on
          // its own, which is step 4.
          void deps.service.triggerFast("foreground-recovery");

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
