/**
 * What a driver's ticket must look like the instant it hits the local database,
 * because that row is what PowerSync replays into Postgres — possibly days
 * later, from a phone that was offline the whole time.
 *
 * Two things are load-bearing:
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
 */

import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  createBacklogTicket,
} from "@/features/backlog-tickets/utils/createBacklogTicket";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedMutationVoid: jest.fn(),
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

jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => "ticket-1",
}));

const mockMutation = executeTypedMutationVoid as jest.MockedFunction<
  typeof executeTypedMutationVoid
>;

const scope = { userUuid: "user-1", driverUuid: "driver-1" } as DriverScope;
const NOW = Date.parse("2026-08-26T12:00:00.000Z");

const input = {
  title: "Trip list scrolls to top",
  description: "Every time a trip syncs the list jumps back to the top.",
  scope,
  recentCreatedAts: [] as (string | null)[],
  now: NOW,
};

/** The single compiled INSERT a successful create runs. */
function capturedInsert() {
  expect(mockMutation).toHaveBeenCalledTimes(1);
  return mockMutation.mock.calls[0][0] as { sql: string; parameters: readonly unknown[] };
}

describe("createBacklogTicket", () => {
  it("writes one row and reports its id", async () => {
    const result = await createBacklogTicket(input);

    expect(result).toEqual({ ok: true, id: "ticket-1" });
    expect(capturedInsert().sql).toMatch(/insert into "RoadmapTasks"/i);
  });

  it("writes exactly the columns a driver may set, and no others", async () => {
    await createBacklogTicket(input);

    const { sql } = capturedInsert();
    const columns = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",")
      .map((c) => c.trim().replace(/"/g, ""))
      .sort();

    expect(columns).toEqual([
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

    const { parameters } = capturedInsert();
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

    const { parameters } = capturedInsert();
    expect(parameters).toContain("padded title");
    expect(parameters).toContain("padded body");
  });

  it("refuses a whitespace-only title without writing anything", async () => {
    const result = await createBacklogTicket({ ...input, title: "   " });

    expect(result).toEqual({ ok: false, reason: "empty_title" });
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it("refuses a whitespace-only description without writing anything", async () => {
    const result = await createBacklogTicket({ ...input, description: "\n\n" });

    expect(result).toEqual({ ok: false, reason: "empty_description" });
    expect(mockMutation).not.toHaveBeenCalled();
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

    expect(mockMutation).not.toHaveBeenCalled();
  });

  it("accepts text exactly at the caps", async () => {
    const result = await createBacklogTicket({
      ...input,
      title: "x".repeat(TITLE_MAX_LENGTH),
      description: "x".repeat(DESCRIPTION_MAX_LENGTH),
    });

    expect(result).toEqual({ ok: true, id: "ticket-1" });
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
    expect(mockMutation).not.toHaveBeenCalled();
  });
});
