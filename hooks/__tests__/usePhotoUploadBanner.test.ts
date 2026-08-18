/**
 * Covers §15 for the one queue consumer that does not inherit driver scoping.
 *
 * Everything else the queue feeds — the recovery pass, the sweeps, the counts —
 * only ever sees rows a scoped `tableAdapters.ts` method already returned, so
 * fixing that file fixed them all. `usePhotoUploadBanner` is the exception: it
 * needs the owning report's id and timestamp, which the queue's row shape does
 * not carry, so it runs its own join. Unfixed, the banner counted strangers'
 * damage reports and tapped through into one; it now builds on the same scoped
 * source (`damageReportPhotosOf`) the adapters use, so the join adds columns
 * rather than a second, separately-maintained ownership filter.
 *
 * The query is exported apart from the hook precisely so this can be asserted
 * without rendering anything — there is no React-hook test harness in this
 * repo, and the bug is in the SQL, not in the hook's wiring.
 */

import { buildProblemPhotoRowsQuery } from "@/hooks/usePhotoUploadBanner";
import type { ProblemPhotoRow } from "@/library/photoUploadQueue";
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

async function runQuery(driver: SeededDriver): Promise<ProblemPhotoRow[]> {
  const { rows } = await mockDb.executeQuery(
    buildProblemPhotoRowsQuery(scopeFor(driver)).compile(),
  );
  return rows as ProblemPhotoRow[];
}

const photoIds = (rows: ProblemPhotoRow[]) =>
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

describe("buildProblemPhotoRowsQuery (§15)", () => {
  it("includes the signed-in driver's own unresolved photos", async () => {
    expect(photoIds(await runQuery(driverA))).toEqual([
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
    expect(photoIds(await runQuery(driverA))).not.toContain(
      "orphan-pending",
    );
  });

  it("still ignores already-uploaded photos", async () => {
    expect(photoIds(await runQuery(driverA))).not.toContain(
      "mine-uploaded",
    );
  });

  it("returns the other driver's photos when they are the one signed in", async () => {
    expect(photoIds(await runQuery(driverB))).toEqual([
      "theirs-pending",
    ]);
  });

  it("carries the report id and timestamp the banner taps through on", async () => {
    const rows = await runQuery(driverA);

    expect(rows[0]).toEqual({
      photo_id: expect.any(String),
      report_uuid: "report-mine",
      report_created_at: "2026-08-01T00:00:00.000Z",
    });
  });
});

afterEach(() => {
  clearDriverScope();
});
