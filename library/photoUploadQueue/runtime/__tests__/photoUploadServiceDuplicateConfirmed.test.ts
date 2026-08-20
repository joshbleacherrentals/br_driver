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
 * Seam under test: `createPhotoUploadService` — the terminal write chosen when
 * an upload outcome is `duplicate` AND the bucket-presence lookup answers
 * `present`.
 * Currently: GREEN — and that is the whole point. This is the regression guard
 * on the happy path that the claim-race / tri-state `BucketPresence` fix had to
 * leave intact.
 *
 * WHY IT IS A SEPARATE FILE
 * Its sibling `photoUploadServicePostmortem.test.ts` pins the two *broken*
 * cases: the double-claim race, and `duplicate` + `unknown` (which must record
 * nothing). Introducing tri-state presence handling to satisfy the second of
 * those is exactly the kind of change that can silently demote the third
 * combination — `duplicate` + `present` — from "confirmed" to "inconclusive" or
 * "failed". A row whose bytes are demonstrably in the bucket must reach
 * `uploaded`: it is the only outcome that stops the retry, clears the §6 banner
 * and lets `countUnresolved` fall to zero. Losing it would leave every
 * successfully-recovered duplicate cycling forever with the driver looking at a
 * red banner about a photo that is safely stored.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system/legacy";

import {
  isDueForFastRetry,
  isDueForRetry,
} from "@/library/photoUploadQueue/backoff";
import { localUriForPath } from "@/library/photoUploadQueue/runtime/localFile";
import { isNetworkAvailable } from "@/library/photoUploadQueue/runtime/networkState";
import { createPhotoUploadService } from "@/library/photoUploadQueue/runtime/photoUploadService";
import { PHOTO_QUEUE_ADAPTERS } from "@/library/photoUploadQueue/runtime/tableAdapters";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
} from "@/library/photoUploadQueue/types";
import {
  clearDriverScope,
  publishDriverScope,
} from "@/library/powersync/scoping/driverScope";

// Same boundary the sibling suites replace: the service only ever reaches a
// table through `PHOTO_QUEUE_ADAPTERS`, so an empty, test-controlled array runs
// the real `uploadRow`, worker and success logic against in-memory rows.
jest.mock("@/library/photoUploadQueue/runtime/tableAdapters", () => ({
  __esModule: true,
  MISSING_LOCAL_FILE_ERROR: "LOCAL_FILE_MISSING",
  PHOTO_QUEUE_ADAPTERS: [],
}));

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  documentDirectory: "file:///container-A/Documents/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

const mockReadBytes = jest.fn(async (_uri: string) => new Uint8Array([1, 2, 3]));

jest.mock("expo-file-system", () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((uri: string) => ({
    bytes: () => mockReadBytes(uri),
  })),
}));

jest.mock("@/library/photoUploadQueue/runtime/networkState", () => ({
  __esModule: true,
  isNetworkAvailable: jest.fn(async () => true),
  subscribeNetworkAvailability: jest.fn(() => () => {}),
}));

const mockFs = FileSystem as unknown as {
  documentDirectory: string;
  getInfoAsync: jest.Mock;
};

const mockIsNetworkAvailable = isNetworkAvailable as jest.MockedFunction<
  typeof isNetworkAvailable
>;

/** Same array reference the mocked module exports — mutated per test. */
const adapters = PHOTO_QUEUE_ADAPTERS as unknown as PhotoQueueTableAdapter[];

const SIGNED_IN_DRIVER = { userUuid: "user-1", driverUuid: "driver-1" };

/** `DamageReportPhotos` metadata, copied verbatim from `tableAdapters.ts`. */
const DAMAGE = {
  table: "DamageReportPhotos",
  bucket: "damage-report-photos",
  upsert: false,
} as const satisfies Pick<
  PhotoQueueTableAdapter,
  "table" | "bucket" | "upsert"
>;

const UNRESOLVED_STATUSES: PhotoUploadRow["upload_status"][] = [
  "pending",
  "failed",
];

const isUnresolved = (row: PhotoUploadRow): boolean =>
  UNRESOLVED_STATUSES.includes(row.upload_status);

const isClaimable = (row: PhotoUploadRow): boolean =>
  isUnresolved(row) && row.last_error !== MISSING_LOCAL_FILE_ERROR;

function makeRow(id: string): PhotoUploadRow {
  return {
    id,
    photo_path: `${DAMAGE.table}/${id}.jpg`,
    upload_status: "pending",
    gallery_asset_id: "asset-1",
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
  };
}

