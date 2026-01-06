import * as PowerSyncReact from "@powersync/react";
import { SQLJSDBAdapter } from "@powersync/adapter-sql-js";

let db: any | null = null;

export function getPowerSyncDatabase() {
  if (!db) {
    db = new (PowerSyncReact as any).PowerSyncDatabase({
      adapter: new SQLJSDBAdapter({ dbFilename: 'sqlite.db' }),
      schema: {
        version: 1,
        tables: {
          trips: `
            id TEXT PRIMARY KEY,
            name TEXT,
            created_at TEXT
          `,
        },
      },
    });
  }

  return db;
}
