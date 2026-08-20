/**
 * §13 — the queue's connectivity signal.
 *
 * The upload passes in `photoUploadService.ts` and the §6.2 bucket verification
 * in `foregroundRecovery.ts` both cost battery, data and CPU for a result that
 * is already knowable when the phone has no connection at all. This module is
 * the single place that answers "is an attempt worth making right now?".
 *
 * Two deliberate non-features:
 *   - **Fail-open.** Only an explicit `isConnected === false` /
 *     `isInternetReachable === false` counts as offline. Every other state, and
 *     any error thrown by the check itself, reads as online. A broken
 *     network-state read must never permanently silence the upload queue — the
 *     worst case of a false "online" is one wasted attempt that the existing
 *     backoff schedule (§6) already spaces out.
 *
 *     That extends to the module itself. `expo-network` resolves its native
 *     module at *import* time and throws if it isn't linked, so a static import
 *     would turn "JS shipped ahead of a native build" (an OTA landing on an
 *     older binary) into a crash on launch for every driver — a far worse
 *     failure than the one this gate exists to avoid. It is therefore resolved
 *     lazily, and its absence degrades to "always online", i.e. exactly the
 *     pre-§13 behaviour.
 *   - **No connection-quality heuristic.** `expo-network` exposes no bandwidth
 *     or latency signal, and guessing one would just be a new way to be wrong.
 *     A too-slow connection is handled reactively instead, by the per-request
 *     upload timeout (§5) feeding the backoff schedule (§6).
 */

/** Type-only — deliberately does not pull the module in at runtime. */
type NetworkModule = typeof import("expo-network");
type NetworkState = NetworkModule extends { getNetworkStateAsync(): Promise<infer S> }
  ? S
  : never;

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let networkModule: NetworkModule | null | undefined;

function loadNetworkModule(): NetworkModule | null {
  if (networkModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      networkModule = require("expo-network") as NetworkModule;
    } catch {
      networkModule = null;
    }
  }
  return networkModule;
}

/**
 * Whether the phone currently has a connection worth attempting an upload on.
 *
 * `true` unless the platform affirmatively says otherwise — see the fail-open
 * note above.
 */
export async function isNetworkAvailable(): Promise<boolean> {
  const network = loadNetworkModule();
  if (!network) return true;

  try {
    const state = await network.getNetworkStateAsync();
    return isOnline(state);
  } catch {
    // A network-state read that cannot run is not evidence of being offline.
    return true;
  }
}

/**
 * Subscribes to connectivity changes, mapped through the same predicate as
 * {@link isNetworkAvailable} so a listener and a poll can never disagree.
 *
 * Returns the unsubscribe function; callers must invoke it on teardown.
 */
export function subscribeNetworkAvailability(
  onChange: (online: boolean) => void,
): () => void {
  const network = loadNetworkModule();
  if (!network) return () => {};

  try {
    const subscription = network.addNetworkStateListener((event) => {
      onChange(isOnline(event));
    });
    return () => subscription.remove();
  } catch {
    // Same fail-open reasoning: if the listener cannot be attached, the caller
    // simply never gets an edge and falls back to the pass loop's own cadence.
    return () => {};
  }
}

/** The one predicate — `false` only on an explicit negative from the platform. */
function isOnline(state: NetworkState | undefined): boolean {
  if (!state) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}
