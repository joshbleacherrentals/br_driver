import { DebugLogger } from "@/library/debug/DebugLogger";
import { AppSchema, PowerSyncDB } from "@/library/powersync/AppSchema";
import { BackendConnector } from "@/library/powersync/BackendConnector";
import {
  clearCurrentDriverContext,
  clearRecoveryState,
  createForegroundRecovery,
  createPhotoUploadService,
  PHOTO_QUEUE_LOG_TAG,
  setCurrentDriverContext,
  subscribeNetworkAvailability,
  type ForegroundRecovery,
  type PhotoUploadService,
} from "@/library/photoUploadQueue";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useAuth } from "@clerk/clerk-expo";
import { AppState } from "react-native";
import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { wrapPowerSyncWithKysely } from "@powersync/kysely-driver";
import {
  createBaseLogger,
  LogLevel,
  PowerSyncContext,
  PowerSyncDatabase,
} from "@powersync/react-native";
import Constants from "expo-constants";
import React, { useEffect, useMemo, useRef } from "react";

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

const isExpoGo = Constants.executionEnvironment === "storeClient";

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(LogLevel.WARN);

// Suppress noisy WebSocket timeout errors — PowerSync auto-reconnects
const originalError = logger.error.bind(logger);
logger.error = (...args: any[]) => {
  const msg = args.map(String).join(" ");
  if (msg.includes("No data received on WebSocket")) return;
  originalError(...args);
};

function createOpenFactory() {
  DebugLogger.info(
    TAG,
    `Execution environment: ${Constants.executionEnvironment}`,
  );
  if (isExpoGo) {
    DebugLogger.info(TAG, "Using SQLJSOpenFactory (Expo Go)");
    return new SQLJSOpenFactory({ dbFilename: "app.db" });
  }

  try {
    const { OPSqliteOpenFactory } = require("@powersync/op-sqlite");
    DebugLogger.info(TAG, "Using OPSqliteOpenFactory (native)");
    return new OPSqliteOpenFactory({ dbFilename: "sqlite.db" });
  } catch (err) {
    DebugLogger.warn(
      TAG,
      "op-sqlite not available; falling back to SQL.js",
      err,
    );
    return new SQLJSOpenFactory({ dbFilename: "app.db" });
  }
}

const openFactory = createOpenFactory();

export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: openFactory,
  logger,
});

export const db = wrapPowerSyncWithKysely<PowerSyncDB>(powerSyncDb);

/**
 * Custom photo upload queue (design doc: docs/custom-photo-upload-queue.md).
 * Replaces the deprecated `@powersync/attachments` queues, whose "recompute
 * which photos are needed" pass could archive + delete a photo before it
 * reached Storage. Screens write rows with `upload_status = pending` and call
 * `triggerFast()`; the service uploads them and never deletes the local copy.
 */
export let photoUploadService: PhotoUploadService | undefined;

/**
 * §6 — the "1 minute of fast retries → verify against the bucket → banner" pass.
 * Runs on connect and on every foreground transition; publishes its verdict to
 * the recovery store that `usePhotoUploadBanner` reads.
 */
export let photoUploadRecovery: ForegroundRecovery | undefined;

/** Row shapes for the §15 Clerk → `Users` → `Drivers` lookup below. */
type UserIdRow = { id: string };
type DriverIdRow = { id: string };

/**
 * §15 — publishes the signed-in driver's ids to the photo upload queue.
 *
 * `DamageReportPhotos`/`InspectionPhotos` sync to every authenticated driver,
 * so `tableAdapters.ts` has to filter every read by owner. The queue runs
 * outside React (timer/AppState/network-driven), so the ids are pushed into a
 * plain module store rather than read from a hook. Same local-DB chain the rest
 * of the app uses: Clerk user → `Users.id` → `Drivers.id`.
 *
 * This is a separate component, rendered as a *child* of the
 * `PowerSyncContext.Provider` below, and that placement is the entire reason it
 * exists. `useTypedQuery` → `useQuery` → `usePowerSync()` is a plain
 * `useContext(PowerSyncContext)`, and `useContext` resolves by walking *up* from
 * the calling component — a component never sees a provider that lives inside
 * its own returned element tree. Run from `SystemProvider`'s body (where this
 * block used to live) both lookups therefore read the context default, `null`,
 * and `@powersync/react`'s `useQuery` answers a null database with a silent
 * `{ data: [], isLoading: false, error: Error('PowerSync not configured.') }` —
 * no throw, no warning. `userUuid`/`driverUuid` stayed `null` for the whole
 * session, `setCurrentDriverContext` was unreachable, and every adapter in
 * `tableAdapters.ts` short-circuited to its empty result: total photo-upload
 * blockage, invisible in the logs. As a child of the provider the same hooks
 * resolve normally.
 */
