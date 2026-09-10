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
  buildAnyDamageReportByIdQuery,
  buildDamageReportByIdQuery,
  buildDamageReportThumbnailsQuery,
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
  seedDamageReport,
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

/**
 * The "fixed by driver" mark has to survive the trip from the row to the
 * screen. It is read on every damage report the app renders — the badge in the
 * lists and the button on the report itself both branch on it — so a column
 * missing from the SELECT would not fail loudly; it would quietly render every
 * report as "not fixed", which is exactly the state the driver was trying to
 * change.
 */
describe("the fixed-by-driver mark is selected, not just stored", () => {
  it("comes back with who set it and when", async () => {
    await seedDamageReport({
      reportId: "report-fixed",
      createdByUserUuid: driverA.userUuid,
      fixed: { at: "2026-09-09T10:00:00.000Z", byUserUuid: driverB.userUuid },
    });

    const { rows } = await mockDb.executeQuery(
      buildDamageReportByIdQuery(scopeFor(driverA), "report-fixed").compile(),
    );

    expect(rows[0]).toMatchObject({
      fixed_by_driver: 1,
      fixed_at: "2026-09-09T10:00:00.000Z",
      fixed_by_user_uuid: driverB.userUuid,
    });
  });

  it("comes back unset on a report nobody has marked", async () => {
    const { rows } = await mockDb.executeQuery(
      buildDamageReportByIdQuery(scopeFor(driverA), "report-mine").compile(),
    );

    expect(rows[0]).toMatchObject({
      fixed_by_driver: 0,
      fixed_at: null,
      fixed_by_user_uuid: null,
    });
  });
});

/**
 * The read-only viewer's counterpart to the scoped lookup above.
 *
 * A driver reaches another driver's report from two places — the checklist that
 * replaces filing a duplicate, and the trips screen — so the report has to be
 * readable by id regardless of who wrote it. That is a different question from
 * "may this driver retry these photos", which is what the scoped query answers
 * and why it keeps its filter: the two must not collapse into one.
 */
describe("reading any driver's damage report (§15)", () => {
  it("returns a report this driver did not file", async () => {
    const { rows } = await mockDb.executeQuery(
      buildAnyDamageReportByIdQuery("report-theirs").compile(),
    );

    expect(rows.map((r) => (r as { id: string }).id)).toEqual(["report-theirs"]);
  });

  it("returns a report with no recorded creator", async () => {
    const { rows } = await mockDb.executeQuery(
      buildAnyDamageReportByIdQuery("report-orphan").compile(),
    );

    expect(rows).toHaveLength(1);
  });

  it("still finds nothing for an id that does not exist", async () => {
    const { rows } = await mockDb.executeQuery(
      buildAnyDamageReportByIdQuery("report-nonexistent").compile(),
    );

    expect(rows).toEqual([]);
  });

  it("carries no ownership predicate at all", () => {
    const { sql } = buildAnyDamageReportByIdQuery("report-theirs").compile();

    expect(sql).not.toContain("exists");
    expect(sql).not.toContain("created_by_user_uuid\" =");
  });

  it("does not soften the scoped query it sits beside", async () => {
    // The pair is the point: same id, two answers, because they answer
    // different questions.
    expect(await runById(driverA, "report-theirs")).toEqual([]);
  });
});

/**
 * Thumbnails for the checklist and the cards.
 *
 * A `DamageReportPhotos` row carries its own base64 thumbnail, and those rows
 * sync for every open report — so a driver comparing "is this the same damage"
 * can see other drivers' photos with no signal at all. The full-size files are
 * a different story (they live in the bucket, and only your own are downloaded
 * to the device), which is exactly why the thumbnail is the thing the card
 * shows.
 */
describe("thumbnails travel with the row (§15 cross-driver)", () => {
  it("returns another driver's thumbnails, grouped by report", async () => {
    await mockDb
      .updateTable("DamageReportPhotos")
      .set({ thumbnail: "data:image/jpeg;base64,theirs" })
      .where("id", "=", "p-theirs")
      .execute();

    const { rows } = await mockDb.executeQuery(
      buildDamageReportThumbnailsQuery(["report-theirs"])!.compile(),
    );

    expect(rows).toEqual([
      {
        damage_report_uuid: "report-theirs",
        thumbnail: "data:image/jpeg;base64,theirs",
      },
    ]);
  });

  it("skips photos whose thumbnail never generated", async () => {
    // `generateThumbnail` is allowed to fail without failing the photo — the
    // full-size file is the evidence, the thumbnail is a convenience.
    const { rows } = await mockDb.executeQuery(
      buildDamageReportThumbnailsQuery(["report-mine"])!.compile(),
    );

    expect(rows).toEqual([]);
  });

  it("asks nothing when there are no reports on screen", () => {
    expect(buildDamageReportThumbnailsQuery([])).toBeNull();
  });
});
