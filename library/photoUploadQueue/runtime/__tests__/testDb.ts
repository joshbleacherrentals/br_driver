/**
 * A real SQLite database for the queries that are the whole point of §15.
 *
 * Every other suite in this folder replaces the table-adapter layer with
 * hand-written fakes, because what it is testing lives *above* that boundary.
 * Driver scoping is the opposite: the behaviour under test IS the SQL — a
 * correlated `EXISTS`, an OR-chain over two nullable foreign keys, and SQL's
 * own NULL semantics. A fake adapter would only re-state the filter in
 * TypeScript and then prove that the re-statement matches itself.
 *
 * So this module gives `tableAdapters.ts` an in-memory `Kysely<PowerSyncDB>`
 * over `better-sqlite3` instead, and the tests assert on what SQLite actually
 * returns. The schema is only as wide as those queries touch — the real
 * `AppSchema.ts` tables carry many more columns, none of which participate in
 * ownership — and it is built with Kysely's schema builder rather than raw SQL
 * strings, per the project's typed-DB rule.
 */

import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

import type { PowerSyncDB } from "@/library/powersync/AppSchema";

/**
 * Module-scope singleton, and `mock`-prefixed on purpose: Jest hoists
 * `jest.mock(...)` above every import, so a suite that swaps
 * `@/library/powersync/db`'s `db` for this one has to reach it from inside the
 * factory.
 */
export const mockDb = new Kysely<PowerSyncDB>({
  dialect: new SqliteDialect({ database: new Database(":memory:") }),
});

/** Tables the §15 ownership queries read, in dependency order. */
const TABLES = [
  "Users",
  "Drivers",
  "WorkTrackers",
  "WorkTrackerInspections",
  "DamageReports",
  "DamageReportPhotos",
  "InspectionPhotos",
] as const;

/**
 * Creates the subset of `AppSchema.ts` these tests need. Column names and
 * types are copied from the real schema (`column.text` → `text`,
 * `column.integer` → `integer`); a divergence here would make the suite prove
 * something about a table that does not exist.
 */
