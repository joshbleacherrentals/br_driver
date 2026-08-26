/**
 * Editing and withdrawing a ticket — both gated by the same 24-hour window, and
 * both scoped to the driver who wrote it.
 *
 * The `created_by_user_uuid` clause in the WHERE is not ceremony. RoadmapTasks
 * is the developers' board: rows belonging to the whole team exist in Postgres,
 * and a future sync-rule change that let any of them reach a phone must not
 * turn into a driver editing the team's backlog. The statement itself refuses.
 *
 * Deletion is soft (`deleted_at`) and never a DELETE: the row is the team's
 * record of what was reported, and a hard delete would also desync the daily
 * limit, which counts rows created — including withdrawn ones.
 */

import { deleteBacklogTicket } from "@/features/backlog-tickets/utils/deleteBacklogTicket";
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "@/features/backlog-tickets/utils/ticketText";
import { updateBacklogTicket } from "@/features/backlog-tickets/utils/updateBacklogTicket";
import type { DriverScope } from "@/library/powersync/scoping";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedMutationVoid: jest.fn(),
}));

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

const mockMutation = executeTypedMutationVoid as jest.MockedFunction<
  typeof executeTypedMutationVoid
>;

const scope = { userUuid: "user-1", driverUuid: "driver-1" } as DriverScope;
const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const fresh = new Date(NOW - HOUR).toISOString();
const stale = new Date(NOW - 25 * HOUR).toISOString();

function captured() {
  expect(mockMutation).toHaveBeenCalledTimes(1);
  return mockMutation.mock.calls[0][0] as { sql: string; parameters: readonly unknown[] };
}

const edit = {
  id: "ticket-1",
  title: "Updated title",
  description: "Updated description",
  scope,
  createdAt: fresh,
  now: NOW,
};

describe("updateBacklogTicket", () => {
  it("writes the new text inside the window", async () => {
    const result = await updateBacklogTicket(edit);

    expect(result).toEqual({ ok: true });
    const { sql, parameters } = captured();
    expect(sql).toMatch(/update "RoadmapTasks" set/i);
    expect(parameters).toContain("Updated title");
    expect(parameters).toContain("Updated description");
  });

  it("touches title and description only — never status, order or ownership", async () => {
    await updateBacklogTicket(edit);

    const { sql } = captured();
    const setClause = sql.slice(sql.indexOf(" set ") + 5, sql.indexOf(" where "));
    const columns = setClause.split(",").map((c) => c.split("=")[0].trim().replace(/"/g, "")).sort();

    expect(columns).toEqual(["description", "title"]);
  });

  it("scopes the statement to the driver who wrote the ticket", async () => {
    await updateBacklogTicket(edit);

    const { sql, parameters } = captured();
    expect(sql).toMatch(/where .*"id" = \?.*"created_by_user_uuid" = \?/is);
    expect(parameters).toContain("ticket-1");
    expect(parameters).toContain("user-1");
  });

  it("trims what the driver typed", async () => {
    await updateBacklogTicket({ ...edit, title: "  t  ", description: "  d  " });

    const { parameters } = captured();
    expect(parameters).toContain("t");
    expect(parameters).toContain("d");
  });

  it("refuses once the window has closed, without writing anything", async () => {
    const result = await updateBacklogTicket({ ...edit, createdAt: stale });

    expect(result).toEqual({ ok: false, reason: "edit_window_closed" });
    expect(mockMutation).not.toHaveBeenCalled();
  });

  it("applies the same emptiness and length rules as creation", async () => {
    await expect(updateBacklogTicket({ ...edit, title: "  " })).resolves.toEqual({
      ok: false,
      reason: "empty_title",
    });
    await expect(updateBacklogTicket({ ...edit, description: "" })).resolves.toEqual({
      ok: false,
      reason: "empty_description",
    });
    await expect(
      updateBacklogTicket({ ...edit, title: "x".repeat(TITLE_MAX_LENGTH + 1) }),
    ).resolves.toEqual({ ok: false, reason: "title_too_long" });
    await expect(
      updateBacklogTicket({
        ...edit,
        description: "x".repeat(DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).resolves.toEqual({ ok: false, reason: "description_too_long" });

    expect(mockMutation).not.toHaveBeenCalled();
  });
});

describe("deleteBacklogTicket", () => {
  const removal = { id: "ticket-1", scope, createdAt: fresh, now: NOW };

  it("stamps deleted_at rather than removing the row", async () => {
    const result = await deleteBacklogTicket(removal);

    expect(result).toEqual({ ok: true });
    const { sql, parameters } = captured();
    expect(sql).toMatch(/update "RoadmapTasks" set "deleted_at" = \?/i);
    expect(sql).not.toMatch(/delete from/i);
    expect(parameters).toContain(new Date(NOW).toISOString());
  });

  it("scopes the statement to the driver who wrote the ticket", async () => {
    await deleteBacklogTicket(removal);

    const { sql, parameters } = captured();
    expect(sql).toMatch(/where .*"id" = \?.*"created_by_user_uuid" = \?/is);
    expect(parameters).toContain("ticket-1");
    expect(parameters).toContain("user-1");
  });

  it("refuses once the window has closed, without writing anything", async () => {
    const result = await deleteBacklogTicket({ ...removal, createdAt: stale });

    expect(result).toEqual({ ok: false, reason: "edit_window_closed" });
    expect(mockMutation).not.toHaveBeenCalled();
  });
});
