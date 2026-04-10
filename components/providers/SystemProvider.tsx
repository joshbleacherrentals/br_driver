import { DebugLogger } from "@/library/debug/DebugLogger";
import { AppSchema, PowerSyncDB } from "@/library/powersync/AppSchema";
import { BackendConnector } from "@/library/powersync/BackendConnector";
import { DocumentAttachmentQueue } from "@/library/powersync/DocumentAttachmentQueue";
import { InspectionPhotoAttachmentQueue } from "@/library/powersync/InspectionPhotoAttachmentQueue";
import { NvisAttachmentQueue } from "@/library/powersync/NvisAttachmentQueue";
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
      if (buf?.from) jsonStr = buf.from(padded, "base64").toString("utf8");
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

const openFactory = createOpenFactory();

export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: openFactory,
  logger,
});

export const db = wrapPowerSyncWithKysely<PowerSyncDB>(powerSyncDb);

export let photoAttachmentQueue: PhotoAttachmentQueue | undefined;
export let inspectionPhotoAttachmentQueue: InspectionPhotoAttachmentQueue | undefined;
/** Download-only queue for BlueBook PDFs from the `documents` Supabase bucket. */
export let documentAttachmentQueue: DocumentAttachmentQueue | undefined;
/** Download-only queue for bleacher NVIS PDFs from the `bleacher-nvis` Supabase bucket. */
export let nvisAttachmentQueue: NvisAttachmentQueue | undefined;

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const connectedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposeStatusListenerRef = useRef<(() => void) | null>(null);

  const connector = useMemo(() => {
    const bc = new BackendConnector({
      getPowerSyncToken: async () => {
        try { return await getToken({ template: "powersync" }); } catch { return null; }
      },
      getSupabaseToken: async () => {
        try { return await getToken(); } catch { return null; }
      },
    });

    photoAttachmentQueue = new PhotoAttachmentQueue({
      powersync: powerSyncDb,
      storage: new SupabaseStorageAdapter({ client: bc.client, bucket: "driver-documents" }),
      performInitialSync: false,
      onDownloadError: async (_attachment, error) => {
        if (String(error).includes("Object not found") || String(error).includes("400")) {
          return { retry: false };
        }
        return { retry: true };
      },
    });

    inspectionPhotoAttachmentQueue = new InspectionPhotoAttachmentQueue({
      storage: new SupabaseStorageAdapter({ client: bc.client, bucket: "inspection-photos" }),
    });

    // Download-only — no upload, no attachments table involvement
    documentAttachmentQueue = new DocumentAttachmentQueue({
      storage: new SupabaseStorageAdapter({ client: bc.client, bucket: "documents" }),
    });

    // Download-only NVIS PDFs from bleacher-nvis bucket
    nvisAttachmentQueue = new NvisAttachmentQueue({
      storage: new SupabaseStorageAdapter({ client: bc.client, bucket: "bleacher-nvis" }),
    });

    return bc;
  }, [getToken]);

  useEffect(() => {
    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; }
    };
    const clearStatusListener = () => {
      if (disposeStatusListenerRef.current) { disposeStatusListenerRef.current(); disposeStatusListenerRef.current = null; }
    };

    const scheduleTokenRefreshReconnect = async () => {
      clearRefreshTimer();
      let token: string | null = null;
      try { token = await getToken({ template: "powersync" }); } catch { return; }
      if (!token) return;
      const expMs = decodeJwtExpMs(token);
      if (!expMs) return;
      const delayMs = Math.max(1_000, expMs - Date.now() - 10_000);
      refreshTimerRef.current = setTimeout(() => void reconnect("token_expiring"), delayMs);
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
        DebugLogger.info(TAG, "Connecting...");
        await powerSyncDb.connect(connector, { params: { app: "mobile" } });
        connectedRef.current = true;
        DebugLogger.info(TAG, "Connected successfully");
        if (photoAttachmentQueue) {
          await photoAttachmentQueue.init();
          DebugLogger.info(TAG, "PhotoAttachmentQueue initialized");
        }
        if (documentAttachmentQueue) {
          await documentAttachmentQueue.init();
          DebugLogger.info(TAG, "DocumentAttachmentQueue initialized");
        }
        if (nvisAttachmentQueue) {
          await nvisAttachmentQueue.init();
          DebugLogger.info(TAG, "NvisAttachmentQueue initialized");
        }
        attachStatusListener();
        await scheduleTokenRefreshReconnect();
      } catch (err: any) {
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
        DebugLogger.error(TAG, "Reconnect FAILED", { reason, error: err?.message ?? String(err) });
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

  return <PowerSyncContext.Provider value={powerSyncDb}>{children}</PowerSyncContext.Provider>;
};

export default SystemProvider;