/**
 * The write path: what lands in the local database when the app reports.
 *
 * The app is offline-first, so the report goes through the local database and
 * PowerSync's upload queue like every other write — never `fetch` or the
 * Supabase client. A report made in a dead zone must survive and arrive later.
 *
 * What the row must carry:
 *  * the count, on the driver's own Drivers row and no other;
 *  * `sync_version` — the connect parameter this build syncs with — so the
 *    page can tell legacy per-trip rules from the active-trip rules;
 *  * `bucket_count_reported_at` from the injected clock, so an offline report
 *    keeps the time it was measured, not the time it happened to upload.
 */

const mockMutate = jest.fn(async (_compiled: unknown) => undefined);

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedMutationVoid: (compiled: unknown) => mockMutate(compiled),
}));

// The real Kysely builder needs the PowerSync native half; the update is
// captured as a plain object instead, which is what these assertions are about.
jest.mock("@/library/powersync/db", () => ({
  __esModule: true,
  db: {
    updateTable: (table: string) => ({
      set: (values: Record<string, unknown>) => ({
        where: (column: string, op: string, value: unknown) => ({
          compile: () => ({ table, values, where: [column, op, value] }),
        }),
      }),
    }),
  },
}));

import { MOBILE_CONNECT_PARAMS } from "@/library/powersync/connectParams";
import { writeBucketCount } from "../writeBucketCount";

const NOW = new Date("2026-09-21T12:34:56.000Z");

describe("writeBucketCount", () => {
  it("writes one local mutation", async () => {
    await writeBucketCount("driver-a", 412, NOW);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("updates the driver's own Drivers row only", async () => {
    await writeBucketCount("driver-a", 412, NOW);
    const compiled = mockMutate.mock.calls[0][0] as {
      table: string;
      where: unknown[];
    };
    expect(compiled.table).toBe("Drivers");
    expect(compiled.where).toEqual(["id", "=", "driver-a"]);
  });

  it("sets exactly the three report columns", async () => {
    await writeBucketCount("driver-a", 412, NOW);
    const { values } = mockMutate.mock.calls[0][0] as {
      values: Record<string, unknown>;
    };
    expect(values).toEqual({
      bucket_count: 412,
      sync_version: MOBILE_CONNECT_PARAMS.sync_version,
      bucket_count_reported_at: "2026-09-21T12:34:56.000Z",
    });
  });

  it("writes a real zero as zero, not as a missing report", async () => {
    await writeBucketCount("driver-a", 0, NOW);
    const { values } = mockMutate.mock.calls[0][0] as {
      values: Record<string, unknown>;
    };
    expect(values.bucket_count).toBe(0);
  });

  it("passes a failed local write up to the caller", async () => {
    mockMutate.mockRejectedValueOnce(new Error("disk full"));
    await expect(writeBucketCount("driver-a", 1, NOW)).rejects.toThrow(
      "disk full",
    );
  });
});
