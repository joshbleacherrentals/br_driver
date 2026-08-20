/**
 * How a batched PATCH is *shaped*, as opposed to how many requests it costs
 * (`backendConnectorBatching.test.ts` owns the count).
 *
 * WHY THIS EXISTS
 * The batching path sent every PATCH group as `upsert(rows, {onConflict:"id"})`.
 * Postgres plans the INSERT half of `INSERT … ON CONFLICT DO UPDATE` whether or
 * not the row already exists, so the payload has to satisfy every NOT NULL
 * column of the table. Since the "2A" hybrid design, a `DamageReportPhotos`
 * batch carries exactly one column — `upload_status: "uploaded"` — and so was
 * rejected with 23502 (`damage_report_uuid` violates not-null) on every single
 * batch observed on a real device. The per-op replay fallback saved the data and
 * hid the fault, at ~10x the sync-blackout it was supposed to remove.
 *
 * The fix is expressed as a property of the *group*, not of the table: a run
 * whose rows all set the same columns to the same values is a plain UPDATE, and
 * an UPDATE never touches a column it does not set. Tables whose batched writes
 * genuinely vary per row must keep the upsert shape, which is the second half of
 * what this file pins.
 */

import { BackendConnector } from "@/library/powersync/BackendConnector";
import type { AbstractPowerSyncDatabase } from "@powersync/react-native";

/** One outbound PostgREST call: the verb, its payload, and its `in`/`eq` filter. */
const mockRequests: {
  table: string;
  verb: string;
  rows: unknown;
  filter?: { column: string; values: unknown };
}[] = [];

jest.mock("@supabase/supabase-js", () => {
  const makeQueryBuilder = (table: string) => {
    const respond = () =>
      Promise.resolve({
        data: [{ id: "row" }],
        error: null,
        status: 200,
        statusText: "OK",
        count: 1,
      });

    const record = (verb: string, rows: unknown) => {
      mockRequests.push({ table, verb, rows });
      return builder;
    };

    const builder: any = {
      upsert: (values: unknown) => record("upsert", values),
      update: (values: unknown) => record("update", values),
      delete: () => record("delete", null),
      eq: (column: string, value: unknown) => {
        const last = mockRequests[mockRequests.length - 1];
        if (last) last.filter = { column, values: value };
        return builder;
      },
      in: (column: string, values: unknown) => {
        const last = mockRequests[mockRequests.length - 1];
        if (last) last.filter = { column, values };
        return builder;
      },
      select: () => builder,
      then: (...args: any[]) => respond().then(...args),
    };
    return builder;
  };

  return {
    __esModule: true,
    createClient: () => ({ from: makeQueryBuilder }),
  };
});

jest.mock("@powersync/react-native", () => ({
  __esModule: true,
  UpdateType: { PUT: "PUT", PATCH: "PATCH", DELETE: "DELETE" },
  CrudEntry: class {},
  AbstractPowerSyncDatabase: class {},
  PowerSyncBackendConnector: class {},
}));

jest.mock("@/library/debug/DebugLogger", () => ({
  __esModule: true,
  DebugLogger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}));

function makeTransaction(crud: unknown[]) {
  return {
    transactionId: 1,
    crud,
    complete: jest.fn(async () => undefined),
  };
}

function makeDatabase(transaction: unknown): AbstractPowerSyncDatabase {
  return {
    getNextCrudTransaction: jest.fn(async () => transaction),
  } as unknown as AbstractPowerSyncDatabase;
}

function makeConnector() {
  return new BackendConnector({
    getPowerSyncToken: async () => "powersync-token",
    getSupabaseToken: async () => "supabase-token",
  });
}

beforeEach(() => {
  mockRequests.length = 0;
});

