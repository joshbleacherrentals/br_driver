/**
 * Covers §15's scoped sources — the four query builders every driver-scoped
 * read in the app is now constructed from.
 *
 * These are asserted against a REAL SQLite database (`testDb.ts`) rather than a
 * fake, because the behaviour under test IS the SQL: a correlated `EXISTS`, an
 * OR-chain over two nullable foreign keys, and SQL's own NULL semantics. A fake
 * would only re-state the predicate in TypeScript and prove the re-statement
 * matches itself.
 *
 * `tableAdapters.test.ts` already exercises these predicates through the upload
 * queue. This suite pins them at the source instead, so the hooks and the
 * banner — which reach them by a different route — are covered by the same
 * assertions rather than by four parallel copies of them.
 */

import {
  crossDriverRead,
  damageReportPhotosOf,
  damageReportsOf,
  driverDocumentsAll,
  inspectionPhotosOf,
  inspectionsOf,
} from "@/library/powersync/scoping";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  linkInspectionToDriver,
  mockDb,
  resetTestDb,
  scopeFor,
  seedDamageReportPhoto,
  seedDriver,
  seedInspectionPhoto,
  type SeededDriver,
} from "@/library/photoUploadQueue/runtime/__tests__/testDb";

jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("@/library/photoUploadQueue/runtime/__tests__/testDb");
  return { __esModule: true, db: database, powerSyncDb: {} };
});

let driverA: SeededDriver;
let driverB: SeededDriver;

const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

async function run(compiled: { sql: string; parameters: readonly unknown[] }) {
  const { rows } = await mockDb.executeQuery(compiled as never);
  return rows as { id: string }[];
}

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
  driverB = await seedDriver("b");
});

afterEach(() => {
  clearDriverScope();
});

// ── damageReportsOf ─────────────────────────────────────────────────────────

