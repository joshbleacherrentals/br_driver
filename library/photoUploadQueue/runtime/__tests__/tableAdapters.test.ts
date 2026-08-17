/**
 * Covers §15 — driver scoping on the two photo tables that sync to everyone.
 *
 * BACKGROUND (confirmed on a real device, not hypothetical)
 * `DamageReports`/`DamageReportPhotos` RLS is `get_current_driver_id() IS NOT
 * NULL`: any authenticated driver, not the owner. A driver who had never been
 * assigned a single trip was found holding 23 damage reports (one of them
 * theirs) and 57 damage-report photos (one of them theirs) in their local
 * database. `tableAdapters.ts` filtered none of it, so the queue would claim,
 * retry, count and banner photos belonging to other drivers — and tapping that
 * banner opened a stranger's damage report.
 *
 * This suite runs the REAL adapters against a REAL SQLite database
 * (`testDb.ts`), because the fix *is* the SQL: a correlated `EXISTS`, an
 * OR-chain across `WorkTrackers.pre_inspection_uuid`/`post_inspection_uuid`,
 * and SQL's own NULL semantics. Only `@/library/powersync/db`'s exports are
 * replaced; `tableAdapters.ts` and `currentDriverContext.ts` are untouched
 * production code.
 */

import {
  clearCurrentDriverContext,
  setCurrentDriverContext,
} from "@/library/photoUploadQueue/runtime/currentDriverContext";
import { PHOTO_QUEUE_ADAPTERS } from "@/library/photoUploadQueue/runtime/tableAdapters";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import { MISSING_LOCAL_FILE_ERROR } from "@/library/photoUploadQueue/types";

import {
  linkInspectionToDriver,
  mockDb,
  resetTestDb,
  seedDamageReportPhoto,
  seedDriver,
  seedInspectionPhoto,
  type SeededDriver,
} from "./testDb";

// Jest hoists this above every import, so the factory reaches the test database
// through `require` rather than a closed-over binding that would still be in
// its temporal dead zone when `tableAdapters.ts` is first loaded.
//
// Mocks the leaf `@/library/powersync/db` module — where `db`/`powerSyncDb` now
// live — rather than `SystemProvider`, which merely re-exports them and would
// therefore leave the real database in place for anything importing it here.
jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("./testDb");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CompiledQuery } = require("kysely");
  return {
    __esModule: true,
    // Reads: `tableAdapters.ts` builds Kysely queries straight off this.
    db: database,
    // Writes: `executeTypedMutation` runs compiled SQL through PowerSync, so
    // `persist()` needs the same statement runner pointed at the same database.
    powerSyncDb: {
      execute: (sql: string, parameters: unknown[]) =>
        database.executeQuery(CompiledQuery.raw(sql, parameters)),
    },
  };
});

const damagePhotos = PHOTO_QUEUE_ADAPTERS.find(
  (adapter) => adapter.table === "DamageReportPhotos",
)!;
const inspectionPhotos = PHOTO_QUEUE_ADAPTERS.find(
  (adapter) => adapter.table === "InspectionPhotos",
)!;

const NOW_MS = Date.parse("2026-08-14T12:00:00.000Z");
/** Anything stamped before this counts as stale for `listStaleUploading`. */
const STALE_BEFORE = "2026-08-14T11:00:00.000Z";
const STALE_ATTEMPT_AT = "2026-08-14T08:00:00.000Z";

const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

/**
 * Claims repeatedly, retiring each claimed row, until the adapter has nothing
 * left. Returns every id it handed out — the set a driver's queue would
 * actually have uploaded.
 */
async function drainClaims(adapter: PhotoQueueTableAdapter): Promise<string[]> {
  const claimed: string[] = [];
  // Bounded so a scoping bug shows up as a failed assertion, not a hung test.
  for (let i = 0; i < 25; i++) {
    const row = await adapter.claimNext("fast", NOW_MS);
    if (!row) break;
    claimed.push(row.id);
    await adapter.persist({ ...row, upload_status: "uploaded" });
  }
  return claimed;
}

let driverA: SeededDriver;
let driverB: SeededDriver;

beforeEach(async () => {
  await resetTestDb();
  clearCurrentDriverContext();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");
});

afterEach(() => {
  clearCurrentDriverContext();
});

