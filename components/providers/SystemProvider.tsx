import { CurrentDriverScopePublisher } from "@/components/providers/CurrentDriverScopePublisher";
import { DebugLogger } from "@/library/debug/DebugLogger";
import { BackendConnector } from "@/library/powersync/BackendConnector";
import {
  clearRecoveryState,
  createForegroundRecovery,
  createPhotoUploadService,
  getPhotoUploadRecovery,
  PHOTO_QUEUE_LOG_TAG,
  setPhotoUploadRecovery,
  setPhotoUploadService,
  subscribeNetworkAvailability,
} from "@/library/photoUploadQueue";
import { db, powerSyncDb } from "@/library/powersync/db";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";
import { useStableCallback } from "@/hooks/useStableCallback";
import { useAuth } from "@clerk/clerk-expo";
import { AppState } from "react-native";
import { PowerSyncContext } from "@powersync/react-native";
import React, { useEffect, useMemo, useRef } from "react";

/**
 * The database lives in `@/library/powersync/db` — a leaf module with no app
 * imports — and is re-exported here so the ~26 call sites that already import
 * `db`/`powerSyncDb` from this provider keep working. Owning it here meant this
 * file both created `db` and imported the photo upload queue, while the queue's
 * runtime modules imported `db` back out: the require cycle Metro warned about.
 */
export { db, powerSyncDb };

const TAG = "PowerSync";

