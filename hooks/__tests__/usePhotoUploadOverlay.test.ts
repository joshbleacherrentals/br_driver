/**
 * Covers §15 for the one queue consumer that does not inherit driver scoping.
 *
 * Everything else the queue feeds — the recovery pass, the sweeps, the counts —
 * only ever sees rows a scoped `tableAdapters.ts` method already returned, so
 * fixing that file fixed them all. The app-wide banner is the exception: it
 * needs the owning report's id and timestamp, which the queue's row shape does
 * not carry, so it runs its own join. Unfixed, the banner counted strangers'
 * damage reports and tapped through into one; it now builds on the same scoped
 * source (`damageReportPhotosOf`) the adapters use, so the join adds columns
 * rather than a second, separately-maintained ownership filter.
 *
 * These assertions moved here wholesale when `usePhotoUploadBanner` was folded
 * into `usePhotoUploadOverlay` — same scoped source, same join, one extra pair
 * of selected columns and one fewer WHERE clause (the uploaded rows the
 * progress state needs are now filtered in JS instead; see the last block).
 *
 * The query is exported apart from the hook precisely so this can be asserted
 * without rendering anything — there is no React-hook test harness in this
 * repo, and the bug is in the SQL, not in the hook's wiring.
 */

import { buildUploadActivityRowsQuery } from "@/hooks/usePhotoUploadOverlay";
import {
  deriveUploadActivity,
  isUnresolvedUploadStatus,
  toProblemReports,
  type UploadActivityRow,
} from "@/library/photoUploadQueue";
import { MISSING_LOCAL_FILE_ERROR } from "@/library/photoUploadQueue/types";

import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  scopeFor,
  seedDamageReportPhoto,
  seedDriver,
  type SeededDriver,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

// Both import paths that reach the database need mocking, or whichever one is
// missed pulls in the real `@powersync/react-native` (ESM Jest can't parse):
// the scoped source the hook builds on imports the leaf `@/library/powersync/db`
// module, and `applyPhotoRepair.ts` (pulled in transitively via the queue
// barrel) imports it too, while other queue modules still go via
// `SystemProvider`, which re-exports it.
jest.mock("@/components/providers/SystemProvider", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});
jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

// Likewise `useTypedQuery`, whose `@powersync/react` dependency ships ESM the
// preset does not transform. Only the hook uses it; the exported query builder
// is plain Kysely.
jest.mock("@/library/powersync/typedQuery", () => ({
  __esModule: true,
  expect: () => undefined,
  useTypedQuery: () => ({ data: undefined, isLoading: false }),
}));

let driverA: SeededDriver;
let driverB: SeededDriver;

async function runQuery(driver: SeededDriver): Promise<UploadActivityRow[]> {
  const { rows } = await mockDb.executeQuery(
    buildUploadActivityRowsQuery(scopeFor(driver)).compile(),
  );
  return rows as UploadActivityRow[];
}

/**
 * The rows the §6 problem list sees — the query's own output, minus the
 * uploaded rows only the progress state cares about. This is the JS filter that
 * replaced the old SQL-side `upload_status` clause, so asserting through it is
 * asserting the same row set the old suite asserted on.
 */
async function runProblemRows(
  driver: SeededDriver,
): Promise<UploadActivityRow[]> {
  const rows = await runQuery(driver);
  return rows.filter((row) => isUnresolvedUploadStatus(row.upload_status));
}

const photoIds = (rows: UploadActivityRow[]) =>
  rows.map((row) => row.photo_id).sort();

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");

  await seedDamageReportPhoto({
    photoId: "mine-pending",
    reportId: "report-mine",
    createdByUserUuid: driverA.userUuid,
  });
  await seedDamageReportPhoto({
    photoId: "mine-parked",
    reportId: "report-mine",
    createdByUserUuid: driverA.userUuid,
    queue: {
      upload_status: "failed",
      attempts: 3,
      last_attempt_at: "2026-08-14T08:00:00.000Z",
      last_error: MISSING_LOCAL_FILE_ERROR,
    },
  });
  await seedDamageReportPhoto({
    photoId: "mine-uploaded",
    reportId: "report-mine",
    createdByUserUuid: driverA.userUuid,
    queue: { upload_status: "uploaded" },
  });
  await seedDamageReportPhoto({
    photoId: "theirs-pending",
    reportId: "report-theirs",
    createdByUserUuid: driverB.userUuid,
  });
  await seedDamageReportPhoto({
    photoId: "orphan-pending",
    reportId: "report-orphan",
    createdByUserUuid: null,
  });
});

