import type { CompiledQuery } from "kysely";
import { useQuery } from "@powersync/react-native";

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

// typedQuery.ts
export function useTypedQuery<C extends CompiledQuery<any>, TExpected>(
  compiled: (C & EnsureExact<CompiledResultOf<C>, TExpected>) | null,
  _expected: TExpected
) {
  // PowerSync's useQuery should handle empty queries gracefully
  const sql = compiled?.sql ?? "";
  const parameters = compiled?.parameters ?? [];
  
  return useQuery<TExpected>(sql, parameters as any[]);
}