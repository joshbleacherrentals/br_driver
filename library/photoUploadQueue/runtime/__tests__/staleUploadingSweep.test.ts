/**
 * Covers §14 — reclaiming rows stranded in `upload_status = 'uploading'`.
 *
 * The rules encoded here:
 *   - a row whose attempt is older than the threshold is reclaimed to `failed`
 *     — retryable, countable, and (the whole point) visible to the banner query
 *     that only looks at `pending`/`failed`;
 *   - the reclaim is an `attempt_timed_out`, so it spends an attempt and feeds
 *     backoff, exactly like the real timeout it stands in for, and carries its
 *     own distinct `last_error` so support can tell the two apart;
 *   - a row still inside the threshold is left alone — it is probably just a
 *     slow upload;
 *   - a row this process is actively uploading is NEVER reclaimed, no matter
 *     how stale its timestamp looks. This is where the concurrency work and the
 *     sweep meet: with several lanes in flight, "stale-looking" and "abandoned"
 *     are not the same thing, and only the service knows which is which;
 *   - a null `last_attempt_at` is maximally stale (a row that reached
 *     `uploading` without a timestamp has no attempt left to wait for);
 *   - non-`uploading` rows are none of this sweep's business, whatever their
 *     timestamps say;
 *   - bounded per table, and resilient to one table erroring.
 */

import {
  STALE_SWEEP_LIMIT_PER_TABLE,
  STALE_UPLOADING_ERROR,
  STALE_UPLOADING_THRESHOLD_MS,
  sweepStaleUploadingRows,
} from "@/library/photoUploadQueue/runtime/staleUploadingSweep";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import { UPLOAD_TIMEOUT_MS } from "@/library/photoUploadQueue/uploadTimeout";
import type { PhotoUploadRow } from "@/library/photoUploadQueue/types";

const NOW_MS = Date.parse("2026-08-14T12:00:00.000Z");

/** ISO timestamp `ms` milliseconds before the fixed "now". */
const agoIso = (ms: number): string => new Date(NOW_MS - ms).toISOString();

function makeRow(overrides: Partial<PhotoUploadRow> = {}): PhotoUploadRow {
  return {
    id: "photo-1",
    photo_path: "damage-report-uuid/photo-1.jpg",
    upload_status: "uploading",
    gallery_asset_id: "asset-1",
    attempts: 2,
    last_attempt_at: agoIso(STALE_UPLOADING_THRESHOLD_MS + 60_000),
    last_error: null,
    ...overrides,
  };
}

/**
 * In-memory stand-in for a real adapter. `listStaleUploading` applies the same
 * predicate the SQL does (`uploading` AND (`last_attempt_at` IS NULL OR older
 * than the bound), oldest first, LIMITed), so the test can't drift into an
 * impossible state where the query and the rows disagree.
 */
function makeFakeAdapter(
  table: PhotoQueueTableAdapter["table"],
  initialRows: PhotoUploadRow[],
) {
  let rows = initialRows.map((row) => ({ ...row }));

  const listStaleUploading = jest.fn(
    async (beforeIso: string, limit: number) =>
      rows
        .filter(
          (row) =>
            row.upload_status === "uploading" &&
            (row.last_attempt_at === null || row.last_attempt_at < beforeIso),
        )
        .sort((a, b) => (a.last_attempt_at ?? "") .localeCompare(b.last_attempt_at ?? ""))
        .slice(0, limit)
        .map((row) => ({ ...row })),
  );
  const persist = jest.fn(async (next: PhotoUploadRow) => {
    rows = rows.map((row) => (row.id === next.id ? { ...next } : row));
  });

  const adapter: PhotoQueueTableAdapter & {
    rows: () => PhotoUploadRow[];
    listStaleUploading: jest.Mock;
    persist: jest.Mock;
  } = {
    table,
    bucket: `${table}-bucket`,
    upsert: false,
    rows: () => rows,
    listStaleUploading,
    persist,
    claimNext: jest.fn(async () => null),
    countUnresolved: jest.fn(async () => rows.length),
    countActionable: jest.fn(async () => 0),
    countParked: jest.fn(async () => 0),
    listUnresolved: jest.fn(async () => []),
  };
  return adapter;
}

