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

/**
 * How many queued CRUD operations one `uploadData` pass pulls.
 *
 * `getCrudBatch` spans transactions, which is the entire point: the photo queue
 * writes one row per status change, so a 300-photo drain produces 300 *separate*
 * single-op transactions. Batching inside one transaction would collapse nothing
 * — the ops have to be gathered across transactions before they can be grouped.
 */
const CRUD_BATCH_LIMIT = 500;

/**
 * A run of adjacent CRUD operations that can share one PostgREST request:
 * same table, same verb, same column set, no repeated row id.
 */
type CrudGroup = {
  table: string;
  op: UpdateType;
  /** Sorted `opData` keys — PostgREST rejects an array whose objects differ. */
  columns: string[];
  ops: CrudEntry[];
};

/**
 * What `uploadData` consumes. `CrudTransaction` is a `CrudBatch` with a
 * `transactionId`, so one shape covers both sources.
 */
type UploadBatch = {
  crud: CrudEntry[];
  complete: (writeCheckpoint?: string) => Promise<void>;
  transactionId?: number;
};

/**
 * Splits the queue into batchable runs **without reordering anything**.
 *
 * Grouping by (table, op) across the whole batch would be a bigger collapse, but
 * it would also move a write past an unrelated one — a delete past a later
 * insert that needs its unique index freed, say. Only *adjacent* operations are
 * merged, so the order Supabase sees is byte-for-byte the order PowerSync
 * recorded. The photo-status case is a single uninterrupted run of identical
 * PATCHes, so it still collapses to one request.
 *
 * A repeated row id also closes the run: `INSERT … ON CONFLICT DO UPDATE` cannot
 * touch the same row twice in one statement (Postgres 21000), and two writes to
 * one row inside a batch is exactly what a retry-then-succeed sequence produces.
 */
function groupCrudOps(crud: CrudEntry[]): CrudGroup[] {
  const groups: CrudGroup[] = [];
  let current: CrudGroup | null = null;
  let currentIds = new Set<string>();

  for (const op of crud) {
    const columns = Object.keys(op.opData ?? {}).sort();

    const extendsRun =
      current !== null &&
      current.table === op.table &&
      current.op === op.op &&
      current.columns.length === columns.length &&
      current.columns.every((column, i) => column === columns[i]) &&
      !currentIds.has(op.id);

    if (!extendsRun) {
      current = { table: op.table, op: op.op, columns, ops: [] };
      currentIds = new Set<string>();
      groups.push(current);
    }

    current!.ops.push(op);
    currentIds.add(op.id);
  }

  return groups;
}

/**
 * The one `opData` a PATCH run shares, or `null` if the rows differ at all.
 *
 * This is what decides whether a batch can travel as a plain `UPDATE … WHERE id
 * IN (…)` instead of `INSERT … ON CONFLICT DO UPDATE`, and the difference is not
 * cosmetic. An upsert has to satisfy every NOT NULL column of the table, because
 * Postgres plans the INSERT whether or not the row turns out to exist. A photo
 * status mirror write carries exactly one column (`upload_status`), so every
 * such batch was rejected with 23502 for the columns it does not carry
 * (`damage_report_uuid` and friends) — 21 of 21 batches on a real device — and
 * then replayed one request at a time by the fallback in `executeGroup`. No data
 * was lost; the entire benefit of batching that table was.
 *
 * An UPDATE has no such problem: it never touches a column it does not set and
 * never inserts. What it cannot do is carry *different* values per row, which is
 * why this is a property of the group rather than of the table. Tables still on
 * the fully-synced path (`InspectionPhotos`, `DriverDocuments`) batch writes
 * whose `attempts` / `last_attempt_at` genuinely differ per photo, so they fail
 * this check and keep the upsert shape that can express them.
 *
 * Values are compared with `Object.is`, so anything non-scalar — which SQLite
 * CRUD payloads do not produce today — simply reads as "not uniform" and falls
 * back to the upsert. The safe direction.
 */
