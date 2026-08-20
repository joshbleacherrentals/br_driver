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
 * Seam under test: `createPhotoUploadService` — the lifetime of entries in the
 * in-memory `claimLedger`.
 * Currently: RED — the ledger is only ever written to. `ledgerEntry()` creates
 * an entry on first claim and nothing ever removes one; the terminal path only
 * flips `inFlight` back to `false`. Over a long-running session the map grows
 * linearly with every photo the process has *ever* handled.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE EVICTION POLICY THIS TEST ENCODES — READ AND CHALLENGE IT
 *
 * No policy had been decided when this was written; this file picks one, and
 * the number below is a judgement call that a reviewer should deliberately
 * re-examine rather than inherit.
 *
 *   An entry may be evicted when ALL of the following hold:
 *     1. no lane is mid-attempt on it (`inFlight === false`); AND
 *     2. this process's own record of the row is the CONFIRMED TERMINAL state
 *        `uploaded` — not `pending`, not `failed`, not "claimed but never
 *        written"; AND
 *     3. that record is older than `LEDGER_CONFIRMED_ENTRY_TTL_MS`.
 *
 * WHY THOSE THREE
 * The ledger exists because the SQLite read connection lags the write
 * connection: for a short window after a commit, `claimNext` still sees the
 * pre-commit row and would re-hand it out. The ledger's record is what
 * overrides that stale read. Once the read connection has demonstrably caught
 * up, the real row is authoritative again — it reads back as `uploaded`, which
 * is invisible to `claimNext` by construction — so the entry has no remaining
 * job and dropping it cannot reintroduce the race. Conditions 1 and 2 keep the
 * eviction confined to exactly that case: an entry for a row still `pending` or
 * `failed` is doing live work (it holds the row's real `attempts` /
 * `last_attempt_at` against a stale read, which is what stops a backed-off row
 * being re-claimed on the very next pass), and must never be evicted on a
 * timer. Neither may an entry whose outcome could not be written at all — the
 * §14 "hold the claim for this session" case — because that one is `inFlight`
 * on purpose.
 *
 * WHY THE TTL, AND WHY THIS SIZE
 * The lag the ledger defends against was measured on device in the tens of
 * milliseconds, up to ~130ms. The TTL must sit far enough above that for the
 * margin to be uninteresting, and low enough that the map is genuinely bounded.
 * This test therefore requires:
 *
 *     1_000ms  ≤  LEDGER_CONFIRMED_ENTRY_TTL_MS  ≤  60_000ms
 *
 * — a floor of ~8x the worst lag ever observed, and a ceiling at the queue's own
 * background pass cadence (`BACKOFF_RESCHEDULE_MS`), because an entry that
 * outlives a whole idle pass cycle is a leak wearing a TTL. A few seconds is the
 * intended landing spot. If the real lag is later measured higher than ~130ms,
 * THIS BAND IS THE THING TO REVISIT, not the assertions below it.
 *
 * WHAT THE TEST ASSERTS — A RELATIONSHIP, NOT A MAGIC NUMBER
 * The session below processes 500 photos ten at a time across 50 passes, with a
 * long gap between passes, plus a handful of permanently-failing rows. The
 * ledger must end up holding roughly the concurrently-active work (~10 + the
 * failing rows), NOT 500 — and its size after 500 rows must not be materially
 * larger than after 100. The bounds are expressed in terms of those two
 * quantities so that changing the batch size or the row count cannot turn this
 * into a hardcoded-number test.
 *
 * TWO SMALL API ADDITIONS THIS CONTRACT REQUIRES
 *   - `photoUploadService.ts` exports `LEDGER_CONFIRMED_ENTRY_TTL_MS`, so the
 *     policy is one named, reviewable constant rather than an inline literal;
 *   - `PhotoUploadService` exposes a readonly `claimLedgerSize`. Boundedness is
 *     otherwise unobservable from outside — eviction of a confirmed entry is by
 *     design behaviourally invisible (the row reads back `uploaded` either way),
 *     which is exactly why it needs an explicit observability seam instead of
 *     being inferred from a heap measurement.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system/legacy";

import {
  isDueForFastRetry,
  isDueForRetry,
} from "@/library/photoUploadQueue/backoff";
import { isNetworkAvailable } from "@/library/photoUploadQueue/runtime/networkState";
import * as photoUploadServiceModule from "@/library/photoUploadQueue/runtime/photoUploadService";
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

