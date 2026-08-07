/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §6, "The '1 minute → banner' rule":
 *   1. on foreground, old pending/failed photos get 1 minute of fast retries
 *      with no backoff pauses;
 *   2. if after 60s a photo still isn't uploaded — verify directly against the
 *      bucket BEFORE showing anything;
 *   3. only a verified-missing object earns the non-dismissible banner;
 *   4. after that the worker drops back into normal background backoff.
 */

import {
  FAST_RETRY_WINDOW_MS,
  decideRecovery,
} from "@/library/photoUploadQueue/recovery";
import type { ForegroundRecoveryState } from "@/library/photoUploadQueue/types";

const unresolved = (
  elapsedMs: number,
  bucketVerification: ForegroundRecoveryState["bucketVerification"] = "not_run",
): ForegroundRecoveryState => ({
  elapsedMs,
  unresolvedPhotoCount: 2,
  bucketVerification,
});

describe("the 1 minute → banner rule (§6)", () => {
  it("uses a one minute fast-retry window", () => {
    expect(FAST_RETRY_WINDOW_MS).toBe(60_000);
  });

  it("retries fast and stays silent for the whole first minute", () => {
    for (const elapsedMs of [0, 1_000, 30_000, 59_000, 59_999]) {
      expect(decideRecovery(unresolved(elapsedMs))).toEqual({
        retryMode: "fast",
        verifyBucket: false,
        showBanner: false,
      });
    }
  });

  // The boundary the rule turns on. 59s: still quietly retrying. 60s and 61s:
  // verification is due, but the driver has still not been shown anything.
  it("switches from fast retries to verification exactly at 60s", () => {
    expect(decideRecovery(unresolved(59_000)).verifyBucket).toBe(false);
    expect(decideRecovery(unresolved(60_000)).verifyBucket).toBe(true);
    expect(decideRecovery(unresolved(61_000)).verifyBucket).toBe(true);

    expect(decideRecovery(unresolved(59_000)).showBanner).toBe(false);
    expect(decideRecovery(unresolved(60_000)).showBanner).toBe(false);
    expect(decideRecovery(unresolved(61_000)).showBanner).toBe(false);
  });

  it("never banners on an unverified guess, however long it has been", () => {
    for (const elapsedMs of [60_000, 61_000, 300_000, 86_400_000]) {
      const decision = decideRecovery(unresolved(elapsedMs));
      expect(decision.showBanner).toBe(false);
      expect(decision.verifyBucket).toBe(true);
    }
  });

  it("shows the banner and falls back to backoff once the object is confirmed missing", () => {
    const decision = decideRecovery(unresolved(61_000, "confirmed_missing"));

    expect(decision.showBanner).toBe(true);
    expect(decision.verifyBucket).toBe(false);
    expect(decision.retryMode).toBe("backoff");
  });

  // §6.2 — rules out the false "failed" where the file actually did land and
  // only the local status lagged behind.
  it("stays silent when verification finds the file already in the bucket", () => {
    const decision = decideRecovery(unresolved(61_000, "confirmed_present"));

    expect(decision.showBanner).toBe(false);
    expect(decision.verifyBucket).toBe(false);
  });

  it("does nothing at all when no photo is unresolved", () => {
    for (const elapsedMs of [0, 59_000, 60_000, 61_000]) {
      expect(
        decideRecovery({
          elapsedMs,
          unresolvedPhotoCount: 0,
          bucketVerification: "not_run",
        }),
      ).toEqual({
        retryMode: "idle",
        verifyBucket: false,
        showBanner: false,
      });
    }
  });
});
