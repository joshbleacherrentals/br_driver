import type { CompiledQuery } from "kysely";
import { usePowerSync, useQuery } from "@powersync/react-native";

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

// typedQuery.ts
export function useTypedQuery<C extends CompiledQuery<any>, TExpected>(
  compiled: (C & EnsureExact<CompiledResultOf<C>, TExpected>) | null,
  _expected: TExpected
) {
  // PowerSync's useQuery should handle empty queries gracefully
  const sql = compiled?.sql ?? "";
  const parameters = compiled?.parameters ?? [];

  // Read the same context `useQuery` reads, one call earlier, purely so a
  // missing provider is loud instead of silent. Called unconditionally, so the
  // hook order is stable. Typed non-nullable upstream; it is `null` in reality
  // whenever there is no provider above the caller.
  const powerSync = usePowerSync();
  if (!powerSync) {
    reportMissingPowerSyncContext(sql);
  }

  return useQuery<TExpected>(sql, parameters as any[]);
}
