/**
 * Covers §5.1 — the complementary, best-effort abort in
 * `library/powersync/supabaseFetch.ts` (the `global.fetch` `BackendConnector`
 * hands to the Supabase client).
 *
 * WHY THIS EXISTS
 * `@supabase/storage-js` never forwards an `AbortSignal` to the `fetch` it
 * performs: `uploadOrUpdate` calls its `put`/`post` helpers without the
 * `parameters` argument that would carry one. So the queue's §5 deadline can
 * mark a row failed while the HTTP request is still running, and that orphan
 * can land minutes later — producing the "The resource already exists"
 * collisions observed on a real device across attempts 8→14. The one layer that
 * does own the `fetch` call is the connector's injected `global.fetch`, so the
 * abort has to go there.
 *
 * WHAT THIS TEST CAN AND CANNOT PROVE
 * It proves the *scoping and wiring*: that a storage write gets a signal that
 * aborts at `UPLOAD_TIMEOUT_MS`, and that ordinary PostgREST traffic and
 * storage reads get no deadline at all. It cannot prove that aborting actually
 * tears down the underlying native connection on iOS/Android — that is
 * platform behaviour, outside Jest's reach, and precisely why §5.1's
 * evidence-based verification (not this abort) is what makes the queue correct.
 */

import { UPLOAD_TIMEOUT_MS } from "@/library/photoUploadQueue/uploadTimeout";
import {
  createSupabaseFetch,
  isStorageUploadRequest,
} from "@/library/powersync/supabaseFetch";

const STORAGE_UPLOAD_URL =
  "https://project.supabase.co/storage/v1/object/damage-report-photos/report/photo-1.jpg";
const REST_URL = "https://project.supabase.co/rest/v1/DamageReportPhotos?id=eq.1";
/** §5.1's bucket-existence lookup — a POST, but a directory query, not a write. */
const STORAGE_LIST_URL =
  "https://project.supabase.co/storage/v1/object/list/damage-report-photos";

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
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe("isStorageUploadRequest (§5.1 scoping)", () => {
  it("matches only non-GET writes to the storage object API", () => {
    expect(isStorageUploadRequest(STORAGE_UPLOAD_URL, "POST")).toBe(true);
    expect(isStorageUploadRequest(STORAGE_UPLOAD_URL, "PUT")).toBe(true);
    expect(isStorageUploadRequest(STORAGE_UPLOAD_URL, "put")).toBe(true);
    // A storage *read* is an ordinary short request.
    expect(isStorageUploadRequest(STORAGE_UPLOAD_URL, "GET")).toBe(false);
    // ...and PostgREST is not storage at all.
    expect(isStorageUploadRequest(REST_URL, "POST")).toBe(false);
  });

  /**
   * The bucket-existence lookup §5.1 depends on is a POST under
   * `/storage/v1/object/`, so the original path+method test classified it as an
   * upload. It therefore got a forced Clerk token refresh (churning the session
   * that owns the Supabase client) and the 35s upload deadline — under exactly
   * the load that made the lookup necessary in the first place. A timing-out
   * verifier answers `unknown`, which keeps the row retryable and sends it
   * round again: the mechanism built to end retry storms was feeding one.
   */
  it("does not treat the §5.1 bucket lookup as an upload", () => {
    expect(isStorageUploadRequest(STORAGE_LIST_URL, "POST")).toBe(false);
  });
});

describe("createSupabaseFetch deadline (§5.1)", () => {
  it("aborts a hung storage upload at the shared upload deadline", async () => {
    const { spy, signalOf } = hangingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const supabaseFetch = createSupabaseFetch(getToken);
    const request = supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    const settled = request.then(
      () => "resolved",
      (error: Error) => error.message,
    );

    await jest.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(1);
    const signal = signalOf(0);
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);

    // Just short of the deadline: still alive.
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1);
    expect(signal!.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(2);
    expect(signal!.aborted).toBe(true);
    await expect(settled).resolves.toBe("aborted");

    // The forced-fresh JWT for storage writes is unchanged behaviour.
    expect(getToken).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it("puts no deadline on a PostgREST request, however long it runs", async () => {
    const { spy, signalOf } = hangingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const supabaseFetch = createSupabaseFetch(getToken);
    let settled = false;
    void supabaseFetch(REST_URL, { method: "POST" }).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS * 10);

    expect(signalOf(0)).toBeUndefined();
    expect(settled).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    // ...and it keeps the cached token rather than hammering Clerk.
    expect(getToken).toHaveBeenCalledWith(undefined);
  });

  it("puts no deadline on a storage read either", async () => {
    const { spy, signalOf } = hangingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const supabaseFetch = createSupabaseFetch(getToken);
    void supabaseFetch(STORAGE_UPLOAD_URL, { method: "GET" }).catch(
      () => undefined,
    );

    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS * 2);
    expect(signalOf(0)).toBeUndefined();
  });

  it("gives the §5.1 bucket lookup neither a deadline nor a forced token refresh", async () => {
    const { spy, signalOf } = hangingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const supabaseFetch = createSupabaseFetch(getToken);
    void supabaseFetch(STORAGE_LIST_URL, { method: "POST" }).catch(
      () => undefined,
    );

    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS * 2);

    expect(signalOf(0)).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
    expect(getToken).toHaveBeenCalledWith(undefined);
    expect(getToken).not.toHaveBeenCalledWith({ forceRefresh: true });
  });

  it("clears its timer when the upload answers in time", async () => {
    const response = new Response("ok");
    global.fetch = jest.fn(async () => response) as unknown as typeof fetch;

    const supabaseFetch = createSupabaseFetch(getToken);
    await expect(
      supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" }),
    ).resolves.toBe(response);

    // No dangling deadline left to abort a later, unrelated request.
    expect(jest.getTimerCount()).toBe(0);
  });
});
