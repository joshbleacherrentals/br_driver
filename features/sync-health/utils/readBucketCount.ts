/** The part of `PowerSyncDatabase` this needs, so tests can pass a fake. */
export type BucketCountSource = {
  get(sql: string, parameters?: unknown[]): Promise<unknown>;
};

/**
 * How many PowerSync buckets this device holds — the number that runs into the
 * server's `max_parameter_query_results` (PSYNC_S2305).
 *
 * The ONE raw SQL string in the Sync Health feature, on purpose:
 * `ps_buckets` is PowerSync's internal bookkeeping table, not a synced table,
 * so it is not in AppSchema and the typed Kysely wrapper cannot express it.
 * Keep it here and nowhere else.
 *
 * `$local` is the SDK's pseudo-bucket for pending local writes. Every device
 * has it and the server never sent it, so it is not counted.
 */
export async function readBucketCount(database: BucketCountSource): Promise<number> {
  const row = (await database.get(
    "SELECT count(*) AS bucket_count FROM ps_buckets WHERE name != '$local'",
  )) as { bucket_count: number | bigint };
  return Number(row.bucket_count);
}
