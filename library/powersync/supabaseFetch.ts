/**
 * The `fetch` the Supabase client is constructed with (`BackendConnector.ts`).
 *
 * Lives on its own, away from the PowerSync connector, for two reasons: it is a
 * single self-contained concern (auth header + request deadline), and keeping it
 * free of the `@powersync/react-native` import is what lets it be tested
 * directly.
 *
 * Two behaviours, both scoped to storage requests only (uploads, and the §5.1
 * bucket `list` lookup — which gets its own, much shorter deadline):
 *
 * 1. **A recently-minted token, shared for a few seconds.** Storage uploads can
 *    outlast the ~60s Clerk token TTL on slow connections. Supabase/Kong
 *    validates the JWT when the request is received (headers), so a
 *    recently-minted token lets a slow body upload finish without an "exp
 *    claim" failure. Every other request keeps whatever Clerk's own cache
 *    holds, so ordinary PostgREST traffic never touches this at all.
 *
 *    This used to force a refresh *per request*, which on a 300-photo drain
 *    meant ~320 round trips to Clerk in three and a half minutes — one per
 *    photo, each one latency on the upload path and each one counting against
 *    Clerk's rate limits. The freshness the original fix needed is a property
 *    of the token's remaining life, not of the request, so the token is now
 *    cached for `TOKEN_CACHE_TTL_MS` (and never past its own `exp`, less a
 *    safety margin — see `tokenCacheDeadline`), and concurrent upload lanes
 *    share one in-flight mint rather than each firing their own.
 *
 * 2. **A real abort deadline (§5.1).** `@supabase/storage-js` never forwards an
 *    `AbortSignal` to the underlying `fetch` — `uploadOrUpdate` calls its
 *    `put`/`post` helpers without the `parameters` argument that would carry
 *    one. So the queue's own §5 deadline can mark a row failed while the HTTP
 *    request keeps running, and that orphan can still land minutes later,
 *    producing "The resource already exists" collisions on the retry. This is
 *    the one layer that actually owns the `fetch` call, so it is the only place
 *    left where the request can be cancelled at all.
 *
 *    Best-effort, not a correctness dependency: whether an abort truly tears
 *    down the native connection varies by platform. Correctness comes from
 *    §5.1's evidence-based verification — a timeout triggers a bucket lookup
 *    instead of a blind retry — which holds either way. `UPLOAD_TIMEOUT_MS` is
 *    imported rather than redeclared so the two deadlines cannot drift apart.
 */

import { DebugLogger } from "@/library/debug/DebugLogger";
import { UPLOAD_TIMEOUT_MS } from "@/library/photoUploadQueue/uploadTimeout";

const TAG = "Upload";

/**
 * Function that returns a JWT. Pass `forceRefresh` to bypass any client-side
 * token cache and mint a full-TTL token (used for slow storage uploads).
 */
export type TokenProvider = (opts?: {
  forceRefresh?: boolean;
}) => Promise<string | null>;

/**
 * Storage-API paths that are NOT a file upload despite a non-GET method.
 *
 * `list` is `POST /storage/v1/object/list/{bucket}` — how `lookupBucketObject`
 * (`runtime/bucketUpload.ts`) asks the bucket whether an object landed. It is a
 * small directory query with a JSON body, not a multi-megabyte upload, so it
 * must not inherit an upload's 35s budget: the verifier is the mechanism §5.1
 * introduced to *resolve* timeouts, and giving it an upload-sized deadline made
 * it a timeout victim itself. It gets its own, much shorter budget instead
 * (`LIST_TIMEOUT_MS`).
 */
const NON_UPLOAD_STORAGE_PATHS = ["/storage/v1/object/list/"] as const;

/**
 * Deadline for the §5.1 bucket `list` lookup.
 *
 * An order of magnitude below `UPLOAD_TIMEOUT_MS`, because a directory query is
 * a small round trip even on a bad connection — and the lookup only ever runs
 * under the degraded network that made an upload's outcome ambiguous, so it is
 * the last request that may be allowed to hang. Blowing this budget answers
 * `unknown` (`types.ts`, `BucketPresence`), which is a first-class answer and
 * leaves the row retryable.
 */
export const LIST_TIMEOUT_MS = 9_000;

/**
 * A write to Supabase Storage — a recently-minted JWT (see `storageToken`) and
 * the long `UPLOAD_TIMEOUT_MS` deadline. Reads (`GET`) and PostgREST traffic are
 * ordinary short requests and are left completely alone.
 */
export function isStorageUploadRequest(url: string, method: string): boolean {
  if (method.toUpperCase() === "GET") return false;
  if (!url.includes("/storage/v1/object/")) return false;
  return !NON_UPLOAD_STORAGE_PATHS.some((path) => url.includes(path));
}

/**
 * The §5.1 bucket-existence lookup. Not an upload, but not "leave it alone"
 * either: it needs its own short deadline, and a token known to be fresh,
 * because it runs after an upload has already been burning its own 35s budget —
 * a lookup that 401s answers `unknown`, the same useless non-answer as a
 * timeout.
 *
 * It takes that token from the same short-lived cache the uploads use rather
 * than minting its own: the cache's safety margin already guarantees a token
 * that outlives this request, and an unconditional mint here would fire in the
 * middle of the very drain the cache exists to keep off Clerk.
 */
export function isStorageListRequest(url: string, method: string): boolean {
  if (method.toUpperCase() === "GET") return false;
  return NON_UPLOAD_STORAGE_PATHS.some((path) => url.includes(path));
}

