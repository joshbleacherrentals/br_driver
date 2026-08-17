/**
 * The PowerSync database singleton and its Kysely wrapper.
 *
 * Deliberately a *leaf* module: it imports the schema, the platform open
 * factory and the logger, and nothing else from the app. Everything that needs
 * the database — hooks, feature screens, `typedMutation.ts`, and the photo
 * upload queue's runtime glue — imports it from here or from
 * `@/components/providers/SystemProvider`, which re-exports it.
 *
 * It used to live in `SystemProvider.tsx`. That made `SystemProvider` both the
 * owner of `db` and a consumer of `@/library/photoUploadQueue`, while four
 * modules under `library/photoUploadQueue/runtime/` and `typedMutation.ts`
 * imported `db` back out of it — an A→B→A require cycle that Metro warned about
 * on every bundle. Nothing read the cyclic bindings at module scope, so it was
 * never a live bug, but the ordering was only accidentally safe. Owning the
 * database in a module with no app-level imports removes the cycle by
 * construction rather than by convention.
 */

import { DebugLogger } from "@/library/debug/DebugLogger";
import { AppSchema, PowerSyncDB } from "@/library/powersync/AppSchema";
import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { wrapPowerSyncWithKysely } from "@powersync/kysely-driver";
import {
  createBaseLogger,
  LogLevel,
  PowerSyncDatabase,
} from "@powersync/react-native";
import Constants from "expo-constants";

const TAG = "PowerSync";

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