// The queue logs per attempt; 500 attempts of console noise buries the result.
jest.mock("@/library/photoUploadQueue/runtime/photoQueueLog", () => ({
  __esModule: true,
  photoQueueLog: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
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

// ── Session shape ───────────────────────────────────────────────────────────

/** Photos saved (and drained) per pass — the "concurrently active" quantity. */
const ROWS_PER_PASS = 10;
/** Passes in the simulated session. */
const PASS_COUNT = 50;
/** Total photos the process handles over the whole session. */
const TOTAL_ROWS = ROWS_PER_PASS * PASS_COUNT;
/** Sampling point used for the "does it grow linearly?" comparison. */
const EARLY_SAMPLE_PASS = 10;
/**
 * Rows whose upload can never succeed. They stay `failed`/retryable forever, so
 * their ledger entries must survive every eviction sweep — this is the half of
 * the policy that stops "bounded" being implemented as `claimLedger.clear()`.
 */
const DOOMED_ROW_COUNT = 4;
/**
 * Simulated wall-clock between passes. Deliberately larger than the maximum TTL
 * this contract permits (60s), so eviction is guaranteed to be due regardless of
 * where inside the allowed band the implementation lands.
 */
const PASS_GAP_MS = 120_000;

/** The band the TTL must fall in — see the policy note at the top of the file. */
const TTL_MIN_MS = 1_000;
const TTL_MAX_MS = 60_000;

const UNRESOLVED_STATUSES: PhotoUploadRow["upload_status"][] = [
  "pending",
  "failed",
];

const isUnresolved = (row: PhotoUploadRow): boolean =>
  UNRESOLVED_STATUSES.includes(row.upload_status);

const isClaimable = (row: PhotoUploadRow): boolean =>
  isUnresolved(row) && row.last_error !== MISSING_LOCAL_FILE_ERROR;

const isDoomed = (path: string): boolean => path.includes("doomed");

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

/** A bucket that accepts everything except the deliberately-doomed paths. */
function makeBucketClient(): { client: SupabaseClient; upload: jest.Mock } {
  const objects = new Set<string>();

  const upload = jest.fn(async (path: string) => {
    if (isDoomed(path)) {
      return { data: null, error: new Error("permanent server rejection") };
    }
    objects.add(path);
    return { data: { path }, error: null };
  });

  const list = jest.fn(async (prefix: string, params?: { search?: string }) => {
    const name = params?.search ?? "";
    const full = prefix ? `${prefix}/${name}` : name;
    return { data: objects.has(full) ? [{ name }] : [], error: null };
  });

  return {
    upload,
    client: {
      storage: { from: () => ({ upload, list }) },
    } as unknown as SupabaseClient,
  };
}

/**
 * A growable in-memory table. Immediately consistent on purpose: read-after-
 * write lag is the *other* contract's subject, and mixing it in here would make
 * a size assertion depend on timing.
 */
function makeGrowableAdapter(): PhotoQueueTableAdapter & {
  add: (rows: PhotoUploadRow[]) => void;
  rows: () => PhotoUploadRow[];
} {
  const live = new Map<string, PhotoUploadRow>();
  /** Bounded so a regression fails an assertion instead of hanging Jest. */
  let claimsLeft = TOTAL_ROWS * 8;

  return {
    ...DAMAGE,
    add: (rows) => rows.forEach((row) => live.set(row.id, { ...row })),
    rows: () => [...live.values()].map((row) => ({ ...row })),
    async claimNext(mode, nowMs, isReserved) {
      if (claimsLeft <= 0) return null;
      claimsLeft -= 1;

      for (const row of live.values()) {
        if (!isClaimable(row)) continue;
        if (isReserved?.(row.id)) continue;
        const due =
          mode === "fast"
            ? isDueForFastRetry(row, nowMs)
            : isDueForRetry(row, nowMs);
        if (due) return { ...row };
      }
      return null;
    },
    async persist(next) {
      live.set(next.id, { ...next });
    },
    async countUnresolved() {
      return [...live.values()].filter(isUnresolved).length;
    },
    async countActionable() {
      return [...live.values()].filter(isClaimable).length;
    },
    async countParked() {
      return [...live.values()].filter(
        (row) => isUnresolved(row) && row.last_error === MISSING_LOCAL_FILE_ERROR,
      ).length;
    },
    async listUnresolved(limit) {
      return [...live.values()]
        .filter(isUnresolved)
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async listStaleUploading(beforeIso, limit) {
      return [...live.values()]
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

/**
 * The two additions this contract requires of the implementation, reached
 * through a cast so the file still type-checks before they exist and fails with
 * a readable assertion rather than a compile error.
 */
const ttlConstant = (
  photoUploadServiceModule as unknown as {
    LEDGER_CONFIRMED_ENTRY_TTL_MS?: number;
  }
).LEDGER_CONFIRMED_ENTRY_TTL_MS;

const ledgerSizeOf = (service: ReturnType<typeof createPhotoUploadService>) =>
  (service as unknown as { claimLedgerSize?: number }).claimLedgerSize;

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

describe("claim ledger is bounded over a long session (§10)", () => {
  it("holds roughly the concurrently-active rows after 500 photos, not all 500 — while keeping every unresolved row's entry", async () => {
    // The policy constant itself, stated before anything else: this is the
    // number a reviewer is meant to argue with.
    expect(typeof ttlConstant).toBe("number");
    expect(ttlConstant!).toBeGreaterThanOrEqual(TTL_MIN_MS);
    expect(ttlConstant!).toBeLessThanOrEqual(TTL_MAX_MS);
    expect(PASS_GAP_MS).toBeGreaterThan(TTL_MAX_MS);

    const adapter = makeGrowableAdapter();
    adapters.push(adapter);

    // Rows that never succeed, present for the whole session.
    adapter.add(
      Array.from({ length: DOOMED_ROW_COUNT }, (_, index) =>
        makeRow(`doomed-${index}`),
      ),
    );

    const bucket = makeBucketClient();
    const service = createPhotoUploadService(bucket.client);

    // The size seam must exist at all, and must be a live reading.
    expect(typeof ledgerSizeOf(service)).toBe("number");

    let clockMs = Date.now();
    let earlySample = 0;
    let peakSample = 0;

    for (let pass = 0; pass < PASS_COUNT; pass++) {
      // A new batch of photos saved, drained, and confirmed.
      adapter.add(
        Array.from({ length: ROWS_PER_PASS }, (_, index) =>
          makeRow(`p${String(pass).padStart(2, "0")}-${index}`),
        ),
      );

      await service.triggerFast();

      const size = ledgerSizeOf(service)!;
      peakSample = Math.max(peakSample, size);
      if (pass + 1 === EARLY_SAMPLE_PASS) earlySample = size;

      // Time moves on — well past any TTL this contract permits — without
      // firing the queue's own timers, so each pass is driven explicitly.
      clockMs += PASS_GAP_MS;
      jest.setSystemTime(clockMs);
    }

    const finalSize = ledgerSizeOf(service)!;

    // ── The session really happened ─────────────────────────────────────────
    const rows = adapter.rows();
    const uploaded = rows.filter((row) => row.upload_status === "uploaded");
    const stillFailing = rows.filter((row) => isDoomed(row.photo_path));
    expect(uploaded).toHaveLength(TOTAL_ROWS);
    expect(stillFailing.every((row) => row.upload_status === "failed")).toBe(
      true,
    );

    // ── Bounded by concurrent work, not by history ─────────────────────────
    // The relationship, not a magic number: five times as many photos must not
    // mean a materially bigger ledger.
    expect(finalSize).toBeLessThanOrEqual(earlySample + ROWS_PER_PASS);
    // ...and in absolute terms it tracks the active batch plus the rows that
    // legitimately still need protecting.
    expect(peakSample).toBeLessThanOrEqual(
      ROWS_PER_PASS * 2 + DOOMED_ROW_COUNT,
    );
    expect(finalSize).toBeLessThan(TOTAL_ROWS / 5);

    // ── ...but eviction is surgical, not a clear() ─────────────────────────
    // Every permanently-failing row is still unresolved and still needs its
    // entry: that entry carries this process's real `attempts` /
    // `last_attempt_at`, which is what keeps a stale read from re-claiming it
    // straight past its backoff.
    expect(finalSize).toBeGreaterThanOrEqual(DOOMED_ROW_COUNT);

    service.dispose();
  });
});
