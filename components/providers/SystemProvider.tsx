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

const isExpoGo = Constants.executionEnvironment === "storeClient";

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(LogLevel.DEBUG);

export const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: isExpoGo
    ? new SQLJSOpenFactory({ dbFilename: "app.db" })
    : { dbFilename: "sqlite.db" },
  logger,
});

export const db = wrapPowerSyncWithKysely<PowerSyncDB>(powerSyncDb);

export const SystemProvider = ({ children }: { children: React.ReactNode }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const connectedRef = useRef(false);

  // Create connector ONCE
  const connector = useMemo(
    () =>
      new BackendConnector(async () => {
        try {
          return await getToken({ template: "powersync" });
        } catch {
          return null;
        }
      }),
    [getToken]
  );

  useEffect(() => {
    // ⛔ Auth not ready → do nothing
    if (!isLoaded) return;

    // 🔌 Signed out → disconnect once
    if (!isSignedIn) {
      if (connectedRef.current) {
        console.log("[PowerSync] Signing out → disconnect");
        powerSyncDb.disconnectAndClear?.();
        connectedRef.current = false;
      }
      return;
    }

    // ✅ Already connected → do nothing
    if (connectedRef.current) return;

    // 🚀 Connect PowerSync
    const connect = async () => {
      try {
        console.log("[PowerSync] Connecting...");
        await powerSyncDb.connect(connector, {
          params: { app: "mobile" },
        });
        connectedRef.current = true;
        console.log("[PowerSync] Connected");
      } catch (err) {
        console.error("[PowerSync] Connect failed:", err);
      }
    };

    connect();
  }, [isLoaded, isSignedIn, connector]);

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {children}
    </PowerSyncContext.Provider>
  );
};

export default SystemProvider;