describe("batched PATCH shape", () => {
  /** The 2A mirror write: one constant column, identical across the batch. */
  it("sends a uniform-value run as UPDATE … WHERE id IN (…), never an upsert", async () => {
    const crud = Array.from({ length: 40 }, (_unused, index) => ({
      op: "PATCH",
      table: "DamageReportPhotos",
      id: `photo-${index}`,
      opData: { upload_status: "uploaded" },
    }));

    await makeConnector().uploadData(makeDatabase(makeTransaction(crud)));

    expect(mockRequests).toHaveLength(1);
    const [request] = mockRequests;

    // The whole point: an upsert here would have to satisfy the table's NOT
    // NULL columns (`damage_report_uuid`) that this payload does not carry.
    expect(request.verb).toBe("update");
    expect(request.rows).toEqual({ upload_status: "uploaded" });

    // No `id` smuggled into the payload either — an UPDATE addresses rows
    // through its filter, and writing the primary key back is how a "harmless"
    // update turns into something Postgres has to re-check.
    expect(request.rows).not.toHaveProperty("id");

    expect(request.filter?.column).toBe("id");
    expect(request.filter?.values).toHaveLength(40);
  });

  /**
   * The tables still on the fully-synced path. Their batched writes carry
   * genuinely per-row values, which an UPDATE cannot express, so the upsert
   * shape has to survive this change untouched.
   */
  it("keeps the upsert for a run whose rows carry different values", async () => {
    const crud = Array.from({ length: 3 }, (_unused, index) => ({
      op: "PATCH",
      table: "InspectionPhotos",
      id: `photo-${index}`,
      opData: {
        upload_status: "failed",
        attempts: index + 1,
        last_attempt_at: `2026-08-20T12:0${index}:00.000Z`,
      },
    }));

    await makeConnector().uploadData(makeDatabase(makeTransaction(crud)));

    expect(mockRequests).toHaveLength(1);
    expect(mockRequests[0].verb).toBe("upsert");
    expect(mockRequests[0].rows).toHaveLength(3);
  });

  /**
   * Same table, same columns, but one row differs — the check is per group, so
   * a single dissenting value has to pull the whole run back to the upsert
   * rather than quietly overwriting the odd one out with the majority value.
   */
  it("falls back to the upsert when a single row in the run differs", async () => {
    const crud = [
      {
        op: "PATCH",
        table: "InspectionPhotos",
        id: "photo-a",
        opData: { upload_status: "uploaded", attempts: 1 },
      },
      {
        op: "PATCH",
        table: "InspectionPhotos",
        id: "photo-b",
        opData: { upload_status: "uploaded", attempts: 1 },
      },
      {
        op: "PATCH",
        table: "InspectionPhotos",
        id: "photo-c",
        opData: { upload_status: "uploaded", attempts: 4 },
      },
    ];

    await makeConnector().uploadData(makeDatabase(makeTransaction(crud)));

    expect(mockRequests).toHaveLength(1);
    expect(mockRequests[0].verb).toBe("upsert");
  });

  /**
   * A PUT is a row that may not exist yet. Uniform values change nothing about
   * that, and turning it into an UPDATE would silently drop the insert.
   */
  it("never turns a PUT run into an update, however uniform its values", async () => {
    const crud = Array.from({ length: 2 }, (_unused, index) => ({
      op: "PUT",
      table: "DamageReportPhotos",
      id: `photo-${index}`,
      opData: { upload_status: "pending" },
    }));

    await makeConnector().uploadData(makeDatabase(makeTransaction(crud)));

    expect(mockRequests).toHaveLength(1);
    expect(mockRequests[0].verb).toBe("upsert");
  });

  /**
   * A single-op group is not a batch at all — it goes down the untouched
   * per-operation path, which has always used `update().eq("id", …)`.
   */
  it("leaves a lone PATCH on the per-operation path", async () => {
    const crud = [
      {
        op: "PATCH",
        table: "DamageReportPhotos",
        id: "photo-solo",
        opData: { upload_status: "uploaded" },
      },
    ];

    await makeConnector().uploadData(makeDatabase(makeTransaction(crud)));

    expect(mockRequests).toHaveLength(1);
    expect(mockRequests[0].verb).toBe("update");
    expect(mockRequests[0].filter).toEqual({ column: "id", values: "photo-solo" });
  });
});
