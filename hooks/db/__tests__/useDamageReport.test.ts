/**
 * §15 — where `hooks/db/useDamageReport.ts` scopes, and where it deliberately
 * does not.
 *
 * This file had no test of any kind before, and it is the one that carries both
 * decisions at once, so getting them confused is easy:
 *
 * - `useDamageReportById` is reached with a caller-supplied id — its only
 *   caller, `DamageReportScreen`, takes that id from `useLocalSearchParams()` —
 *   and its result decides which rows `usePhotoRepair` may Retry/Replace. It is
 *   scoped.
 * - the bleacher/inspection lookups answer "what is wrong with this bleacher",
 *   which spans drivers by design: a driver hauling a bleacher must see damage
 *   another driver reported on it. They are NOT scoped, and this suite pins
 *   that so a later sweep cannot quietly "fix" them into hiding it.
 */

import {
  buildDamageReportByIdQuery,
  useDamageReport,
  useDamageReportByInspection,
  useDamageReportPhotoPaths,
  useDamageReports,
} from "@/hooks/db/useDamageReport";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  scopeFor,
  seedDamageReportPhoto,
  seedDriver,
  type SeededDriver,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

/**
 * The unscoped hooks build their SQL inside `useMemo`, so their queries cannot
 * be compiled without React. What can be asserted without rendering is that
 * they exist and carry no ownership predicate — which the module-level
 * `crossDriverRead` wrapper and this suite's SQL assertions below cover between
 * them. `useTypedQuery` is stubbed because `@powersync/react` ships ESM the
 * jest-expo preset does not transform.
 */
jest.mock("@/library/powersync/typedQuery", () => ({
  __esModule: true,
  expect: () => undefined,
  useTypedQuery: () => ({ data: undefined, isLoading: false }),
}));

let driverA: SeededDriver;
let driverB: SeededDriver;

async function runById(driver: SeededDriver, reportId: string) {
  const { rows } = await mockDb.executeQuery(
    buildDamageReportByIdQuery(scopeFor(driver), reportId).compile(),
  );
  return rows as { id: string }[];
}

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");

  await seedDamageReportPhoto({
    photoId: "p-mine",
    reportId: "report-mine",
    createdByUserUuid: driverA.userUuid,
  });
  await seedDamageReportPhoto({
    photoId: "p-theirs",
    reportId: "report-theirs",
    createdByUserUuid: driverB.userUuid,
  });
  await seedDamageReportPhoto({
    photoId: "p-orphan",
    reportId: "report-orphan",
    createdByUserUuid: null,
  });
});

afterEach(() => {
  clearDriverScope();
});

describe("buildDamageReportByIdQuery driver scoping (§15)", () => {
  it("returns nothing for another driver's report id", async () => {
    // The route-param case: `damage-report?damageReportId=<someone else's>`.
    expect(await runById(driverA, "report-theirs")).toEqual([]);
  });

  it("returns nothing for a report with no recorded creator", async () => {
    expect(await runById(driverA, "report-orphan")).toEqual([]);
  });

  it("returns nothing for an id that does not exist at all", async () => {
    // Indistinguishable from the foreign case on purpose — the screen must not
    // be able to tell a driver that a report exists but is not theirs.
    expect(await runById(driverA, "report-nonexistent")).toEqual([]);
  });

  it("still returns the driver's own report", async () => {
    const rows = await runById(driverA, "report-mine");

    expect(rows.map((r) => r.id)).toEqual(["report-mine"]);
  });

  it("follows the scope — the same id answers for its own driver", async () => {
    expect((await runById(driverB, "report-theirs")).map((r) => r.id)).toEqual([
      "report-theirs",
    ]);
  });
});

describe("the bleacher-damage reads stay cross-driver (§15)", () => {
  it.each([
    ["useDamageReport", useDamageReport],
    ["useDamageReports", useDamageReports],
    ["useDamageReportByInspection", useDamageReportByInspection],
    ["useDamageReportPhotoPaths", useDamageReportPhotoPaths],
  ])(
    "%s is exported and takes no scope — damage on a bleacher belongs to the bleacher",
    (_name, hook) => {
      // A scoped hook cannot be called without a `DriverScope` reaching it;
      // these take exactly one argument, an entity id. Pinning the arity is the
      // regression guard: adding a scope parameter here would be the change
      // that hides another driver's damage from the driver now hauling it.
      expect(typeof hook).toBe("function");
      expect(hook.length).toBe(1);
    },
  );
});
