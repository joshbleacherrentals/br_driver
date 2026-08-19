/**
 * LOCKED CONTRACT — DO NOT MODIFY THIS TEST FILE.
 *
 * This test defines expected behavior for a diagnosed bug/regression in the
 * photo upload queue (see the "Photo Queue Postmortem" plan). It must stay
 * red until the corresponding fix lands, and must not be edited, weakened,
 * skipped, or deleted to make broken implementation code pass. If you are
 * an agent implementing the fix and believe this test is wrong, STOP and
 * ask the user — do not change this file yourself.
 *
 * Seam under test: `tableAdapters.ts`'s `persist()` — whether a photo's upload
 * bookkeeping write (`upload_status`, `attempts`, `last_attempt_at`,
 * `last_error`) enters PowerSync's `ps_crud` outbox.
 * Currently: RED — those columns still live on the synced `DamageReportPhotos`
 * table, so every terminal status write becomes one more CRUD operation queued
 * for Postgres ahead of the driver's real writes.
 */

import { sql } from "kysely";

import { PHOTO_QUEUE_ADAPTERS } from "@/library/photoUploadQueue/runtime/tableAdapters";
import { applyUploadEvent } from "@/library/photoUploadQueue/uploadStatus";
import { clearDriverScope } from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  scopeFor,
  seedDamageReportPhoto,
  seedDriver,
  type SeededDriver,
} from "./testDb";

// Same boundary `tableAdapters.test.ts` uses: only `@/library/powersync/db` is
// replaced, so the adapters — and the SQL they emit — are real.
jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("./testDb");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CompiledQuery } = require("kysely");
  return {
    __esModule: true,
    db: database,
    powerSyncDb: {
      execute: (statement: string, parameters: unknown[]) =>
        database.executeQuery(CompiledQuery.raw(statement, parameters)),
    },
  };
});

const damagePhotos = PHOTO_QUEUE_ADAPTERS.find(
  (adapter) => adapter.table === "DamageReportPhotos",
)!;

const NOW_MS = Date.parse("2026-08-19T12:00:00.000Z");
const NOW_ISO = new Date(NOW_MS).toISOString();

/**
 * PowerSync's own write outbox, plus the capture rule that fills it.
 *
 * On device, a *synced* table is a view whose INSTEAD OF triggers write both
 * the row and a `ps_crud` entry; a table declared local-only gets the row write
 * and no `ps_crud` entry at all — that difference IS the fix under test. So the
 * harness models exactly that: `DamageReportPhotos` (synced today) captures,
 * and any table the queue's status write is moved to instead does not, because
 * nothing installs a trigger on it.
 *
 * Raw SQL is used deliberately and only here: `ps_crud` is PowerSync's internal
 * bookkeeping, not part of the app's typed schema, and the triggers are DDL the
 * query builder has no vocabulary for. This is a test-only exception to the
 * typed-access rule — never a pattern for app code.
 */
async function installCrudCapture(): Promise<void> {
  await sql`create table if not exists ps_crud (
    id integer primary key autoincrement,
    tx_id integer,
    data text
  )`.execute(mockDb);

  await sql`create trigger if not exists ps_crud_insert_DamageReportPhotos
    after insert on "DamageReportPhotos"
    begin
      insert into ps_crud (tx_id, data)
      values (1, json_object('op', 'PUT', 'type', 'DamageReportPhotos', 'id', NEW.id));
    end`.execute(mockDb);

  await sql`create trigger if not exists ps_crud_update_DamageReportPhotos
    after update on "DamageReportPhotos"
    begin
      insert into ps_crud (tx_id, data)
      values (1, json_object('op', 'PATCH', 'type', 'DamageReportPhotos', 'id', NEW.id));
    end`.execute(mockDb);

  await sql`create trigger if not exists ps_crud_delete_DamageReportPhotos
    after delete on "DamageReportPhotos"
    begin
      insert into ps_crud (tx_id, data)
      values (1, json_object('op', 'DELETE', 'type', 'DamageReportPhotos', 'id', OLD.id));
    end`.execute(mockDb);
}

async function crudEntries(): Promise<{ data: string }[]> {
  const result = await sql<{ data: string }>`select data from ps_crud`.execute(
    mockDb,
  );
  return [...result.rows];
}

let driver: SeededDriver;

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  await installCrudCapture();
  driver = await seedDriver("a");
  scopeFor(driver);
});

afterEach(async () => {
  clearDriverScope();
  await sql`delete from ps_crud`.execute(mockDb);
});

describe("photo upload status writes (§3 bookkeeping)", () => {
  it("produces no ps_crud entry for a terminal upload-status write", async () => {
    await seedDamageReportPhoto({
      photoId: "photo-1",
      reportId: "report-1",
      createdByUserUuid: driver.userUuid,
    });
    // Only the write under test may be measured, so the seed's own capture is
    // discarded first.
    await sql`delete from ps_crud`.execute(mockDb);

    const row = await damagePhotos.claimNext("fast", NOW_MS);
    expect(row).not.toBeNull();

    // The real terminal transition the queue applies on success (§3/§10).
    await damagePhotos.persist(
      applyUploadEvent(row!, "upload_confirmed", NOW_ISO),
    );

    // The upload queue's own bookkeeping is a device-local concern: nothing on
    // the server reads it, and every entry it puts in the outbox delays every
    // real write the driver made behind it.
    expect(await crudEntries()).toEqual([]);
  });
});
