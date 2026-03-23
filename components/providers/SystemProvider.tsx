import { DebugLogger } from "@/library/debug/DebugLogger";
import { AppSchema, PowerSyncDB } from "@/library/powersync/AppSchema";
import { BackendConnector } from "@/library/powersync/BackendConnector";
import { InspectionPhotoAttachmentQueue } from "@/library/powersync/InspectionPhotoAttachmentQueue";
import { PhotoAttachmentQueue } from "@/library/powersync/PhotoAttachmentQueue";
import { SupabaseStorageAdapter } from "@/library/storage/SupabaseStorageAdapter";
import { useAuth } from "@clerk/clerk-expo";
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

function createOpenFactory() {
  DebugLogger.info(TAG, `Execution environment: ${Constants.executionEnvironment}`);
  if (isExpoGo) {
    DebugLogger.info(TAG, "Using SQLJSOpenFactory (Expo Go)");
    return new SQLJSOpenFactory({ dbFilename: "app.db" });
  }

  try {
    const { OPSqliteOpenFactory } = require("@powersync/op-sqlite");
    DebugLogger.info(TAG, "Using OPSqliteOpenFactory (native)");
    return new OPSqliteOpenFactory({ dbFilename: "sqlite.db" });
  } catch (err) {
    DebugLogger.warn(TAG, "op-sqlite not available; falling back to SQL.js", err);
    return new SQLJSOpenFactory({ dbFilename: "app.db" });
  }
}

console.log('[SystemProvider] Creating openFactory...');
const openFactory = createOpenFactory();
console.log('[SystemProvider] openFactory created');

console.log("ENV CHECK", {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  POWERSYNC_URL: process.env.EXPO_PUBLIC_POWERSYNC_URL,
});

console.log('[SystemProvider] Creating PowerSyncDatabase...');
export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: openFactory,
  logger,
});
console.log('[SystemProvider] PowerSyncDatabase created');

console.log('[SystemProvider] Wrapping with Kysely...');
export const db = wrapPowerSyncWithKysely<PowerSyncDB>(powerSyncDb);
console.log('[SystemProvider] Kysely wrap complete');

export let photoAttachmentQueue: PhotoAttachmentQueue | undefined;
export let inspectionPhotoAttachmentQueue: InspectionPhotoAttachmentQueue | undefined;

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  console.log('[SystemProvider] Component rendering...');
  const { isLoaded, isSignedIn, getToken } = useAuth();
  console.log('[SystemProvider] useAuth state:', { isLoaded, isSignedIn });
  
  const connectedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposeStatusListenerRef = useRef<(() => void) | null>(null);

  const connector = useMemo(() => {
    console.log('[SystemProvider] Creating BackendConnector...');
    const bc = new BackendConnector({
      getPowerSyncToken: async () => {
        try {
          return await getToken({ template: "powersync" });
        } catch {
          return null;
        }
      },
      getSupabaseToken: async () => {
        try {
          return await getToken();
        } catch {
          return null;
        }
      },
    });

    console.log('[SystemProvider] Creating SupabaseStorageAdapter...');
    const storage = new SupabaseStorageAdapter({
      client: bc.client,
      bucket: "driver-documents",
    });

    photoAttachmentQueue = new PhotoAttachmentQueue({
      powersync: powerSyncDb,
      storage,
      performInitialSync: false,
      onDownloadError: async (_attachment, error) => {
        if (String(error).includes("Object not found") || String(error).includes("400")) {
          return { retry: false };
        }
        return { retry: true };
      },
    });

    const inspectionStorage = new SupabaseStorageAdapter({
      client: bc.client,
      bucket: "inspection-photos",
    });

    inspectionPhotoAttachmentQueue = new InspectionPhotoAttachmentQueue({
      storage: inspectionStorage,
    });

    console.log('[SystemProvider] BackendConnector and queues ready');
    return bc;
  }, [getToken]);

  useEffect(() => {
    console.log('[SystemProvider] useEffect fired', { isLoaded, isSignedIn });

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
      try {
        console.log('[SystemProvider] connect() called');
        DebugLogger.info(TAG, "Connecting...");
        await powerSyncDb.connect(connector, {
          params: { app: "mobile" },
        });
        connectedRef.current = true;
        DebugLogger.info(TAG, "Connected successfully", { params: { app: "mobile" } });

        if (photoAttachmentQueue) {
          await photoAttachmentQueue.init();
          DebugLogger.info(TAG, "PhotoAttachmentQueue initialized");
        }

        attachStatusListener();
        await scheduleTokenRefreshReconnect();
        console.log('[SystemProvider] connect() complete');
      } catch (err: any) {
        console.log('[SystemProvider] connect() FAILED:', err?.message);
        DebugLogger.error(TAG, "Connect FAILED", {
          error: err?.message ?? String(err),
          stack: err?.stack?.substring(0, 300),
        });
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

    if (!isLoaded) {
      console.log('[SystemProvider] Auth not loaded yet, waiting...');
      return;
    }

    if (!isSignedIn) {
      console.log('[SystemProvider] Not signed in, disconnecting...');
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
      console.log('[SystemProvider] Already connected, scheduling refresh...');
      void scheduleTokenRefreshReconnect();
      return;
    }

    console.log('[SystemProvider] Starting connect...');
    void connect();

    return () => {
      clearRefreshTimer();
      clearStatusListener();
    };
  }, [isLoaded, isSignedIn, connector, getToken]);

  console.log('[SystemProvider] Rendering children...');
  return <PowerSyncContext.Provider value={powerSyncDb}>{children}</PowerSyncContext.Provider>;
};

export default SystemProvider;