/**
 * What a driver's ticket must look like the instant it hits the local database,
 * because that row is what PowerSync replays into Postgres — possibly days
 * later, from a phone that was offline the whole time.
 *
 * Three things are load-bearing:
 *
 * 1. `created_at` is written by the client, not left to the Postgres default.
 *    The default would stamp the moment of *sync*, and both the 24-hour edit
 *    window and the daily limit are measured from creation. A ticket written in
 *    a dead zone on Friday must not reset its own window on Monday.
 *
 * 2. The row is written with exactly the columns the driver is allowed to set.
 *    The mobile RLS policy admits `is_backlog = true` and `status = 'to_do'`
 *    only; anything else (a sprint, a developer, a sort order) is the web
 *    roadmap's business, and a rejected write is dropped silently.
 *
 * 3. The ticket and its authorship notice are one transaction. The notice is
 *    how the web roadmap says who filed the ticket, and a task that committed
 *    without one would be anonymous on the board forever — nothing re-runs it.
 */

import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  createBacklogTicket,
} from "@/features/backlog-tickets/utils/createBacklogTicket";
import { ticketAuthorNoticeBody } from "@/features/backlog-tickets/utils/ticketAuthorNotice";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedTransaction: jest.fn(),
}));

// The real module boots PowerSync; only the Kysely query builder is needed to
// compile the insert under test.
jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Kysely, DummyDriver, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } = require("kysely");
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

let mockNextId = 0;
jest.mock("expo-crypto", () => ({
  __esModule: true,
  // Sequential rather than constant: the notice has to point at the ticket's
  // id, which a single fixed uuid would hide.
  randomUUID: () => `uuid-${++mockNextId}`,
}));

const mockTransaction = executeTypedTransaction as jest.MockedFunction<
  typeof executeTypedTransaction
>;

const scope = { userUuid: "user-1", driverUuid: "driver-1" } as DriverScope;
const NOW = Date.parse("2026-08-26T12:00:00.000Z");

const author = {
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  phone: null,
};

const input = {
  title: "Trip list scrolls to top",
  description: "Every time a trip syncs the list jumps back to the top.",
  scope,
  author,
  recentCreatedAts: [] as (string | null)[],
  now: NOW,
};

type Statement = { sql: string; parameters: readonly unknown[] };

/** Every statement the transaction ran, in order. */
let statements: Statement[] = [];

function statementFor(table: string): Statement {
  const match = statements.filter((s) =>
    new RegExp(`insert into "${table}"`, "i").test(s.sql),
  );
  expect(match).toHaveLength(1);
  return match[0];
}

