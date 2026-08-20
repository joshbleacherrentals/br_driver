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
 * Seam under test: `createPhotoUploadService` — claim exclusivity across ALL
 * `MAX_CONCURRENT_UPLOADS` lanes when the read connection lags the write
 * connection in *batches* rather than row by row.
 * Currently: expected GREEN — the claim ledger's guarantee is meant to be
 * timing-independent, so widening the lag must not be able to break it. If this
 * file is red, that is a real limit of the shipped claim-race fix and must be
 * reported as such, not tuned away.
 *
 * WHY THIS EXISTS — IT ANTICIPATES THE "2B" CRUD-BATCHING CHANGE
 * The shipped claim-race fix (`photoUploadServicePostmortem.test.ts`, first
 * describe) was built against the lag actually observed on device: a single
 * row's commit staying invisible to the reader for tens to ~130ms, exercised
 * one claim at a time. Batching `BackendConnector`'s CRUD upload into fewer,
 * larger requests changes the *shape* of that lag rather than its existence:
 * writes land and become visible to readers in bursts, so a whole group of rows
 * can stay pre-commit in the read snapshot for a much longer stretch, while
 * `MAX_CONCURRENT_UPLOADS` lanes keep claiming through that stale snapshot in
 * parallel. Any exclusivity mechanism that depended on "the reader catches up
 * within about one claim" would survive the original test and fail here.
 *
 * The ledger is designed not to depend on that at all: it is this process's own
 * record of what it wrote, consulted instead of the read snapshot. This test
 * pins that design property against the harsher timing rather than the observed
 * one, so the 2B work has a standing net under it before it starts. It requires
 * no batching implementation to exist — only the fake adapter's timing.
 *
 * THE ASSERTION IS ABOUT WASTE, NOT CORRECTNESS OF STATE
 * Every row ends up `uploaded` either way; what a double claim costs is a
 * second, wholly redundant upload of the same bytes — the exact field symptom
 * (repeat "The resource already exists" collisions, doubled egress, doubled
 * CRUD) the postmortem chased. So the assertion counts uploads per path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system/legacy";

import {
  isDueForFastRetry,
  isDueForRetry,
} from "@/library/photoUploadQueue/backoff";
import { isNetworkAvailable } from "@/library/photoUploadQueue/runtime/networkState";
import { createPhotoUploadService } from "@/library/photoUploadQueue/runtime/photoUploadService";
import { PHOTO_QUEUE_ADAPTERS } from "@/library/photoUploadQueue/runtime/tableAdapters";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
} from "@/library/photoUploadQueue/types";
import { MAX_CONCURRENT_UPLOADS } from "@/library/photoUploadQueue/worker";
import {
  clearDriverScope,
  publishDriverScope,
} from "@/library/powersync/scoping/driverScope";

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

const adapters = PHOTO_QUEUE_ADAPTERS as unknown as PhotoQueueTableAdapter[];

const SIGNED_IN_DRIVER = { userUuid: "user-1", driverUuid: "driver-1" };

const DAMAGE = {
  table: "DamageReportPhotos",
  bucket: "damage-report-photos",
  upsert: false,
} as const satisfies Pick<
  PhotoQueueTableAdapter,
  "table" | "bucket" | "upsert"
>;

/** Comfortably more rows than lanes, so the pool stays saturated throughout. */
const ROW_COUNT = 12;
/**
 * How many claims are served from one stale read snapshot before the reader
 * catches up. Chosen to exceed `MAX_CONCURRENT_UPLOADS` so that a *whole pool*
 * of lanes can be looking at the same pre-commit snapshot simultaneously —
 * that is the batching-shaped lag this file exists to model, as opposed to the
 * one-row/one-claim lag the original postmortem test used.
 */
const CLAIMS_PER_STALE_WINDOW = 5;

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

/** Yields the microtask queue so the lanes genuinely interleave. */
const yieldToLanes = async (turns = 3): Promise<void> => {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
};