function uniformPatchValues(group: CrudGroup): Record<string, any> | null {
  if (group.op !== UpdateType.PATCH) return null;
  if (group.ops.length < 2) return null;
  // A PATCH that sets nothing has no UPDATE to express; leave it alone.
  if (group.columns.length === 0) return null;

  const [first, ...rest] = group.ops;
  const values = (first.opData ?? {}) as Record<string, any>;

  for (const op of rest) {
    const other = (op.opData ?? {}) as Record<string, any>;
    for (const column of group.columns) {
      if (!Object.is(values[column], other[column])) return null;
    }
  }

  return values;
}

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
   * Pulls the next chunk of queued writes.
   *
   * Prefers `getCrudBatch`, which crosses transaction boundaries and is the only
   * source that can hand this connector enough same-shape operations to be worth
   * grouping. Falls back to `getNextCrudTransaction` when the database does not
   * expose it, so the single-transaction contract still works unchanged.
   */
  private async nextUploadBatch(
    database: AbstractPowerSyncDatabase,
  ): Promise<UploadBatch | null> {
    if (typeof database.getCrudBatch === "function") {
      return (await database.getCrudBatch(
        CRUD_BATCH_LIMIT,
      )) as UploadBatch | null;
    }
    return (await database.getNextCrudTransaction()) as UploadBatch | null;
  }

  /**
   * Issues one operation as its own request — the pre-batching behaviour,
   * preserved verbatim. It is both the path for a run of length 1 and the
   * fallback a failed batched request replays through.
   */
  private async executeSingle(op: CrudEntry): Promise<any> {
    const table = this.client.from(op.table);

    switch (op.op) {
      case UpdateType.PUT:
        return await table
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

      case UpdateType.PATCH:
        return await table.update(op.opData).eq("id", op.id).select("id");

      case UpdateType.DELETE:
        return await table.delete().eq("id", op.id);
    }
  }

  /** Issues a whole run as one request. */
  private async executeBatched(group: CrudGroup): Promise<any> {
    const table = this.client.from(group.table);
    const ids = group.ops.map((op) => op.id);

    switch (group.op) {
      case UpdateType.DELETE:
        return await table.delete().in("id", ids);

      case UpdateType.PATCH: {
        // A run whose rows all set the same columns to the same values is a
        // real `UPDATE … WHERE id IN (…)`: it keeps UPDATE semantics (no
        // insert, no NOT NULL obligation for columns it does not carry) while
        // still costing one request. This is the shape the `DamageReportPhotos`
        // `upload_status` mirror produces — one constant column, identical
        // across the batch — and the shape the upsert below could not express
        // without tripping 23502. See `uniformPatchValues`.
        const uniform = uniformPatchValues(group);
        if (uniform) {
          return await table.update(uniform).in("id", ids).select("id");
        }
        return await this.upsertRows(group);
      }

      case UpdateType.PUT:
        return await this.upsertRows(group);
    }
  }

  /**
   * One `INSERT … ON CONFLICT (id) DO UPDATE` for a whole run.
   *
   * For PUT that is exactly N upserts collapsed. For a PATCH run it is the only
   * shape PostgREST offers that carries *different* values per row in a single
   * request, which is what the still-fully-synced photo tables need
   * (`attempts` and `last_attempt_at` differ per photo). It comes with INSERT
   * obligations the rows may not be able to meet — see `executeGroup` for how
   * that semantic gap is contained.
   */
  private async upsertRows(group: CrudGroup): Promise<any> {
    return await this.client
      .from(group.table)
      .upsert(
        group.ops.map((op) => ({ id: op.id, ...op.opData })),
        { onConflict: "id", count: "exact" },
      )
      .select("id");
  }

  /**
   * Runs one group and throws a code-carrying error if Supabase rejected it.
   *
   * A batched request that fails is replayed one operation at a time before the
   * failure is allowed to propagate. That keeps two things true:
   *
   * - **Blast radius stays per-operation.** The error that reaches the caller
   *   names the single op that actually failed, so the fatal-vs-retryable
   *   decision is made on that op rather than on 300 of them at once.
   * - **PATCH keeps `UPDATE` semantics whenever batching's `INSERT … ON
   *   CONFLICT` shape is the thing that broke.** A table where the driver may
   *   update but not insert (RLS 42501), or a row deleted server-side whose
   *   partial re-insert trips a NOT NULL constraint (23502), fails as a batch
   *   and then succeeds — or no-ops — on replay, exactly as before batching.
   */
  private async executeGroup(group: CrudGroup): Promise<void> {
    const batched = group.ops.length > 1;

    DebugLogger.info(
      TAG,
      `Processing ${group.ops.length} x ${group.op} on ${group.table}`,
      {
        op: group.op,
        table: group.table,
        opCount: group.ops.length,
        batched,
        // Column NAMES, never their values. `opData` carries whole photo
        // payloads (`DamageReportPhotos.thumbnail` is a ~10KB base64 string),
        // and `DebugLogger` retains the last 500 entries by reference while
        // also handing them to `console` — so logging the payload cost both a
        // megabytes-sized retained buffer and a serialization pass, per
        // operation, on the CRUD upload path itself. Which columns a write
        // touches is the part that was ever diagnostically useful.
        columns: group.columns,
      },
    );

    if (batched) {
      const result = await this.executeBatched(group);

      DebugLogger.info(TAG, `${group.op} batch result`, {
        table: group.table,
        opCount: group.ops.length,
        status: result?.status,
        statusText: result?.statusText,
        count: result?.count,
        hasError: !!result?.error,
        error: result?.error,
        dataCount: result?.data?.length,
      });

      if (!result?.error) {
        if (
          group.op === UpdateType.PATCH &&
          result?.data &&
          result.data.length < group.ops.length
        ) {
          DebugLogger.warn(TAG, "RLS may have blocked updates - short result", {
            table: group.table,
            expected: group.ops.length,
            returned: result.data.length,
          });
        }
        return;
      }

      DebugLogger.warn(
        TAG,
        `Batched ${group.op} on ${group.table} failed - replaying per operation`,
        {
          code: result.error.code,
          message: result.error.message,
        },
      );
    }

    for (const op of group.ops) {
      const result = await this.executeSingle(op);

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
        DebugLogger.warn(TAG, "RLS may have blocked update - 0 rows returned", {
          table: op.table,
          id: op.id,
        });
      }
    }
  }

  /**
   * Upload local changes to Supabase.
   *
   * Adjacent same-table, same-verb, same-column-set writes travel as one
   * PostgREST request. A photo-queue drain used to cost one round trip per
   * status write — 300 photos, 300 sequential requests — and PowerSync cannot
   * apply the checkpoint sitting behind them until the last one answers.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await this.nextUploadBatch(database);

    if (!transaction) {
      return;
    }

    const opCount = transaction.crud.length;
    const groups = groupCrudOps(transaction.crud);

    DebugLogger.info(
      TAG,
      `uploadData START - ${opCount} operation(s) in ${groups.length} request(s)`,
      {
        transactionId: transaction.transactionId,
        opCount,
        requestCount: groups.length,
      },
    );

    let lastOp: CrudEntry | null = null;
    let completedOps = 0;

    try {
      for (const group of groups) {
        lastOp = group.ops[group.ops.length - 1];
        await this.executeGroup(group);
        completedOps += group.ops.length;
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
      // A failure inside a batched group is replayed per operation before it is
      // rethrown, so the error itself names the one op that actually failed;
      // `lastOp` only says which group was in flight.
      const failedOp = ex?.table
        ? { table: ex.table, op: ex.op, id: ex.id }
        : lastOp
          ? { table: lastOp.table, op: lastOp.op, id: lastOp.id }
          : null;

      DebugLogger.error(TAG, "uploadData FAILED", {
        completedOps,
        totalOps: opCount,
        lastOp: failedOp,
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
            lastOp: failedOp,
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
