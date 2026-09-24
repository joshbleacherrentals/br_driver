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
import {
  getDriverScope,
  publishDriverScope,
  type DriverScope,
} from "@/library/powersync/scoping/driverScope";

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
  "DamageReportAcknowledgements",
  "PhotoUploadStatus",
  "InspectionPhotos",
  "Contacts",
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
    .createTable("Contacts")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("first_name", "text")
    .addColumn("last_name", "text")
    .addColumn("phone", "text")
    .addColumn("email", "text")
    .addColumn("company_uuid", "text")
    .addColumn("notes", "text")
    .addColumn("deleted", "integer")
    .addColumn("created_at", "text")
    .execute();

  await db.schema
    .createTable("WorkTrackerInspections")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("created_at", "text")
    .addColumn("walk_around_complete", "integer")
    .addColumn("issues_found", "integer")
    .addColumn("issue_description", "text")
    .addColumn("answers_json", "text")
    .addColumn("bleacher_uuid", "text")
    .execute();

  await db.schema
    .createTable("DamageReports")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("inspection_uuid", "text")
    .addColumn("bleacher_uuid", "text")
    .addColumn("is_safe_to_sit", "integer")
    .addColumn("is_safe_to_haul", "integer")
    .addColumn("seat_damage", "text")
    .addColumn("haul_damage", "text")
    .addColumn("note", "text")
    .addColumn("created_at", "text")
    .addColumn("resolved_at", "text")
    .addColumn("maintenance_event_uuid", "text")
    .addColumn("created_by_user_uuid", "text")
    .addColumn("deleted", "integer")
    // "Fixed by driver" — a driver's claim that the damage is gone, which is
    // not a resolve (a manager still closes the report on the web). Three
    // columns because "fixed" without "who" and "when" answers nothing.
    .addColumn("fixed_by_driver", "integer")
    .addColumn("fixed_at", "text")
    .addColumn("fixed_by_user_uuid", "text")
    .execute();

  await db.schema
    .createTable("DamageReportAcknowledgements")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("damage_report_uuid", "text")
    .addColumn("inspection_uuid", "text")
    .addColumn("work_tracker_uuid", "text")
    .addColumn("acknowledged_by_user_uuid", "text")
    .addColumn("created_at", "text")
    .addColumn("deleted", "integer")
    // Mirror of the parent's resolved_at, maintained server-side. Present here
    // because the rows arrive carrying it, never because the client writes it.
    .addColumn("report_resolved_at", "text")
    .execute();

  await db.schema
    .createTable("DamageReportPhotos")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("damage_report_uuid", "text")
    .addColumn("photo_path", "text")
    .addColumn("thumbnail", "text")
    .addColumn("created_at", "text")
    // The server-visible half of the §3 hybrid (`AppSchema.ts`): written once
    // per photo, only ever `uploaded`, and only by
    // `runtime/syncedUploadStatusMirror.ts`. Left out of every seed helper on
    // purpose — production creates the photo row without it, and NULL is
    // exactly what "the file has not been confirmed in the bucket" looks like
    // on the server.
    .addColumn("upload_status", "text")
    .execute();

  /**
   * The local-only §3 bookkeeping table (`AppSchema.ts`), keyed by the photo
   * row's own id.
   *
   * On device this is a view over `ps_data_local__PhotoUploadStatus` and writes
   * to it produce no `ps_crud` entry — the whole reason it exists. Here it is an
   * ordinary table, which is the right model for these suites: what they assert
   * is which rows the queue's SQL selects and what it writes, and a suite that
   * cares about the CRUD boundary itself installs its own capture triggers
   * (`statusWritesAreLocalOnly.test.ts`).
   */
  await db.schema
    .createTable("PhotoUploadStatus")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("upload_status", "text")
    .addColumn("gallery_asset_id", "text")
    .addColumn("attempts", "integer")
    .addColumn("last_attempt_at", "text")
    .addColumn("last_error", "text")
    .execute();

  await db.schema
    .createTable("InspectionPhotos")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("inspection_uuid", "text")
    .addColumn("storage_path", "text")
    .addColumn("caption", "text")
    .addColumn("upload_status", "text")
    .addColumn("gallery_asset_id", "text")
    .addColumn("attempts", "integer")
    .addColumn("last_attempt_at", "text")
    .addColumn("last_error", "text")
    .addColumn("created_at", "text")
    .addColumn("created_by_driver_uuid", "text")
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

/**
 * A real `DriverScope` for a seeded driver.
 *
 * `DriverScope` is branded (`library/powersync/scoping/driverScope.ts`) and can
 * only be minted by `publishDriverScope`, deliberately — a test cannot hand a
 * scoped query builder a hand-rolled `{ userUuid, driverUuid }` object any more
 * than production code can. So this publishes and reads back, which also leaves
 * the module store pointing at the same driver for anything reading it
 * synchronously (the queue's adapters).
 */
export function scopeFor(driver: SeededDriver): DriverScope {
  publishDriverScope(driver.userUuid, driver.driverUuid);
  const scope = getDriverScope();
  if (!scope) {
    throw new Error("publishDriverScope did not produce a scope");
  }
  return scope;
}

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

/**
 * One damage report, with no photos on it.
 *
 * `seedDamageReportPhoto` creates a parent report as a side effect of seeding a
 * photo; this is for the suites whose subject is the report row itself.
 */