describe("damageReportsOf (§15)", () => {
  beforeEach(async () => {
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

  it("returns only the reports this driver created", async () => {
    const rows = await run(
      damageReportsOf(scopeFor(driverA)).select("id").compile(),
    );

    expect(ids(rows)).toEqual(["report-mine"]);
  });

  it("excludes a report with no recorded creator, with no special case", async () => {
    // `created_by_user_uuid IS NULL` fails `= ?` under SQL's null semantics —
    // there is no branch for it in `ownership.ts`, and none is wanted.
    const rows = await run(
      damageReportsOf(scopeFor(driverA)).select("id").compile(),
    );

    expect(ids(rows)).not.toContain("report-orphan");
  });

  it("composes with a caller's own bare-column filter", async () => {
    // The reason the predicate is `EXISTS` and not a join: `.where("id", ...)`
    // still refers to the outer table unqualified.
    const rows = await run(
      damageReportsOf(scopeFor(driverA))
        .select("id")
        .where("id", "=", "report-theirs")
        .compile(),
    );

    expect(rows).toEqual([]);
  });
});

// ── damageReportPhotosOf ────────────────────────────────────────────────────

describe("damageReportPhotosOf (§15)", () => {
  beforeEach(async () => {
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

  it("returns only photos hanging off this driver's reports", async () => {
    const rows = await run(
      damageReportPhotosOf(scopeFor(driverA)).select("id").compile(),
    );

    expect(ids(rows)).toEqual(["p-mine"]);
  });

  it("excludes photos on an unattributed report", async () => {
    const rows = await run(
      damageReportPhotosOf(scopeFor(driverA)).select("id").compile(),
    );

    expect(ids(rows)).not.toContain("p-orphan");
  });

  it("answers for whichever driver the scope names", async () => {
    const rows = await run(
      damageReportPhotosOf(scopeFor(driverB)).select("id").compile(),
    );

    expect(ids(rows)).toEqual(["p-theirs"]);
  });
});

// ── inspectionsOf ───────────────────────────────────────────────────────────

describe("inspectionsOf (§15)", () => {
  beforeEach(async () => {
    await seedInspectionPhoto({
      photoId: "ip-mine",
      inspectionId: "inspection-mine",
      driverUuid: driverA.driverUuid,
      leg: "pre",
    });
    await seedInspectionPhoto({
      photoId: "ip-theirs",
      inspectionId: "inspection-theirs",
      driverUuid: driverB.driverUuid,
      leg: "post",
    });
    await seedInspectionPhoto({
      photoId: "ip-orphan",
      inspectionId: "inspection-orphan",
      driverUuid: null,
    });
  });

  it("returns only inspections that are a leg of this driver's trips", async () => {
    const rows = await run(
      inspectionsOf(scopeFor(driverA)).select("id").compile(),
    );

    expect(ids(rows)).toEqual(["inspection-mine"]);
  });

  it("walks the post leg too, not just the pre leg", async () => {
    const rows = await run(
      inspectionsOf(scopeFor(driverB)).select("id").compile(),
    );

    expect(ids(rows)).toEqual(["inspection-theirs"]);
  });

  it("excludes an inspection no trip references", async () => {
    const rows = await run(
      inspectionsOf(scopeFor(driverA)).select("id").compile(),
    );

    expect(ids(rows)).not.toContain("inspection-orphan");
  });
});

// ── inspectionPhotosOf ──────────────────────────────────────────────────────

describe("inspectionPhotosOf (§15)", () => {
  beforeEach(async () => {
    await seedInspectionPhoto({
      photoId: "ip-mine",
      inspectionId: "inspection-mine",
      driverUuid: driverA.driverUuid,
    });
    await seedInspectionPhoto({
      photoId: "ip-theirs",
      inspectionId: "inspection-theirs",
      driverUuid: driverB.driverUuid,
    });
  });

  it("returns only photos on this driver's inspections", async () => {
    const rows = await run(
      inspectionPhotosOf(scopeFor(driverA)).select("id").compile(),
    );

    expect(ids(rows)).toEqual(["ip-mine"]);
  });

  /**
   * The regression test behind the `EXISTS`-not-`INNER JOIN` decision, mirrored
   * here from `tableAdapters.test.ts` so it guards the predicate itself rather
   * than one consumer of it.
   *
   * Nothing in the schema makes the inspection→trip relationship 1:1 —
   * `WorkTrackerInspections` has no foreign key back to `WorkTrackers` — so two
   * trips referencing one inspection id is a shape the database permits. Under
   * an `INNER JOIN` that shape multiplies the outer row and the same photo
   * comes back twice. `EXISTS` is a yes/no question, so it cannot.
   */
  it("returns a photo at most once when two trips reference one inspection", async () => {
    await seedInspectionPhoto({
      photoId: "ip-shared",
      inspectionId: "inspection-shared",
      driverUuid: driverA.driverUuid,
      leg: "pre",
      workTrackerId: "wt-first",
    });
    await linkInspectionToDriver({
      inspectionId: "inspection-shared",
      driverUuid: driverB.driverUuid,
      leg: "post",
      workTrackerId: "wt-second",
    });

    const rows = await run(
      inspectionPhotosOf(scopeFor(driverA))
        .select("id")
        .where("id", "=", "ip-shared")
        .compile(),
    );

    expect(rows).toHaveLength(1);
  });

  it("returns it once even when BOTH legs belong to the current driver", async () => {
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

    const rows = await run(
      inspectionPhotosOf(scopeFor(driverA))
        .select("id")
        .where("id", "=", "ip-both")
        .compile(),
    );

    expect(rows).toHaveLength(1);
  });
});

// ── The named opt-outs ──────────────────────────────────────────────────────

describe("the deliberate opt-outs (§15)", () => {
  it("driverDocumentsAll applies no ownership predicate", async () => {
    // Pinned as a decision, not an oversight: `DriverDocuments`' Postgres RLS is
    // already owner-scoped server-side, so a device only ever holds its own
    // driver's documents.
    const { sql } = driverDocumentsAll().select("id").compile();

    expect(sql).not.toContain("exists");
    expect(sql).not.toContain("driver_uuid");
  });

  it("crossDriverRead returns its query untouched", async () => {
    const query = damageReportsOf(scopeFor(driverA)).select("id");

    expect(crossDriverRead("a written reason", query)).toBe(query);
  });
});