/**
 * A fake Supabase Storage bucket that behaves like the real insert-only one:
 * a second write to an occupied path is rejected with the "already exists"
 * error, and `list` answers truthfully about what the bucket holds.
 */
function makeBucketClient(): {
  client: SupabaseClient;
  upload: jest.Mock;
  list: jest.Mock;
  seed: (path: string) => void;
} {
  const objects = new Set<string>();

  const upload = jest.fn(
    async (path: string, _data: ArrayBuffer, opts?: { upsert?: boolean }) => {
      if (objects.has(path) && opts?.upsert !== true) {
        return { data: null, error: new Error("The resource already exists") };
      }
      objects.add(path);
      return { data: { path }, error: null };
    },
  );

  const list = jest.fn(async (prefix: string, params?: { search?: string }) => {
    const name = params?.search ?? "";
    const full = prefix ? `${prefix}/${name}` : name;
    return { data: objects.has(full) ? [{ name }] : [], error: null };
  });

  return {
    upload,
    list,
    seed: (path) => objects.add(path),
    client: {
      storage: { from: () => ({ upload, list }) },
    } as unknown as SupabaseClient,
  };
}

/** An immediately-consistent in-memory table — no read lag is under test here. */
function makeAdapter(
  initialRows: PhotoUploadRow[],
): PhotoQueueTableAdapter & { rows: () => PhotoUploadRow[] } {
  let live = initialRows.map((row) => ({ ...row }));
  /** Bounded so a regression fails an assertion instead of hanging Jest. */
  let claimsLeft = 8;

  return {
    ...DAMAGE,
    rows: () => live.map((row) => ({ ...row })),
    async claimNext(mode, nowMs, isReserved) {
      if (claimsLeft <= 0) return null;
      claimsLeft -= 1;

      const row = live
        .filter(
          (candidate) => isClaimable(candidate) && !isReserved?.(candidate.id),
        )
        .find((candidate) =>
          mode === "fast"
            ? isDueForFastRetry(candidate, nowMs)
            : isDueForRetry(candidate, nowMs),
        );
      return row ? { ...row } : null;
    },
    async persist(next) {
      live = live.map((row) => (row.id === next.id ? { ...next } : row));
    },
    async countUnresolved() {
      return live.filter(isUnresolved).length;
    },
    async countActionable() {
      return live.filter(isClaimable).length;
    },
    async countParked() {
      return live.filter(
        (row) => isUnresolved(row) && row.last_error === MISSING_LOCAL_FILE_ERROR,
      ).length;
    },
    async listUnresolved(limit) {
      return live
        .filter(isUnresolved)
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async listStaleUploading(beforeIso, limit) {
      return live
        .filter(
          (row) =>
            row.upload_status === "uploading" &&
            (row.last_attempt_at === null || row.last_attempt_at < beforeIso),
        )
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  adapters.length = 0;
  mockFs.documentDirectory = "file:///container-A/Documents/";
  mockFs.getInfoAsync.mockReset();
  mockFs.getInfoAsync.mockImplementation(async () => ({ exists: true }));
  mockReadBytes.mockClear();
  mockIsNetworkAvailable.mockResolvedValue(true);
  publishDriverScope(SIGNED_IN_DRIVER.userUuid, SIGNED_IN_DRIVER.driverUuid);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  clearDriverScope();
});

describe("ambiguous outcome with an answerable bucket lookup (§5.1/§9)", () => {
  it("marks the row uploaded when a duplicate signal meets a confirmed-present bucket lookup", async () => {
    const row = makeRow("recovered-row");
    mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === localUriForPath(row.photo_path),
    }));

    const adapter = makeAdapter([row]);
    adapters.push(adapter);

    // An earlier attempt already put the object there, so this attempt's
    // insert-only upload comes back `duplicate`...
    const bucket = makeBucketClient();
    bucket.seed(row.photo_path);

    const service = createPhotoUploadService(bucket.client);
    await service.triggerFast();

    // ...and the verifying lookup CAN answer: the bytes are in the bucket.
    expect(bucket.list).toHaveBeenCalled();

    const after = adapter.rows()[0];
    // `present` is explicit evidence of success (§9), so this is a confirmed
    // upload — not "inconclusive", and certainly not a failed attempt.
    expect(after.upload_status).toBe("uploaded");
    expect(after.last_error).toBeNull();

    // And the queue is genuinely done with it: nothing left to retry, nothing
    // left to banner.
    await expect(service.countUnresolved()).resolves.toBe(0);
  });
});
