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
 * replaced; `tableAdapters.ts` and the scoping layer are untouched
 * production code.
 */

import {
  clearDriverScope,
  publishDriverScope,
} from "@/library/powersync/scoping/driverScope";
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
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");
});

afterEach(() => {
  clearDriverScope();
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
    publishDriverScope(driverA.userUuid, driverA.driverUuid);
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

    clearDriverScope();

    await expect(damagePhotos.countUnresolved()).resolves.toBe(0);
    await expect(damagePhotos.claimNext("fast", NOW_MS)).resolves.toBeNull();
  });

  it("switches cleanly to the other driver's rows and only those", async () => {
    publishDriverScope(driverB.userUuid, driverB.driverUuid);

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
    publishDriverScope(driverA.userUuid, driverA.driverUuid);
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
    publishDriverScope(driverA.userUuid, driverA.driverUuid);
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
 * Head-of-line blocking in `claimNext` — the reason a backlog with a non-trivial
 * failure rate crawled, independently of how many upload lanes existed.
 *
 * `claimNext` took the `CLAIM_BATCH` (25) oldest unresolved rows and only then
 * filtered them for backoff-eligibility in JS. `LIMIT` therefore ran before the
 * predicate. Rows that fail tend to fail together and are the oldest together,
 * so the 25-row window routinely consisted entirely of rows attempted seconds
 * ago — and the claim answered `null` while dozens of never-attempted rows sat
 * directly behind them. Every lane looked through the same starved window, so
 * the pass simply ended.
 *
 * Reverting `claimNext`'s `.where((eb) => retryEligible(...))` makes both of
 * these fail.
 */
describe("claim eligibility is applied before LIMIT, not after (F2)", () => {
  /** Distinct, increasing `created_at` so claim order is unambiguous. */
  const createdAt = (index: number) =>
    new Date(Date.parse("2026-08-01T00:00:00.000Z") + index * 60_000).toISOString();

  /**
   * `blocked` recently-attempted photos ahead of `free` never-attempted ones,
   * all owned by driver A and all on one report.
   */
  async function seedBacklog(blocked: number, free: number): Promise<void> {
    for (let i = 0; i < blocked + free; i++) {
      const isBlocked = i < blocked;
      await seedDamageReportPhoto({
        photoId: `dr-${String(i).padStart(3, "0")}`,
        reportId: "report-backlog",
        createdByUserUuid: driverA.userUuid,
        queue: {
          created_at: createdAt(i),
          upload_status: isBlocked ? "failed" : "pending",
          attempts: isBlocked ? 1 : 0,
          // Attempted "just now": ineligible under both the fast spacing floor
          // and the §6 backoff schedule.
          last_attempt_at: isBlocked ? new Date(NOW_MS).toISOString() : null,
        },
      });
    }
    publishDriverScope(driverA.userUuid, driverA.driverUuid);
  }

  it.each([["fast"], ["backoff"]] as const)(
    "%s mode — reaches an eligible row sitting behind a full batch of ineligible ones",
    async (mode) => {
      await seedBacklog(25, 35);

      const row = await damagePhotos.claimNext(mode, NOW_MS);

      // Not merely non-null: it is the oldest *eligible* row, i.e. the first
      // one past the blocked window.
      expect(row?.id).toBe("dr-025");
    },
  );

  it("still refuses to claim when every row really is ineligible", async () => {
    // The other half: filtering in SQL must not become "claim anything".
    await seedBacklog(30, 0);

    await expect(damagePhotos.claimNext("fast", NOW_MS)).resolves.toBeNull();
    await expect(damagePhotos.claimNext("backoff", NOW_MS)).resolves.toBeNull();
  });

  it("honours the backoff schedule per attempt count", async () => {
    // 30s after one failure the row is due; 30s after three it is not (the
    // plateau step is 5 minutes).
    await seedDamageReportPhoto({
      photoId: "one-attempt",
      reportId: "report-schedule",
      createdByUserUuid: driverA.userUuid,
      queue: {
        created_at: createdAt(0),
        upload_status: "failed",
        attempts: 1,
        last_attempt_at: new Date(NOW_MS - 31_000).toISOString(),
      },
    });
    await seedDamageReportPhoto({
      photoId: "three-attempts",
      reportId: "report-schedule",
      createdByUserUuid: driverA.userUuid,
      queue: {
        created_at: createdAt(1),
        upload_status: "failed",
        attempts: 3,
        last_attempt_at: new Date(NOW_MS - 31_000).toISOString(),
      },
    });
    publishDriverScope(driverA.userUuid, driverA.driverUuid);

    await expect(
      damagePhotos.claimNext("backoff", NOW_MS),
    ).resolves.toMatchObject({ id: "one-attempt" });

    // With the one-attempt row retired, the three-attempt row is still waiting
    // out its 5-minute plateau...
    await damagePhotos.persist({
      id: "one-attempt",
      photo_path: "",
      upload_status: "uploaded",
      gallery_asset_id: null,
      attempts: 1,
      last_attempt_at: null,
      last_error: null,
    });
    await expect(damagePhotos.claimNext("backoff", NOW_MS)).resolves.toBeNull();
    // ...and becomes claimable once it has elapsed.
    await expect(
      damagePhotos.claimNext("backoff", NOW_MS + 300_000),
    ).resolves.toMatchObject({ id: "three-attempts" });
  });
});

/**
 * Claim priority: never-attempted rows first, then oldest-first within each
 * group.
 *
 * WHY THIS EXISTS (and why it used to pass by accident)
 * `created_at` was never written on insert — not by `createDamageReport.ts`,
 * `inspection.tsx` or `applyPhotoRepair.ts` — so a freshly-saved photo carried
 * `NULL`, and SQLite sorts NULL first under `ORDER BY created_at ASC`. On a
 * real device that produced exactly the behaviour a driver needs: a new
 * report's photos were claimed within ~1s and uploaded within ~9s even with
 * ~1000 backlog rows ahead of them by insertion order. But it was a side effect
 * of a missing value, not a decision — and writing `created_at` (which
 * `ORDER BY created_at` requires to mean anything at all) would silently have
 * inverted it into strict FIFO, burying every new report behind the backlog
 * while the driver watched the §7 progress modal.
 *
 * Both halves therefore have to land together, and this is the half that pins
 * the behaviour: priority is now stated (`last_attempt_at IS NULL` first), so
 * it survives `created_at` being populated.
 */
describe("claim priority — a fresh photo outranks an attempted backlog", () => {
  const BACKLOG_SIZE = 60; // Comfortably more than `CLAIM_BATCH` (25).
  const backlogCreatedAt = (index: number) =>
    new Date(Date.parse("2026-08-01T00:00:00.000Z") + index * 60_000).toISOString();
  /** Newer than every backlog row — so FIFO alone would put it dead last. */
  const FRESH_CREATED_AT = "2026-08-14T11:59:00.000Z";

  /**
   * A backlog of rows that have all been attempted once, long enough ago to be
   * eligible again under both modes — so nothing but the ordering decides which
   * row is handed out.
   */
  async function seedAttemptedBacklog(): Promise<void> {
    for (let i = 0; i < BACKLOG_SIZE; i++) {
      await seedDamageReportPhoto({
        photoId: `backlog-${String(i).padStart(3, "0")}`,
        reportId: "report-backlog",
        createdByUserUuid: driverA.userUuid,
        queue: {
          created_at: backlogCreatedAt(i),
          upload_status: "failed",
          attempts: 1,
          last_attempt_at: new Date(NOW_MS - 600_000).toISOString(),
        },
      });
    }
  }

  beforeEach(() => {
    publishDriverScope(driverA.userUuid, driverA.driverUuid);
  });

  it.each([["fast"], ["backoff"]] as const)(
    "%s mode — claims a just-saved photo first, not the oldest of 60 eligible backlog rows",
    async (mode) => {
      await seedAttemptedBacklog();
      // Saved seconds ago: newest `created_at` of all, never attempted.
      await seedDamageReportPhoto({
        photoId: "just-saved",
        reportId: "report-new",
        createdByUserUuid: driverA.userUuid,
        queue: { created_at: FRESH_CREATED_AT },
      });

      const row = await damagePhotos.claimNext(mode, NOW_MS);

      // Under plain `ORDER BY created_at ASC` this row would not even reach
      // `claimNext`'s 25-row candidate batch.
      expect(row?.id).toBe("just-saved");
    },
  );

  it("orders oldest-first within the never-attempted group", async () => {
    for (const [id, createdAt] of [
      ["fresh-late", "2026-08-14T11:59:00.000Z"],
      ["fresh-early", "2026-08-14T09:00:00.000Z"],
      ["fresh-middle", "2026-08-14T10:00:00.000Z"],
    ] as const) {
      await seedDamageReportPhoto({
        photoId: id,
        reportId: "report-new",
        createdByUserUuid: driverA.userUuid,
        queue: { created_at: createdAt },
      });
    }

    await expect(damagePhotos.claimNext("fast", NOW_MS)).resolves.toMatchObject({
      id: "fresh-early",
    });
  });

  it("falls back to the oldest eligible backlog row once nothing is fresh", async () => {
    // The priority is a tiebreak, not a filter: with no never-attempted rows
    // left, the backlog still drains in `created_at` order.
    await seedAttemptedBacklog();

    await expect(damagePhotos.claimNext("fast", NOW_MS)).resolves.toMatchObject({
      id: "backlog-000",
    });
  });

  /**
   * §10 — the claim reservation lives in the service's in-memory ledger, not in
   * `upload_status`, so a row an upload lane already holds still satisfies every
   * predicate in the SQL. `isReserved` is the only thing standing between it and
   * a second lane.
   */
  it("skips rows the caller has already reserved, and returns the next one", async () => {
    await seedAttemptedBacklog();

    const first = await damagePhotos.claimNext("fast", NOW_MS);
    expect(first?.id).toBe("backlog-000");

    const reserved = new Set([first!.id]);
    const second = await damagePhotos.claimNext("fast", NOW_MS, (id) =>
      reserved.has(id),
    );

    expect(second?.id).toBe("backlog-001");
  });

  it("returns null rather than a duplicate when the only eligible row is reserved", async () => {
    await seedDamageReportPhoto({
      photoId: "only-row",
      reportId: "report-new",
      createdByUserUuid: driverA.userUuid,
      queue: { created_at: FRESH_CREATED_AT },
    });

    await expect(
      damagePhotos.claimNext("fast", NOW_MS, (id) => id === "only-row"),
    ).resolves.toBeNull();
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
