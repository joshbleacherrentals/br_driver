/**
 * §15 write-side check: can a mutation act on another driver's row if handed
 * that row's id?
 *
 * The design doc is explicit that `tableAdapters.ts`'s `persist()` is
 * deliberately left unscoped, "only ever handed a row that a scoped read
 * already returned" (§15). `applyPhotoRepair.ts`, `replaceDriverDocumentPhoto.ts`
 * and `requeuePhotoRows.ts` follow the identical pattern — a bare
 * `.where("id", "=", id)` with no ownership re-check — for the same stated
 * reason.
 *
 * These tests confirm that premise is mechanically true (no ownership check
 * exists at the write layer at all — these functions will happily mutate any
 * row id they are handed, from any driver), which is *expected*, matching the
 * doc. They exist to make the invariant explicit and regression-proof: the
 * write layer's safety depends entirely on every caller upstream only ever
 * supplying ids from an already-scoped read.
 *
 * That upstream premise now holds, which is what changed. It did not before:
 * `useDamageReportPhotos`/`useInspectionPhotos`/`useDamageReportById` returned
 * rows for ANY report/inspection id, all three feed `usePhotoRepair`'s
 * Retry/Replace, and `DamageReportScreen` takes its id from
 * `useLocalSearchParams()` — so a foreign id was loaded, displayed and, through
 * exactly these mutations, writable. Those reads are scoped now (see
 * `library/powersync/scoping/__tests__/scopedReads.test.ts` and the suites in
 * `hooks/db/__tests__/`), so the ids reaching this layer come from a scoped
 * read again.
 *
 * What this suite pins is that the write layer itself still relies on that and
 * checks nothing of its own. If a future screen reintroduces an unscoped read,
 * these functions will not catch it — that is the cost of the §15 decision, and
 * it should be a deliberate one rather than a discovery.
 */

import { CompiledQuery } from "kysely";

import { applyPhotoRepair } from "@/library/photoUploadQueue/runtime/applyPhotoRepair";
import { replaceDriverDocumentPhoto } from "@/library/photoUploadQueue/runtime/replaceDriverDocumentPhoto";
import { requeuePhotoRows } from "@/library/photoUploadQueue/runtime/requeuePhotoRows";
import {
  clearDriverScope,
  publishDriverScope,
} from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  seedDamageReportPhoto,
  seedDriver,
  type SeededDriver,
} from "./testDb";

jest.mock("@/library/powersync/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mockDb: database } = require("./testDb");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CompiledQuery: CQ } = require("kysely");
  return {
    __esModule: true,
    db: database,
    powerSyncDb: {
      execute: (sql: string, parameters: unknown[]) =>
        database.executeQuery(CQ.raw(sql, parameters)),
      // Good-enough fake transaction for a test DB with no real concurrency:
      // run the callback against a `tx` that executes straight against the
      // same connection. Good enough to prove row-level write behaviour.
      writeTransaction: async (
        cb: (tx: { execute: (sql: string, params: unknown[]) => Promise<unknown> }) => Promise<unknown>,
      ) =>
        cb({
          execute: (sql: string, parameters: unknown[]) =>
            database.executeQuery(CQ.raw(sql, parameters)),
        }),
    },
  };
});

// File I/O — never actually touch the filesystem.
jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  documentDirectory: "file:///tmp/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  readAsStringAsync: jest.fn(async () => "ZmFrZS1iYXNlNjQ="),
  writeAsStringAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => "generated-uuid",
}));

jest.mock("expo-image-manipulator", () => ({
  __esModule: true,
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: jest.fn(async () => ({ base64: "thumb-base64" })),
}));

let driverA: SeededDriver;
let driverB: SeededDriver;

