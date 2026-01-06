import "@azure/core-asynciterator-polyfill";

import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { AttachmentRecord } from "@powersync/attachments";
import {
  createBaseLogger,
  LogLevel,
  PowerSyncDatabase,
  SyncClientImplementation,
} from "@powersync/react-native";
import Constants from "expo-constants";
import React from "react";
import { KVStorage } from "../storage/KVStorage";
import { SupabaseStorageAdapter } from "../storage/SupabaseStorageAdapter";
import { AppConfig } from "../supabase/AppConfig";
import { AppSchema } from "./appSchema";
import { PhotoAttachmentQueue } from "./PhotoAttachmentQueue";
import { SupabaseConnector } from "./SupabaseConnector";

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(LogLevel.DEBUG);

export class System {
  kvStorage: KVStorage;
  storage: SupabaseStorageAdapter;
  supabaseConnector: SupabaseConnector;
  powersync: PowerSyncDatabase;
  attachmentQueue: PhotoAttachmentQueue | undefined = undefined;

  constructor() {
    this.kvStorage = new KVStorage();
    this.supabaseConnector = new SupabaseConnector(this);
    this.storage = this.supabaseConnector.storage;

    const isExpoGo = Constants.executionEnvironment === "storeClient";
    // const factory = new OPSqliteOpenFactory({
    //   dbFilename: "sqlite.db",
    // });
    // this.powersync = new PowerSyncDatabase({ database: factory, schema: AppSchema });
    this.powersync = new PowerSyncDatabase({
      schema: AppSchema,
      database: isExpoGo
        ? new SQLJSOpenFactory({
            dbFilename: "sqlite.db",
          })
        : // : new OPSqliteOpenFactory({
          //     dbFilename: "sqlite.db",
          //   }),
          {
            dbFilename: "sqlite.db",
          },
      logger,
    });

    if (AppConfig.supabaseBucket) {
      this.attachmentQueue = new PhotoAttachmentQueue({
        powersync: this.powersync,
        storage: this.storage,
        // Use this to handle download errors where you can use the attachment
        // and/or the exception to decide if you want to retry the download
        onDownloadError: async (attachment: AttachmentRecord, exception: any) => {
          if (exception.toString() === "StorageApiError: Object not found") {
            return { retry: false };
          }

          return { retry: true };
        },
      });
    }
  }

  async init() {
    await this.powersync.init();
    await this.powersync.connect(this.supabaseConnector, {
      clientImplementation: SyncClientImplementation.RUST,
    });

    if (this.attachmentQueue) {
      await this.attachmentQueue.init();
    }
  }
}

export const system = new System();

export const SystemContext = React.createContext(system);
export const useSystem = () => React.useContext(SystemContext);