describe("stale-uploading sweep (§14)", () => {
  it("reclaims a row whose attempt is long past the threshold", async () => {
    const row = makeRow({ id: "stranded" });
    const adapter = makeFakeAdapter("DamageReportPhotos", [row]);

    const result = await sweepStaleUploadingRows([adapter], { nowMs: NOW_MS });

    expect(result.reclaimed).toBe(1);
    expect(result.skippedInFlight).toBe(0);
    expect(result.perTable).toEqual([
      { table: "DamageReportPhotos", reclaimed: 1, skippedInFlight: 0 },
    ]);

    const reclaimed = adapter.rows()[0];
    // `failed` is what makes it claimable AND banner-visible again — the two
    // things `uploading` silently denied it.
    expect(reclaimed.upload_status).toBe("failed");
    // Reused `attempt_timed_out`: a real attempt happened, outcome unknown.
    expect(reclaimed.attempts).toBe(row.attempts + 1);
    expect(reclaimed.last_error).toBe(STALE_UPLOADING_ERROR);
    expect(reclaimed.last_error).not.toBe(row.last_error);
    expect(reclaimed.last_attempt_at).toBe(new Date(NOW_MS).toISOString());
    // §3 — nothing is deleted, and the local original is never dropped.
    expect(reclaimed.id).toBe(row.id);
    expect(reclaimed.photo_path).toBe(row.photo_path);
    expect(reclaimed.gallery_asset_id).toBe(row.gallery_asset_id);
  });

  it("leaves a row alone while it is still inside the threshold", async () => {
    // One timeout budget in — a slow upload, not an abandoned one.
    const row = makeRow({
      id: "still-going",
      last_attempt_at: agoIso(UPLOAD_TIMEOUT_MS),
    });
    const adapter = makeFakeAdapter("InspectionPhotos", [row]);

    const result = await sweepStaleUploadingRows([adapter], { nowMs: NOW_MS });

    expect(result).toEqual({ reclaimed: 0, skippedInFlight: 0, perTable: [] });
    expect(adapter.persist).not.toHaveBeenCalled();
    expect(adapter.rows()[0].upload_status).toBe("uploading");
  });

  // Where §14 and the bounded-concurrency work meet. With several lanes in
  // flight, a stale-looking timestamp is not proof of abandonment — only the
  // service knows which rows it is actually holding.
  it("never reclaims a row the service reports in flight, however stale it looks", async () => {
    const live = makeRow({
      id: "live",
      // Deliberately ancient: nothing about the timing may override this.
      last_attempt_at: agoIso(STALE_UPLOADING_THRESHOLD_MS * 100),
    });
    const abandoned = makeRow({ id: "abandoned", photo_path: "r/2.jpg" });
    const adapter = makeFakeAdapter("DamageReportPhotos", [live, abandoned]);

    const result = await sweepStaleUploadingRows([adapter], {
      nowMs: NOW_MS,
      isInFlight: (table, rowId) =>
        table === "DamageReportPhotos" && rowId === "live",
    });

    expect(result.reclaimed).toBe(1);
    expect(result.skippedInFlight).toBe(1);
    expect(adapter.persist).toHaveBeenCalledTimes(1);
    expect(adapter.persist.mock.calls[0][0].id).toBe("abandoned");
    // Untouched — the lane uploading it still owns its bookkeeping.
    const untouched = adapter.rows().find((r) => r.id === "live")!;
    expect(untouched.upload_status).toBe("uploading");
    expect(untouched.attempts).toBe(live.attempts);
    expect(untouched.last_error).toBeNull();
  });

  it("treats a missing last_attempt_at as maximally stale", async () => {
    const row = makeRow({ id: "no-timestamp", last_attempt_at: null });
    const adapter = makeFakeAdapter("DriverDocuments", [row]);

    const result = await sweepStaleUploadingRows([adapter], { nowMs: NOW_MS });

    expect(result.reclaimed).toBe(1);
    expect(adapter.rows()[0].upload_status).toBe("failed");
    expect(adapter.rows()[0].last_error).toBe(STALE_UPLOADING_ERROR);
  });

  it("never touches a row that is not `uploading`", async () => {
    const ancient = agoIso(STALE_UPLOADING_THRESHOLD_MS * 10);
    const rows: PhotoUploadRow[] = [
      makeRow({ id: "pending", upload_status: "pending", last_attempt_at: ancient }),
      makeRow({ id: "failed", upload_status: "failed", last_attempt_at: ancient }),
      makeRow({ id: "uploaded", upload_status: "uploaded", last_attempt_at: ancient }),
    ];
    const adapter = makeFakeAdapter("DamageReportPhotos", rows);

    const result = await sweepStaleUploadingRows([adapter], { nowMs: NOW_MS });

    expect(result).toEqual({ reclaimed: 0, skippedInFlight: 0, perTable: [] });
    expect(adapter.persist).not.toHaveBeenCalled();
    expect(adapter.rows().map((r) => r.upload_status)).toEqual([
      "pending",
      "failed",
      "uploaded",
    ]);
  });

  it("stays bounded per table when the backlog is larger than the limit", async () => {
    const backlog = Array.from(
      { length: STALE_SWEEP_LIMIT_PER_TABLE + 25 },
      (_, i) => makeRow({ id: `row-${i}`, photo_path: `report/photo-${i}.jpg` }),
    );
    const adapter = makeFakeAdapter("DamageReportPhotos", backlog);

    const result = await sweepStaleUploadingRows([adapter], { nowMs: NOW_MS });

    expect(adapter.listStaleUploading).toHaveBeenCalledWith(
      expect.any(String),
      STALE_SWEEP_LIMIT_PER_TABLE,
    );
    expect(result.reclaimed).toBe(STALE_SWEEP_LIMIT_PER_TABLE);
    // The rest is not lost — the next pass picks it up.
    expect(
      adapter.rows().filter((r) => r.upload_status === "uploading"),
    ).toHaveLength(25);
  });

  it("skips a table that cannot be read, and keeps sweeping the rest", async () => {
    const broken = makeFakeAdapter("DamageReportPhotos", [makeRow({ id: "a" })]);
    broken.listStaleUploading.mockRejectedValue(new Error("db is busy"));
    const healthy = makeFakeAdapter("DriverDocuments", [
      makeRow({ id: "b", photo_path: "other/1.jpg" }),
    ]);

    const result = await sweepStaleUploadingRows([broken, healthy], {
      nowMs: NOW_MS,
    });

    expect(result.reclaimed).toBe(1);
    expect(result.perTable).toEqual([
      { table: "DriverDocuments", reclaimed: 1, skippedInFlight: 0 },
    ]);
    expect(broken.rows()[0].upload_status).toBe("uploading");
    expect(healthy.rows()[0].upload_status).toBe("failed");
  });

  it("leaves a row `uploading` when the reclaim write itself fails, and carries on", async () => {
    jest.useFakeTimers();
    try {
      const broken = makeFakeAdapter("DamageReportPhotos", [makeRow({ id: "a" })]);
      broken.persist.mockRejectedValue(new Error("db is busy"));
      const healthy = makeFakeAdapter("DriverDocuments", [
        makeRow({ id: "b", photo_path: "other/1.jpg" }),
      ]);

      const sweeping = sweepStaleUploadingRows([broken, healthy], {
        nowMs: NOW_MS,
      });
      // `persistWithRetry` pauses between its attempts.
      await jest.advanceTimersByTimeAsync(5_000);
      const result = await sweeping;

      expect(result.reclaimed).toBe(1);
      expect(broken.rows()[0].upload_status).toBe("uploading");
      expect(healthy.rows()[0].upload_status).toBe("failed");
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("sweeps every photo table in one go", async () => {
    const adapters = [
      makeFakeAdapter("DamageReportPhotos", [makeRow({ id: "d" })]),
      makeFakeAdapter("InspectionPhotos", [
        makeRow({ id: "i", last_attempt_at: agoIso(UPLOAD_TIMEOUT_MS) }),
      ]),
      makeFakeAdapter("DriverDocuments", [makeRow({ id: "doc" })]),
    ];

    const result = await sweepStaleUploadingRows(adapters, { nowMs: NOW_MS });

    expect(result).toEqual({
      reclaimed: 2,
      skippedInFlight: 0,
      perTable: [
        { table: "DamageReportPhotos", reclaimed: 1, skippedInFlight: 0 },
        { table: "DriverDocuments", reclaimed: 1, skippedInFlight: 0 },
      ],
    });
  });

  it("uses three upload deadlines as its staleness threshold", async () => {
    // Pinned deliberately: one deadline would race the very attempt the sweep
    // is meant to protect; much more would leave a stuck photo invisible for
    // longer than a driver's session.
    expect(STALE_UPLOADING_THRESHOLD_MS).toBe(3 * UPLOAD_TIMEOUT_MS);
  });
});
