import { DebugLogger } from "@/library/debug/DebugLogger";
import {
  createSupabaseFetch,
  type TokenProvider,
} from "@/library/powersync/supabaseFetch";
import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/react-native";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const TAG = "Upload";
const TAG_CREDS = "PowerSync";

/**
 * Postgres response codes that are NOT retryable
 */
const FATAL_RESPONSE_CODES = [
  new RegExp("^22...$"), // Data exception
  new RegExp("^23...$"), // Constraint violation
  new RegExp("^42501$"), // RLS / insufficient privilege
];

type BackendConnectorTokenProviders = {
  /** Token for the PowerSync service connection (must include `aud`). */
  getPowerSyncToken: TokenProvider;
  /** Token for Supabase PostgREST/Storage (Clerk third_party integration). */
  getSupabaseToken: TokenProvider;
};

export class BackendConnector implements PowerSyncBackendConnector {
  client: SupabaseClient;
  private getPowerSyncToken: TokenProvider;
  private getSupabaseToken: TokenProvider;

  supabaseUrl: string;
  supabaseAnonKey: string;

  constructor(tokens: BackendConnectorTokenProviders) {
    this.getPowerSyncToken = tokens.getPowerSyncToken;
    this.getSupabaseToken = tokens.getSupabaseToken;

    this.supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    this.supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

    DebugLogger.info(TAG_CREDS, "BackendConnector initialized", {
      supabaseUrl: this.supabaseUrl,
      hasAnonKey: !!this.supabaseAnonKey,
      anonKeyPrefix: this.supabaseAnonKey?.substring(0, 20) + "...",
    });

    this.client = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
      global: {
        // Forced-fresh JWT + hard abort deadline for storage uploads only —
        // see `createSupabaseFetch` above.
        fetch: createSupabaseFetch(this.getSupabaseToken),
      },
    });
  }

  /**
   * PowerSync calls this whenever it needs credentials.
   * MUST always return a fresh JWT.
   */
  async fetchCredentials() {
    DebugLogger.info(TAG_CREDS, "fetchCredentials called");

    let token: string | null = null;

    // Wait until a token exists
    for (let i = 0; i < 20; i++) {
      token = await this.getPowerSyncToken();
      if (token) break;
      await new Promise((res) => setTimeout(res, 250));
    }

    if (!token) {
      DebugLogger.warn(TAG_CREDS, "Token not ready after 5s, retrying later");
      throw new Error("TEMP_NO_TOKEN"); // retryable
    }

    const endpoint = process.env.EXPO_PUBLIC_POWERSYNC_URL!;

    DebugLogger.info(TAG_CREDS, "fetchCredentials success", {
      endpoint,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 30) + "...",
    });

    return { endpoint, token };
  }

  /**
   * Upload local changes to Supabase
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    const opCount = transaction.crud.length;
    DebugLogger.info(TAG, `uploadData START - ${opCount} operation(s)`, {
      transactionId: transaction.transactionId,
      opCount,
    });

    let lastOp: CrudEntry | null = null;
    let completedOps = 0;

    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = this.client.from(op.table);
        let result: any;

        DebugLogger.info(TAG, `Processing ${op.op} on ${op.table}`, {
          op: op.op,
          table: op.table,
          id: op.id,
          // Column NAMES, never their values. `opData` carries whole photo
          // payloads (`DamageReportPhotos.thumbnail` is a ~10KB base64 string),
          // and `DebugLogger` retains the last 500 entries by reference while
          // also handing them to `console` — so logging the payload cost both a
          // megabytes-sized retained buffer and a serialization pass, per
          // operation, on the CRUD upload path itself. Which columns a write
          // touches is the part that was ever diagnostically useful.
          columns: Object.keys(op.opData ?? {}),
        });

        switch (op.op) {
          case UpdateType.PUT:
            result = await table
              .upsert(
                { id: op.id, ...op.opData },
                {
                  onConflict: "id",
                  count: "exact",
                },
              )
              // `.select("id")`, never a bare `.select()`.
              //
              // PostgREST returns whatever the select names, and an unqualified
              // `.select()` means `*` — the FULL updated row. On the photo
              // tables that row carries a base64 `thumbnail` (~10KB), and the
              // upload queue produces one status write per photo per attempt:
              // draining a ~1000-photo backlog was pushing ~20MB of response
              // body over the wire that nothing below ever reads. The only
              // things this response is used for are the row-count check below
              // (PATCH) and a log line, and an `id` satisfies both.
              .select("id");
            break;

          case UpdateType.PATCH:
            result = await table.update(op.opData).eq("id", op.id).select("id");
            break;

          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
        }

        // Log full result
        DebugLogger.info(TAG, `${op.op} result`, {
          table: op.table,
          id: op.id,
          status: result?.status,
          statusText: result?.statusText,
          count: result?.count,
          hasError: !!result?.error,
          error: result?.error,
          dataCount: result?.data?.length,
        });

        if (result?.error) {
          DebugLogger.error(TAG, `Supabase error on ${op.op}`, {
            table: op.table,
            id: op.id,
            error: result.error,
            code: result.error.code,
            message: result.error.message,
            details: result.error.details,
            hint: result.error.hint,
          });

          // Preserve the error code for fatal detection
          const err: any = new Error(result.error.message ?? "Supabase error");
          err.code = result.error.code;
          err.details = result.error.details;
          err.hint = result.error.hint;
          err.table = op.table;
          err.op = op.op;
          err.id = op.id;
          throw err;
        }

        // Check if any rows were actually updated (RLS silent failure)
        if (op.op === UpdateType.PATCH && result?.data?.length === 0) {
          DebugLogger.warn(
            TAG,
            "RLS may have blocked update - 0 rows returned",
            {
              table: op.table,
              id: op.id,
            },
          );
        }

        completedOps++;
      }

      await transaction.complete();
      DebugLogger.info(
        TAG,
        `uploadData SUCCESS - ${completedOps}/${opCount} ops completed`,
        {
          transactionId: transaction.transactionId,
        },
      );
    } catch (ex: any) {
      DebugLogger.error(TAG, "uploadData FAILED", {
        completedOps,
        totalOps: opCount,
        lastOp: lastOp
          ? { table: lastOp.table, op: lastOp.op, id: lastOp.id }
          : null,
        errorMessage: ex?.message,
        errorCode: ex?.code,
        errorDetails: ex?.details,
        errorHint: ex?.hint,
        errorStack: ex?.stack?.substring(0, 500),
      });

      const isFatal =
        typeof ex?.code === "string" &&
        FATAL_RESPONSE_CODES.some((re) => re.test(ex.code));

      if (isFatal) {
        DebugLogger.warn(
          TAG,
          `Discarding FATAL transaction (code: ${ex.code})`,
          {
            code: ex.code,
            lastOp: lastOp
              ? { table: lastOp.table, op: lastOp.op, id: lastOp.id }
              : null,
          },
        );
        await transaction.complete();
      } else {
        DebugLogger.info(TAG, "Error is retryable, will retry later");
        throw ex;
      }
    }
  }
}
