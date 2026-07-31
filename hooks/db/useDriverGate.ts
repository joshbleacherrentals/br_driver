import { useSyncTimeout } from "@/hooks/useSyncTimeout";
import { useCheckDriver } from "./useCheckActiveDriver";
import { useInitialSyncStatus } from "./useInitialSyncStatus";

/**
 * How long the first sync may make NO download progress before we surface a
 * "poor connection" / "auth error" screen. Because the grace timer restarts on
 * every progress advance, a slow-but-moving sync keeps showing the progress bar
 * indefinitely — only a genuine stall (or being offline) trips the error state.
 * PowerSync keeps retrying in the background, so it recovers on its own.
 */
export const SYNC_GRACE_MS = 12_000;

export type DriverGateState =
  | "loading"
  | "poor-connection"
  | "auth-error"
  | "account-not-found"
  | "no-driver"
  | "ready";

export type DriverGate = {
  state: DriverGateState;
  /** Re-arm the grace timer to show the spinner again and retry. */
  retry: () => void;
};

/**
 * Single source of truth for the first-launch gate. Decides between showing the
 * app, a spinner, or one of the error screens by combining the local driver
 * lookup with PowerSync's sync status.
 *
 * Order matters: an active driver already in the local DB wins immediately, so
 * an established user is never blocked by connectivity — that is the whole
 * point of the offline-first DB. We only fall back to sync-status reasoning
 * when the driver is not (yet) present locally.
 */
export function useDriverGate(): DriverGate {
  const { driverActive, userRowExists, isSignedIn, queriesLoading } =
    useCheckDriver();
  const { hasSynced, authError, progress } = useInitialSyncStatus();

  // Wait only while we genuinely can't decide yet: signed in, no local driver,
  // and the first full sync hasn't completed. Passing `progress` as the restart
  // key makes the timer a stall detector: while the download keeps advancing the
  // progress screen stays up; only a real stall (or offline) trips the timer.
  const waiting = isSignedIn && !driverActive && !hasSynced;
  const { elapsed, reset } = useSyncTimeout(waiting, SYNC_GRACE_MS, progress);

  const state = ((): DriverGateState => {
    if (!isSignedIn) return "loading";
    // Offline-safe: local driver present → straight into the app.
    if (driverActive) return "ready";
    // Local queries still resolving — don't trust "not found" yet.
    if (queriesLoading) return "loading";
    // Sync not finished: hold the spinner, then explain the likely cause.
    if (!hasSynced) {
      if (!elapsed) return "loading";
      return authError ? "auth-error" : "poor-connection";
    }
    // Sync complete → the local DB is authoritative.
    if (!userRowExists) return "account-not-found";
    return "no-driver";
  })();

  return { state, retry: reset };
}
