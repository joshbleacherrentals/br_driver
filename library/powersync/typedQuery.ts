import type { CompiledQuery } from "kysely";
import { usePowerSync, useQuery } from "@powersync/react-native";
import { useMemo } from "react";

import { DebugLogger } from "@/library/debug/DebugLogger";

const TAG = "TypedQuery";

export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? (<T>() => T extends B ? 1 : 2) extends <T>() => T extends A ? 1 : 2
    ? true
    : false
  : false;

export type CompiledResultOf<C> = C extends CompiledQuery<infer R> ? R : never;

type EnsureExact<Actual, Expected> = Equal<Actual, Expected> extends true
  ? {}
  : { __TYPE_MISMATCH__: { actual: Actual; expected: Expected } };

// phantom helper (runtime = undefined, compile-time = T)
export const expect = <T>() => undefined as unknown as T;

/**
 * Queries already reported as running outside the provider, keyed by SQL.
 *
 * A hook in the wrong place re-renders for the lifetime of its component, and
 * one line per render would bury the console it is trying to warn in. One line
 * per distinct query is enough to identify the caller.
 */
const missingContextReported = new Set<string>();

/**
 * The failure mode this exists for: `usePowerSync()` is a plain
 * `useContext(PowerSyncContext)` whose default value is `null`, and
 * `@powersync/react`'s `useQuery` answers a null database with
 * `{ data: [], isLoading: false, error: Error('PowerSync not configured.') }` —
 * it does not throw and it does not log. Any hook that ends up outside
 * `PowerSyncContext.Provider` (including one called from the body of the
 * component that *renders* the provider, which never sees its own provider)
 * therefore reads as "this query has no rows", forever, in total silence. That
 * cost a full session of blocked photo uploads once; it should never be silent
 * again.
 */
function reportMissingPowerSyncContext(sql: string): void {
  const key = sql || "(empty query)";
  if (missingContextReported.has(key)) return;
  missingContextReported.add(key);

  DebugLogger.error(
    TAG,
    "useTypedQuery ran with no PowerSync database in context — the caller is " +
      "outside <PowerSyncContext.Provider> (or inside the component that " +
      "renders it). This query will return [] forever, not 'no rows'.",
    { sql: key },
  );
}

/**
 * The query run in place of a caller's query while that caller has nothing to
 * ask yet (`compiled === null` — the standard "the id this query needs hasn't
 * resolved" guard used by a dozen hooks in `hooks/db/`).
 *
 * It must be a *valid, zero-row, table-free* statement, and the reason is
 * narrow. `useQuery` has no disabled mode: it always builds a `WatchedQuery`,
 * and `OnChangeQueryProcessor.linkQuery` hands the SQL to
 * `AbstractPowerSyncDatabase.resolveTables`, which runs `EXPLAIN ${sql}` to
 * discover which tables to watch. The previous fallback here was the empty
 * string, so that became the literal `"EXPLAIN "` — which op-sqlite rejects
 * with `sqlite query error: incomplete input`, surfacing as `.error` on the
 * result of a query the caller never actually asked for. It fired on the first
 * render of every guarded hook in the app and was invisible everywhere except
 * `SystemProvider`'s §15 lookups, the one place that reads `.error`.
 *
 * `SELECT 1 WHERE 0` fixes it end to end: it `EXPLAIN`s cleanly, its plan
 * contains no `OpenRead` opcode so `resolveTables` returns `[]` and no
 * table-change listener is registered (the disabled query can never re-fire on
 * unrelated writes), and it yields zero rows, so `data` is `[]` exactly as
 * callers already assume.
 */
export const DISABLED_QUERY_SQL = "SELECT 1 WHERE 0";

// typedQuery.ts
export function useTypedQuery<C extends CompiledQuery<any>, TExpected>(
  compiled: (C & EnsureExact<CompiledResultOf<C>, TExpected>) | null,
  _expected: TExpected
) {
  const isDisabled = compiled === null;
  // Never the empty string — see DISABLED_QUERY_SQL.
  const sql = compiled?.sql ?? DISABLED_QUERY_SQL;
  const parameters = compiled?.parameters ?? [];

  // Read the same context `useQuery` reads, one call earlier, purely so a
  // missing provider is loud instead of silent. Called unconditionally, so the
  // hook order is stable. Typed non-nullable upstream; it is `null` in reality
  // whenever there is no provider above the caller.
  const powerSync = usePowerSync();
  if (!powerSync) {
    reportMissingPowerSyncContext(sql);
  }

  const result = useQuery<TExpected>(sql, parameters as any[]);

  // Additive, and deliberately left to inference: every field `useQuery`
  // returned is passed through untouched — `isDisabled` is the only new one —
  // so all 38 existing call sites keep working. (Writing the return type by
  // hand as `ReturnType<typeof useQuery<T>>` does *not* work: `useQuery` is
  // overloaded, and `ReturnType` picks its last overload — the differential one,
  // whose `data` is `readonly`. That silently made every call site that assigns
  // `.data` to a mutable array fail to compile.)
  return useMemo(() => ({ ...result, isDisabled }), [result, isDisabled]);
}

/**
 * The result of {@link useTypedQuery} — `useQuery`'s result plus `isDisabled`,
 * which is `true` when the caller passed `compiled === null` and this hook has
 * no query to run yet. It distinguishes "nothing was asked" from "the query ran
 * and matched nothing", which are otherwise both `data: []`.
 */
export type TypedQueryResult<TExpected> = ReturnType<
  typeof useTypedQuery<CompiledQuery<TExpected>, TExpected>
>;
