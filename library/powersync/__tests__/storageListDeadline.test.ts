/**
 * LOCKED CONTRACT — DO NOT MODIFY THIS TEST FILE.
 *
 * This test defines expected behavior for a diagnosed bug/regression in the
 * photo upload queue (see the "Photo Queue Postmortem" plan). It must stay
 * red until the corresponding fix lands, and must not be edited, weakened,
 * skipped, or deleted to make broken implementation code pass. If you are
 * an agent implementing the fix and believe this test is wrong, STOP and
 * ask the user — do not change this file yourself.
 *
 * Seam under test: `createSupabaseFetch` (`library/powersync/supabaseFetch.ts`)
 * — how a storage request is classified and which request deadline / token
 * treatment it therefore receives.
 * Currently: RED — `supabaseFetch.ts` applies ONE deadline (`UPLOAD_TIMEOUT_MS`,
 * 35s) and one token policy, and `NON_UPLOAD_STORAGE_PATHS` currently routes the
 * §5.1 bucket `list` lookup into the "leave it completely alone" branch: no
 * deadline at all and no forced token refresh.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ DELIBERATE CONFLICT WITH AN EXISTING TEST — READ BEFORE IMPLEMENTING
 *
 * `library/powersync/__tests__/backendConnectorFetch.test.ts` contains
 * `it("gives the §5.1 bucket lookup neither a deadline nor a forced token
 * refresh")`, which pins the CURRENT behaviour and is green today. This file
 * specifies the opposite for `list`: a short deadline AND a forced-fresh token.
 * The two cannot both hold. Whoever implements this contract must consciously
 * decide which one is right and retire the other with the user's agreement —
 * it is not an accident and must not be resolved by quietly editing either file.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY A SHORT DEADLINE ON `list` IS THE POINT
 * The bucket lookup only runs when an upload's outcome was ambiguous — i.e.
 * under exactly the degraded network that produced the ambiguity. Without any
 * deadline a hung `list` can hold a lane open indefinitely; the §5.1 verifier is
 * the mechanism that resolves timeouts, so it is the last request that may be
 * allowed to hang. It is a small JSON directory query, so its honest budget is
 * ~an order of magnitude below an upload's, not equal to it and not unbounded.
 * A `list` that blows an 8-10s budget answers `unknown`, which is a first-class
 * answer (`types.ts`, `BucketPresence`) and leaves the row retryable.
 */

import { UPLOAD_TIMEOUT_MS } from "@/library/photoUploadQueue/uploadTimeout";
import { createSupabaseFetch } from "@/library/powersync/supabaseFetch";

const STORAGE_UPLOAD_URL =
  "https://project.supabase.co/storage/v1/object/damage-report-photos/report/photo-1.jpg";
/** §5.1's bucket-existence lookup — a POST, but a directory query, not a write. */
const STORAGE_LIST_URL =
  "https://project.supabase.co/storage/v1/object/list/damage-report-photos";

/**
 * The band the `list` deadline must land in. Stated as a range rather than one
 * number so the implementation may pick anywhere sensible inside it, while the
 * contract — "materially shorter than an upload's, but long enough for a small
 * query on a bad connection" — stays enforced.
 */
const LIST_DEADLINE_MIN_MS = 8_000;
const LIST_DEADLINE_MAX_MS = 10_000;

const getToken = jest.fn(async () => "jwt-token");

/** A `fetch` that never answers, and reports the signal it was handed. */
function hangingFetch(): {
  spy: jest.Mock;
  signalOf: (call: number) => AbortSignal | undefined;
} {
  const spy = jest.fn(
    (_url: unknown, options: { signal?: AbortSignal } = {}) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
  return {
    spy,
    signalOf: (call) => spy.mock.calls[call]?.[1]?.signal,
  };
}

const originalFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
  getToken.mockClear();
  getToken.mockResolvedValue("jwt-token");
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe("storage request deadlines are classified, not uniform (§5.1)", () => {
  it("gives a bucket `list` a short deadline and a fresh token, while an upload keeps the long one", async () => {
    const { spy, signalOf } = hangingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const supabaseFetch = createSupabaseFetch(getToken);

    // ── The §5.1 lookup ────────────────────────────────────────────────────
    void supabaseFetch(STORAGE_LIST_URL, { method: "POST" }).catch(
      () => undefined,
    );
    await jest.advanceTimersByTimeAsync(0);

    const listSignal = signalOf(0);
    // Not merely "eventually aborted": the request must be issued with a real
    // client-side deadline at all, which is the half that is missing today.
    expect(listSignal).toBeDefined();

    // The verifier runs when the token may already be near expiry (the upload
    // that produced the ambiguity has been burning its own 35s budget), and a
    // lookup that 401s answers `unknown` — the same non-answer as a timeout.
    expect(getToken).toHaveBeenCalledWith({ forceRefresh: true });

    // Still alive just inside the lower bound of the band...
    await jest.advanceTimersByTimeAsync(LIST_DEADLINE_MIN_MS - 1);
    expect(listSignal!.aborted).toBe(false);

    // ...and cancelled by the upper bound of it.
    await jest.advanceTimersByTimeAsync(
      LIST_DEADLINE_MAX_MS - LIST_DEADLINE_MIN_MS + 2,
    );
    expect(listSignal!.aborted).toBe(true);

    // ── An actual upload, unchanged ───────────────────────────────────────
    const { spy: uploadSpy, signalOf: uploadSignalOf } = hangingFetch();
    global.fetch = uploadSpy as unknown as typeof fetch;

    void supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" }).catch(
      () => undefined,
    );
    await jest.advanceTimersByTimeAsync(0);

    const uploadSignal = uploadSignalOf(0);
    expect(uploadSignal).toBeDefined();

    // The upload budget is the one the queue's own §5 deadline is pinned to, so
    // it must NOT be dragged down to the lookup's; a multi-megabyte body on a
    // slow connection legitimately needs the full window.
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1);
    expect(uploadSignal!.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(2);
    expect(uploadSignal!.aborted).toBe(true);

    // Stated as a relationship too, so the two deadlines cannot quietly
    // converge on one shared constant again.
    expect(LIST_DEADLINE_MAX_MS).toBeLessThan(UPLOAD_TIMEOUT_MS / 2);
  });
});