export async function createSchema(db: Kysely<PowerSyncDB>): Promise<void> {
  await db.schema
    .createTable("Users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("clerk_user_id", "text")
    .execute();

  await db.schema
    .createTable("Drivers")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_uuid", "text")
    .execute();

  await db.schema
    .createTable("WorkTrackers")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("driver_uuid", "text")
    .addColumn("pre_inspection_uuid", "text")
    .addColumn("post_inspection_uuid", "text")
    .execute();

  await db.schema
    .createTable("WorkTrackerInspections")
    .addColumn("id", "text", (col) => col.primaryKey())
    .execute();

  await db.schema
    .createTable("DamageReports")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("created_by_user_uuid", "text")
    .addColumn("created_at", "text")
    .execute();

  await db.schema
    .createTable("DamageReportPhotos")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("damage_report_uuid", "text")
    .addColumn("photo_path", "text")
    .addColumn("upload_status", "text")
    .addColumn("gallery_asset_id", "text")
    .addColumn("attempts", "integer")
    .addColumn("last_attempt_at", "text")
    .addColumn("last_error", "text")
    .addColumn("created_at", "text")
    .execute();

  await db.schema
    .createTable("InspectionPhotos")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("inspection_uuid", "text")
    .addColumn("storage_path", "text")
    .addColumn("upload_status", "text")
    .addColumn("gallery_asset_id", "text")
    .addColumn("attempts", "integer")
    .addColumn("last_attempt_at", "text")
    .addColumn("last_error", "text")
    .addColumn("created_at", "text")
    .execute();
}

/** Drops and rebuilds everything, so each test starts from a known empty DB. */
export async function resetTestDb(): Promise<void> {
  for (const table of [...TABLES].reverse()) {
    await mockDb.schema.dropTable(table).ifExists().execute();
  }
  await createSchema(mockDb);
}

// ── Seed helpers ────────────────────────────────────────────────────────────

export type SeededDriver = {
  /** `Users.id` — what `DamageReports.created_by_user_uuid` points at. */
  userUuid: string;
  /** `Drivers.id` — what `WorkTrackers.driver_uuid` points at. */
  driverUuid: string;
};

/** One driver, as the Clerk → Users → Drivers chain would leave them locally. */
export async function seedDriver(name: string): Promise<SeededDriver> {
  const userUuid = `user-${name}`;
  const driverUuid = `driver-${name}`;

  await mockDb
    .insertInto("Users")
    .values({ id: userUuid, clerk_user_id: `clerk-${name}` })
    .execute();
  await mockDb
    .insertInto("Drivers")
    .values({ id: driverUuid, user_uuid: userUuid })
    .execute();

  return { userUuid, driverUuid };
}

/** Queue columns a test may vary; the defaults describe a fresh pending photo. */
export type QueueColumns = {
  upload_status?: string;
  attempts?: number;
  last_attempt_at?: string | null;
  last_error?: string | null;
  created_at?: string;
};

const queueDefaults = (created_at: string) => ({
  upload_status: "pending",
  gallery_asset_id: null,
  attempts: 0,
  last_attempt_at: null,
  last_error: null,
  created_at,
});

/**
 * A damage report plus one photo on it. `createdByUserUuid: null` seeds the
 * unattributed case — a report whose creator was never recorded.
 */
export async function seedDamageReportPhoto(args: {
  photoId: string;
  reportId: string;
  createdByUserUuid: string | null;
  queue?: QueueColumns;
}): Promise<string> {
  const { photoId, reportId, createdByUserUuid, queue = {} } = args;

  const existingReport = await mockDb
    .selectFrom("DamageReports")
    .select("id")
    .where("id", "=", reportId)
    .executeTakeFirst();

  if (!existingReport) {
    await mockDb
      .insertInto("DamageReports")
      .values({
        id: reportId,
        created_by_user_uuid: createdByUserUuid,
        created_at: "2026-08-01T00:00:00.000Z",
      })
      .execute();
  }

  await mockDb
    .insertInto("DamageReportPhotos")
    .values({
      id: photoId,
      damage_report_uuid: reportId,
      photo_path: `${reportId}/${photoId}.jpg`,
      ...queueDefaults("2026-08-01T00:00:00.000Z"),
      ...queue,
    })
    .execute();

  return photoId;
}

/** Which leg of a trip an inspection hangs off. */
export type InspectionLeg = "pre" | "post";

/**
 * An inspection plus one photo on it, reachable from `driverUuid` through the
 * named leg. Pass `driverUuid: null` to seed an inspection no trip references.
 */
export async function seedInspectionPhoto(args: {
  photoId: string;
  inspectionId: string;
  driverUuid: string | null;
  leg?: InspectionLeg;
  workTrackerId?: string;
  queue?: QueueColumns;
}): Promise<string> {
  const {
    photoId,
    inspectionId,
    driverUuid,
    leg = "pre",
    workTrackerId = `wt-${inspectionId}-${leg}`,
    queue = {},
  } = args;

  const existingInspection = await mockDb
    .selectFrom("WorkTrackerInspections")
    .select("id")
    .where("id", "=", inspectionId)
    .executeTakeFirst();

  if (!existingInspection) {
    await mockDb
      .insertInto("WorkTrackerInspections")
      .values({ id: inspectionId })
      .execute();
  }

  const existingTrip = await mockDb
    .selectFrom("WorkTrackers")
    .select("id")
    .where("id", "=", workTrackerId)
    .executeTakeFirst();

  // Several photos may hang off the same inspection; the trip that references
  // it is still one row.
  if (driverUuid && !existingTrip) {
    await linkInspectionToDriver({
      inspectionId,
      driverUuid,
      leg,
      workTrackerId,
    });
  }

  await mockDb
    .insertInto("InspectionPhotos")
    .values({
      id: photoId,
      inspection_uuid: inspectionId,
      storage_path: `${inspectionId}/${photoId}.jpg`,
      ...queueDefaults("2026-08-01T00:00:00.000Z"),
      ...queue,
    })
    .execute();

  return photoId;
}

/**
 * Adds one more `WorkTrackers` row pointing at an existing inspection.
 *
 * Exists so a test can build the pathological shape the `EXISTS` choice guards
 * against: the same inspection id referenced by two different trips.
 */
export async function linkInspectionToDriver(args: {
  inspectionId: string;
  driverUuid: string;
  leg: InspectionLeg;
  workTrackerId: string;
}): Promise<void> {
  const { inspectionId, driverUuid, leg, workTrackerId } = args;

  await mockDb
    .insertInto("WorkTrackers")
    .values({
      id: workTrackerId,
      driver_uuid: driverUuid,
      pre_inspection_uuid: leg === "pre" ? inspectionId : null,
      post_inspection_uuid: leg === "post" ? inspectionId : null,
    })
    .execute();
}
