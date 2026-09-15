/**
 * The write a driver's withdrawal makes, exactly as it lands in the local
 * database — which is what PowerSync later replays into Postgres, possibly
 * days later from a phone that was in a dead zone the whole time.
 *
 * Three things are load-bearing:
 *
 * 1. The status is the one the office reads off the board. `declined` and
 *    `abandoned` are different facts — an offer nobody took versus work
 *    someone walked out of — and collapsing them into `cancelled` (which is
 *    what the app could do before this) loses that distinction forever.
 *
 * 2. The moment is stamped by the client, not left to a server default. The
 *    default would record the moment of *sync*; the office needs to know when
 *    the driver actually gave the work back, which is the only thing that
 *    explains a missed morning delivery.
 *
 * 3. Nothing else on the row is touched. A withdrawal is not a completion:
 *    `completed_at` staying null is what keeps the trip out of the pay total.
 */

import { withdrawTracker } from "@/utils/withdrawTracker";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedMutationVoid: jest.fn(),
}));

// The real module boots PowerSync; only the Kysely query builder is needed to
// compile the update under test.
jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    Kysely,
    DummyDriver,
    SqliteAdapter,
    SqliteIntrospector,
    SqliteQueryCompiler,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
  } = require("kysely");
  return {
    __esModule: true,
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (database: unknown) =>
          new SqliteIntrospector(database as never),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
    powerSyncDb: {},
  };
});

const mockMutation = executeTypedMutationVoid as jest.MockedFunction<
  typeof executeTypedMutationVoid
>;

const NOW = "2026-09-11T14:30:00.000Z";

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(Date.parse(NOW));
});

afterEach(() => {
  jest.useRealTimers();
});

/** The compiled statement the function handed to the mutation runner. */
function compiledWrite() {
  const [query] = mockMutation.mock.calls[0];
  return query as { sql: string; parameters: readonly unknown[] };
}

describe("withdrawTracker", () => {
  it("declines the one tracker it was given, and stamps when", async () => {
    await withdrawTracker("wt-1", "decline");

    const { sql, parameters } = compiledWrite();
    expect(sql).toContain('update "WorkTrackers"');
    expect(sql).toContain('"status"');
    expect(sql).toContain('"declined_at"');
    expect(sql).toContain('"updated_at"');
    expect(sql).toContain('where "id" = ?');
    expect(parameters).toEqual(["declined", NOW, NOW, "wt-1"]);
  });

  it("abandons into its own status and its own timestamp", async () => {
    await withdrawTracker("wt-2", "abandon");

    const { sql, parameters } = compiledWrite();
    expect(sql).toContain('"abandoned_at"');
    expect(sql).not.toContain('"declined_at"');
    expect(parameters).toEqual(["abandoned", NOW, NOW, "wt-2"]);
  });

  // A withdrawn trip is not a finished one. `completed_at` is what the pay
  // total in Trip History sums over, so writing it here would pay a driver for
  // work they handed back.
  it("leaves the completion fields alone", async () => {
    await withdrawTracker("wt-3", "abandon");

    const { sql } = compiledWrite();
    expect(sql).not.toContain('"completed_at"');
    expect(sql).not.toContain('"accepted_at"');
    expect(sql).not.toContain('"started_at"');
  });
});
