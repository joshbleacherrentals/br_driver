/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §5 ("Timeout — per HTTP request, not 'a deadline on
 * everything'"): a short AbortSignal instead of Supabase Storage's ~5 minute
 * default, and "Timeout ≠ 'stop trying'" — an aborted attempt leaves the row
 * pending/failed for the next pass.
 *
 * All timing is driven by jest fake timers; nothing here waits on a real clock.
 */

import {
  UPLOAD_TIMEOUT_MS,
  uploadWithTimeout,
} from "@/library/photoUploadQueue/uploadTimeout";
import {
  isTerminalUploadStatus,
  nextUploadStatus,
} from "@/library/photoUploadQueue/uploadStatus";

const SUPABASE_DEFAULT_TIMEOUT_MS = 5 * 60_000;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("upload request deadline (§5)", () => {
  it("uses the documented 30-45s window, far below Supabase's ~5 minutes", () => {
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(UPLOAD_TIMEOUT_MS).toBeLessThanOrEqual(45_000);
    expect(UPLOAD_TIMEOUT_MS).toBeLessThan(SUPABASE_DEFAULT_TIMEOUT_MS);
  });

  it("aborts a hung request at the deadline instead of blocking the queue", async () => {
    let received: AbortSignal | undefined;
    let outcome: "pending" | "resolved" | "rejected" = "pending";

    const attempt = uploadWithTimeout<void>((signal) => {
      received = signal;
      // A dead socket: never resolves, never rejects.
      return new Promise<void>(() => {});
    });
    attempt.then(
      () => {
        outcome = "resolved";
      },
      () => {
        outcome = "rejected";
      },
    );

    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1);
    expect(received).toBeDefined();
    expect(received?.aborted).toBe(false);
    expect(outcome).toBe("pending");

    await jest.advanceTimersByTimeAsync(2);
    expect(received?.aborted).toBe(true);
    expect(outcome).toBe("rejected");
  });

  it("honours an explicitly shorter deadline", async () => {
    let received: AbortSignal | undefined;
    let outcome: "pending" | "resolved" | "rejected" = "pending";

    const attempt = uploadWithTimeout<void>((signal) => {
      received = signal;
      return new Promise<void>(() => {});
    }, 1_000);
    attempt.then(
      () => {
        outcome = "resolved";
      },
      () => {
        outcome = "rejected";
      },
    );

    await jest.advanceTimersByTimeAsync(1_001);

    expect(received?.aborted).toBe(true);
    expect(outcome).toBe("rejected");
  });

  it("resolves normally and never aborts a request that beat the deadline", async () => {
    let received: AbortSignal | undefined;

    const attempt = uploadWithTimeout<string>((signal) => {
      received = signal;
      return new Promise<string>((resolve) =>
        setTimeout(() => resolve("uploaded"), 5_000),
      );
    });

    await jest.advanceTimersByTimeAsync(5_000);
    await expect(attempt).resolves.toBe("uploaded");

    // Well past the deadline: the winning request must not be aborted late.
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS * 2);
    expect(received?.aborted).toBe(false);
  });

  // §5 — "After a timeout abort, the row stays pending/failed, and the queue
  // picks it up again on the next attempt."
  it("leaves a timed-out row retryable rather than permanently given up", () => {
    const afterTimeout = nextUploadStatus("uploading", "attempt_timed_out");

    expect(["pending", "failed"]).toContain(afterTimeout);
    expect(isTerminalUploadStatus(afterTimeout)).toBe(false);
    expect(nextUploadStatus(afterTimeout, "attempt_started")).toBe("uploading");
  });
});
