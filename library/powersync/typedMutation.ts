import type { CompiledQuery } from "kysely";
import { powerSyncDb } from '@/components/providers/SystemProvider';

export type CompiledResultOf<C> = C extends CompiledQuery<infer R> ? R : never;

/**
 * Execute a type-safe mutation (INSERT, UPDATE, DELETE) using Kysely compiled query
 * @param compiled - The compiled Kysely query
 * @returns Promise with the result
 */
export async function executeTypedMutation<C extends CompiledQuery<any>>(
  compiled: C
): Promise<CompiledResultOf<C>> {
  const { sql, parameters } = compiled;
  
  try {
    const result = await powerSyncDb.execute(sql, parameters as any[]);
    return result as CompiledResultOf<C>;
  } catch (error) {
    console.error("Mutation error:", error);
    throw error;
  }
}

/**
 * Execute a type-safe mutation without returning the result
 * Useful for UPDATE/DELETE operations where you don't need the return value
 */
export async function executeTypedMutationVoid<C extends CompiledQuery<any>>(
  compiled: C
): Promise<void> {
  await executeTypedMutation(compiled);
}

/**
 * Statement runner scoped to an open write transaction. Mutations must go
 * through this — `executeTypedMutation` takes the write lock itself, so calling
 * it from inside a transaction would both escape the transaction and deadlock
 * against the lock the transaction already holds.
 */
export type TypedTransaction = {
  run<C extends CompiledQuery<any>>(compiled: C): Promise<CompiledResultOf<C>>;
};

/**
 * Execute multiple mutations atomically.
 *
 * Everything the callback runs through `tx` commits together or not at all —
 * required whenever one user action touches several rows (e.g. replacing some
 * photo rows while deleting others), so a failure part-way through can never
 * leave the record in a half-repaired state.
 */
export async function executeTypedTransaction<T>(
  callback: (tx: TypedTransaction) => Promise<T>
): Promise<T> {
  try {
    return await powerSyncDb.writeTransaction(async (tx) => {
      return await callback({
        async run(compiled) {
          const result = await tx.execute(
            compiled.sql,
            compiled.parameters as any[]
          );
          return result as CompiledResultOf<typeof compiled>;
        },
      });
    });
  } catch (error) {
    console.error('[Transaction] Transaction failed:', error);
    throw error;
  }
}