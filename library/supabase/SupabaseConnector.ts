import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
  type PowerSyncCredentials,
} from "@powersync/react-native";

import { getClerkInstance } from "@clerk/clerk-expo";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { SupabaseStorageAdapter } from "../storage/SupabaseStorageAdapter";
import { AppConfig } from "./AppConfig";

/// Postgres Response codes that we cannot recover from by retrying.
const FATAL_RESPONSE_CODES = [
  // Class 22 — Data Exception
  // Examples include data type mismatch.
  new RegExp("^22...$"),
  // Class 23 — Integrity Constraint Violation.
  // Examples include NOT NULL, FOREIGN KEY and UNIQUE violations.
  new RegExp("^23...$"),
  // INSUFFICIENT PRIVILEGE - typically a row-level security violation
  new RegExp("^42501$"),
];

export class SupabaseConnector implements PowerSyncBackendConnector {
  client: SupabaseClient;
  storage: SupabaseStorageAdapter;

  // This connector is kept for reference/experimentation.
  // It's currently not used by the app runtime.
  constructor() {
    this.client = createClient(
      AppConfig.supabaseUrl,
      AppConfig.supabaseAnonKey,
      {
        accessToken: async () => {
          const clerk = getClerkInstance();
          const token = await clerk.session?.getToken();
          return token ?? null;
        },
      },
    );
    this.storage = new SupabaseStorageAdapter({
      client: this.client,
      bucket: "",
    });
  }

  async fetchCredentials() {
    const clerk = getClerkInstance();

    if (!clerk.session) {
      throw new Error("No active Clerk session");
    }

    // Get the Supabase JWT from Clerk
    const token = await clerk.session.getToken({ template: "powersync" });

    if (!token) {
      throw new Error("Could not fetch Supabase token from Clerk");
    }

    console.debug("Fetched PowerSync credentials from Clerk");

    return {
      endpoint: AppConfig.powersyncUrl,
      token: token,
    } satisfies PowerSyncCredentials;
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    let lastOp: CrudEntry | null = null;
    try {
      // Note: If transactional consistency is important, use database functions
      // or edge functions to process the entire transaction in a single call.
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result: any = null;
        switch (op.op) {
          case UpdateType.PUT:
            // eslint-disable-next-line no-case-declarations
            const record = { ...op.opData, id: op.id };
            result = await table.upsert(record);
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData!).eq("id", op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
        }

        if (result.error) {
          console.error(result.error);
          result.error.message = `Could not ${op.op} data to Supabase error: ${JSON.stringify(
            result,
          )}`;
          throw result.error;
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      console.debug(ex);
      if (
        typeof ex.code == "string" &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))
      ) {
        /**
         * Instead of blocking the queue with these errors,
         * discard the (rest of the) transaction.
         *
         * Note that these errors typically indicate a bug in the application.
         * If protecting against data loss is important, save the failing records
         * elsewhere instead of discarding, and/or notify the user.
         */
        console.error("Data upload error - discarding:", lastOp, ex);
        await transaction.complete();
      } else {
        // Error may be retryable - e.g. network error or temporary server error.
        // Throwing an error here causes this call to be retried after a delay.
        throw ex;
      }
    }
  }
}