function makeBucketClient(): {
  client: SupabaseClient;
  upload: jest.Mock;
  uploadsOf: (path: string) => number;
} {
  const objects = new Set<string>();

  const upload = jest.fn(
    async (path: string, _data: ArrayBuffer, opts?: { upsert?: boolean }) => {
      // A real network round trip, however fast, always gives the other lanes a
      // chance to run — and it is during that gap that a double claim happens.
      await yieldToLanes();
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
    uploadsOf: (path) =>
      upload.mock.calls.filter((call) => call[0] === path).length,
    client: {
      storage: { from: () => ({ upload, list }) },
    } as unknown as SupabaseClient,
  };
}

/**
 * An in-memory table whose reader lags its writer in BATCHES.
 *
 * `live` is what the write connection has committed. `readView` is what the
 * read connection serves, and it is refreshed only once every
 * {@link CLAIMS_PER_STALE_WINDOW} claims — so a run of consecutive claims,
 * spanning every lane, is answered from a snapshot in which several rows that
 * have already been uploaded and persisted still look untouched and `pending`.
 * That is the shape a batched CRUD flush gives the lag: not "one row is briefly
 * behind" but "a group of commits becomes visible all at once, later".
 */
function makeBatchLaggingAdapter(
  initialRows: PhotoUploadRow[],
): PhotoQueueTableAdapter & { rows: () => PhotoUploadRow[] } {
  let live = initialRows.map((row) => ({ ...row }));
  let readView = live.map((row) => ({ ...row }));
  let claimsSinceFlush = 0;
  /** Bounded so a regression fails an assertion instead of hanging Jest. */
  let claimsLeft = ROW_COUNT * 4;

  return {
    ...DAMAGE,
    rows: () => live.map((row) => ({ ...row })),
    async claimNext(mode, nowMs, isReserved) {
      if (claimsLeft <= 0) return null;
      claimsLeft -= 1;

      if (claimsSinceFlush >= CLAIMS_PER_STALE_WINDOW) {
        // The batch lands: everything committed since the last flush becomes
        // visible to readers at once.
        readView = live.map((row) => ({ ...row }));
        claimsSinceFlush = 0;
      }
      claimsSinceFlush += 1;

      // Reading is asynchronous on a real device, and the await is what lets a
      // second lane enter this same critical section in a broken build.
      await yieldToLanes(1);

      const row = readView
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
      await yieldToLanes(1);
      // Committed — but deliberately NOT published to `readView`; that only
      // happens on the next flush boundary above.
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

describe("claim exclusivity under a batched, long read-after-write lag (§10, pre-2B)", () => {
  it("uploads every one of a pool of concurrently-claimed photos exactly once", async () => {
    // Sanity: the whole premise is that several lanes claim at once. If the
    // pool were ever narrowed to one, this test would silently stop testing
    // anything and would need rewriting rather than quietly passing.
    expect(MAX_CONCURRENT_UPLOADS).toBeGreaterThan(1);
    expect(CLAIMS_PER_STALE_WINDOW).toBeGreaterThan(MAX_CONCURRENT_UPLOADS);

    const rows = Array.from({ length: ROW_COUNT }, (_, index) =>
      makeRow(`batched-row-${String(index).padStart(2, "0")}`),
    );
    const paths = new Set(rows.map((row) => row.photo_path));
    mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: [...paths].some((path) => uri.endsWith(path)),
    }));

    const adapter = makeBatchLaggingAdapter(rows);
    adapters.push(adapter);

    const bucket = makeBucketClient();
    const service = createPhotoUploadService(bucket.client);
    await service.triggerFast();

    // Not one redundant byte: no row is uploaded twice...
    for (const row of rows) {
      expect(bucket.uploadsOf(row.photo_path)).toBe(1);
    }
    // ...and no row is skipped either — exactly one upload per row, no more.
    expect(bucket.upload).toHaveBeenCalledTimes(ROW_COUNT);

    // The drain really did finish; the count above is not "one each because
    // most of them never ran".
    const after = adapter.rows();
    expect(after.every((row) => row.upload_status === "uploaded")).toBe(true);
  });
});
