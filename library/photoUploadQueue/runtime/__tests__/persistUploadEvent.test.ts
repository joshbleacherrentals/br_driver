/**
 * Covers §14 — layer two of the persist defence: the guaranteed-`failed`
 * fallback.
 *
 * The rules encoded here:
 *   - the happy path is just "apply the event and write it";
 *   - a transient write failure is absorbed by `persistWithRetry` and the
 *     intended event still lands, unchanged;
 *   - when the retries are exhausted AND the caller asked for the guarantee,
 *     the row is forced to `failed` with `PERSIST_FALLBACK_ERROR` — because a
 *     lost attempt result is an attempt that never happened as far as backoff
 *     and the driver-facing banner are concerned, whereas `failed` is retryable
 *     and visible;
 *   - a caller that did NOT ask for the guarantee gets the error rethrown and
 *     no fallback write at all;
 *   - if even the fallback write fails, this resolves `false` anyway (never
 *     throws) and logs at `error` — throwing would only cost the lane its
 *     remaining work, and `false` is what tells the caller to hold its claim.
 *
 * `applyUploadEvent` is exercised for real; only the adapter is faked.
 */

import {
  PERSIST_FALLBACK_ERROR,
  persistUploadEvent,
} from "@/library/photoUploadQueue/runtime/persistUploadEvent";
import { PERSIST_RETRY_ATTEMPTS } from "@/library/photoUploadQueue/runtime/persistWithRetry";
import { photoQueueLog } from "@/library/photoUploadQueue/runtime/photoQueueLog";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import type { PhotoUploadRow } from "@/library/photoUploadQueue/types";

const NOW_ISO = "2026-08-14T12:00:00.000Z";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** A row mid-attempt — the only state the guaranteed fallback exists for. */
function uploadingRow(overrides: Partial<PhotoUploadRow> = {}): PhotoUploadRow {
  return {
    id: "photo-1",
    photo_path: "damage-report-uuid/photo-1.jpg",
    upload_status: "uploading",
    gallery_asset_id: "asset-1",
    attempts: 2,
    last_attempt_at: "2026-08-14T11:59:00.000Z",
    last_error: null,
    ...overrides,
  };
}

function makeAdapter(): PhotoQueueTableAdapter & { persist: jest.Mock } {
  const persist = jest.fn(async () => {});
  return {
    table: "DamageReportPhotos",
    bucket: "damage-report-photos",
    upsert: false,
    persist,
    claimNext: jest.fn(async () => null),
    countUnresolved: jest.fn(async () => 0),
    countActionable: jest.fn(async () => 0),
    countParked: jest.fn(async () => 0),
    listUnresolved: jest.fn(async () => []),
    listStaleUploading: jest.fn(async () => []),
  };
}

/**
 * Settles `promise`, letting `persistWithRetry`'s pauses elapse. Forwards the
 * resolved value — `persistUploadEvent` answers whether *some* outcome reached
 * the database, which is what decides whether the caller may release its claim.
 */
async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  await jest.advanceTimersByTimeAsync(5_000);
  const result = await settled;
  if (!result.ok) throw result.error;
  return result.value;
}

describe("persistUploadEvent (§14)", () => {
  it("writes the requested event when the database is healthy", async () => {
    const adapter = makeAdapter();

    await expect(
      persistUploadEvent(
        adapter,
        uploadingRow(),
        "upload_confirmed",
        NOW_ISO,
        undefined,
        { label: "DamageReportPhotos photo-1", guaranteedFailedFallback: true },
      ),
    ).resolves.toBe(true);

    expect(adapter.persist).toHaveBeenCalledTimes(1);
    const written = adapter.persist.mock.calls[0][0] as PhotoUploadRow;
    expect(written.upload_status).toBe("uploaded");
    expect(written.last_error).toBeNull();
  });

  it("absorbs a transient failure and still lands the intended event", async () => {
    const adapter = makeAdapter();
    adapter.persist
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValueOnce(undefined);

    await runWithTimers(
      persistUploadEvent(
        adapter,
        uploadingRow(),
        "upload_confirmed",
        NOW_ISO,
        undefined,
        { label: "DamageReportPhotos photo-1", guaranteedFailedFallback: true },
      ),
    );

    expect(adapter.persist).toHaveBeenCalledTimes(2);
    const written = adapter.persist.mock.calls[1][0] as PhotoUploadRow;
    // The intended outcome, not the fallback — a retry is not a failure.
    expect(written.upload_status).toBe("uploaded");
    expect(written.last_error).toBeNull();
  });

  it("forces the row to failed when the intended write cannot land at all", async () => {
    const adapter = makeAdapter();
    const row = uploadingRow();
    // Every retry of the real event fails; only the fallback write succeeds.
    adapter.persist.mockImplementation(async (next: PhotoUploadRow) => {
      if (next.last_error !== PERSIST_FALLBACK_ERROR) {
        throw new Error("database is locked");
      }
    });

    // `true`: the fallback landed, so *an* outcome is on record and the caller
    // may release its claim.
    await expect(
      runWithTimers(
        persistUploadEvent(adapter, row, "upload_confirmed", NOW_ISO, undefined, {
          label: "DamageReportPhotos photo-1",
          guaranteedFailedFallback: true,
        }),
      ),
    ).resolves.toBe(true);

    // 3 attempts at the real event + 1 fallback write.
    expect(adapter.persist).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS + 1);
    const fallback = adapter.persist.mock.calls.at(-1)![0] as PhotoUploadRow;
    expect(fallback.upload_status).toBe("failed");
    expect(fallback.last_error).toBe(PERSIST_FALLBACK_ERROR);
    // Retryable, countable, banner-visible — and the row itself is untouched.
    expect(fallback.attempts).toBe(row.attempts + 1);
    expect(fallback.id).toBe(row.id);
    expect(fallback.photo_path).toBe(row.photo_path);
    expect(fallback.gallery_asset_id).toBe(row.gallery_asset_id);
  });

  it("rethrows and writes no fallback when the caller did not ask for the guarantee", async () => {
    const adapter = makeAdapter();
    adapter.persist.mockRejectedValue(new Error("database is locked"));

    await expect(
      runWithTimers(
        persistUploadEvent(
          adapter,
          uploadingRow(),
          "attempt_failed",
          NOW_ISO,
          "boom",
          {
            label: "DamageReportPhotos photo-1",
            guaranteedFailedFallback: false,
          },
        ),
      ),
    ).rejects.toThrow("database is locked");

    expect(adapter.persist).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS);
    for (const [written] of adapter.persist.mock.calls) {
      expect((written as PhotoUploadRow).last_error).not.toBe(
        PERSIST_FALLBACK_ERROR,
      );
    }
  });

  it("logs at error and resolves when even the fallback cannot be written", async () => {
    const adapter = makeAdapter();
    adapter.persist.mockRejectedValue(new Error("database is locked"));
    const logError = jest.spyOn(photoQueueLog, "error");

    // Resolving rather than throwing is the contract: the lane keeps its
    // remaining work. Resolving `false` is the other half — that is how the
    // caller learns the row is unchanged in the database and must keep its
    // claim rather than hand it straight back to the next lane.
    await expect(
      runWithTimers(
        persistUploadEvent(
          adapter,
          uploadingRow(),
          "upload_confirmed",
          NOW_ISO,
          undefined,
          {
            label: "DamageReportPhotos photo-1",
            guaranteedFailedFallback: true,
          },
        ),
      ),
    ).resolves.toBe(false);

    expect(adapter.persist).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS + 1);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toContain("fallback ALSO failed");
    expect(logError.mock.calls[0][0]).toContain("holds its claim");
  });
});
