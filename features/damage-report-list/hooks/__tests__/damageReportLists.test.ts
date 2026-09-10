/**
 * The two lists behind the Damage Reports screen's tabs.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * `All` is every open report in the company — that is deliberate, and it is
 * what makes the screen useful for the thing it is now for: checking whether a
 * bleacher's damage is already known before filing anything. `Mine` is what
 * this driver filed.
 *
 * Both show unresolved reports only. That is a product decision with one sharp
 * edge, pinned below: a driver's OWN report whose photos have not finished
 * uploading must stay visible even after it is resolved, because that screen is
 * the only route to Retry and Replace. Hiding it would strand the evidence on
 * the phone with no way to reach it.
 */

import {
  buildBleachersWithOpenReportsQuery,
  buildMyBleachersWithOpenReportsQuery,
} from "@/features/damage-report-list/hooks/useBleachersWithOpenReports";
import {
  buildMyDamageReportsQuery,
  buildOpenDamageReportsQuery,
} from "@/features/damage-report-list/hooks/useDamageReportLists";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  scopeFor,
  seedDamageReport,
  seedDamageReportPhoto,
  seedDriver,
  type SeededDriver,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

// The hook modules import `useBatchBleachers`, which boots PowerSync through
// `SystemProvider`. Only the query builders are under test here.
jest.mock("@/library/powersync/typedQuery", () => ({
  __esModule: true,
  expect: () => undefined,
  useTypedQuery: () => ({ data: undefined, isLoading: false }),
}));

jest.mock("@/hooks/db/useBleacher", () => ({
  __esModule: true,
  useBatchBleachers: () => ({ bleachers: [] }),
}));

jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

let driverA: SeededDriver;
let driverB: SeededDriver;

async function ids(compiled: { sql: string; parameters: readonly unknown[] }) {
  const { rows } = await mockDb.executeQuery(compiled as never);
  return (rows as { id: string }[]).map((row) => row.id);
}

async function values(compiled: { sql: string; parameters: readonly unknown[] }) {
  const { rows } = await mockDb.executeQuery(compiled as never);
  return rows as Record<string, unknown>[];
}

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");
});

describe("the All tab", () => {
  it("shows open reports whoever filed them", async () => {
    await seedDamageReport({
      reportId: "mine",
      createdByUserUuid: driverA.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "theirs",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });

    expect((await ids(buildOpenDamageReportsQuery(null).compile())).sort()).toEqual([
      "mine",
      "theirs",
    ]);
  });

  it("drops resolved reports — the damage is dealt with", async () => {
    await seedDamageReport({
      reportId: "open",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "closed",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
      resolvedAt: "2026-09-01T00:00:00.000Z",
    });

    expect(await ids(buildOpenDamageReportsQuery(null).compile())).toEqual(["open"]);
  });

  it("drops soft-deleted reports", async () => {
    await seedDamageReport({
      reportId: "kept",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "binned",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
      deleted: true,
    });

    expect(await ids(buildOpenDamageReportsQuery(null).compile())).toEqual(["kept"]);
  });

  it("narrows to one bleacher when the driver picks one", async () => {
    await seedDamageReport({
      reportId: "on-b1",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "on-b2",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b2",
    });

    expect(await ids(buildOpenDamageReportsQuery("b2").compile())).toEqual(["on-b2"]);
  });

  it("puts the newest first", async () => {
    await seedDamageReport({
      reportId: "older",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    await seedDamageReport({
      reportId: "newer",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
      createdAt: "2026-09-01T00:00:00.000Z",
    });

    expect(await ids(buildOpenDamageReportsQuery(null).compile())).toEqual([
      "newer",
      "older",
    ]);
  });
});

describe("the Mine tab", () => {
  it("shows only what this driver filed", async () => {
    await seedDamageReport({
      reportId: "mine",
      createdByUserUuid: driverA.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "theirs",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });

    expect(
      await ids(buildMyDamageReportsQuery(scopeFor(driverA), null).compile()),
    ).toEqual(["mine"]);
  });

  it("drops a resolved report whose photos are all delivered", async () => {
    await seedDamageReportPhoto({
      photoId: "p1",
      reportId: "done",
      createdByUserUuid: driverA.userUuid,
      resolvedAt: "2026-09-01T00:00:00.000Z",
      queue: { upload_status: "uploaded" },
    });

    expect(
      await ids(buildMyDamageReportsQuery(scopeFor(driverA), null).compile()),
    ).toEqual([]);
  });

  it("KEEPS a resolved report whose photos never finished uploading", async () => {
    // The screen is the only route to Retry and Replace. Filtering this row out
    // would leave the photos stranded on the phone with nothing able to reach
    // them — the report is closed, but the evidence still has to get out.
    await seedDamageReportPhoto({
      photoId: "p1",
      reportId: "stuck",
      createdByUserUuid: driverA.userUuid,
      resolvedAt: "2026-09-01T00:00:00.000Z",
      queue: { upload_status: "failed" },
    });

    expect(
      await ids(buildMyDamageReportsQuery(scopeFor(driverA), null).compile()),
    ).toEqual(["stuck"]);
  });

  it("keeps my open reports regardless of their photos", async () => {
    await seedDamageReportPhoto({
      photoId: "p1",
      reportId: "open",
      createdByUserUuid: driverA.userUuid,
      queue: { upload_status: "uploaded" },
    });

    expect(
      await ids(buildMyDamageReportsQuery(scopeFor(driverA), null).compile()),
    ).toEqual(["open"]);
  });

  it("does not rescue another driver's stuck report — their queue owns it", async () => {
    await seedDamageReportPhoto({
      photoId: "p1",
      reportId: "theirs",
      createdByUserUuid: driverB.userUuid,
      resolvedAt: "2026-09-01T00:00:00.000Z",
      queue: { upload_status: "failed" },
    });

    expect(
      await ids(buildMyDamageReportsQuery(scopeFor(driverA), null).compile()),
    ).toEqual([]);
  });
});

describe("the bleacher picker", () => {
  it("offers every bleacher with an open report", async () => {
    await seedDamageReport({
      reportId: "r1",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "r2",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "r3",
      createdByUserUuid: driverA.userUuid,
      bleacherUuid: "b2",
    });

    const rows = await values(buildBleachersWithOpenReportsQuery().compile());

    // One entry per bleacher, not per report: the picker is a list of
    // bleachers, and a bleacher with four open reports is still one choice.
    expect(rows.map((row) => row.bleacher_uuid).sort()).toEqual(["b1", "b2"]);
  });

  it("offers only my own bleachers on the Mine tab", async () => {
    await seedDamageReport({
      reportId: "r1",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
    });
    await seedDamageReport({
      reportId: "r2",
      createdByUserUuid: driverA.userUuid,
      bleacherUuid: "b2",
    });

    const rows = await values(
      buildMyBleachersWithOpenReportsQuery(scopeFor(driverA)).compile(),
    );

    expect(rows.map((row) => row.bleacher_uuid)).toEqual(["b2"]);
  });

  it("ignores resolved reports — those bleachers are not a choice any more", async () => {
    await seedDamageReport({
      reportId: "r1",
      createdByUserUuid: driverB.userUuid,
      bleacherUuid: "b1",
      resolvedAt: "2026-09-01T00:00:00.000Z",
    });

    expect(await values(buildBleachersWithOpenReportsQuery().compile())).toEqual([]);
  });
});
