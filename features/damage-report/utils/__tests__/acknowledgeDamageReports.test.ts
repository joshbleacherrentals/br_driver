/**
 * Acknowledging existing damage reports — what a driver writes INSTEAD of a
 * duplicate report.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * The interesting part is not the INSERT. It is what an acknowledgement means
 * to everyone downstream:
 *
 * - the manager reads a count ("confirmed by 3 drivers"), so an ack has to be
 *   attributed and dated, and has to land once per submission rather than once
 *   per retry;
 * - a report someone previously marked as fixed is being looked at, right now,
 *   by a driver who can still see the damage — so the claim is withdrawn in
 *   the same breath, or the manager keeps reading a lie;
 * - and both of those have to be one atomic write, because a phone that dies
 *   between them leaves a report acknowledged but still advertised as fixed.
 *
 * The queries run against a real SQLite database; only the transaction wrapper
 * is faked, and only in the suite whose subject IS the wrapper.
 */

import {
  acknowledgeDamageReports,
  buildAcknowledgementInserts,
  buildClearFixedOnAcknowledged,
} from "@/features/damage-report/utils/acknowledgeDamageReports";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";

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

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedTransaction: jest.fn(),
}));

let mockIdCounter = 0;
jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => `ack-${++mockIdCounter}`,
}));

const mockTransaction = executeTypedTransaction as jest.MockedFunction<
  typeof executeTypedTransaction
>;

let driverA: SeededDriver;
let driverB: SeededDriver;

const NOW = "2026-09-09T12:00:00.000Z";

async function run(compiled: { sql: string; parameters: readonly unknown[] }) {
  await mockDb.executeQuery(compiled as never);
}

async function acks() {
  return mockDb
    .selectFrom("DamageReportAcknowledgements")
    .selectAll()
    .orderBy("damage_report_uuid")
    .execute();
}

async function report(reportId: string) {
  return mockDb
    .selectFrom("DamageReports")
    .select(["fixed_by_driver", "fixed_at", "fixed_by_user_uuid", "note"])
    .where("id", "=", reportId)
    .executeTakeFirstOrThrow();
}

beforeEach(async () => {
  mockIdCounter = 0;
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");
});

