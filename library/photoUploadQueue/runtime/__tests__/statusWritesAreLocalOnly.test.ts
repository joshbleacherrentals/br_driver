/**
 * LOCKED CONTRACT — DO NOT MODIFY THIS TEST FILE.
 *
 * ─── REVISED ONCE, DELIBERATELY, WITH HUMAN APPROVAL (2026-08-20) ───────────
 * This file originally locked a stricter contract: *no* write to any §3
 * bookkeeping field — the terminal `uploaded` transition included — may ever
 * produce a `ps_crud` entry. Moving every one of those columns to the
 * local-only `PhotoUploadStatus` table satisfied it, and that part stands.
 *
 * But going fully local-only removed something real. A `DamageReportPhotos`
 * row syncs to Postgres the moment the photo is saved, long before its file
 * finishes uploading, so "the row exists on the server" has never meant "the
 * photo is in the bucket". `upload_status` was the only server-visible signal
 * of true completion — the thing a human queries in Postgres to confirm a
 * report's photos landed, and the input the upcoming `DamageReports.isReady`
 * gate needs. Nothing else on the server can reconstruct it.
 *
 * So the contract locked here is now the approved HYBRID, and it is narrower
 * than either extreme:
 *
 *   - `attempts` / `last_attempt_at` / `last_error` / `gallery_asset_id`
 *     remain fully local-only. Every retry, every failure, every intermediate
 *     state costs ZERO `ps_crud` entries. This is the half that fixed the
 *     stall, and it must never regress.
 *   - the terminal `uploaded` confirmation — and *only* that — is mirrored
 *     once onto the synced photo row: one entry, one column, one value.
 *
 * Both halves are asserted below. This file is locked as-is from this point
 * forward: if you are an agent and believe it is wrong, STOP and ask the user.
 *
 * Seam under test: `tableAdapters.ts`'s `persist()` — exactly which of a
 * photo's upload-bookkeeping writes enter PowerSync's `ps_crud` outbox.
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
 * and no `ps_crud` entry at all — that difference IS what the split under test
 * relies on. So the harness models exactly that: `DamageReportPhotos` (synced)
 * captures, and `PhotoUploadStatus` does not, because nothing installs a
 * trigger on it.
 *
 * The UPDATE trigger records the new `upload_status`, so the terminal case can
 * assert not just that one entry appeared but that it carries the one value the
 * server is meant to learn.
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
      values (1, json_object('op', 'PATCH', 'type', 'DamageReportPhotos', 'id', NEW.id, 'upload_status', NEW.upload_status));
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

/** Everything the synced photo row carries, to prove what a write did NOT touch. */
async function syncedPhotoRow(photoId: string) {
  return mockDb
    .selectFrom("DamageReportPhotos")
    .select([
      "id",
      "damage_report_uuid",
      "photo_path",
      "thumbnail",
      "created_at",
      "upload_status",
    ])
    .where("id", "=", photoId)
    .executeTakeFirstOrThrow();
}

/** The device-local bookkeeping, which stays the queue's own source of truth. */
async function localStatusRow(photoId: string) {
  return mockDb
    .selectFrom("PhotoUploadStatus")
    .select(["upload_status", "attempts", "last_attempt_at", "last_error"])
    .where("id", "=", photoId)
    .executeTakeFirst();
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

/** Seeds one claimable photo and discards the seed's own CRUD capture. */
async function seedClaimablePhoto(photoId: string): Promise<void> {
  await seedDamageReportPhoto({
    photoId,
    reportId: "report-1",
    createdByUserUuid: driver.userUuid,
  });
  // Only the write under test may be measured.
  await sql`delete from ps_crud`.execute(mockDb);
}

describe("photo upload status writes (§3 bookkeeping)", () => {
  it("produces no ps_crud entry for a failed attempt's bookkeeping", async () => {
    await seedClaimablePhoto("photo-1");

    const row = await damagePhotos.claimNext("fast", NOW_MS);
    expect(row).not.toBeNull();

    await damagePhotos.persist(
      applyUploadEvent(row!, "attempt_failed", NOW_ISO, "network down"),
    );

    // `attempts`, `last_attempt_at` and `last_error` are pure device
    // bookkeeping: nothing on the server reads them, and every entry they put
    // in the outbox delays every real write the driver made behind it. This is
    // the churn — one write per photo per attempt — that must never sync.
    expect(await crudEntries()).toEqual([]);

    // It did land locally, and the synced row was not touched at all.
    expect(await localStatusRow("photo-1")).toMatchObject({
      upload_status: "failed",
      attempts: 1,
      last_error: "network down",
    });
    expect(await syncedPhotoRow("photo-1")).toMatchObject({
      upload_status: null,
    });
  });

  it("produces no ps_crud entry for an inconclusive or re-queued attempt", async () => {
    await seedClaimablePhoto("photo-1");

    const row = await damagePhotos.claimNext("fast", NOW_MS);
    expect(row).not.toBeNull();

    await damagePhotos.persist(
      applyUploadEvent(row!, "attempt_inconclusive", NOW_ISO),
    );
    await damagePhotos.persist(
      applyUploadEvent(row!, "retry_requested", NOW_ISO),
    );

    expect(await crudEntries()).toEqual([]);
  });

  it("mirrors the terminal confirmation as exactly one upload_status write", async () => {
    await seedClaimablePhoto("photo-1");
    const before = await syncedPhotoRow("photo-1");

    const row = await damagePhotos.claimNext("fast", NOW_MS);
    expect(row).not.toBeNull();

    // The real terminal transition the queue applies on success (§3/§10).
    await damagePhotos.persist(
      applyUploadEvent(row!, "upload_confirmed", NOW_ISO),
    );

    // A photo row syncs the moment it is saved, well before its file finishes
    // uploading, so completion is the one fact about an upload the server
    // cannot infer for itself. It costs exactly one entry, once per photo.
    const entries = await crudEntries();
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].data)).toEqual({
      op: "PATCH",
      type: "DamageReportPhotos",
      id: "photo-1",
      upload_status: "uploaded",
    });

    // Only `upload_status` changed — not the attempt counters, which have no
    // synced column at all, and not the photo's identity or path. The table has
    // no `updated_at`, so there is no bookkeeping column to carry either.
    const after = await syncedPhotoRow("photo-1");
    expect(after).toEqual({ ...before, upload_status: "uploaded" });

    // And the mirror is one-way: the queue's own record of the attempt still
    // lives entirely in the local-only table.
    expect(await localStatusRow("photo-1")).toMatchObject({
      upload_status: "uploaded",
      last_attempt_at: NOW_ISO,
      last_error: null,
    });
  });

  it("does not re-write upload_status when a confirmation repeats", async () => {
    await seedClaimablePhoto("photo-1");

    const row = await damagePhotos.claimNext("fast", NOW_MS);
    expect(row).not.toBeNull();

    const confirmed = applyUploadEvent(row!, "upload_confirmed", NOW_ISO);
    await damagePhotos.persist(confirmed);
    await sql`delete from ps_crud`.execute(mockDb);

    // A terminal persist can legitimately run again — a duplicate confirmation
    // from the §5.1 verification pass, or a re-attempt after a terminal write
    // that could not be recorded. "Once per photo" has to survive that.
    await damagePhotos.persist(confirmed);

    expect(await crudEntries()).toEqual([]);
    expect(await syncedPhotoRow("photo-1")).toMatchObject({
      upload_status: "uploaded",
    });
  });
});
