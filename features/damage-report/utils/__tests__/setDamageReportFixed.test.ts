/**
 * "Fixed by driver" — the write itself.
 *
 * Spec: docs/specs/driver-fixed-damage-reports.md
 *
 * Two things are under test, and only one of them is the SQL.
 *
 * The first is that the three columns move as ONE fact: `fixed_by_driver`
 * without `fixed_at` and `fixed_by_user_uuid` is a state Postgres refuses to
 * store (CHECK constraint, see the migration), so a client that writes them
 * separately produces a row that syncs and is then rejected server-side —
 * offline, hours later, with nobody watching. Asserting the shape here is what
 * keeps that from being reachable at all.
 *
 * The second is that the write is deliberately NOT scoped to the report's
 * author (§15). Any driver may mark any report fixed, because the driver on
 * site is the one who fixed it — so these assertions pin the absence of an
 * ownership predicate, which is otherwise indistinguishable from having
 * forgotten one. `crossDriverWrite` at the call site is what makes that
 * decision greppable; `scopedReads.test.ts` covers the wrapper.
 *
 * Run against a real SQLite database rather than a mock: the behaviour under
 * test is what the row looks like afterwards, and a mock would only echo back
 * the object the test itself built.
 */

import {
  buildMarkFixedQuery,
  buildUnmarkFixedQuery,
} from "@/features/damage-report/utils/setDamageReportFixed";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  scopeFor,
  seedDamageReport,
  seedDriver,
  type SeededDriver,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

let driverA: SeededDriver;
let driverB: SeededDriver;

const FIXED_AT = "2026-09-09T10:00:00.000Z";

async function run(compiled: { sql: string; parameters: readonly unknown[] }) {
  await mockDb.executeQuery(compiled as never);
}

async function readReport(reportId: string) {
  return mockDb
    .selectFrom("DamageReports")
    .select([
      "fixed_by_driver",
      "fixed_at",
      "fixed_by_user_uuid",
      "note",
      "resolved_at",
    ])
    .where("id", "=", reportId)
    .executeTakeFirstOrThrow();
}

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");
});

describe("marking a report fixed", () => {
  it("writes the flag, the timestamp and the author together", async () => {
    await seedDamageReport({
      reportId: "report-1",
      createdByUserUuid: driverA.userUuid,
    });

    await run(buildMarkFixedQuery("report-1", scopeFor(driverA), FIXED_AT));

    expect(await readReport("report-1")).toMatchObject({
      fixed_by_driver: 1,
      fixed_at: FIXED_AT,
      fixed_by_user_uuid: driverA.userUuid,
    });
  });

  it("records the driver who pressed it, not the one who filed the report", async () => {
    await seedDamageReport({
      reportId: "report-1",
      createdByUserUuid: driverA.userUuid,
    });

    await run(buildMarkFixedQuery("report-1", scopeFor(driverB), FIXED_AT));

    expect(await readReport("report-1")).toMatchObject({
      fixed_by_driver: 1,
      fixed_by_user_uuid: driverB.userUuid,
    });
  });

  it("touches nothing else on the report", async () => {
    await seedDamageReport({
      reportId: "report-1",
      createdByUserUuid: driverA.userUuid,
      note: "loose seat bolt",
    });

    await run(buildMarkFixedQuery("report-1", scopeFor(driverB), FIXED_AT));

    expect(await readReport("report-1")).toMatchObject({
      note: "loose seat bolt",
      resolved_at: null,
    });
  });

  it("leaves other reports alone", async () => {
    await seedDamageReport({
      reportId: "report-1",
      createdByUserUuid: driverA.userUuid,
    });
    await seedDamageReport({
      reportId: "report-2",
      createdByUserUuid: driverA.userUuid,
    });

    await run(buildMarkFixedQuery("report-1", scopeFor(driverA), FIXED_AT));

    expect(await readReport("report-2")).toMatchObject({
      fixed_by_driver: 0,
      fixed_at: null,
      fixed_by_user_uuid: null,
    });
  });

  it("carries no ownership predicate — the write is cross-driver by design", () => {
    const { sql } = buildMarkFixedQuery("report-1", scopeFor(driverA), FIXED_AT);

    expect(sql).not.toContain("created_by_user_uuid");
    expect(sql).not.toContain("exists");
  });
});

describe("removing the fixed mark", () => {
  it("clears all three columns, leaving no trace of the mark", async () => {
    await seedDamageReport({
      reportId: "report-1",
      createdByUserUuid: driverA.userUuid,
      fixed: { at: FIXED_AT, byUserUuid: driverB.userUuid },
    });

    await run(buildUnmarkFixedQuery("report-1"));

    expect(await readReport("report-1")).toMatchObject({
      fixed_by_driver: 0,
      fixed_at: null,
      fixed_by_user_uuid: null,
    });
  });

  it("can be done by a driver who did not set the mark", async () => {
    const { sql } = buildUnmarkFixedQuery("report-1");
    const where = sql.slice(sql.indexOf(" where "));

    // The only thing that identifies the row is its id: neither the report's
    // author nor whoever last pressed Fixed narrows who may undo it.
    expect(where).not.toContain("created_by_user_uuid");
    expect(where).not.toContain("fixed_by_user_uuid");
  });
});
