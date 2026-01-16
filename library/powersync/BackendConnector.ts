import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/react-native";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Postgres response codes that are NOT retryable
 */
const FATAL_RESPONSE_CODES = [
  new RegExp("^22...$"), // Data exception
  new RegExp("^23...$"), // Constraint violation
  new RegExp("^42501$"), // RLS / insufficient privilege
];

/**
 * Function that always returns a fresh JWT
 */
type TokenProvider = () => Promise<string | null>;

export class BackendConnector implements PowerSyncBackendConnector {
  client: SupabaseClient;
  getToken: TokenProvider;

  supabaseUrl: string;
  supabaseAnonKey: string;

  constructor(getToken: TokenProvider) {
    this.getToken = getToken;

    this.supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    this.supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

    this.client = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
      global: {
        fetch: async (url, options = {}) => {
          // Always get a fresh token for each request
          const token = await this.getToken();

          const headers = new Headers(options.headers);
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
          }

          return fetch(url, {
            ...options,
            headers,
          });
        },
      },
    });
  }

  /**
   * PowerSync calls this whenever it needs credentials.
   * MUST always return a fresh JWT.
   */
  // In BackendConnector.ts fetchCredentials():
  async fetchCredentials() {
    console.debug("[PowerSync] fetchCredentials called");

    let token: string | null = null;

    // Wait until a token exists
    for (let i = 0; i < 20; i++) {
      token = await this.getToken();
      if (token) break;
      await new Promise(res => setTimeout(res, 250));
    }

    if (!token) {
      console.warn("[PowerSync] Token not ready yet, retrying later");
      throw new Error("TEMP_NO_TOKEN"); // retryable
    }

    return {
      endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL!,
      token,
    };
  }


  /**
   * Upload local changes to Supabase
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) return;

    let lastOp: CrudEntry | null = null;

    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result: any;

        console.log(`[uploadData] Processing ${op.op} for table ${op.table}`);
        console.log(`[uploadData] ID: ${op.id}`);
        console.log(`[uploadData] Data:`, op.opData);

        switch (op.op) {
          case UpdateType.PUT:
            result = await table
              .upsert({ id: op.id, ...op.opData }, { 
                onConflict: 'id',
                count: "exact" 
              })
              .select();
            break;

          case UpdateType.PATCH:
            // Request the updated data back to verify it worked
            result = await table
              .update(op.opData)
              .eq("id", op.id)
              .select(); // Add .select() to return the updated row
            break;

          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
        }

        console.log(`[uploadData] ${op.op} result:`, JSON.stringify(result, null, 2));

        if (result?.error) {
          console.error(`[uploadData] Supabase error:`, result.error);
          throw new Error(
            `Supabase ${op.op} failed: ${JSON.stringify(result.error)}`
          );
        }

        // Check if any rows were actually updated
        if (op.op === UpdateType.PATCH && result.count === 0) {
          console.error(
            `[uploadData] RLS BLOCKED UPDATE — row exists but policy rejected it`
          );
        }
      }

      await transaction.complete();
      console.log("[uploadData] Transaction completed successfully");
    } catch (ex: any) {
      console.error("[PowerSync] Upload error:", ex);

      if (
        typeof ex?.code === "string" &&
        FATAL_RESPONSE_CODES.some((re) => re.test(ex.code))
      ) {
        console.error("[PowerSync] Discarding fatal transaction", lastOp);
        await transaction.complete();
      } else {
        // retryable
        throw ex;
      }
    }
  }
}