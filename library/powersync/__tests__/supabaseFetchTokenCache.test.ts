/**
 * How often the storage path mints a Clerk token.
 *
 * WHY THIS EXISTS
 * `createSupabaseFetch` forced a fresh token on every storage request. On a real
 * device a 300-photo upload therefore made ~320 token round trips to Clerk in
 * three and a half minutes: latency on every photo, and a straight line towards
 * the rate limits the app already warns about in its logs ("development keys
 * have strict usage limits").
 *
 * The freshness that forced refresh was introduced for is a property of the
 * token's remaining life, not of the request — a token minted two seconds ago is
 * exactly as fresh for photo #2 as for photo #1. So the token is cached briefly,
 * and the lanes that find the cache stale at the same moment share one mint
 * instead of each firing their own.
 *
 * The deadline behaviour these requests also carry is `backendConnectorFetch`
 * and `storageListDeadline`'s subject, not this file's.
 */

import { UPLOAD_TIMEOUT_MS } from "@/library/photoUploadQueue/uploadTimeout";
import {
  TOKEN_CACHE_TTL_MS,
  createSupabaseFetch,
} from "@/library/powersync/supabaseFetch";

const STORAGE_UPLOAD_URL =
  "https://project.supabase.co/storage/v1/object/damage-report-photos/report/photo-1.jpg";
const STORAGE_LIST_URL =
  "https://project.supabase.co/storage/v1/object/list/damage-report-photos";
const REST_URL = "https://project.supabase.co/rest/v1/DamageReportPhotos?id=eq.1";

const originalFetch = global.fetch;

/** A `fetch` that answers immediately, recording the Authorization it was sent. */
function respondingFetch() {
  const seen: (string | null)[] = [];
  const spy = jest.fn(async (_url: unknown, options: any = {}) => {
    seen.push(new Headers(options.headers).get("Authorization"));
    return new Response("ok");
  });
  return { spy, seen };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe("storage token caching", () => {
  it("mints once for a burst of uploads instead of once per photo", async () => {
    const { spy, seen } = respondingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const getToken = jest.fn(async () => "jwt-token");
    const supabaseFetch = createSupabaseFetch(getToken);

    for (let i = 0; i < 25; i++) {
      await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    }

    expect(spy).toHaveBeenCalledTimes(25);
    // One mint for 25 photos — the behaviour this file exists to hold.
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith({ forceRefresh: true });
    // ...and every request still went out authenticated.
    expect(seen).toHaveLength(25);
    expect(seen.every((header) => header === "Bearer jwt-token")).toBe(true);
  });

  /**
   * The thundering herd. `MAX_CONCURRENT_UPLOADS` lanes start together on a cold
   * cache; without a shared in-flight promise that is one forced refresh each.
   */
  it("shares a single in-flight mint across concurrent lanes", async () => {
    const { spy } = respondingFetch();
    global.fetch = spy as unknown as typeof fetch;

    let release!: (token: string) => void;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const getToken = jest.fn(() => pending);

    const supabaseFetch = createSupabaseFetch(getToken);
    const lanes = [
      supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" }),
      supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" }),
      supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" }),
    ];

    await jest.advanceTimersByTimeAsync(0);
    expect(getToken).toHaveBeenCalledTimes(1);

    release("jwt-token");
    await Promise.all(lanes);

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("mints again once the cached token is past its TTL", async () => {
    const { spy } = respondingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const getToken = jest.fn(async () => "jwt-token");
    const supabaseFetch = createSupabaseFetch(getToken);

    await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    expect(getToken).toHaveBeenCalledTimes(1);

    // Still inside the window: reused.
    await jest.advanceTimersByTimeAsync(TOKEN_CACHE_TTL_MS - 1);
    await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    expect(getToken).toHaveBeenCalledTimes(1);

    // Past it: minted again, so a long drain never runs on a stale token.
    await jest.advanceTimersByTimeAsync(2);
    await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  /**
   * The cache is a reuse window, not a lifetime. It must be comfortably shorter
   * than the upload deadline, so a token can never be the reason a request that
   * started inside the window fails on arrival.
   */
  it("keeps the reuse window well under an upload's own budget", () => {
    expect(TOKEN_CACHE_TTL_MS).toBeLessThan(UPLOAD_TIMEOUT_MS);
  });

  /**
   * A JWT that expires sooner than the fixed TTL caps the window itself —
   * otherwise the cache would happily hand out a token that expires mid-flight.
   * A 20s token minus the 15s safety margin leaves ~5s of reuse, not 30.
   */
  it("never reuses a token past its own exp claim", async () => {
    const { spy } = respondingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const shortLived = makeJwt(Math.floor(Date.now() / 1000) + 20);
    const getToken = jest.fn(async () => shortLived);
    const supabaseFetch = createSupabaseFetch(getToken);

    await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    expect(getToken).toHaveBeenCalledTimes(1);

    // Inside the token's own remaining life, margin included: reused.
    await jest.advanceTimersByTimeAsync(4_000);
    await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    expect(getToken).toHaveBeenCalledTimes(1);

    // Past it — and still far inside the fixed 30s TTL, which is the point:
    // the token's own expiry, not the TTL, is what ended the window.
    await jest.advanceTimersByTimeAsync(2_000);
    await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  /**
   * The §5.1 bucket lookup shares the cache: what it needs is a token that will
   * still be valid when it lands, which the margin guarantees, not a mint of its
   * own in the middle of a drain. A cold cache still mints for it — the
   * behaviour `storageListDeadline.test.ts` pins.
   */
  it("lets the §5.1 lookup share the uploads' token", async () => {
    const { spy } = respondingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const getToken = jest.fn(async () => "jwt-token");
    const supabaseFetch = createSupabaseFetch(getToken);

    await supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" });
    await supabaseFetch(STORAGE_LIST_URL, { method: "POST" });

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenNthCalledWith(1, { forceRefresh: true });
  });

  /**
   * PostgREST traffic is untouched by any of this: it never mints, and it never
   * borrows a minted token either — it keeps asking for whatever Clerk's own
   * cache holds.
   */
  it("leaves ordinary PostgREST traffic on the ambient token", async () => {
    const { spy } = respondingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const getToken = jest.fn(async () => "jwt-token");
    const supabaseFetch = createSupabaseFetch(getToken);

    await supabaseFetch(REST_URL, { method: "POST" });
    await supabaseFetch(REST_URL, { method: "POST" });

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getToken).toHaveBeenNthCalledWith(2, undefined);
  });

  /**
   * A failed mint must not poison the cache: the next request has to be able to
   * try again rather than inherit a rejected promise forever.
   */
  it("recovers from a failed mint on the next request", async () => {
    const { spy } = respondingFetch();
    global.fetch = spy as unknown as typeof fetch;

    const getToken = jest
      .fn<Promise<string | null>, unknown[]>()
      .mockRejectedValueOnce(new Error("clerk unreachable"))
      .mockResolvedValue("jwt-token");
    const supabaseFetch = createSupabaseFetch(getToken);

    await expect(
      supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" }),
    ).rejects.toThrow("clerk unreachable");

    await expect(
      supabaseFetch(STORAGE_UPLOAD_URL, { method: "POST" }),
    ).resolves.toBeInstanceOf(Response);
    expect(getToken).toHaveBeenCalledTimes(2);
  });
});

/** A syntactically real JWT carrying nothing but the `exp` under test. */
function makeJwt(expSeconds: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: expSeconds })}.signature`;
}
