/**
 * Covers §14 — layer one of the persist defence.
 *
 * The rules encoded here:
 *   - a write that works first time costs exactly one call and no delay;
 *   - a write that fails transiently is retried, and the eventual success is
 *     returned as if nothing had happened;
 *   - a write that never succeeds rethrows the LAST error, so the caller's own
 *     fallback (`persistUploadEvent`) gets a real diagnosis to log;
 *   - the retry decision does not look at the error at all. This is the
 *     deliberate design point: op-sqlite (native) and the sql.js WASM adapter
 *     (dev/Expo Go) surface a busy database in different shapes, so any
 *     "is this SQLITE_BUSY?" test would fail open exactly when it mattered.
 *     Three blind retries at 100/300ms cost under half a second instead.
 *
 * Fake timers keep the real 100/300ms pauses out of the suite's wall-clock
 * while still proving they are actually awaited.
 */

import {
  PERSIST_RETRY_ATTEMPTS,
  PERSIST_RETRY_DELAYS_MS,
  persistWithRetry,
} from "@/library/photoUploadQueue/runtime/persistWithRetry";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** Runs `promise` to settlement, letting the retry pauses elapse. */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  const budget =
    PERSIST_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) * (PERSIST_RETRY_ATTEMPTS + 1);
  await jest.advanceTimersByTimeAsync(budget + 1_000);
  const result = await settled;
  if (result.ok) return result.value;
  throw result.error;
}

describe("persistWithRetry (§14)", () => {
  it("returns the first successful write without pausing", async () => {
    const fn = jest.fn(async () => "written");

    await expect(persistWithRetry(fn, { label: "row-1" })).resolves.toBe(
      "written",
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("retries a transient failure and returns the eventual success", async () => {
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValueOnce("written");

    await expect(
      runWithTimers(persistWithRetry(fn, { label: "row-2" })),
    ).resolves.toBe("written");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("uses every attempt before giving up", async () => {
    const fn = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("busy 1"))
      .mockRejectedValueOnce(new Error("busy 2"))
      .mockResolvedValueOnce("written");

    await expect(
      runWithTimers(persistWithRetry(fn, { label: "row-3" })),
    ).resolves.toBe("written");
    expect(fn).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS);
  });

  it("rethrows the last error once the attempts are exhausted", async () => {
    const last = new Error("still locked");
    const fn = jest
      .fn<Promise<never>, []>()
      .mockRejectedValueOnce(new Error("earlier"))
      .mockRejectedValueOnce(new Error("also earlier"))
      .mockRejectedValueOnce(last);

    await expect(
      runWithTimers(persistWithRetry(fn, { label: "row-4" })),
    ).rejects.toBe(last);
    expect(fn).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS);
  });

  // The retry budget is a hard ceiling: a persistently failing write must cost
  // a bounded number of calls, never spin.
  it("never exceeds the attempt budget however long the failure lasts", async () => {
    const fn = jest.fn(async () => {
      throw new Error("permanently unhappy");
    });

    await expect(
      runWithTimers(persistWithRetry(fn, { label: "row-5" })),
    ).rejects.toThrow("permanently unhappy");
    expect(fn).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS);
  });

  // Deliberate non-feature: no error classification anywhere in this module.
  it.each([
    ["an Error instance", new Error("database is locked")],
    ["a plain string", "SQLITE_BUSY"],
    ["a coded object", { code: "SQLITE_BUSY", message: "busy" }],
    ["a nullish rejection", null],
    ["something with no message at all", { weird: true }],
  ])("treats %s identically — retries, then rethrows", async (_label, thrown) => {
    const fn = jest.fn(async () => {
      throw thrown;
    });

    await expect(
      runWithTimers(persistWithRetry(fn, { label: "row-6" })),
    ).rejects.toBe(thrown);
    expect(fn).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS);
  });

  it("honours an explicit attempt/delay budget", async () => {
    const fn = jest.fn(async () => {
      throw new Error("nope");
    });

    await expect(
      runWithTimers(
        persistWithRetry(fn, { label: "row-7", attempts: 2, delaysMs: [5] }),
      ),
    ).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