/** The column names an INSERT lists, sorted. */
function columnsOf({ sql }: Statement): string[] {
  return sql
    .slice(sql.indexOf("(") + 1, sql.indexOf(")"))
    .split(",")
    .map((c) => c.trim().replace(/"/g, ""))
    .sort();
}

beforeEach(() => {
  mockNextId = 0;
  statements = [];
  mockTransaction.mockReset();
  mockTransaction.mockImplementation((callback: any) =>
    callback({
      run: async (compiled: Statement) => {
        statements.push(compiled);
        return undefined as never;
      },
    }),
  );
});

describe("createBacklogTicket", () => {
  it("writes the ticket and reports its id", async () => {
    const result = await createBacklogTicket(input);

    expect(result).toEqual({ ok: true, id: "uuid-1" });
    expect(statementFor("RoadmapTasks").sql).toMatch(/insert into "RoadmapTasks"/i);
  });

  it("writes exactly the columns a driver may set, and no others", async () => {
    await createBacklogTicket(input);

    expect(columnsOf(statementFor("RoadmapTasks"))).toEqual([
      "created_at",
      "created_by_user_uuid",
      "description",
      "id",
      "is_backlog",
      "sort_order",
      "status",
      "title",
    ]);
  });

  it("stamps the driver, the backlog flag, the to_do status and the client clock", async () => {
    await createBacklogTicket(input);

    const { parameters } = statementFor("RoadmapTasks");
    expect(parameters).toContain("user-1");
    expect(parameters).toContain("to_do");
    expect(parameters).toContain(new Date(NOW).toISOString());
    // Booleans live as 0/1 in PowerSync's SQLite mirror.
    expect(parameters).toContain(1);
    expect(parameters).toContain(0);
  });

  it("trims what the driver typed", async () => {
    await createBacklogTicket({
      ...input,
      title: "  padded title  ",
      description: "  padded body  ",
    });

    const { parameters } = statementFor("RoadmapTasks");
    expect(parameters).toContain("padded title");
    expect(parameters).toContain("padded body");
  });

  it("refuses a whitespace-only title without writing anything", async () => {
    const result = await createBacklogTicket({ ...input, title: "   " });

    expect(result).toEqual({ ok: false, reason: "empty_title" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses a whitespace-only description without writing anything", async () => {
    const result = await createBacklogTicket({ ...input, description: "\n\n" });

    expect(result).toEqual({ ok: false, reason: "empty_description" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses text past the caps the web roadmap can render", async () => {
    await expect(
      createBacklogTicket({ ...input, title: "x".repeat(TITLE_MAX_LENGTH + 1) }),
    ).resolves.toEqual({ ok: false, reason: "title_too_long" });

    await expect(
      createBacklogTicket({
        ...input,
        description: "x".repeat(DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).resolves.toEqual({ ok: false, reason: "description_too_long" });

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("accepts text exactly at the caps", async () => {
    const result = await createBacklogTicket({
      ...input,
      title: "x".repeat(TITLE_MAX_LENGTH),
      description: "x".repeat(DESCRIPTION_MAX_LENGTH),
    });

    expect(result).toEqual({ ok: true, id: "uuid-1" });
  });

  /**
   * The daily limit is re-checked here and not only in the screen: the button
   * can be stale for a render, and a dropped write is invisible to the driver.
   */
  it("refuses a fourth ticket in 24h even if the screen let the tap through", async () => {
    const hour = 60 * 60 * 1000;
    const result = await createBacklogTicket({
      ...input,
      recentCreatedAts: [
        new Date(NOW - hour).toISOString(),
        new Date(NOW - 2 * hour).toISOString(),
        new Date(NOW - 3 * hour).toISOString(),
      ],
    });

    expect(result).toEqual({ ok: false, reason: "limit_reached" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  describe("the authorship notice", () => {
    it("commits with the ticket, in one transaction, ticket first", async () => {
      await createBacklogTicket(input);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(statements).toHaveLength(2);
      // Order is not cosmetic: PowerSync replays CRUD in the order it recorded
      // it, and the message's FK points at a task that must already be there.
      expect(statements[0].sql).toMatch(/insert into "RoadmapTasks"/i);
      expect(statements[1].sql).toMatch(/insert into "RoadmapTaskMessages"/i);
    });

    it("writes only the columns the mobile lane may set", async () => {
      await createBacklogTicket(input);

      expect(columnsOf(statementFor("RoadmapTaskMessages"))).toEqual([
        "body",
        "created_at",
        "id",
        "is_system",
        "task_id",
        "user_uuid",
      ]);
    });

    it("hangs off the new ticket, credits the driver, and reads as system-written", async () => {
      await createBacklogTicket(input);

      const { parameters } = statementFor("RoadmapTaskMessages");
      expect(parameters).toContain("uuid-1"); // task_id
      expect(parameters).toContain("uuid-2"); // its own id
      expect(parameters).toContain("user-1");
      expect(parameters).toContain(ticketAuthorNoticeBody(author));
      // `is_system` — the board renders this as a note, not as a driver's reply.
      expect(parameters).toContain(1);
    });

    it("shares the ticket's client-written timestamp", async () => {
      await createBacklogTicket(input);

      const iso = new Date(NOW).toISOString();
      expect(statementFor("RoadmapTaskMessages").parameters).toContain(iso);
    });

    it("still names someone when the profile has not synced yet", async () => {
      await createBacklogTicket({ ...input, author: null });

      const { parameters } = statementFor("RoadmapTaskMessages");
      expect(parameters).toContain(
        "Submitted from the driver app by a driver with no name on file.",
      );
    });
  });
});
