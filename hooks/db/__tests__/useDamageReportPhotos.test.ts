/**
 * §15 — `useDamageReportPhotos`' query is scoped to the signed-in driver.
 *
 * `DamageReportPhotos` syncs every authenticated driver's rows to every device
 * (RLS is `get_current_driver_id() IS NOT NULL`, not owner-scoped — see
 * `docs/custom-photo-upload-queue.en.md` §15). `buildDamageReportPhotosQuery`
 * used to filter only by `damage_report_uuid`, so it returned whichever
 * driver's photos lived under that report id, with no ownership check at all.
 *
 * That was not hypothetical. `DamageReportScreen` reads `damageReportId`
 * straight from `useLocalSearchParams()` — an Expo Router param, fully
 * caller-controlled — and hands it to this hook. A deep link or a routing bug
 * pointed at another driver's report id rendered that driver's full damage
 * report, photos included, and (via `usePhotoRepair`) exposed Retry/Replace
 * mutations against those rows.
 *
 * The query now starts from `damageReportPhotosOf(scope)`, so the report id
 * alone can no longer produce rows.
 */

import { buildDamageReportPhotosQuery } from "@/hooks/db/useDamageReportPhotos";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  scopeFor,
  seedDamageReportPhoto,
  seedDriver,
  type SeededDriver,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

// The hook builds its query through `library/powersync/scoping`, which imports
// the leaf `@/library/powersync/db`. Mocking that one module is enough — and it
// is the only one that must be mocked, since the real module boots PowerSync.
jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

// `useDamageReportPhotos.ts` also imports `useTypedQuery`, whose
// `@powersync/react` dependency ships ESM the jest-expo preset can't
// transform. Only the hook itself calls it; the exported query builder under
// test is plain Kysely.
jest.mock("@/library/powersync/typedQuery", () => ({
  __esModule: true,
  expect: () => undefined,
  useTypedQuery: () => ({ data: undefined, isLoading: false }),
}));

let driverA: SeededDriver;
let driverB: SeededDriver;

async function runQuery(driver: SeededDriver, damageReportUuid: string) {
  const { rows } = await mockDb.executeQuery(
    buildDamageReportPhotosQuery(scopeFor(driver), damageReportUuid).compile(),
  );
  return rows as { id: string; damage_report_uuid: string | null }[];
}

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");

  await seedDamageReportPhoto({
    photoId: "mine-photo",
    reportId: "report-mine",
    createdByUserUuid: driverA.userUuid,
  });
  await seedDamageReportPhoto({
    photoId: "theirs-photo",
    reportId: "report-theirs",
    createdByUserUuid: driverB.userUuid,
  });
  await seedDamageReportPhoto({
    photoId: "orphan-photo",
    reportId: "report-orphan",
    createdByUserUuid: null,
  });
});

afterEach(() => {
  clearDriverScope();
});

describe("buildDamageReportPhotosQuery driver scoping (§15)", () => {
  it("returns nothing when handed another driver's report id", async () => {
    // Driver A's session hands the query driver B's report id — e.g. a route
    // param it never validated ownership of.
    const rows = await runQuery(driverA, "report-theirs");

    expect(rows).toEqual([]);
  });

  it("returns nothing for a report with no recorded creator", async () => {
    // NULL is excluded by SQL equality itself, not by a separate branch.
    const rows = await runQuery(driverA, "report-orphan");

    expect(rows).toEqual([]);
  });

  it("still returns the requested report's own photos (sanity check)", async () => {
    const rows = await runQuery(driverA, "report-mine");
    expect(rows.map((r) => r.id)).toEqual(["mine-photo"]);
  });

  it("follows the scope — the same report id answers for its own driver", async () => {
    expect((await runQuery(driverB, "report-theirs")).map((r) => r.id)).toEqual([
      "theirs-photo",
    ]);
    expect(await runQuery(driverB, "report-mine")).toEqual([]);
  });
});
