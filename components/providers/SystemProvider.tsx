import { DebugLogger } from "@/library/debug/DebugLogger";
import { AppSchema, PowerSyncDB } from "@/library/powersync/AppSchema";
import { BackendConnector } from "@/library/powersync/BackendConnector";
import {
  createPhotoUploadService,
  type PhotoUploadService,
} from "@/library/photoUploadQueue";
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

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const connectedRef = useRef(false);
  const connectingRef = useRef(false);
  const reconnectingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposeStatusListenerRef = useRef<(() => void) | null>(null);

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

        // Background recovery pass (§6): pick up any pending/failed photos left
        // over from a previous session, honouring backoff.
        void photoUploadService?.triggerBackoff();

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
  // photos stranded from a previous session get another chance to upload.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void photoUploadService?.triggerBackoff();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {children}
    </PowerSyncContext.Provider>
  );
};

export default SystemProvider;
