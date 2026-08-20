/**
 * Covers §12 — self-healing rows parked with `MISSING_LOCAL_FILE_ERROR`.
 *
 * The rules encoded here:
 *   - a parked row whose local file is present again is un-parked with no
 *     driver interaction (goal: "if the file is there, it uploads by itself");
 *   - a parked row whose file is genuinely gone stays parked, and costs exactly
 *     one local filesystem check — never a network call;
 *   - a row that is *not* parked is never touched by the sweep, whatever the
 *     filesystem says: only `uploadRow` may move a live row's state;
 *   - a table with nothing parked does no work at all beyond one `countParked`;
 *   - the sweep is bounded per table, so a large backlog can't fan out.
 *
 * `localPhotoExists` is exercised for real (it is a two-line wrapper over
 * `FileSystem.getInfoAsync`); only the filesystem underneath it is mocked, so
 * the deterministic `photo_path` → URI recompute stays part of what's tested.
 */

import * as FileSystem from "expo-file-system/legacy";

import { localUriForPath } from "@/library/photoUploadQueue/runtime/localFile";
import {
  SWEEP_LIMIT_PER_TABLE,
  sweepParkedRows,
} from "@/library/photoUploadQueue/runtime/parkedRowSweep";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
} from "@/library/photoUploadQueue/types";

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  documentDirectory: "file:///container-A/Documents/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

const mockFs = FileSystem as unknown as { getInfoAsync: jest.Mock };

function makeRow(overrides: Partial<PhotoUploadRow> = {}): PhotoUploadRow {
  return {
    id: "photo-1",
    photo_path: "damage-report-uuid/photo-1.jpg",
    upload_status: "failed",
    gallery_asset_id: "asset-1",
    attempts: 3,
    last_attempt_at: "2026-08-01T09:00:00.000Z",
    last_error: MISSING_LOCAL_FILE_ERROR,
    ...overrides,
  };
}

/**
 * In-memory stand-in for a real adapter. `countParked` is derived from the same
 * rows the list returns, exactly as the SQL versions in `tableAdapters.ts` are
 * two views of one table — so the test can't drift into an impossible state
 * where the count and the rows disagree.
 */
function makeFakeAdapter(
  table: PhotoQueueTableAdapter["table"],
  initialRows: PhotoUploadRow[],
) {
  let rows = initialRows.map((row) => ({ ...row }));
  const listUnresolved = jest.fn(async (limit: number) =>
    rows.filter((row) => row.upload_status !== "uploaded").slice(0, limit),
  );
  const persist = jest.fn(async (next: PhotoUploadRow) => {
    rows = rows.map((row) => (row.id === next.id ? { ...next } : row));
  });
  const countParked = jest.fn(
    async () =>
      rows.filter(
        (row) =>
          row.upload_status !== "uploaded" &&
          row.last_error === MISSING_LOCAL_FILE_ERROR,
      ).length,
  );

  const adapter: PhotoQueueTableAdapter & {
    rows: () => PhotoUploadRow[];
    listUnresolved: jest.Mock;
    persist: jest.Mock;
    countParked: jest.Mock;
  } = {
    table,
    bucket: `${table}-bucket`,
    upsert: false,
    rows: () => rows,
    listUnresolved,
    persist,
    countParked,
    claimNext: jest.fn(async () => null),
    countUnresolved: jest.fn(async () => rows.length),
    countActionable: jest.fn(async () => 0),
    // A different sweep's concern (§14) — nothing here is stuck `uploading`.
    listStaleUploading: jest.fn(async () => []),
  };
  return adapter;
}

/** Only the listed bucket paths are "on disk". */
function filesOnDisk(...bucketPaths: string[]): void {
  const uris = new Set(bucketPaths.map(localUriForPath));
  mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
    exists: uris.has(uri),
  }));
}

beforeEach(() => {
  mockFs.getInfoAsync.mockReset();
  filesOnDisk();
});