/**
 * How long a freshly minted storage token may be reused.
 *
 * Comfortably under the ~50-60s cadence the session logs show for Clerk's own
 * token lifetime, so a cached token is never anywhere near its expiry when it is
 * handed to a request — while still collapsing a whole burst of photo uploads
 * onto a handful of mints instead of one per photo.
 */
export const TOKEN_CACHE_TTL_MS = 30_000;

/**
 * How much of a token's own life is treated as already spent.
 *
 * Applies only when the JWT's `exp` is readable. Wider than `LIST_TIMEOUT_MS`
 * on purpose: a cached token must still be valid when the *slowest* request
 * that may borrow it — the §5.1 lookup, which is the one request whose 401 and
 * whose timeout are the same useless non-answer — finally reaches the server.
 */
const TOKEN_EXPIRY_MARGIN_MS = 15_000;

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64url → bytes-as-a-string, by hand.
 *
 * `atob` exists on some of the runtimes this ships to and not others (Hermes
 * gained it comparatively late, and the test environment is different again),
 * and `Buffer` is a Node import this file has no business taking. Fifteen lines
 * of decoder removes the question entirely. Any character outside the alphabet
 * answers `null` — the caller treats that the same as "not a JWT".
 */
function decodeBase64Url(input: string): string | null {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let accumulator = 0;
  let bits = 0;
  let decoded = "";

  for (const character of base64) {
    const value = BASE64_ALPHABET.indexOf(character);
    if (value < 0) return null;

    accumulator = (accumulator << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      decoded += String.fromCharCode((accumulator >> bits) & 0xff);
    }
  }

  return decoded;
}

/**
 * The `exp` claim of a JWT, in epoch milliseconds, or `null` when it cannot be
 * read for any reason.
 *
 * Deliberately total: a token need not be a JWT at all, and a malformed payload
 * must not take an upload down. Every such case answers `null`, which simply
 * means "fall back to the fixed TTL".
 */
function jwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const decoded = decodeBase64Url(payload);
    if (decoded === null) return null;

    const claims = JSON.parse(decoded) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * When a token minted at `now` stops being reusable: the fixed TTL, or the
 * token's own expiry less the safety margin, whichever comes first.
 *
 * A token that is already inside its margin yields a deadline in the past, so
 * it is used for the request that fetched it and never reused — the honest
 * outcome, not an error.
 */
function tokenCacheDeadline(token: string, now: number): number {
  const fixed = now + TOKEN_CACHE_TTL_MS;
  const expiry = jwtExpiryMs(token);
  return expiry === null ? fixed : Math.min(fixed, expiry - TOKEN_EXPIRY_MARGIN_MS);
}

export function createSupabaseFetch(
  getSupabaseToken: TokenProvider,
): typeof fetch {
  /**
   * The last minted storage token, and the single mint that may be in flight.
   *
   * Scoped to this closure rather than to the module: the client, the connector
   * and this `fetch` are rebuilt together when the signed-in user changes
   * (`SystemProvider`), so a per-instance cache cannot outlive the session whose
   * token it holds. There is exactly one instance per session in practice, so
   * nothing is lost by not sharing it more widely.
   */
  let cached: { token: string; reusableUntil: number } | null = null;
  let inFlight: Promise<string | null> | null = null;

  /**
   * A storage-grade token: recently minted, and shared by whoever asks for one
   * while it is still fresh.
   *
   * The `inFlight` promise is what keeps `MAX_CONCURRENT_UPLOADS` lanes from
   * each firing their own forced refresh the moment the cache goes stale —
   * they all await the same mint. A rejected mint is not cached and clears the
   * slot, so the next request tries again rather than inheriting the failure.
   */
  const storageToken = async (): Promise<string | null> => {
    if (cached && Date.now() < cached.reusableUntil) return cached.token;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const token = await getSupabaseToken({ forceRefresh: true });
        const now = Date.now();
        cached = token
          ? { token, reusableUntil: tokenCacheDeadline(token, now) }
          : null;
        return token;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  };

  return async (url: any, options: any = {}) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const method = (options.method ?? "GET").toUpperCase();
    const isStorageUpload = isStorageUploadRequest(urlStr, method);
    const isStorageList = isStorageUpload
      ? false
      : isStorageListRequest(urlStr, method);

    // Both deadline-bearing kinds want a recently minted token; everything else
    // keeps whatever Clerk's own cache holds, so ordinary traffic never mints.
    const deadlineMs = isStorageUpload
      ? UPLOAD_TIMEOUT_MS
      : isStorageList
        ? LIST_TIMEOUT_MS
        : undefined;

    // The §5.1 lookup shares the uploads' cache rather than keeping its own.
    // What that path actually needs is a token that will still be valid when it
    // lands — the reason it stopped trusting the ambient one — and the margin in
    // `tokenCacheDeadline` guarantees exactly that. Its own forced refresh would
    // otherwise fire in the middle of a drain, which is the pattern this change
    // exists to stop.
    const token =
      deadlineMs === undefined
        ? await getSupabaseToken(undefined)
        : await storageToken();

    const headers = new Headers(options.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const controller =
      deadlineMs === undefined ? undefined : new AbortController();
    const timer = controller
      ? setTimeout(() => controller.abort(), deadlineMs)
      : undefined;

    try {
      return await fetch(url, {
        ...options,
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch (fetchError: any) {
      DebugLogger.error(TAG, "Supabase fetch FAILED", {
        url: urlStr,
        error: fetchError?.message ?? String(fetchError),
        abortedByDeadline: controller?.signal.aborted ?? false,
      });
      throw fetchError;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