/** One pending, one parked and one stale-`uploading` photo per owner. */
async function seedMixedDamagePhotos(): Promise<void> {
  const owners: [string, string | null][] = [
    ["a", driverA.userUuid],
    ["b", driverB.userUuid],
    // The unattributed case: a report whose creator was never recorded.
    ["null", null],
  ];

  for (const [name, creator] of owners) {
    await seedDamageReportPhoto({
      photoId: `dr-${name}-pending`,
      reportId: `report-${name}`,
      createdByUserUuid: creator,
    });
    await seedDamageReportPhoto({
      photoId: `dr-${name}-parked`,
      reportId: `report-${name}`,
      createdByUserUuid: creator,
      queue: {
        upload_status: "failed",
        attempts: 3,
        last_attempt_at: STALE_ATTEMPT_AT,
        last_error: MISSING_LOCAL_FILE_ERROR,
      },
    });
    await seedDamageReportPhoto({
      photoId: `dr-${name}-stale`,
      reportId: `report-${name}`,
      createdByUserUuid: creator,
      queue: {
        upload_status: "uploading",
        attempts: 1,
        last_attempt_at: STALE_ATTEMPT_AT,
      },
    });
  }
}

/** The same three shapes per owner, reachable through the trip's pre-leg. */
async function seedMixedInspectionPhotos(): Promise<void> {
  const owners: [string, string | null][] = [
    ["a", driverA.driverUuid],
    ["b", driverB.driverUuid],
    // An inspection no trip references at all.
    ["orphan", null],
  ];

  for (const [name, driver] of owners) {
    await seedInspectionPhoto({
      photoId: `ip-${name}-pending`,
      inspectionId: `inspection-${name}`,
      driverUuid: driver,
    });
    await seedInspectionPhoto({
      photoId: `ip-${name}-parked`,
      inspectionId: `inspection-${name}`,
      driverUuid: driver,
      queue: {
        upload_status: "failed",
        attempts: 3,
        last_attempt_at: STALE_ATTEMPT_AT,
        last_error: MISSING_LOCAL_FILE_ERROR,
      },
    });
    await seedInspectionPhoto({
      photoId: `ip-${name}-stale`,
      inspectionId: `inspection-${name}`,
      driverUuid: driver,
      queue: {
        upload_status: "uploading",
        attempts: 1,
        last_attempt_at: STALE_ATTEMPT_AT,
      },
    });
  }
}

// ── No driver established ───────────────────────────────────────────────────

describe("with no driver context (§15)", () => {
  it.each([
    ["DamageReportPhotos", () => damagePhotos, seedMixedDamagePhotos],
    ["InspectionPhotos", () => inspectionPhotos, seedMixedInspectionPhotos],
  ])(
    "%s — every method answers empty rather than falling back to an unscoped read",
    async (_table, adapterOf, seed) => {
      await seed();
      const adapter = adapterOf();

      // The database is full of claimable work; none of it is attributable to
      // anyone right now, so none of it may be touched.
      await expect(adapter.claimNext("fast", NOW_MS)).resolves.toBeNull();
      await expect(adapter.claimNext("backoff", NOW_MS)).resolves.toBeNull();
      await expect(adapter.countUnresolved()).resolves.toBe(0);
      await expect(adapter.countActionable()).resolves.toBe(0);
      await expect(adapter.countParked()).resolves.toBe(0);
      await expect(adapter.listUnresolved(50)).resolves.toEqual([]);
      await expect(
        adapter.listStaleUploading(STALE_BEFORE, 50),
      ).resolves.toEqual([]);
    },
  );
});

// ── DamageReportPhotos ──────────────────────────────────────────────────────