export async function seedDamageReport(args: {
  reportId: string;
  createdByUserUuid: string | null;
  note?: string;
  resolvedAt?: string | null;
  fixed?: { at: string; byUserUuid: string };
  bleacherUuid?: string | null;
  createdAt?: string;
  deleted?: boolean;
}): Promise<string> {
  const {
    reportId,
    createdByUserUuid,
    note = null,
    resolvedAt = null,
    fixed,
    bleacherUuid = null,
    createdAt = "2026-08-01T00:00:00.000Z",
    deleted = false,
  } = args;

  await mockDb
    .insertInto("DamageReports")
    .values({
      id: reportId,
      created_by_user_uuid: createdByUserUuid,
      created_at: createdAt,
      note,
      resolved_at: resolvedAt,
      bleacher_uuid: bleacherUuid,
      deleted: deleted ? 1 : 0,
      fixed_by_driver: fixed ? 1 : 0,
      fixed_at: fixed?.at ?? null,
      fixed_by_user_uuid: fixed?.byUserUuid ?? null,
    })
    .execute();

  return reportId;
}

/** One acknowledgement, as it arrives from the server. */
export async function seedDamageReportAck(args: {
  ackId: string;
  reportId: string;
  byUserUuid: string;
  inspectionUuid?: string | null;
  workTrackerUuid?: string | null;
  createdAt?: string;
  reportResolvedAt?: string | null;
}): Promise<string> {
  const {
    ackId,
    reportId,
    byUserUuid,
    inspectionUuid = null,
    workTrackerUuid = null,
    createdAt = "2026-08-02T00:00:00.000Z",
    reportResolvedAt = null,
  } = args;

  await mockDb
    .insertInto("DamageReportAcknowledgements")
    .values({
      id: ackId,
      damage_report_uuid: reportId,
      inspection_uuid: inspectionUuid,
      work_tracker_uuid: workTrackerUuid,
      acknowledged_by_user_uuid: byUserUuid,
      created_at: createdAt,
      deleted: 0,
      report_resolved_at: reportResolvedAt,
    })
    .execute();

  return ackId;
}

/** Queue columns a test may vary; the defaults describe a fresh pending photo. */
export type QueueColumns = {
  upload_status?: string;
  attempts?: number;
  last_attempt_at?: string | null;
  last_error?: string | null;
  created_at?: string;
};

const DEFAULT_CREATED_AT = "2026-08-01T00:00:00.000Z";

const queueDefaults = (created_at: string) => ({
  upload_status: "pending",
  gallery_asset_id: null,
  attempts: 0,
  last_attempt_at: null,
  last_error: null,
  created_at,
});

/**
 * Seeds `DamageReportPhotos`' §3 bookkeeping where it now lives: the local-only
 * `PhotoUploadStatus` table, keyed by the photo's own id.
 *
 * A row is always written, even for the all-defaults case. Production leaves it
 * absent until the queue first persists an outcome, and reads coalesce the two
 * to the same state — so seeding it keeps these suites saying exactly what they
 * said when the columns were on the photo row.
 */
async function seedPhotoUploadStatus(
  photoId: string,
  queue: QueueColumns,
): Promise<void> {
  await mockDb
    .insertInto("PhotoUploadStatus")
    .values({
      id: photoId,
      upload_status: queue.upload_status ?? "pending",
      gallery_asset_id: null,
      attempts: queue.attempts ?? 0,
      last_attempt_at: queue.last_attempt_at ?? null,
      last_error: queue.last_error ?? null,
    })
    .execute();
}

/**
 * A damage report plus one photo on it. `createdByUserUuid: null` seeds the
 * unattributed case — a report whose creator was never recorded.
 */
export async function seedDamageReportPhoto(args: {
  photoId: string;
  reportId: string;
  createdByUserUuid: string | null;
  resolvedAt?: string | null;
  queue?: QueueColumns;
}): Promise<string> {
  const {
    photoId,
    reportId,
    createdByUserUuid,
    resolvedAt = null,
    queue = {},
  } = args;

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
        resolved_at: resolvedAt,
        fixed_by_driver: 0,
      })
      .execute();
  }

  await mockDb
    .insertInto("DamageReportPhotos")
    .values({
      id: photoId,
      damage_report_uuid: reportId,
      photo_path: `${reportId}/${photoId}.jpg`,
      created_at: queue.created_at ?? DEFAULT_CREATED_AT,
    })
    .execute();

  await seedPhotoUploadStatus(photoId, queue);

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
  /** The photo's own driver column. Omitted = NULL, as an old build leaves it. */
  createdByDriverUuid?: string | null;
}): Promise<string> {
  const {
    photoId,
    inspectionId,
    driverUuid,
    leg = "pre",
    workTrackerId = `wt-${inspectionId}-${leg}`,
    queue = {},
    createdByDriverUuid = null,
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
      created_by_driver_uuid: createdByDriverUuid,
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

/** Contact columns a test may vary; the defaults describe a live contact. */
export type ContactColumns = {
  first_name?: string;
  last_name?: string | null;
  phone?: string | null;
  deleted?: number;
};

/** One `Contacts` row — the POC an office user attached to a trip. */
export async function seedContact(
  id: string,
  columns: ContactColumns = {},
): Promise<string> {
  await mockDb
    .insertInto("Contacts")
    .values({
      id,
      first_name: columns.first_name ?? "Dave",
      last_name: columns.last_name ?? "Brubeck",
      phone: columns.phone ?? "5551234567",
      email: null,
      company_uuid: null,
      notes: null,
      deleted: columns.deleted ?? 0,
      created_at: "2026-08-25T10:00:00Z",
    })
    .execute();

  return id;
}