describe("what an acknowledgement records", () => {
  it("writes one row per selected report", async () => {
    await seedDamageReport({ reportId: "r1", createdByUserUuid: driverB.userUuid });
    await seedDamageReport({ reportId: "r2", createdByUserUuid: driverB.userUuid });

    for (const q of buildAcknowledgementInserts(
      {
        reportIds: ["r1", "r2"],
        inspectionUuid: "insp-1",
        workTrackerUuid: "wt-1",
        scope: scopeFor(driverA),
      },
      NOW,
    )) {
      await run(q);
    }

    expect(await acks()).toMatchObject([
      {
        damage_report_uuid: "r1",
        inspection_uuid: "insp-1",
        work_tracker_uuid: "wt-1",
        acknowledged_by_user_uuid: driverA.userUuid,
        created_at: NOW,
        deleted: 0,
      },
      { damage_report_uuid: "r2", acknowledged_by_user_uuid: driverA.userUuid },
    ]);
  });

  it("carries no inspection when it came from the damage reports screen", async () => {
    await seedDamageReport({ reportId: "r1", createdByUserUuid: driverB.userUuid });

    for (const q of buildAcknowledgementInserts(
      {
        reportIds: ["r1"],
        inspectionUuid: null,
        workTrackerUuid: null,
        scope: scopeFor(driverA),
      },
      NOW,
    )) {
      await run(q);
    }

    expect(await acks()).toMatchObject([
      { damage_report_uuid: "r1", inspection_uuid: null, work_tracker_uuid: null },
    ]);
  });

  it("writes nothing when nothing was selected", () => {
    expect(
      buildAcknowledgementInserts(
        {
          reportIds: [],
          inspectionUuid: "insp-1",
          workTrackerUuid: null,
          scope: scopeFor(driverA),
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("never claims the report is resolved — that column is the server's", () => {
    const [insert] = buildAcknowledgementInserts(
      {
        reportIds: ["r1"],
        inspectionUuid: null,
        workTrackerUuid: null,
        scope: scopeFor(driverA),
      },
      NOW,
    );

    // `report_resolved_at` is a mirror maintained by Postgres triggers, and the
    // column the mobile sync rule filters on. A client that wrote it would be
    // deciding what reaches other drivers' phones.
    expect(insert.sql).not.toContain("report_resolved_at");
  });
});

describe("acknowledging a report someone called fixed", () => {
  it("withdraws the fixed mark — the damage is being looked at right now", async () => {
    await seedDamageReport({
      reportId: "r1",
      createdByUserUuid: driverB.userUuid,
      fixed: { at: "2026-09-01T00:00:00.000Z", byUserUuid: driverB.userUuid },
    });

    await run(buildClearFixedOnAcknowledged(["r1"]));

    expect(await report("r1")).toMatchObject({
      fixed_by_driver: 0,
      fixed_at: null,
      fixed_by_user_uuid: null,
    });
  });

  it("leaves everything else on the report alone", async () => {
    await seedDamageReport({
      reportId: "r1",
      createdByUserUuid: driverB.userUuid,
      note: "loose seat bolt",
      fixed: { at: "2026-09-01T00:00:00.000Z", byUserUuid: driverB.userUuid },
    });

    await run(buildClearFixedOnAcknowledged(["r1"]));

    expect(await report("r1")).toMatchObject({ note: "loose seat bolt" });
  });

  it("touches only reports that actually carry the mark", () => {
    // Not a micro-optimisation: PowerSync records one upload per row an UPDATE
    // touches, so an unfiltered write would push a no-op change for every
    // report the driver ticked.
    expect(buildClearFixedOnAcknowledged(["r1", "r2"]).sql).toContain(
      "fixed_by_driver",
    );
  });

  it("clears nothing when nothing was selected", async () => {
    await seedDamageReport({
      reportId: "r1",
      createdByUserUuid: driverB.userUuid,
      fixed: { at: "2026-09-01T00:00:00.000Z", byUserUuid: driverB.userUuid },
    });

    await run(buildClearFixedOnAcknowledged([]));

    expect(await report("r1")).toMatchObject({ fixed_by_driver: 1 });
  });
});

describe("the write is cross-driver by design (§15)", () => {
  it("acknowledges reports belonging to anyone", () => {
    const [insert] = buildAcknowledgementInserts(
      {
        reportIds: ["r1"],
        inspectionUuid: null,
        workTrackerUuid: null,
        scope: scopeFor(driverA),
      },
      NOW,
    );

    expect(insert.sql).not.toContain("created_by_user_uuid");
  });

  it("clears the fixed mark whoever set it", () => {
    expect(buildClearFixedOnAcknowledged(["r1"]).sql).not.toContain(
      "created_by_user_uuid",
    );
  });
});

describe("atomicity", () => {
  it("puts the acknowledgements and the withdrawal in one transaction", async () => {
    const ran: string[] = [];
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        run: (async (compiled: { sql: string }) => {
          ran.push(compiled.sql);
          return undefined;
        }) as never,
      }),
    );

    await acknowledgeDamageReports({
      reportIds: ["r1", "r2"],
      inspectionUuid: "insp-1",
      workTrackerUuid: "wt-1",
      scope: scopeFor(driverA),
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(ran.filter((sql) => sql.startsWith("insert"))).toHaveLength(2);
    expect(ran.filter((sql) => sql.startsWith("update"))).toHaveLength(1);
  });

  it("does not open a transaction when nothing was selected", async () => {
    await acknowledgeDamageReports({
      reportIds: [],
      inspectionUuid: "insp-1",
      workTrackerUuid: null,
      scope: scopeFor(driverA),
    });

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
