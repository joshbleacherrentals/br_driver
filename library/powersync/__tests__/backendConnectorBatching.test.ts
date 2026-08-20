/**
 * LOCKED CONTRACT — DO NOT MODIFY THIS TEST FILE.
 *
 * This test defines expected behavior for a diagnosed bug/regression in the
 * photo upload queue (see the "Photo Queue Postmortem" plan). It must stay
 * red until the corresponding fix lands, and must not be edited, weakened,
 * skipped, or deleted to make broken implementation code pass. If you are
 * an agent implementing the fix and believe this test is wrong, STOP and
 * ask the user — do not change this file yourself.
 *
 * Seam under test: `BackendConnector.uploadData` — how many outbound Supabase
 * requests one CRUD transaction of same-table, same-op writes costs.
 * Currently: RED — the upload loop issues one HTTP request per CRUD operation,
 * so a 300-op transaction costs 300 round trips and the checkpoint behind it
 * cannot be applied until every one of them has answered.
 */

import { BackendConnector } from "@/library/powersync/BackendConnector";
import type { AbstractPowerSyncDatabase } from "@powersync/react-native";

/**
 * One outbound PostgREST call, as the connector's Supabase client would make
 * it. `rows` is whatever payload the verb was handed — an object for a
 * single-row write, an array for a batched one.
 *
 * `mock`-prefixed because Jest hoists `jest.mock(...)` above every import and
 * only allows the factory to reach out-of-scope bindings with that prefix.
 */
const mockRequests: { table: string; verb: string; rows: unknown }[] = [];

jest.mock("@supabase/supabase-js", () => {
  /**
   * A minimal PostgREST query builder: chainable, thenable, and recording one
   * request per terminal verb — which is exactly one HTTP round trip each.
   */
  const makeQueryBuilder = (table: string) => {
    const respond = () =>
      Promise.resolve({
        data: [{ id: "row" }],
        error: null,
        status: 200,
        statusText: "OK",
        count: 1,
      });

    const builder: any = {
      upsert(values: unknown) {
        mockRequests.push({ table, verb: "upsert", rows: values });
        return builder;
      },
      update(values: unknown) {
        mockRequests.push({ table, verb: "update", rows: values });
        return builder;
      },
      delete() {
        mockRequests.push({ table, verb: "delete", rows: null });
        return builder;
      },
      eq: () => builder,
      in: () => builder,
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

// `@powersync/react-native` ships ESM the jest-expo preset does not transform,
// and the connector only needs its `UpdateType` values at runtime.
jest.mock("@powersync/react-native", () => ({
  __esModule: true,
  UpdateType: { PUT: "PUT", PATCH: "PATCH", DELETE: "DELETE" },
  CrudEntry: class {},
  AbstractPowerSyncDatabase: class {},
  PowerSyncBackendConnector: class {},
}));

// 300 log lines per assertion would bury the failure this test exists to show.
jest.mock("@/library/debug/DebugLogger", () => ({
  __esModule: true,
  DebugLogger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}));

/** How many photo status writes a single queue drain produces in the field. */
const OP_COUNT = 300;

/**
 * One CRUD transaction of `OP_COUNT` identical-shape PATCHes on one table —
 * the exact shape a photo-queue drain hands PowerSync.
 */
function makeStatusPatchTransaction() {
  const crud = Array.from({ length: OP_COUNT }, (_, index) => ({
    op: "PATCH",
    table: "DamageReportPhotos",
    id: `photo-${index}`,
    opData: {
      upload_status: "uploaded",
      attempts: 1,
      last_attempt_at: "2026-08-19T12:00:00.000Z",
      last_error: null,
    },
  }));

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

beforeEach(() => {
  mockRequests.length = 0;
});

describe("BackendConnector.uploadData batching", () => {
  it("sends one request for a transaction of 300 same-table, same-op writes", async () => {
    const transaction = makeStatusPatchTransaction();
    const connector = new BackendConnector({
      getPowerSyncToken: async () => "powersync-token",
      getSupabaseToken: async () => "supabase-token",
    });

    await connector.uploadData(makeDatabase(transaction));

    // Every op in this transaction touches the same table with the same verb
    // and the same column set, so it is one batched write — not 300 serial
    // round trips holding the sync checkpoint behind them.
    expect(mockRequests).toHaveLength(1);
  });
});
