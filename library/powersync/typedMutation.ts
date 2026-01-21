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
 * Execute multiple mutations in a transaction
 * This ensures all operations complete together and maintains proper order during sync
 */
export async function executeTypedTransaction<T>(
  callback: () => Promise<T>
): Promise<T> {
  try {
    console.log('[Transaction] Starting writeTransaction...');
    const result = await powerSyncDb.writeTransaction(async (tx) => {
      console.log('[Transaction] Inside writeTransaction callback');
      return await callback();
    });
    console.log('[Transaction] Transaction committed successfully');
    return result;
  } catch (error) {
    console.error('[Transaction] Transaction failed:', error);
    throw error;
  }
}