function CurrentDriverContextPublisher() {
  const { isSignedIn, userId: clerkUserId } = useAuth();

  const compiledUserId = useMemo(() => {
    if (!clerkUserId) return null;
    return db
      .selectFrom("Users as u")
      .select(["u.id as id"])
      .where("clerk_user_id", "=", clerkUserId)
      .limit(1)
      .compile();
  }, [clerkUserId]);

  const userLookup = useTypedQuery(compiledUserId, expect<UserIdRow>());
  const userUuid = userLookup.data?.[0]?.id ?? null;

  const compiledDriverId = useMemo(() => {
    if (!userUuid) return null;
    return db
      .selectFrom("Drivers as d")
      .select(["d.id as id"])
      .where("user_uuid", "=", userUuid)
      .limit(1)
      .compile();
  }, [userUuid]);

  const driverLookup = useTypedQuery(compiledDriverId, expect<DriverIdRow>());
  const driverUuid = driverLookup.data?.[0]?.id ?? null;

  // Declared BEFORE the effect that sets a context, and keyed on the Clerk id
  // alone, so the two can never race: React runs effects in declaration order,
  // and on the commit where the Clerk id changes the id lookups above still
  // hold the *previous* driver's values. Clearing here means the window between
  // two drivers on one device is always "nobody", never "the driver before".
  useEffect(() => {
    clearCurrentDriverContext();
  }, [clerkUserId]);

  useEffect(() => {
    if (!isSignedIn || !userUuid || !driverUuid) {
      clearCurrentDriverContext();
      return;
    }
    setCurrentDriverContext({ userUuid, driverUuid });
  }, [isSignedIn, userUuid, driverUuid]);

  // Either lookup erroring is not survivable in silence. Without both ids every
  // adapter short-circuits and the queue uploads nothing at all — which is
  // indistinguishable, from the outside, from "this driver has no photos". The
  // bug this component was extracted to fix produced exactly that error on both
  // lookups and reported it nowhere; from here on it is one grep away.
  const userError = userLookup.error;
  const driverError = driverLookup.error;
  useEffect(() => {
    if (!userError && !driverError) return;
    DebugLogger.error(
      PHOTO_QUEUE_LOG_TAG,
      "§15 driver-context lookup failed — the queue stays unscoped and will " +
        "upload nothing until this resolves",
      {
        userError: userError?.message ?? null,
        driverError: driverError?.message ?? null,
      },
    );
  }, [userError, driverError]);

  return null;
}

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const connectedRef = useRef(false);
  const connectingRef = useRef(false);
  const reconnectingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposeStatusListenerRef = useRef<(() => void) | null>(null);
  // §13 — assumed online until the platform says otherwise, so a phone that was
  // already connected at launch doesn't count as a spurious "restored" edge.
  const wasOnlineRef = useRef(true);

  const connector = useMemo(() => {
    const bc = new BackendConnector({
      getPowerSyncToken: async () => {
        try {
          return await getToken({ template: "powersync" });
        } catch {
          return null;
        }
      },
      getSupabaseToken: async (opts) => {
        try {
          return await getToken(
            opts?.forceRefresh ? { skipCache: true } : undefined,
          );
        } catch {
          return null;
        }
      },
    });

    // Single custom photo upload queue for every photo type (damage report,
    // inspection, driver documents). Recreated with the fresh Supabase client;
    // it holds no watchers/timers of its own — screens and the foreground
    // listener below drive it.
    photoUploadService = createPhotoUploadService(bc.client);
    photoUploadRecovery?.dispose();
    photoUploadRecovery = createForegroundRecovery({
      client: bc.client,
      service: photoUploadService,
    });

    return bc;
  }, [getToken]);

  useEffect(() => {
    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const clearStatusListener = () => {
      if (disposeStatusListenerRef.current) {
        disposeStatusListenerRef.current();
        disposeStatusListenerRef.current = null;
      }
    };

    const scheduleTokenRefreshReconnect = async () => {
      clearRefreshTimer();

      let token: string | null = null;
      try {
        token = await getToken({ template: "powersync" });
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

    const attachStatusListener = () => {
      clearStatusListener();

      disposeStatusListenerRef.current = powerSyncDb.registerListener({
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
            void reconnect("jwt_expired");
          }
        },
      });
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
        photoUploadRecovery?.run();

        attachStatusListener();
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

    if (!isLoaded) return;

    if (!isSignedIn) {
      clearRefreshTimer();
      clearStatusListener();
      // Belt and braces with the §15 effect above and the §6 gate: the whole
      // sign-out teardown is visible in one place, and neither the queue's
      // driver scope nor a banner verdict can outlive the session that earned
      // it.
      clearCurrentDriverContext();
      clearRecoveryState();
      if (connectedRef.current) {
        DebugLogger.info(TAG, "Signing out → disconnect");
        powerSyncDb.disconnectAndClear?.();
        connectedRef.current = false;
      }
      return;
    }

    if (connectedRef.current) {
      void scheduleTokenRefreshReconnect();
      return;
    }

    void connect();

    return () => {
      clearRefreshTimer();
      clearStatusListener();
    };
  }, [isLoaded, isSignedIn, connector, getToken]);

  // §6 — every time the app returns to the foreground, run the recovery pass so
  // photos stranded from a previous session get another chance to upload before
  // anything is reported to the driver.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        photoUploadRecovery?.run();
      }
    });
    return () => {
      subscription.remove();
      photoUploadRecovery?.dispose();
    };
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
        photoUploadRecovery?.run();
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
      <CurrentDriverContextPublisher />
      {children}
    </PowerSyncContext.Provider>
  );
};

export default SystemProvider;
