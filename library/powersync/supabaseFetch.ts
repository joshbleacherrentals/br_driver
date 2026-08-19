/**
 * The `fetch` the Supabase client is constructed with (`BackendConnector.ts`).
 *
 * Lives on its own, away from the PowerSync connector, for two reasons: it is a
 * single self-contained concern (auth header + request deadline), and keeping it
 * free of the `@powersync/react-native` import is what lets it be tested
 * directly.
 *
 * Two behaviours, both scoped to storage *writes* only:
 *
 * 1. **Full-TTL token.** Storage uploads can outlast the ~60s Clerk token TTL on
 *    slow connections. Supabase/Kong validates the JWT when the request is
 *    received (headers), so a freshly-minted token lets a slow body upload
 *    finish without an "exp claim" failure. Every other request keeps the cached
 *    token, so Clerk isn't hammered.
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
 * small directory query with a JSON body, not a multi-megabyte upload, and it
 * only runs when an upload's outcome was ambiguous, i.e. under exactly the load
 * that produced the ambiguity. Giving it the upload treatment made it a
 * self-inflicted wound twice over: the forced token refresh churned Clerk (each
 * refresh re-rendered `SystemProvider`, which used to mean another upload
 * service — see `serviceRegistry.ts`), and the upload deadline made the very
 * mechanism §5.1 introduced to resolve timeouts into a timeout victim itself.
 */
const NON_UPLOAD_STORAGE_PATHS = ["/storage/v1/object/list/"] as const;

/**
 * A write to Supabase Storage — the only requests that get a forced-fresh JWT
 * and a hard client-side deadline. Reads (`GET`), PostgREST traffic and the
 * non-upload storage endpoints above are ordinary short requests and are left
 * completely alone.
 */
export function isStorageUploadRequest(url: string, method: string): boolean {
  if (method.toUpperCase() === "GET") return false;
  if (!url.includes("/storage/v1/object/")) return false;
  return !NON_UPLOAD_STORAGE_PATHS.some((path) => url.includes(path));
}

export function createSupabaseFetch(
  getSupabaseToken: TokenProvider,
): typeof fetch {
  return async (url: any, options: any = {}) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    const method = (options.method ?? "GET").toUpperCase();
    const isStorageUpload = isStorageUploadRequest(urlStr, method);

    const token = await getSupabaseToken(
      isStorageUpload ? { forceRefresh: true } : undefined,
    );

    const headers = new Headers(options.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const controller = isStorageUpload ? new AbortController() : undefined;
    const timer = controller
      ? setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
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
