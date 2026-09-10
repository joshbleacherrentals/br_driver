/**
 * Reading acknowledgements.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * Two questions, and both are answered across drivers on purpose:
 *
 * - "how many drivers have confirmed this report" — the line that stops the
 *   fourth duplicate being filed. Counting only the reader's own
 *   acknowledgements would make it read `0` on every report that matters;
 * - "what did this inspection already confirm" — what keeps a re-opened
 *   inspection from double-counting, and what the summary screen shows instead
 *   of an empty damage card.
 *
 * Run against a real SQLite database: the subject is a GROUP BY and a soft-
 * delete filter, and a fake would only restate them.
 */

import {
  buildAckCountsQuery,
  buildAcksForInspectionQuery,
  useAckCounts,
  useAcksForInspection,
} from "@/hooks/db/useDamageReportAcknowledgements";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  seedDamageReport,
  seedDamageReportAck,
  seedDriver,
  type SeededDriver,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

jest.mock("@/library/powersync/typedQuery", () => ({
  __esModule: true,
  expect: () => undefined,
  useTypedQuery: () => ({ data: undefined, isLoading: false }),
}));

let driverA: SeededDriver;
let driverB: SeededDriver;

async function rows(compiled: { sql: string; parameters: readonly unknown[] }) {
  const { rows } = await mockDb.executeQuery(compiled as never);
  return rows as Record<string, unknown>[];
}

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");

  await seedDamageReport({ reportId: "r1", createdByUserUuid: driverA.userUuid });
  await seedDamageReport({ reportId: "r2", createdByUserUuid: driverA.userUuid });
});

describe("how many drivers have confirmed a report", () => {
  it("counts acknowledgements from every driver, not just the reader's", async () => {
    await seedDamageReportAck({ ackId: "a1", reportId: "r1", byUserUuid: driverA.userUuid });
    await seedDamageReportAck({ ackId: "a2", reportId: "r1", byUserUuid: driverB.userUuid });

    expect(await rows(buildAckCountsQuery(["r1"])!.compile())).toEqual([
      { damage_report_uuid: "r1", count: 2 },
    ]);
  });

  it("counts each report separately", async () => {
    await seedDamageReportAck({ ackId: "a1", reportId: "r1", byUserUuid: driverA.userUuid });
    await seedDamageReportAck({ ackId: "a2", reportId: "r2", byUserUuid: driverA.userUuid });
    await seedDamageReportAck({ ackId: "a3", reportId: "r2", byUserUuid: driverB.userUuid });

    expect(await rows(buildAckCountsQuery(["r1", "r2"])!.compile())).toEqual([
      { damage_report_uuid: "r1", count: 1 },
      { damage_report_uuid: "r2", count: 2 },
    ]);
  });

  it("says nothing about a report nobody has confirmed", async () => {
    // Absent, not zero: the caller renders no line at all for those, and a row
    // of `0` would be a line saying nobody agrees with the report.
    expect(await rows(buildAckCountsQuery(["r1"])!.compile())).toEqual([]);
  });

  it("ignores withdrawn acknowledgements", async () => {
    await seedDamageReportAck({ ackId: "a1", reportId: "r1", byUserUuid: driverA.userUuid });
    await mockDb
      .updateTable("DamageReportAcknowledgements")
      .set({ deleted: 1 })
      .where("id", "=", "a1")
      .execute();

    expect(await rows(buildAckCountsQuery(["r1"])!.compile())).toEqual([]);
  });

  it("stays out of the database when there is nothing to count", () => {
    expect(buildAckCountsQuery([])).toBeNull();
  });
});

describe("what an inspection already confirmed", () => {
  it("returns the reports acknowledged on that inspection", async () => {
    await seedDamageReportAck({
      ackId: "a1",
      reportId: "r1",
      byUserUuid: driverA.userUuid,
      inspectionUuid: "insp-1",
    });
    await seedDamageReportAck({
      ackId: "a2",
      reportId: "r2",
      byUserUuid: driverA.userUuid,
      inspectionUuid: "insp-2",
    });

    const found = await rows(buildAcksForInspectionQuery("insp-1")!.compile());

    expect(found.map((r) => r.damage_report_uuid)).toEqual(["r1"]);
  });

  it("ignores withdrawn ones", async () => {
    await seedDamageReportAck({
      ackId: "a1",
      reportId: "r1",
      byUserUuid: driverA.userUuid,
      inspectionUuid: "insp-1",
    });
    await mockDb
      .updateTable("DamageReportAcknowledgements")
      .set({ deleted: 1 })
      .where("id", "=", "a1")
      .execute();

    expect(await rows(buildAcksForInspectionQuery("insp-1")!.compile())).toEqual([]);
  });
});

describe("the reads stay cross-driver (§15)", () => {
  it.each([
    ["useAckCounts", useAckCounts],
    ["useAcksForInspection", useAcksForInspection],
  ])(
    "%s takes no scope — a confirmation count that only counts you is worthless",
    (_name, hook) => {
      expect(typeof hook).toBe("function");
      expect(hook.length).toBe(1);
    },
  );

  it("neither query filters by who is reading", () => {
    // Selecting the author is fine — the UI names who confirmed. Filtering by
    // it is what would turn a shared count into a personal one.
    const whereOf = (sql: string) => sql.slice(sql.indexOf(" where "));

    expect(whereOf(buildAckCountsQuery(["r1"])!.compile().sql)).not.toContain(
      "acknowledged_by_user_uuid",
    );
    expect(
      whereOf(buildAcksForInspectionQuery("insp-1")!.compile().sql),
    ).not.toContain("acknowledged_by_user_uuid");
  });
});