describe("DamageReportPhotos scoping (§15)", () => {
  beforeEach(async () => {
    await seedMixedDamagePhotos();
    setCurrentDriverContext({
      userUuid: driverA.userUuid,
      driverUuid: driverA.driverUuid,
    });
  });

  it("never claims another driver's photo, however many times it is asked", async () => {
    const claimed = await drainClaims(damagePhotos);

    expect(claimed).toEqual(["dr-a-pending"]);
    expect(claimed).not.toContain("dr-b-pending");
  });

  it("never claims a photo whose report has no recorded creator", async () => {
    const claimed = await drainClaims(damagePhotos);

    // NULL is excluded by SQL equality itself, not by a separate branch.
    expect(claimed).not.toContain("dr-null-pending");
  });

  it("still claims the driver's own pending photo — scoping must not over-filter", async () => {
    const row = await damagePhotos.claimNext("fast", NOW_MS);

    expect(row?.id).toBe("dr-a-pending");
    expect(row?.photo_path).toBe("report-a/dr-a-pending.jpg");
  });

  it("counts only the driver's own rows", async () => {
    // Own pending + own parked. `uploading` is not an unresolved status.
    await expect(damagePhotos.countUnresolved()).resolves.toBe(2);
    // Parked rows are excluded from actionable.
    await expect(damagePhotos.countActionable()).resolves.toBe(1);
    await expect(damagePhotos.countParked()).resolves.toBe(1);
  });

  it("lists only the driver's own unresolved rows, by id", async () => {
    const rows = await damagePhotos.listUnresolved(50);

    expect(ids(rows)).toEqual(["dr-a-parked", "dr-a-pending"]);
  });

  it("lists only the driver's own stale `uploading` rows, by id", async () => {
    const rows = await damagePhotos.listStaleUploading(STALE_BEFORE, 50);

    expect(ids(rows)).toEqual(["dr-a-stale"]);
  });

  it("sees nothing at all once the context is withdrawn mid-session", async () => {
    await expect(damagePhotos.countUnresolved()).resolves.toBe(2);

    clearCurrentDriverContext();

    await expect(damagePhotos.countUnresolved()).resolves.toBe(0);
    await expect(damagePhotos.claimNext("fast", NOW_MS)).resolves.toBeNull();
  });

  it("switches cleanly to the other driver's rows and only those", async () => {
    setCurrentDriverContext({
      userUuid: driverB.userUuid,
      driverUuid: driverB.driverUuid,
    });

    expect(ids(await damagePhotos.listUnresolved(50))).toEqual([
      "dr-b-parked",
      "dr-b-pending",
    ]);
    await expect(damagePhotos.claimNext("fast", NOW_MS)).resolves.toMatchObject(
      { id: "dr-b-pending" },
    );
  });
});

// ── InspectionPhotos ────────────────────────────────────────────────────────

describe("InspectionPhotos scoping (§15)", () => {
  beforeEach(async () => {
    await seedMixedInspectionPhotos();
    setCurrentDriverContext({
      userUuid: driverA.userUuid,
      driverUuid: driverA.driverUuid,
    });
  });

  it("never claims another driver's photo, however many times it is asked", async () => {
    const claimed = await drainClaims(inspectionPhotos);

    expect(claimed).toEqual(["ip-a-pending"]);
    expect(claimed).not.toContain("ip-b-pending");
  });

  it("never claims a photo whose inspection no trip references", async () => {
    const claimed = await drainClaims(inspectionPhotos);

    expect(claimed).not.toContain("ip-orphan-pending");
  });

  it("still claims the driver's own pending photo — scoping must not over-filter", async () => {
    const row = await inspectionPhotos.claimNext("fast", NOW_MS);

    expect(row?.id).toBe("ip-a-pending");
    expect(row?.photo_path).toBe("inspection-a/ip-a-pending.jpg");
  });

  it("counts only the driver's own rows", async () => {
    await expect(inspectionPhotos.countUnresolved()).resolves.toBe(2);
    await expect(inspectionPhotos.countActionable()).resolves.toBe(1);
    await expect(inspectionPhotos.countParked()).resolves.toBe(1);
  });

  it("lists only the driver's own unresolved rows, by id", async () => {
    const rows = await inspectionPhotos.listUnresolved(50);

    expect(ids(rows)).toEqual(["ip-a-parked", "ip-a-pending"]);
  });

  it("lists only the driver's own stale `uploading` rows, by id", async () => {
    const rows = await inspectionPhotos.listStaleUploading(STALE_BEFORE, 50);

    expect(ids(rows)).toEqual(["ip-a-stale"]);
  });
});

/**
 * Ownership runs `InspectionPhotos → WorkTrackerInspections → WorkTrackers`,
 * and the last hop is an OR over two columns because a trip has a pickup
 * inspection and a dropoff inspection. Both legs have to be walked, and neither
 * may be walked twice.
 */
