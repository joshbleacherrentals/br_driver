/**
 * §15 — `useInspection`/`useInspectionPhotos`' queries are scoped to the
 * signed-in driver.
 *
 * `InspectionPhotos` syncs every driver's rows to every device, same as
 * `DamageReportPhotos` (§15 of the design doc). `buildInspectionPhotosQuery` /
 * `buildInspectionQuery` used to filter only by `inspection_uuid` / `id`, so
 * whichever driver's inspection row and photos lived under that id came back
 * unconditionally.
 *
 * `InspectionPhotoRepair` feeds whatever `inspectionUuid` prop it is given
 * straight into `useInspectionPhotos`, and its result flows into
 * `usePhotoRepair`'s Retry/Replace mutations with no re-check. Today that prop
 * happens to come from a driver-scoped trip list, but the query itself provided
 * no such guarantee — exactly the defensive gap §15 closed everywhere else.
 *
 * Both queries now start from the scoped sources in
 * `library/powersync/scoping`, which walk `WorkTrackerInspections` →
 * `WorkTrackers.driver_uuid` across both trip legs.
 */

import {
  buildInspectionPhotosQuery,
  buildInspectionQuery,
} from "@/hooks/db/useInspection";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  scopeFor,
  seedDriver,
  seedInspectionPhoto,
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

async function runPhotosQuery(driver: SeededDriver, inspectionId: string) {
  const { rows } = await mockDb.executeQuery(
    buildInspectionPhotosQuery(scopeFor(driver), inspectionId).compile(),
  );
  return rows as { id: string; inspection_uuid: string | null }[];
}

async function runInspectionQuery(driver: SeededDriver, inspectionId: string) {
  const { rows } = await mockDb.executeQuery(
    buildInspectionQuery(scopeFor(driver), inspectionId).compile(),
  );
  return rows as { id: string }[];
}

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");

  await seedInspectionPhoto({
    photoId: "mine-photo",
    inspectionId: "inspection-mine",
    driverUuid: driverA.driverUuid,
  });
  await seedInspectionPhoto({
    photoId: "theirs-photo",
    inspectionId: "inspection-theirs",
    driverUuid: driverB.driverUuid,
  });
  await seedInspectionPhoto({
    photoId: "orphan-photo",
    inspectionId: "inspection-orphan",
    driverUuid: null,
  });
});

afterEach(() => {
  clearDriverScope();
});

describe("buildInspectionPhotosQuery driver scoping (§15)", () => {
  it("returns nothing when handed another driver's inspection id", async () => {
    expect(await runPhotosQuery(driverA, "inspection-theirs")).toEqual([]);
  });

  it("returns nothing for an inspection no trip references", async () => {
    expect(await runPhotosQuery(driverA, "inspection-orphan")).toEqual([]);
  });

  it("still returns the requested inspection's own photos (sanity check)", async () => {
    const rows = await runPhotosQuery(driverA, "inspection-mine");
    expect(rows.map((r) => r.id)).toEqual(["mine-photo"]);
  });
});

describe("buildInspectionQuery driver scoping (§15)", () => {
  it("returns nothing for another driver's inspection record", async () => {
    expect(await runInspectionQuery(driverA, "inspection-theirs")).toEqual([]);
  });

  it("still returns the driver's own inspection record", async () => {
    const rows = await runInspectionQuery(driverA, "inspection-mine");
    expect(rows.map((r) => r.id)).toEqual(["inspection-mine"]);
  });
});