function decodeJwtExpMs(token: string): number | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;

    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);

    let jsonStr: string | null = null;

    if (typeof globalThis.atob === "function") {
      jsonStr = globalThis.atob(padded);
    } else {
      const buf = (globalThis as any).Buffer;
      if (buf?.from) {
        jsonStr = buf.from(padded, "base64").toString("utf8");
      }
    }

    if (!jsonStr) return null;

    const payload = JSON.parse(jsonStr) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const connectedRef = useRef(false);
  const connectingRef = useRef(false);
  const reconnectingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // §13 — assumed online until the platform says otherwise, so a phone that was
  // already connected at launch doesn't count as a spurious "restored" edge.
  const wasOnlineRef = useRef(true);

  /**
   * `useAuth` returns a brand-new `getToken` closure on every call (see
   * `useStableCallback`'s doc comment), so memoizing on it memoized nothing:
   * every render of this provider built a new `BackendConnector`, a new
   * Supabase client and a new `PhotoUploadService`, each with its own upload
   * lanes and its own self-perpetuating pass timer.
   */
  const stableGetToken = useStableCallback(getToken);

  /**
   * The connector, the Supabase client it owns and the photo upload queue built
   * on it.
   *
   * Keyed on what actually means "a different connector is needed" — a
   * different signed-in user — rather than on an identity this file does not
   * control. `stableGetToken` is in the list because the rule requires it, not
   * because it can change.
   */
  const connector = useMemo(() => {
    // One line per connector built. With `userId` as the key this should be one
    // per signed-in session; anything more means the memo is churning again.
    DebugLogger.info(TAG, "Building backend connector", { userId });

    const bc = new BackendConnector({
      getPowerSyncToken: async () => {
        try {
          return await stableGetToken({ template: "powersync" });
        } catch {
          return null;
        }
      },
      getSupabaseToken: async (opts) => {
        try {
          return await stableGetToken(
            opts?.forceRefresh ? { skipCache: true } : undefined,
          );
        } catch {
          return null;
        }
      },
    });

    // Single custom photo upload queue for every photo type (damage report,
    // inspection, driver documents). Recreated with the fresh Supabase client;
    // it holds no watchers of its own beyond the §6 pass timer — screens and
    // the foreground listener below drive it. Published to
    // `serviceRegistry.ts`, which retires the previous service and recovery
    // instance as part of publishing the new one, so at most one of each can
    // ever be claiming rows or holding a timer.
    const service = createPhotoUploadService(bc.client);
    setPhotoUploadService(service);
    setPhotoUploadRecovery(
      createForegroundRecovery({ client: bc.client, service }),
    );

    return bc;
  }, [stableGetToken, userId]);

  /**
   * Reconnect, reachable from both effects below.
   *
   * The connection lifecycle owns it (it needs the effect's `connect`), but the
   * status listener has to be able to call it too, and the two now live in
   * separate effects — see the F1 note on the listener effect.
   */
  const reconnectRef = useRef<((reason: string) => Promise<void>) | null>(null);

  // ── A. Connection lifecycle ───────────────────────────────────────────────
  // Connect / disconnect / token-refresh reconnect. Deliberately free of the
  // status listener, which has its own effect below.
  useEffect(() => {
    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const scheduleTokenRefreshReconnect = async () => {
      clearRefreshTimer();

      let token: string | null = null;
      try {
        token = await stableGetToken({ template: "powersync" });
      } catch {
        return;
      }
      if (!token) return;

      const expMs = decodeJwtExpMs(token);
      if (!expMs) return;

      const now = Date.now();
      const skewMs = 10_000;
      const delayMs = Math.max(1_000, expMs - now - skewMs);

      refreshTimerRef.current = setTimeout(() => {
        void reconnect("token_expiring");
      }, delayMs);
    };

    const connect = async () => {
      if (connectingRef.current || connectedRef.current) return;
      connectingRef.current = true;
      try {
        DebugLogger.info(TAG, "Connecting...");
        await powerSyncDb.connect(connector, { params: { app: "mobile" } });
        connectedRef.current = true;
        DebugLogger.info(TAG, "Connected successfully");

        // Recovery pass (§6): pick up any pending/failed photos left over from a
        // previous session — a minute of fast retries first, then a direct
        // bucket check, and only then the banner.
        getPhotoUploadRecovery()?.run();

        await scheduleTokenRefreshReconnect();
      } catch (err: any) {
        DebugLogger.error(TAG, "Connect FAILED", {
          error: err?.message ?? String(err),
          stack: err?.stack?.substring(0, 300),
        });
      } finally {
        connectingRef.current = false;
      }
    };

    const reconnect = async (reason: string) => {
      if (reconnectingRef.current) return;
      reconnectingRef.current = true;

      try {
        DebugLogger.info(TAG, `Reconnecting (${reason})...`);
        clearRefreshTimer();
        await powerSyncDb.disconnect();
        connectedRef.current = false;
        await connect();
      } catch (err: any) {
        DebugLogger.error(TAG, "Reconnect FAILED", {
          reason,
          error: err?.message ?? String(err),
        });
      } finally {
        reconnectingRef.current = false;
      }
    };

    // Published for the status-listener effect, which reconnects on an expired
    // JWT but must not own the connection lifecycle to do it.
    reconnectRef.current = reconnect;

    if (!isLoaded) return;

    if (!isSignedIn) {
      clearRefreshTimer();
      // Belt and braces with the §15 effect above and the §6 gate: the whole
      // sign-out teardown is visible in one place, and neither the queue's
      // driver scope nor a banner verdict can outlive the session that earned
      // it.
      clearDriverScope();
      clearRecoveryState();
      if (connectedRef.current) {
        DebugLogger.info(TAG, "Signing out → disconnect");
        powerSyncDb.disconnectAndClear?.();
        connectedRef.current = false;
      }
      return;
    }

    if (!connectedRef.current) {
      void connect();
    } else {
      void scheduleTokenRefreshReconnect();
    }

    // One cleanup for every signed-in path, including the already-connected
    // one — which previously returned early and left its refresh timer behind.
    return () => {
      clearRefreshTimer();
      reconnectRef.current = null;
    };
  }, [isLoaded, isSignedIn, connector, stableGetToken]);

  // ── B. Sync status listener ───────────────────────────────────────────────
  /**
   * Its own effect, with its own cleanup, so the listener can never be silently
   * dropped.
   *
   * It used to be attached from inside `connect()` in the effect above, which
   * meant a re-run whose `connectedRef.current` was already true took an
   * early-return path that never re-attached it. That effect re-ran on every
   * render (its `connector`/`getToken` dependencies were unstable), so in
   * practice the very first re-render permanently removed the app's only
   * `PSYNC_S2103 / JWT has expired` auto-reconnect — a silent sync failure with
   * nothing to do with photos. Attach and detach now live in the same effect as
   * a pair, so there is no path that does one without the other.
   */
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    return powerSyncDb.registerListener({
      statusChanged: (status: any) => {
        const flow = status?.dataFlowStatus;
        const downloadErr: Error | undefined = flow?.downloadError;
        const uploadErr: Error | undefined = flow?.uploadError;

        if (downloadErr || uploadErr) {
          DebugLogger.warn(TAG, "Status changed with errors", {
            downloading: flow?.downloading,
            uploading: flow?.uploading,
            downloadError: downloadErr?.message,
            uploadError: uploadErr?.message,
          });
        }

        const msg = `${downloadErr?.message ?? ""} ${uploadErr?.message ?? ""}`;
        if (/PSYNC_S2103|JWT has expired/i.test(msg)) {
          DebugLogger.info(TAG, "JWT expired, triggering reconnect");
          void reconnectRef.current?.("jwt_expired");
        }
      },
    });
  }, [isLoaded, isSignedIn, connector]);

  // The queue is created during this provider's render (see the memo above), so
  // this provider is also where it has to be torn down. Passing `undefined`
  // disposes whatever is installed — the registry owns that transition.
  useEffect(
    () => () => {
      setPhotoUploadService(undefined);
      setPhotoUploadRecovery(undefined);
    },
    [],
  );

  // §6 — every time the app returns to the foreground, run the recovery pass so
  // photos stranded from a previous session get another chance to upload before
  // anything is reported to the driver.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        getPhotoUploadRecovery()?.run();
      }
    });
    // Only the listener is removed here. Retiring the recovery instance is the
    // registry's job now (see the unmount effect above), not something two
    // unrelated cleanups both reach for.
    return () => subscription.remove();
  }, []);

  // §13 — the other half of the network gate. Passes made while offline skip
  // their upload attempt, so the moment connectivity comes back is exactly when
  // the queue should try again — without waiting out the backoff plateau.
  // Only the offline→online *edge* runs a pass: the listener also fires for
  // Wi-Fi↔cellular switches and other churn, and re-running recovery on every
  // one of those would be its own small hot loop.
  useEffect(() => {
    const unsubscribe = subscribeNetworkAvailability((online) => {
      const wasOnline = wasOnlineRef.current;
      wasOnlineRef.current = online;
      if (online && !wasOnline) {
        DebugLogger.info(
          PHOTO_QUEUE_LOG_TAG,
          "network restored (offline→online) — re-running the recovery pass",
        );
        getPhotoUploadRecovery()?.run();
      } else if (!online && wasOnline) {
        DebugLogger.info(
          PHOTO_QUEUE_LOG_TAG,
          "network lost (online→offline) — upload attempts will be skipped until it returns",
        );
      }
    });
    return unsubscribe;
  }, []);

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {/* §15 — must be *inside* the provider: its `useTypedQuery` calls resolve
          the database through `useContext`, which only sees providers above the
          calling component. See the component's own doc comment. */}
      <CurrentDriverScopePublisher />
      {children}
    </PowerSyncContext.Provider>
  );
};

export default SystemProvider;