describe("InspectionPhotos ownership through both trip legs (§15)", () => {
  beforeEach(() => {
    setCurrentDriverContext({
      userUuid: driverA.userUuid,
      driverUuid: driverA.driverUuid,
    });
  });

  it("recognises an inspection referenced as the trip's pre-inspection", async () => {
    await seedInspectionPhoto({
      photoId: "ip-pre",
      inspectionId: "inspection-pre",
      driverUuid: driverA.driverUuid,
      leg: "pre",
    });

    expect(ids(await inspectionPhotos.listUnresolved(50))).toEqual(["ip-pre"]);
    await expect(
      inspectionPhotos.claimNext("fast", NOW_MS),
    ).resolves.toMatchObject({ id: "ip-pre" });
  });

  it("recognises an inspection referenced as the trip's post-inspection", async () => {
    await seedInspectionPhoto({
      photoId: "ip-post",
      inspectionId: "inspection-post",
      driverUuid: driverA.driverUuid,
      leg: "post",
    });

    expect(ids(await inspectionPhotos.listUnresolved(50))).toEqual(["ip-post"]);
    await expect(
      inspectionPhotos.claimNext("fast", NOW_MS),
    ).resolves.toMatchObject({ id: "ip-post" });
  });

  /**
   * The regression test behind the `EXISTS`-not-`INNER JOIN` decision.
   *
   * Nothing in the schema makes the inspection→trip relationship 1:1 —
   * `WorkTrackerInspections` has no foreign key back to `WorkTrackers`, so two
   * trips referencing one inspection id is a shape the database permits. Under
   * an `INNER JOIN` that shape multiplies the outer row: the same photo would
   * appear twice in `listUnresolved` and consume two slots of `claimNext`'s
   * candidate batch. `EXISTS` is a yes/no question, so it cannot.
   *
   * Swapping the helper back to an `INNER JOIN` makes this test fail.
   */
  it("returns a photo at most once even when two trips reference the same inspection", async () => {
    await seedInspectionPhoto({
      photoId: "ip-shared",
      inspectionId: "inspection-shared",
      driverUuid: driverA.driverUuid,
      leg: "pre",
      workTrackerId: "wt-first",
    });
    // A second trip — a different driver's — pointing at the same inspection.
    await linkInspectionToDriver({
      inspectionId: "inspection-shared",
      driverUuid: driverB.driverUuid,
      leg: "post",
      workTrackerId: "wt-second",
    });

    const unresolved = await inspectionPhotos.listUnresolved(50);
    expect(ids(unresolved)).toEqual(["ip-shared"]);
    expect(unresolved).toHaveLength(1);

    await expect(inspectionPhotos.countUnresolved()).resolves.toBe(1);
    await expect(inspectionPhotos.countActionable()).resolves.toBe(1);
    // And it is handed out exactly once, not once per matching trip.
    await expect(drainClaims(inspectionPhotos)).resolves.toEqual(["ip-shared"]);
  });

  it("still returns it once when BOTH references belong to the current driver", async () => {
    // The duplicate-matching case at its worst: both legs match the predicate.
    await seedInspectionPhoto({
      photoId: "ip-both",
      inspectionId: "inspection-both",
      driverUuid: driverA.driverUuid,
      leg: "pre",
      workTrackerId: "wt-leg-one",
    });
    await linkInspectionToDriver({
      inspectionId: "inspection-both",
      driverUuid: driverA.driverUuid,
      leg: "post",
      workTrackerId: "wt-leg-two",
    });

    expect(await inspectionPhotos.listUnresolved(50)).toHaveLength(1);
    await expect(inspectionPhotos.countUnresolved()).resolves.toBe(1);
  });
});

/**
 * `DriverDocuments` is deliberately out of §15's scope: its Postgres RLS is
 * already owner-scoped server-side, so a device never holds another driver's
 * documents in the first place. Pinned here so the omission reads as a decision
 * rather than an oversight, and so removing the scoping from the other two
 * adapters can't quietly pass as "consistent".
 */
describe("DriverDocuments is intentionally unscoped (§15)", () => {
  it("does not consult the driver context", async () => {
    const driverDocuments = PHOTO_QUEUE_ADAPTERS.find(
      (adapter) => adapter.table === "DriverDocuments",
    )!;

    await mockDb.schema
      .createTable("DriverDocuments")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("driver_uuid", "text")
      .addColumn("photo_path", "text")
      .addColumn("upload_status", "text")
      .addColumn("gallery_asset_id", "text")
      .addColumn("attempts", "integer")
      .addColumn("last_attempt_at", "text")
      .addColumn("last_error", "text")
      .addColumn("created_at", "text")
      .execute();
    await mockDb
      .insertInto("DriverDocuments")
      .values({
        id: "doc-1",
        driver_uuid: driverB.driverUuid,
        photo_path: "docs/doc-1.jpg",
        upload_status: "pending",
        attempts: 0,
        created_at: "2026-08-01T00:00:00.000Z",
      })
      .execute();

    // No context set at all — the other two adapters would answer 0/null here.
    await expect(driverDocuments.countUnresolved()).resolves.toBe(1);
    await expect(
      driverDocuments.claimNext("fast", NOW_MS),
    ).resolves.toMatchObject({ id: "doc-1" });

    await mockDb.schema.dropTable("DriverDocuments").execute();
  });
});