describe("buildUploadActivityRowsQuery (§15)", () => {
  it("includes the signed-in driver's own unresolved photos", async () => {
    expect(photoIds(await runProblemRows(driverA))).toEqual([
      "mine-parked",
      "mine-pending",
    ]);
  });

  it("excludes another driver's photos — the bug this section exists for", async () => {
    const rows = await runQuery(driverA);

    expect(photoIds(rows)).not.toContain("theirs-pending");
    // Nothing may leak through the report side of the join either: a foreign
    // report id here is what let a banner tap open a stranger's report.
    expect(rows.map((row) => row.report_uuid)).not.toContain("report-theirs");
  });

  it("excludes a report with no recorded creator", async () => {
    expect(photoIds(await runQuery(driverA))).not.toContain("orphan-pending");
  });

  it("keeps already-uploaded photos out of the problem list", async () => {
    expect(photoIds(await runProblemRows(driverA))).not.toContain(
      "mine-uploaded",
    );
  });

  it("excludes a photo whose report is already resolved", async () => {
    await seedDamageReportPhoto({
      photoId: "mine-resolved",
      reportId: "report-mine-resolved",
      createdByUserUuid: driverA.userUuid,
      resolvedAt: "2026-08-15T00:00:00.000Z",
    });

    const rows = await runQuery(driverA);

    expect(photoIds(rows)).not.toContain("mine-resolved");
    expect(photoIds(await runProblemRows(driverA))).toEqual([
      "mine-parked",
      "mine-pending",
    ]);
  });

  it("returns the other driver's photos when they are the one signed in", async () => {
    expect(photoIds(await runProblemRows(driverB))).toEqual(["theirs-pending"]);
  });

  it("carries the report id and timestamp the banner taps through on", async () => {
    const rows = await runProblemRows(driverA);

    expect(rows[0]).toEqual({
      photo_id: expect.any(String),
      report_uuid: "report-mine",
      report_created_at: "2026-08-01T00:00:00.000Z",
      upload_status: expect.anything(),
      last_error: null,
    });
  });
});

/**
 * The half the query gained: progress needs the uploaded rows the §6 filter
 * throws away, and it must stay scoped to the signed-in driver just as the
 * problem list is.
 */
describe("progress counts off the same scoped query (§15)", () => {
  it("counts only the signed-in driver's photos", async () => {
    // report-mine: pending + parked + uploaded. The parked row is not in
    // flight, the pending one is, so the whole report is the current batch.
    expect(deriveUploadActivity(await runQuery(driverA))).toEqual({
      total: 3,
      uploaded: 1,
      inFlight: 1,
    });

    // The other driver's single pending photo is a batch of its own, and never
    // shows up in driver A's numbers above.
    expect(deriveUploadActivity(await runQuery(driverB))).toEqual({
      total: 1,
      uploaded: 0,
      inFlight: 1,
    });
  });

  it("stops counting a report once everything on it has landed", async () => {
    await mockDb
      .updateTable("PhotoUploadStatus")
      .set({ upload_status: "uploaded", last_error: null })
      .where("id", "in", ["mine-pending", "mine-parked"])
      .execute();

    expect(deriveUploadActivity(await runQuery(driverA))).toEqual({
      total: 0,
      uploaded: 0,
      inFlight: 0,
    });
  });
});

/**
 * The §6.2 gate, end to end on real rows: a photo the bucket was never asked
 * about must not produce a banner, however long it has been failing.
 */
describe("problem reports still require bucket confirmation (§6.2)", () => {
  it("reports nothing until a photo is confirmed missing", async () => {
    const rows = await runProblemRows(driverA);

    expect(toProblemReports(rows, new Set())).toEqual([]);
    expect(toProblemReports(rows, new Set(["mine-parked"]))).toEqual([
      { reportUuid: "report-mine", createdAt: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("never surfaces a confirmed-missing photo belonging to another driver", async () => {
    const rows = await runProblemRows(driverA);

    expect(toProblemReports(rows, new Set(["theirs-pending"]))).toEqual([]);
  });
});

afterEach(() => {
  clearDriverScope();
});
