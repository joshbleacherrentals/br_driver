import { AppSchema, PowerSyncDB } from "@/library/powersync/AppSchema";
import { BackendConnector } from "@/library/powersync/BackendConnector";
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

function decodeJwtExpMs(token: string): number | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;

    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);

    // Prefer atob when available (RN often has it).
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
logger.setLevel(LogLevel.DEBUG);

function createOpenFactory() {
  // Expo Go can't load native modules like `@powersync/op-sqlite`.
  if (isExpoGo) {
    return new SQLJSOpenFactory({ dbFilename: "app.db" });
  }

  // In dev-client / production builds, prefer op-sqlite when available,
  // but fall back to SQL.js if the native module isn't present.
  try {
    // Lazy require so Expo Go doesn't attempt to resolve the module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OPSqliteOpenFactory } = require("@powersync/op-sqlite");
    return new OPSqliteOpenFactory({ dbFilename: "sqlite.db" });
  } catch (err) {
    console.warn("[PowerSync] op-sqlite not available; falling back to SQL.js", err);
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

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const connectedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposeStatusListenerRef = useRef<(() => void) | null>(null);

  // Create connector ONCE
  const connector = useMemo(
    () =>
      new BackendConnector({
        // PowerSync service requires `aud` to match `powersync.yaml`.
        getPowerSyncToken: async () => {
          try {
            return await getToken({ template: "powersync" });
          } catch {
            return null;
          }
        },
        // Supabase calls should use the standard Clerk session token so Supabase's
        // Clerk third-party auth integration can treat it as `authenticated`.
        getSupabaseToken: async () => {
          try {
            return await getToken();
          } catch {
            return null;
          }
        },
      }),
    [getToken]
  );

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

      // We reconnect slightly *before* expiry to avoid PSYNC_S2103 spam.
      // With very short token lifetimes, this will reconnect frequently.
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
          const msg = `${downloadErr?.message ?? ""} ${uploadErr?.message ?? ""}`;

          if (/PSYNC_S2103|JWT has expired/i.test(msg)) {
            void reconnect("jwt_expired");
          }
        },
      });
    };

    const connect = async () => {
      try {
        console.log("[PowerSync] Connecting...");
        await powerSyncDb.connect(connector, {
          params: { app: "mobile" },
        });
        connectedRef.current = true;
        console.log("[PowerSync] Connected");

        attachStatusListener();
        await scheduleTokenRefreshReconnect();
      } catch (err) {
        console.error("[PowerSync] Connect failed:", err);
      }
    };

    const reconnect = async (reason: string) => {
      if (reconnectingRef.current) return;
      reconnectingRef.current = true;

      try {
        console.log(`[PowerSync] Reconnecting (${reason})...`);
        clearRefreshTimer();

        await powerSyncDb.disconnect();
        connectedRef.current = false;

        await connect();
      } catch (err) {
        console.error("[PowerSync] Reconnect failed:", err);
      } finally {
        reconnectingRef.current = false;
      }
    };

    // ⛔ Auth not ready → do nothing
    if (!isLoaded) return;

    // 🔌 Signed out → disconnect once
    if (!isSignedIn) {
      clearRefreshTimer();
      clearStatusListener();

      if (connectedRef.current) {
        console.log("[PowerSync] Signing out → disconnect");
        powerSyncDb.disconnectAndClear?.();
        connectedRef.current = false;
      }

      return;
    }

    // ✅ Already connected → ensure refresh scheduling exists
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

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {children}
    </PowerSyncContext.Provider>
  );
};

export default SystemProvider;
