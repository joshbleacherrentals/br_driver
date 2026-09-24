/**
 * docs/specs/sync-bucket-limit.md §4 — every `InspectionPhotos` row this app
 * creates carries the driver who took it.
 *
 * The mobile stream (`sync_version: 2`) buckets inspection photos by
 * `created_by_driver_uuid`, and the upload queue's ownership reads the same
 * column. A row inserted without it would sync to nobody once uploaded, and a
 * pending one would drop out of this driver's queue the moment its trip
 * finished. Postgres fills it for rows older builds insert; this build writes
 * it itself so the row is right from the first local write.
 */

import { CompiledQuery } from "kysely";

import { applyPhotoRepair } from "@/library/photoUploadQueue/runtime/applyPhotoRepair";
import { inspectionPhotoInsert } from "@/library/photoUploadQueue/runtime/inspectionPhotoInsert";
import {
  clearDriverScope,
  publishDriverScope,
} from "@/library/powersync/scoping/driverScope";

import {
  mockDb,
  resetTestDb,
  seedDriver,
  seedInspectionPhoto,
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
      writeTransaction: async (
        cb: (tx: {
          execute: (sql: string, params: unknown[]) => Promise<unknown>;
        }) => Promise<unknown>,
      ) =>
        cb({
          execute: (sql: string, parameters: unknown[]) =>
            database.executeQuery(CQ.raw(sql, parameters)),
        }),
    },
  };
});

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  documentDirectory: "file:///tmp/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  readAsStringAsync: jest.fn(async () => "ZmFrZS1iYXNlNjQ="),
  writeAsStringAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
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

beforeEach(async () => {
  await resetTestDb();
  clearDriverScope();
  driverA = await seedDriver("a");
});

afterEach(() => {
  clearDriverScope();
});

describe("inspectionPhotoInsert — a photo taken during an inspection", () => {
  it("is inserted pending, queued by created_at, carrying the signed-in driver", async () => {
    publishDriverScope(driverA.userUuid, driverA.driverUuid);

    await mockDb.executeQuery(
      inspectionPhotoInsert({
        id: "ip-new",
        inspectionUuid: "inspection-1",
        storagePath: "inspection-1/q1/photo_0.jpg",
        createdAt: "2026-09-18T10:00:00.000Z",
      }),
    );

    const row = await mockDb
      .selectFrom("InspectionPhotos")
      .select([
        "inspection_uuid",
        "storage_path",
        "upload_status",
        "attempts",
        "created_at",
        "created_by_driver_uuid",
      ])
      .where("id", "=", "ip-new")
      .executeTakeFirst();

    expect(row).toEqual({
      inspection_uuid: "inspection-1",
      storage_path: "inspection-1/q1/photo_0.jpg",
      upload_status: "pending",
      attempts: 0,
      created_at: "2026-09-18T10:00:00.000Z",
      created_by_driver_uuid: driverA.driverUuid,
    });
  });
});

describe("applyPhotoRepair — an extra inspection photo", () => {
  it("is inserted carrying the signed-in driver", async () => {
    await seedInspectionPhoto({
      photoId: "ip-missing",
      inspectionId: "inspection-1",
      driverUuid: driverA.driverUuid,
      createdByDriverUuid: driverA.driverUuid,
      queue: {
        upload_status: "failed",
        attempts: 5,
        last_error: "LOCAL_FILE_MISSING",
      },
    });
    // The photo question the repaired photo belongs to — an extra has to join
    // an existing question or it would never render.
    await mockDb.executeQuery(
      CompiledQuery.raw(
        `UPDATE "WorkTrackerInspections" SET answers_json = ? WHERE id = ?`,
        [
          JSON.stringify({
            q1: {
              question_type: "photo",
              photos: [{ storage_path: "inspection-1/ip-missing.jpg" }],
            },
          }),
          "inspection-1",
        ],
      ),
    );

    publishDriverScope(driverA.userUuid, driverA.driverUuid);

    const result = await applyPhotoRepair({
      parent: { table: "InspectionPhotos", inspectionUuid: "inspection-1" },
      plan: {
        reuse: [{ rowId: "ip-missing", pickedIndex: 0 }],
        deletions: [],
        extras: [1],
        resultingPhotoCount: 2,
        violatesMinimum: false,
      },
      rowsById: new Map([
        [
          "ip-missing",
          { id: "ip-missing", bucketPath: "inspection-1/ip-missing.jpg" },
        ],
      ]),
      picked: [
        { uri: "file:///tmp/a.jpg", ext: "jpg", source: "library" } as never,
        { uri: "file:///tmp/b.jpg", ext: "jpg", source: "library" } as never,
      ],
    });

    const inserted = await mockDb
      .selectFrom("InspectionPhotos")
      .select("created_by_driver_uuid")
      .where("id", "=", "generated-uuid")
      .executeTakeFirst();

    expect({
      added: result.added,
      driver: inserted?.created_by_driver_uuid,
    }).toEqual({
      added: 1,
      driver: driverA.driverUuid,
    });
  });
});
