/**
 * Reading how many PowerSync buckets this device holds.
 *
 * `ps_buckets` is PowerSync's own bookkeeping table, not part of AppSchema, so
 * the typed Kysely wrapper cannot reach it — this is the one raw SQL read in
 * the feature, and these tests pin exactly what it asks for:
 *
 *  * it counts `ps_buckets`, the device's list of server buckets;
 *  * it leaves out `$local`, the SDK's pseudo-bucket for pending local writes
 *    — it exists on every device and is not something the server sent, so
 *    counting it would put every driver one above the truth;
 *  * it returns a plain number, whatever numeric shape SQLite hands back.
 */

import { readBucketCount } from "../readBucketCount";

function fakeDb(result: unknown) {
  return { get: jest.fn(async () => result) };
}

describe("readBucketCount", () => {
  it("counts the rows of ps_buckets", async () => {
    const db = fakeDb({ bucket_count: 143 });
    await readBucketCount(db);

    const sql = String((db.get.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/count\(\*\)/i);
    expect(sql).toMatch(/from\s+ps_buckets/i);
  });

  it("does not count the SDK's $local pseudo-bucket", async () => {
    const db = fakeDb({ bucket_count: 143 });
    await readBucketCount(db);

    const [sql, params] = db.get.mock.calls[0] as unknown as [string, unknown[]?];
    const excludesLocal =
      /name\s*(!=|<>)\s*'\$local'/i.test(sql) ||
      (/name\s*(!=|<>)\s*\?/i.test(sql) && (params ?? []).includes("$local"));
    expect(excludesLocal).toBe(true);
  });

  it("returns the count as a number", async () => {
    await expect(readBucketCount(fakeDb({ bucket_count: 143 }))).resolves.toBe(143);
  });

  it("returns a number even when SQLite hands back a bigint", async () => {
    await expect(
      readBucketCount(fakeDb({ bucket_count: BigInt(7) })),
    ).resolves.toBe(7);
  });

  it("returns 0 for a device with no server buckets", async () => {
    await expect(readBucketCount(fakeDb({ bucket_count: 0 }))).resolves.toBe(0);
  });

  it("lets a failed read reject, so no made-up number is ever written", async () => {
    const db = { get: jest.fn(async () => Promise.reject(new Error("locked"))) };
    await expect(readBucketCount(db)).rejects.toThrow("locked");
  });
});