async function statusOf(table: "DamageReportPhotos", id: string) {
  const { rows } = await mockDb.executeQuery(
    CompiledQuery.raw(`SELECT upload_status FROM "${table}" WHERE id = ?`, [id]),
  );
  return (rows[0] as { upload_status: string } | undefined)?.upload_status;
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

describe("requeuePhotoRows — no ownership check at the write layer (§15)", () => {
  it("re-queues another driver's row when handed its id, regardless of the current driver context", async () => {
    await seedDamageReportPhoto({
      photoId: "theirs-failed",
      reportId: "report-theirs",
      createdByUserUuid: driverB.userUuid,
      queue: { upload_status: "failed", attempts: 3, last_error: "boom" },
    });

    // Driver A is signed in...
    publishDriverScope(driverA.userUuid, driverA.driverUuid);

    // ...yet nothing stops a caller from handing this function driver B's row.
    const result = await requeuePhotoRows("DamageReportPhotos", [
      { id: "theirs-failed", bucketPath: "report-theirs/theirs-failed.jpg" },
    ]);

    expect(result).toEqual({ retried: 1, needReAdd: 0 });
    expect(await statusOf("DamageReportPhotos", "theirs-failed")).toBe(
      "pending",
    );
  });
});

describe("applyPhotoRepair — no ownership check at the write layer (§15)", () => {
  it("reuses (rewrites) another driver's row when handed its id", async () => {
    await seedDamageReportPhoto({
      photoId: "theirs-parked",
      reportId: "report-theirs",
      createdByUserUuid: driverB.userUuid,
      queue: {
        upload_status: "failed",
        attempts: 5,
        last_error: "LOCAL_FILE_MISSING",
      },
    });

    publishDriverScope(driverA.userUuid, driverA.driverUuid);

    const result = await applyPhotoRepair({
      parent: { table: "DamageReportPhotos", damageReportUuid: "report-theirs" },
      plan: {
        reuse: [{ rowId: "theirs-parked", pickedIndex: 0 }],
        deletions: [],
        extras: [],
        resultingPhotoCount: 1,
        violatesMinimum: false,
      },
      rowsById: new Map([
        [
          "theirs-parked",
          { id: "theirs-parked", bucketPath: "report-theirs/theirs-parked.jpg" },
        ],
      ]),
      picked: [
        {
          uri: "file:///tmp/new-photo.jpg",
          ext: "jpg",
          source: "library",
        } as never,
      ],
    });

    expect(result.replaced).toBe(1);
    // The row was reset to `pending` — driver A's session just rewrote a photo
    // that belongs to driver B's damage report.
    expect(await statusOf("DamageReportPhotos", "theirs-parked")).toBe(
      "pending",
    );
  });
});

describe("replaceDriverDocumentPhoto — no ownership check at the write layer (§15, by design)", () => {
  it("writes to whatever DriverDocuments row id it is given", async () => {
    await mockDb.schema
      .createTable("DriverDocuments")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("driver_uuid", "text")
      .addColumn("doc_type", "text")
      .addColumn("photo_path", "text")
      .addColumn("upload_status", "text")
      .addColumn("attempts", "integer")
      .addColumn("last_attempt_at", "text")
      .addColumn("last_error", "text")
      .execute();
    // `replaceDriverDocumentPhoto` also mirrors the path onto `Drivers`; the
    // shared test schema doesn't carry that column, so add it here.
    await mockDb.schema
      .alterTable("Drivers")
      .addColumn("license_photo_path", "text")
      .execute();

    await mockDb
      .insertInto("DriverDocuments")
      .values({
        id: "doc-theirs",
        driver_uuid: driverB.driverUuid,
        doc_type: "license",
        photo_path: "old/path.jpg",
        upload_status: "uploaded",
        attempts: 0,
      })
      .execute();

    publishDriverScope(driverA.userUuid, driverA.driverUuid);

    // Driver A's session, but the call is made with driver B's row id and
    // driver B's driverUuid (e.g. a stale prop, a copy-paste bug upstream).
    await replaceDriverDocumentPhoto({
      rowId: "doc-theirs",
      driverUuid: driverB.driverUuid,
      docType: "license",
      picked: { uri: "file:///tmp/new-doc.jpg", ext: "jpg", source: "library" } as never,
    });

    const { rows } = await mockDb.executeQuery(
      CompiledQuery.raw(
        `SELECT photo_path, upload_status FROM "DriverDocuments" WHERE id = ?`,
        ["doc-theirs"],
      ),
    );
    expect((rows[0] as { upload_status: string }).upload_status).toBe(
      "pending",
    );

    await mockDb.schema.dropTable("DriverDocuments").execute();
  });
});