describe("parked-row sweep (§12)", () => {
  it("un-parks a row whose local file is present again — no driver involved", async () => {
    const row = makeRow({ id: "healed" });
    const adapter = makeFakeAdapter("DamageReportPhotos", [row]);
    filesOnDisk(row.photo_path);

    const result = await sweepParkedRows([adapter]);

    expect(result.healed).toBe(1);
    expect(result.stillParked).toBe(0);
    expect(result.perTable).toEqual([
      { table: "DamageReportPhotos", healed: 1, stillParked: 0 },
    ]);

    const healed = adapter.rows()[0];
    expect(healed.last_error).toBeNull();
    expect(healed.upload_status).toBe("pending");
    // The heal is a correction, not an attempt (§12).
    expect(healed.attempts).toBe(row.attempts);
    expect(healed.last_attempt_at).toBe(row.last_attempt_at);
    // §3 — nothing is deleted, and the local original is never dropped.
    expect(healed.photo_path).toBe(row.photo_path);
    expect(healed.gallery_asset_id).toBe(row.gallery_asset_id);
  });

  it("leaves a genuinely missing row parked, at the cost of one local check", async () => {
    const row = makeRow({ id: "gone" });
    const adapter = makeFakeAdapter("InspectionPhotos", [row]);
    filesOnDisk(); // nothing on disk

    const result = await sweepParkedRows([adapter]);

    expect(result.healed).toBe(0);
    expect(result.stillParked).toBe(1);
    expect(adapter.persist).not.toHaveBeenCalled();
    expect(adapter.rows()[0].last_error).toBe(MISSING_LOCAL_FILE_ERROR);
    expect(mockFs.getInfoAsync).toHaveBeenCalledTimes(1);
  });

  it("never touches a row that is not parked, whatever the filesystem says", async () => {
    const live = makeRow({ id: "live", last_error: "Network request failed" });
    const fresh = makeRow({
      id: "fresh",
      upload_status: "pending",
      attempts: 0,
      last_error: null,
    });
    const parked = makeRow({ id: "parked" });
    const adapter = makeFakeAdapter("DriverDocuments", [live, fresh, parked]);
    // Every file is present — the only thing keeping the live rows out of the
    // sweep is that they were never parked in the first place.
    filesOnDisk(live.photo_path, fresh.photo_path, parked.photo_path);

    const result = await sweepParkedRows([adapter]);

    expect(result.healed).toBe(1);
    expect(adapter.persist).toHaveBeenCalledTimes(1);
    expect(adapter.persist.mock.calls[0][0].id).toBe("parked");
    expect(adapter.rows().find((r) => r.id === "live")?.last_error).toBe(
      "Network request failed",
    );
    expect(adapter.rows().find((r) => r.id === "fresh")?.upload_status).toBe(
      "pending",
    );
  });

  it("does no filesystem work at all when a table has nothing parked", async () => {
    const adapter = makeFakeAdapter("DamageReportPhotos", [
      makeRow({ id: "live", last_error: null, upload_status: "pending" }),
    ]);

    const result = await sweepParkedRows([adapter]);

    expect(adapter.countParked).toHaveBeenCalledTimes(1);
    expect(adapter.listUnresolved).not.toHaveBeenCalled();
    expect(mockFs.getInfoAsync).not.toHaveBeenCalled();
    expect(result).toEqual({ healed: 0, stillParked: 0, perTable: [] });
  });

  it("stays bounded per table when the parked backlog is larger than the limit", async () => {
    const backlog = Array.from({ length: SWEEP_LIMIT_PER_TABLE + 25 }, (_, i) =>
      makeRow({ id: `row-${i}`, photo_path: `report/photo-${i}.jpg` }),
    );
    const adapter = makeFakeAdapter("DamageReportPhotos", backlog);
    filesOnDisk(...backlog.map((row) => row.photo_path));

    const result = await sweepParkedRows([adapter]);

    expect(adapter.listUnresolved).toHaveBeenCalledWith(SWEEP_LIMIT_PER_TABLE);
    expect(mockFs.getInfoAsync).toHaveBeenCalledTimes(SWEEP_LIMIT_PER_TABLE);
    expect(result.healed).toBe(SWEEP_LIMIT_PER_TABLE);
    // The remainder is not lost — it is picked up by the next pass, which the
    // indefinite reschedule (§12) guarantees will come.
    expect(await adapter.countParked()).toBe(25);
  });

  it("sweeps every photo table in one go", async () => {
    const damage = makeRow({ id: "d", photo_path: "d/1.jpg" });
    const inspection = makeRow({ id: "i", photo_path: "i/1.jpg" });
    const document = makeRow({ id: "doc", photo_path: "doc/1.jpg" });
    const adapters = [
      makeFakeAdapter("DamageReportPhotos", [damage]),
      makeFakeAdapter("InspectionPhotos", [inspection]),
      makeFakeAdapter("DriverDocuments", [document]),
    ];
    filesOnDisk(damage.photo_path, document.photo_path); // inspection still gone

    const result = await sweepParkedRows(adapters);

    expect(result).toEqual({
      healed: 2,
      stillParked: 1,
      perTable: [
        { table: "DamageReportPhotos", healed: 1, stillParked: 0 },
        { table: "InspectionPhotos", healed: 0, stillParked: 1 },
        { table: "DriverDocuments", healed: 1, stillParked: 0 },
      ],
    });
  });

  it("keeps a row parked, and keeps going, when the DB or filesystem fails", async () => {
    const broken = makeFakeAdapter("DamageReportPhotos", [makeRow({ id: "a" })]);
    broken.persist.mockRejectedValue(new Error("db is busy"));
    const healthyRow = makeRow({ id: "b", photo_path: "other/1.jpg" });
    const healthy = makeFakeAdapter("DriverDocuments", [healthyRow]);
    filesOnDisk("damage-report-uuid/photo-1.jpg", healthyRow.photo_path);

    const result = await sweepParkedRows([broken, healthy]);

    // The failed write leaves its row parked for the next pass, and does not
    // stop the other table from being healed.
    expect(result.healed).toBe(1);
    expect(result.stillParked).toBe(1);
    expect(broken.rows()[0].last_error).toBe(MISSING_LOCAL_FILE_ERROR);
    expect(healthy.rows()[0].last_error).toBeNull();
  });
});
