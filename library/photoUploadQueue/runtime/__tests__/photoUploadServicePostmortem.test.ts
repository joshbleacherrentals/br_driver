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
 * Seam under test: `createPhotoUploadService` — claim/reserve/release around
 * `uploadRow`, and the terminal write chosen when an upload outcome is
 * ambiguous and the bucket lookup cannot answer.
 * Currently: RED — double-claim race exists (the in-memory reservation is
 * released before the read connection can see the committed row), and a
 * `duplicate` outcome with an `unknown` bucket presence is recorded as a
 * failed attempt.
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

// Same boundary the sibling `photoUploadService.test.ts` replaces: the service
// only ever reaches a table through `PHOTO_QUEUE_ADAPTERS`, so an empty,
// test-controlled array runs the real `uploadRow`, worker and success logic
// against in-memory rows.
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
 * the second write to a path that already holds an object is rejected with the
 * "already exists" error `isAlreadyInStorageError` recognises, which is exactly
 * what a double upload of the same photo produces in the field.
 */
function makeBucketClient(options: { listAnswers: "found" | "errors" }): {
  client: SupabaseClient;
  upload: jest.Mock;
  list: jest.Mock;
  uploadsOf: (path: string) => number;
} {
  const objects = new Set<string>();

  const upload = jest.fn(
    async (path: string, _data: ArrayBuffer, opts?: { upsert?: boolean }) => {
      if (objects.has(path) && opts?.upsert !== true) {
        return {
          data: null,
          error: new Error("The resource already exists"),
        };
      }
      objects.add(path);
      return { data: { path }, error: null };
    },
  );

  // §5.1 — `lookupBucketObject` maps an errored `list` to `unknown`, the
  // honest answer when the lookup itself could not be performed.
  const list = jest.fn(async (prefix: string, params?: { search?: string }) => {
    if (options.listAnswers === "errors") {
      return { data: null, error: new Error("network request failed") };
    }
    const name = params?.search ?? "";
    const full = prefix ? `${prefix}/${name}` : name;
    return {
      data: objects.has(full) ? [{ name }] : [],
      error: null,
    };
  });

  return {
    upload,
    list,
    uploadsOf: (path) =>
      upload.mock.calls.filter((call) => call[0] === path).length,
    client: {
      storage: { from: () => ({ upload, list }) },
    } as unknown as SupabaseClient,
  };
}

/**
 * The claim ledger is released the instant `persist()` resolves, but on a real
 * device the SELECT behind `claimNext` runs on a *different* SQLite connection
 * than the write did (PowerSync/op-sqlite keeps a write-locked connection and
 * separate read-only `query_only` connections). That reader can keep serving
 * the pre-commit snapshot for tens of milliseconds after the writer committed,
 * so the row still looks `pending` — and unreserved — to the very next claim.
 *
 * This fake makes that lag deterministic rather than timing-dependent: every
 * `persist()` snapshots the pre-write state, and the next `claimNext` is served
 * from that snapshot before the reader catches up.
 */
function makeAdapter(
  initialRows: PhotoUploadRow[],
  options: { readLagClaims: number; claimBudget?: number },
): PhotoQueueTableAdapter & { rows: () => PhotoUploadRow[] } {
  const { readLagClaims } = options;
  const claimBudget = options.claimBudget ?? 8;
  /** What the write connection has committed. */
  let live = initialRows.map((row) => ({ ...row }));
  /** What the read connection still sees while it is behind. */
  let readView = live.map((row) => ({ ...row }));
  /** How many further claims are served from the stale snapshot. */
  let staleClaims = 0;
  /** Bounded so a regression fails an assertion instead of hanging Jest. */
  let claimsLeft = claimBudget;

  return {
    ...DAMAGE,
    rows: () => live.map((row) => ({ ...row })),
    async claimNext(mode, nowMs, isReserved) {
      if (claimsLeft <= 0) return null;
      claimsLeft -= 1;

      const view = staleClaims > 0 ? readView : live;
      if (staleClaims > 0) staleClaims -= 1;

      const row = view
        .filter((candidate) => isClaimable(candidate) && !isReserved?.(candidate.id))
        .find((candidate) =>
          mode === "fast"
            ? isDueForFastRetry(candidate, nowMs)
            : isDueForRetry(candidate, nowMs),
        );
      return row ? { ...row } : null;
    },
    async persist(next) {
      // The reader's snapshot is taken from the state as it was *before* this
      // commit, and stays current for one more read.
      readView = live.map((row) => ({ ...row }));
      live = live.map((row) => (row.id === next.id ? { ...next } : row));
      staleClaims = readLagClaims;
    },
    async countUnresolved() {
      return live.filter(isUnresolved).length;
    },
    async countActionable() {
      return live.filter(isClaimable).length;
    },
    async countParked() {
      return live.filter(
        (row) =>
          isUnresolved(row) && row.last_error === MISSING_LOCAL_FILE_ERROR,
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

describe("claim exclusivity survives read-after-write lag (§10)", () => {
  it("uploads a photo exactly once even when the next claim still reads the pre-commit snapshot", async () => {
    const row = makeRow("racing-row");
    mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === localUriForPath(row.photo_path),
    }));

    const adapter = makeAdapter([row], { readLagClaims: 1 });
    adapters.push(adapter);

    const bucket = makeBucketClient({ listAnswers: "found" });
    const service = createPhotoUploadService(bucket.client);
    await service.triggerFast();

    // The row is confirmed either way — what the race costs is a second, wholly
    // redundant upload of the same bytes for the same photo id.
    expect(bucket.uploadsOf(row.photo_path)).toBe(1);
  });
});

describe("ambiguous outcome with an unanswerable bucket lookup (§5.1/§9)", () => {
  it("leaves the row retryable instead of recording a failed attempt when a duplicate signal meets an unknown bucket presence", async () => {
    const row = makeRow("ambiguous-row");
    mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === localUriForPath(row.photo_path),
    }));

    // No read lag here: the only thing this test varies is the outcome/lookup
    // pair, so the table is immediately consistent.
    const adapter = makeAdapter([row], { readLagClaims: 0 });
    adapters.push(adapter);

    // The object is already in the bucket (an earlier attempt landed), so the
    // insert-only upload comes back `duplicate`...
    const bucket = makeBucketClient({ listAnswers: "errors" });
    await bucket.client.storage
      .from(DAMAGE.bucket)
      .upload(row.photo_path, new ArrayBuffer(3), { upsert: false });
    bucket.upload.mockClear();

    // ...and the verifying lookup cannot answer at all: not `present`, not
    // `absent`, but `unknown`.
    const service = createPhotoUploadService(bucket.client);
    await service.triggerFast();

    const after = adapter.rows()[0];
    // Nothing was learned, so nothing may be recorded against the row: an
    // `unknown` presence is the absence of evidence, not evidence of failure.
    expect(after.attempts).toBe(0);
    expect(after.last_error).toBeNull();
    expect(after.upload_status).toBe("pending");
  });
});
