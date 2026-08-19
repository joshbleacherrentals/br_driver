/**
 * Regression coverage proving `uploadRow`
 * (library/photoUploadQueue/runtime/photoUploadService.ts) is immune to iOS
 * container drift.
 *
 * BACKGROUND (fixed, not merely worked around)
 * `uploadRow` used to decide whether a photo could still be uploaded with:
 *
 *   if (!row.local_uri || !(await localFileExists(row.local_uri))) { park }
 *
 * `local_uri` was a DB-stored column holding an absolute `file://…` URI baked
 * with the app's container UUID at write time. On iOS that UUID can rotate
 * (native rebuild / reinstall / `expo prebuild --clean`) even on the same day
 * the row was written. When it did, the stored `local_uri` silently pointed
 * at a container that no longer existed, while the photo itself survived —
 * migrated into the new container under the same *relative* path, reachable
 * via `localUriForPath(row.photo_path)` (`runtime/localFile.ts`, proven
 * fresh-recomputing in `localFile.test.ts`).
 *
 * The fix: `local_uri` no longer exists anywhere — not on the Postgres
 * tables, not in `AppSchema.ts`, not on `PhotoUploadRow`. `uploadRow` now
 * recomputes the on-device path live from `photo_path` via
 * `localPhotoExists`/`localUriForPath`, exactly like every other consumer
 * already did. With no stored absolute path left to trust, container drift is
 * now structurally impossible to reintroduce here, not just handled — there
 * is nothing left for a future edit to "trust by mistake".
 *
 * These tests simulate drift by changing the mocked `FileSystem.
 * documentDirectory` between when a row is set up and when `uploadRow` runs,
 * and confirm the upload still succeeds purely from `photo_path` — for each
 * of the three photo tables.
 *
 * HOW `uploadRow` IS EXERCISED
 * `uploadRow` is a private closure inside `createPhotoUploadService` — it is
 * not exported, so the only way to exercise the REAL, unmodified function is
 * through the service's public API (`triggerFast`). The table-adapter layer
 * (`./tableAdapters`, which talks to the real Kysely/PowerSync `db`) is
 * mocked out with a minimal in-memory adapter per table, mirroring each real
 * adapter's `table` / `bucket` / `upsert` metadata exactly (see
 * `tableAdapters.ts`) — everything downstream of that boundary
 * (`uploadRow` itself, `applyUploadEvent`, `isUploadSuccessful`,
 * `uploadToBucket`, `createUploadQueueWorker`) is the real, unmodified
 * production code.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import * as FileSystem from "expo-file-system/legacy";

import {
  createDeferred,
  flushMicrotasks,
} from "@/library/photoUploadQueue/__tests__/support";
import { isDueForFastRetry, isDueForRetry } from "@/library/photoUploadQueue/backoff";
import {
  clearDriverScope,
  getDriverScope,
  publishDriverScope,
} from "@/library/powersync/scoping/driverScope";
import { localUriForPath } from "@/library/photoUploadQueue/runtime/localFile";
import { isNetworkAvailable } from "@/library/photoUploadQueue/runtime/networkState";
import { PERSIST_FALLBACK_ERROR } from "@/library/photoUploadQueue/runtime/persistUploadEvent";
import { PERSIST_RETRY_ATTEMPTS } from "@/library/photoUploadQueue/runtime/persistWithRetry";
import { createPhotoUploadService } from "@/library/photoUploadQueue/runtime/photoUploadService";
import {
  STALE_UPLOADING_ERROR,
  STALE_UPLOADING_THRESHOLD_MS,
} from "@/library/photoUploadQueue/runtime/staleUploadingSweep";
import { PHOTO_QUEUE_ADAPTERS } from "@/library/photoUploadQueue/runtime/tableAdapters";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
} from "@/library/photoUploadQueue/types";
import { UPLOAD_TIMEOUT_MS } from "@/library/photoUploadQueue/uploadTimeout";
import { MAX_CONCURRENT_UPLOADS } from "@/library/photoUploadQueue/worker";

// The service only ever talks to its adapters through `PHOTO_QUEUE_ADAPTERS`
// (never to `db`/`powerSyncDb` directly), so replacing that export with an
// empty, test-controlled array is enough to run the real `uploadRow` against
// fully in-memory rows — no Kysely/PowerSync mocking needed.
jest.mock("@/library/photoUploadQueue/runtime/tableAdapters", () => ({
  __esModule: true,
  MISSING_LOCAL_FILE_ERROR: "LOCAL_FILE_MISSING",
  PHOTO_QUEUE_ADAPTERS: [],
}));

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  documentDirectory: "file:///container-A/Documents/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

/**
 * The one filesystem read an upload performs, recorded by URI.
 *
 * `readLocalPhotoBytes` (`runtime/localFile.ts`) goes through the *new*
 * `expo-file-system` `File` API — `bytes()` returns the file's bytes from the
 * native side directly, where the old path materialised a ~1.35x-sized base64
 * string on the JS heap and then decoded it back in a JS loop, three lanes at a
 * time. Which URI it reads is still exactly what the container-drift tests
 * below turn on, so that is what this records.
 */
const mockReadBytes = jest.fn(async (_uri: string) => new Uint8Array([1, 2, 3]));

jest.mock("expo-file-system", () => ({
  __esModule: true,
  File: jest.fn().mockImplementation((uri: string) => ({
    bytes: () => mockReadBytes(uri),
  })),
}));

// §13 — the connectivity signal is the service's own wrapper (its mapping from
// `expo-network` states is specified in `networkState.test.ts`); here it is
// mocked so a pass can be run deliberately online or offline.
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

/** Puts the mocked device online or offline for the passes that follow. */
function setOnline(online: boolean): void {
  mockIsNetworkAvailable.mockResolvedValue(online);
}

const CONTAINER_BEFORE = "file:///container-A/Documents/";
const CONTAINER_AFTER = "file:///container-B-after-rebuild/Documents/";

/** Same array reference the mocked module exports — mutated per test. */
const adapters = PHOTO_QUEUE_ADAPTERS as unknown as PhotoQueueTableAdapter[];

/**
 * §15's two ids, as `SystemProvider` eventually publishes them. `null` — the
 * state before that resolution lands — is what the launch-race tests use.
 */
const SIGNED_IN_DRIVER = { userUuid: "user-1", driverUuid: "driver-1" };

/**
 * `table` / `bucket` / `upsert` copied verbatim from the real adapters in
 * `tableAdapters.ts` (read in full before writing this test). Kept here by
 * hand since that file is out of scope for a test-only change — if it drifts,
 * update this list to match.
 */
const REAL_ADAPTER_METADATA: Array<
  Pick<PhotoQueueTableAdapter, "table" | "bucket" | "upsert">
> = [
  {
    table: "DamageReportPhotos",
    bucket: "damage-report-photos",
    upsert: false,
  },
  { table: "InspectionPhotos", bucket: "inspection-photos", upsert: true },
  { table: "DriverDocuments", bucket: "driver-documents", upsert: true },
];

function makeFakeSupabaseClient(): SupabaseClient {
  return {
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "ok" }, error: null }),
        list: async () => ({ data: [], error: null }),
      }),
    },
  } as unknown as SupabaseClient;
}

/**
 * Same fake client, with every Storage entry point spied on — so a test can
 * assert that a pass made no network calls at all, not merely that it didn't
 * change any row.
 */
function makeSpyingSupabaseClient(): {
  client: SupabaseClient;
  upload: jest.Mock;
  list: jest.Mock;
} {
  const upload = jest.fn(async () => ({ data: { path: "ok" }, error: null }));
  const list = jest.fn(async () => ({ data: [], error: null }));
  return {
    upload,
    list,
    client: {
      storage: { from: () => ({ upload, list }) },
    } as unknown as SupabaseClient,
  };
}

/**
 * `tableAdapters.ts`'s `UNRESOLVED_STATUSES` — the statuses the queue still
 * owns work for. Reproduced here because it drives every fake below.
 *
 * `uploading` is NOT in this list, and the queue no longer writes it either:
 * the claim reservation lives in the service's in-memory ledger (§10), which
 * the fakes see as `claimNext`'s `isReserved` argument. Honouring that argument
 * is what makes these fakes model exclusivity correctly — a fake that ignores
 * it hands the same row to all three lanes.
 */
const UNRESOLVED_STATUSES: PhotoUploadRow["upload_status"][] = [
  "pending",
  "failed",
];

const isUnresolved = (row: PhotoUploadRow): boolean =>
  UNRESOLVED_STATUSES.includes(row.upload_status);

const isClaimable = (row: PhotoUploadRow): boolean =>
  isUnresolved(row) && row.last_error !== MISSING_LOCAL_FILE_ERROR;

/**
 * Minimal stand-in for a real `PhotoQueueTableAdapter` — an in-memory single
 * row instead of a real Kysely/PowerSync-backed table. Mirrors the real
 * adapters' `claimNext`/`persist`/`countActionable` semantics (see
 * `tableAdapters.ts`: only `pending`/`failed` rows are visible to the queue,
 * and a row with `last_error === MISSING_LOCAL_FILE_ERROR` is parked — never
 * claimed, never counted as actionable) closely enough to drive `uploadRow`
 * through a realistic single pass.
 */
function makeFakeAdapter(
  meta: Pick<PhotoQueueTableAdapter, "table" | "bucket" | "upsert">,
  initialRow: PhotoUploadRow,
): PhotoQueueTableAdapter & { current: () => PhotoUploadRow } {
  let row: PhotoUploadRow = { ...initialRow };
  return {
    ...meta,
    current: () => row,
    async claimNext(_mode, _nowMs, isReserved) {
      if (!isClaimable(row) || isReserved?.(row.id)) return null;
      return { ...row };
    },
    async persist(next) {
      row = { ...next };
    },
    async countUnresolved() {
      return isUnresolved(row) ? 1 : 0;
    },
    async countActionable() {
      return isClaimable(row) ? 1 : 0;
    },
    async countParked() {
      if (!isUnresolved(row)) return 0;
      return row.last_error === MISSING_LOCAL_FILE_ERROR ? 1 : 0;
    },
    async listUnresolved() {
      return isUnresolved(row) ? [{ ...row }] : [];
    },
    async listStaleUploading(beforeIso, limit) {
      if (row.upload_status !== "uploading") return [];
      if (row.last_attempt_at !== null && row.last_attempt_at >= beforeIso) {
        return [];
      }
      return limit > 0 ? [{ ...row }] : [];
    },
  };
}

/**
 * The same fake, wearing §15's driver scoping.
 *
 * The real `DamageReportPhotos`/`InspectionPhotos` adapters gate every read on
 * `getDriverScope()` and return their empty answer — `null`, `0`, `[]`
 * — without touching the database when there is none (`tableAdapters.ts`). That
 * gate is the entire reason a `0` from `countUnresolved` is not evidence of an
 * empty queue, so a fake that ignores it cannot reproduce the launch race at
 * all. `persist` is left unscoped, exactly as the real adapters leave it.
 */
function makeDriverScopedAdapter(
  meta: Pick<PhotoQueueTableAdapter, "table" | "bucket" | "upsert">,
  initialRow: PhotoUploadRow,
): PhotoQueueTableAdapter & { current: () => PhotoUploadRow } {
  const inner = makeFakeAdapter(meta, initialRow);
  const scoped = (): boolean => getDriverScope() !== null;
  return {
    ...inner,
    async claimNext(mode, nowMs, isReserved) {
      return scoped() ? inner.claimNext(mode, nowMs, isReserved) : null;
    },
    async countUnresolved() {
      return scoped() ? inner.countUnresolved() : 0;
    },
    async countActionable() {
      return scoped() ? inner.countActionable() : 0;
    },
    async countParked() {
      return scoped() ? inner.countParked() : 0;
    },
    async listUnresolved(limit) {
      return scoped() ? inner.listUnresolved(limit) : [];
    },
    async listStaleUploading(beforeIso, limit) {
      return scoped() ? inner.listStaleUploading(beforeIso, limit) : [];
    },
  };
}

/**
 * The same fake, over several rows — needed to exercise the claim lock, which
 * is only observable when there is more than one row to hand out.
 */
function makeMultiRowAdapter(
  meta: Pick<PhotoQueueTableAdapter, "table" | "bucket" | "upsert">,
  initialRows: PhotoUploadRow[],
): PhotoQueueTableAdapter & {
  rows: () => PhotoUploadRow[];
  find: (id: string) => PhotoUploadRow | undefined;
  persistCalls: () => PhotoUploadRow[];
} {
  let rows = initialRows.map((row) => ({ ...row }));
  const persisted: PhotoUploadRow[] = [];
  return {
    ...meta,
    rows: () => rows.map((row) => ({ ...row })),
    find: (id) => rows.find((row) => row.id === id),
    persistCalls: () => persisted.map((row) => ({ ...row })),
    // Mirrors `tableAdapters.ts`'s `firstEligible`, including the fast-mode
    // spacing floor — the mechanism that has always made a hot loop impossible
    // (a row that just failed cannot be re-claimed on the very next iteration).
    // The single-row fake above predates it; this one honours it, so the
    // concurrency/fallback tests below can't accidentally pass by spinning.
    async claimNext(mode, nowMs, isReserved) {
      const row = rows
        .filter((candidate) => isClaimable(candidate) && !isReserved?.(candidate.id))
        .find((candidate) =>
          mode === "fast"
            ? isDueForFastRetry(candidate, nowMs)
            : isDueForRetry(candidate, nowMs),
        );
      return row ? { ...row } : null;
    },
    async persist(next) {
      persisted.push({ ...next });
      rows = rows.map((row) => (row.id === next.id ? { ...next } : row));
    },
    async countUnresolved() {
      return rows.filter(isUnresolved).length;
    },
    async countActionable() {
      return rows.filter(isClaimable).length;
    },
    async countParked() {
      return rows.filter(
        (row) => isUnresolved(row) && row.last_error === MISSING_LOCAL_FILE_ERROR,
      ).length;
    },
    async listUnresolved(limit) {
      return rows.filter(isUnresolved).slice(0, limit).map((row) => ({ ...row }));
    },
    async listStaleUploading(beforeIso, limit) {
      return rows
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

/** A row already parked by an earlier session with a missing-file verdict. */
function makeParkedRow(
  meta: Pick<PhotoQueueTableAdapter, "table">,
  id: string,
): PhotoUploadRow {
  return {
    ...makeRow(meta, id),
    upload_status: "failed",
    attempts: 3,
    last_attempt_at: "2026-08-01T09:00:00.000Z",
    last_error: MISSING_LOCAL_FILE_ERROR,
  };
}

function makeRow(
  meta: Pick<PhotoQueueTableAdapter, "table">,
  id: string,
): PhotoUploadRow {
  return {
    id,
    photo_path: `${meta.table}/photo-1.jpg`,
    upload_status: "pending",
    gallery_asset_id: "asset-1",
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
  };
}

beforeEach(() => {
  // The pass loop re-arms itself on a timer for as long as anything is
  // unresolved (§12). Fake timers keep those scheduled passes from firing into
  // a torn-down test, and make "did it schedule another pass?" assertable.
  jest.useFakeTimers();
  adapters.length = 0;
  mockFs.documentDirectory = CONTAINER_BEFORE;
  mockFs.getInfoAsync.mockReset();
  mockReadBytes.mockClear();
  setOnline(true);
  // Steady state for every test below: a driver is signed in and §15's ids are
  // published, so the counts the loop reasons about are real. The launch race —
  // ids not resolved yet — is its own describe block at the bottom, and clears
  // this explicitly.
  publishDriverScope(SIGNED_IN_DRIVER.userUuid, SIGNED_IN_DRIVER.driverUuid);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  clearDriverScope();
});

describe.each(REAL_ADAPTER_METADATA)(
  "uploadRow — $table",
  (meta) => {
    it("uploads successfully purely from photo_path, with no stored local path involved", async () => {
      const row = makeRow(meta, "row-1");
      const canonicalUri = localUriForPath(row.photo_path);
      mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
        exists: uri === canonicalUri,
      }));

      const adapter = makeFakeAdapter(meta, row);
      adapters.push(adapter);

      const client = makeFakeSupabaseClient();
      const service = createPhotoUploadService(client);
      await service.triggerFast();

      expect(adapter.current().last_error).not.toBe(MISSING_LOCAL_FILE_ERROR);
      expect(adapter.current().upload_status).toBe("uploaded");
      expect(mockReadBytes).toHaveBeenCalledWith(canonicalUri);
    });

    it(
      "survives container drift between row setup and upload — the path is " +
        "recomputed fresh at read time, so a rotated documentDirectory can't " +
        "produce a stale miss (structurally impossible now that no absolute " +
        "path is ever persisted)",
      async () => {
        const row = makeRow(meta, "row-2");

        // The row is "written" while CONTAINER_BEFORE is current...
        mockFs.documentDirectory = CONTAINER_BEFORE;

        // ...then the app's container UUID rotates (native rebuild/reinstall)
        // before the worker gets to it. The file migrates with it, reachable
        // at the SAME relative path under the NEW container root.
        mockFs.documentDirectory = CONTAINER_AFTER;
        const canonicalUriAfterDrift = localUriForPath(row.photo_path);
        const canonicalUriBeforeDrift = `${CONTAINER_BEFORE}photo-upload-queue/${row.photo_path}`;
        expect(canonicalUriAfterDrift).not.toBe(canonicalUriBeforeDrift);

        // Only the post-drift path is "on disk" — proving the read didn't
        // luck into success via some cached pre-drift value.
        mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
          exists: uri === canonicalUriAfterDrift,
        }));

        const adapter = makeFakeAdapter(meta, row);
        adapters.push(adapter);

        const client = makeFakeSupabaseClient();
        const service = createPhotoUploadService(client);
        await service.triggerFast();

        expect(adapter.current().last_error).not.toBe(
          MISSING_LOCAL_FILE_ERROR,
        );
        expect(adapter.current().upload_status).toBe("uploaded");
        expect(mockReadBytes).toHaveBeenCalledWith(canonicalUriAfterDrift);
        expect(mockReadBytes).not.toHaveBeenCalledWith(canonicalUriBeforeDrift);
      },
    );

    it("parks the row as LOCAL_FILE_MISSING when the file is genuinely gone at the current canonical path", async () => {
      const row = makeRow(meta, "row-3");
      mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false }));

      const adapter = makeFakeAdapter(meta, row);
      adapters.push(adapter);

      const client = makeFakeSupabaseClient();
      const service = createPhotoUploadService(client);
      await service.triggerFast();

      expect(adapter.current().last_error).toBe(MISSING_LOCAL_FILE_ERROR);
      expect(adapter.current().upload_status).toBe("failed");
      expect(mockReadBytes).not.toHaveBeenCalled();
    });
  },
);

/**
 * Covers §12 (self-healing parked rows) and §13 (network-gated retries) at the
 * level that actually matters to a driver: one `triggerFast`/`triggerBackoff`
 * call, and what the row looks like afterwards.
 *
 * These run against the real `runPass` — sweep, network gate and worker drain
 * in their production order — with only the adapter layer and the connectivity
 * signal replaced.
 */
describe("self-healing and network gating (§12/§13)", () => {
  const DAMAGE = REAL_ADAPTER_METADATA[0];

  /** Only this row's canonical local path is "on disk". */
  const fileIsPresentFor = (row: PhotoUploadRow) => {
    const canonicalUri = localUriForPath(row.photo_path);
    mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === canonicalUri,
    }));
  };

  it("un-parks a row whose file is back and uploads it in the same pass — zero driver taps", async () => {
    const row = makeParkedRow(DAMAGE, "healed-row");
    fileIsPresentFor(row);

    const adapter = makeFakeAdapter(DAMAGE, row);
    adapters.push(adapter);

    const service = createPhotoUploadService(makeFakeSupabaseClient());
    await service.triggerFast();

    // The sweep clears the stale verdict, and the row re-enters the claim path
    // on the very next iteration of the same drain — not on some later pass.
    expect(adapter.current().upload_status).toBe("uploaded");
    expect(adapter.current().last_error).toBeNull();
    expect(mockReadBytes).toHaveBeenCalledWith(localUriForPath(row.photo_path));
  });

  it("leaves a genuinely missing parked row parked, without a single network call", async () => {
    const row = makeParkedRow(DAMAGE, "still-gone");
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false }));

    const adapter = makeFakeAdapter(DAMAGE, row);
    adapters.push(adapter);

    const { client, upload, list } = makeSpyingSupabaseClient();
    const service = createPhotoUploadService(client);
    await service.triggerFast();

    expect(adapter.current().last_error).toBe(MISSING_LOCAL_FILE_ERROR);
    expect(adapter.current().upload_status).toBe("failed");
    // The whole cost of a permanently-missing row is one local stat call.
    expect(upload).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(mockFs.getInfoAsync).toHaveBeenCalledTimes(1);
    // §12 — and it never spends an attempt, so backoff isn't ratcheted by the
    // sweep either.
    expect(adapter.current().attempts).toBe(row.attempts);
  });

  it("skips the upload attempt entirely while offline, spending no attempt", async () => {
    const row = makeRow(DAMAGE, "offline-row");
    fileIsPresentFor(row);
    setOnline(false);

    const adapter = makeFakeAdapter(DAMAGE, row);
    adapters.push(adapter);

    const { client, upload } = makeSpyingSupabaseClient();
    const service = createPhotoUploadService(client);
    await service.triggerFast();

    expect(upload).not.toHaveBeenCalled();
    expect(mockReadBytes).not.toHaveBeenCalled();
    // Untouched: the claim writes nothing (§10 — the reservation is in memory)
    // and no attempt ran, so the row is exactly as it was. A doomed offline
    // attempt must not advance the §6 backoff schedule, and its network error
    // must never be recorded as a missing-file verdict.
    expect(adapter.current().upload_status).toBe("pending");
    expect(adapter.current().attempts).toBe(0);
    expect(adapter.current().last_attempt_at).toBeNull();
    expect(adapter.current().last_error).toBeNull();
  });

  it("resumes real attempts as soon as the connection is back", async () => {
    const row = makeRow(DAMAGE, "resumes-row");
    fileIsPresentFor(row);

    const adapter = makeFakeAdapter(DAMAGE, row);
    adapters.push(adapter);

    const { client, upload } = makeSpyingSupabaseClient();
    const service = createPhotoUploadService(client);

    setOnline(false);
    await service.triggerBackoff();
    expect(upload).not.toHaveBeenCalled();
    expect(adapter.current().upload_status).toBe("pending");

    setOnline(true);
    await service.triggerBackoff();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(adapter.current().upload_status).toBe("uploaded");
  });

  it("still sweeps while offline — the row un-parks locally and waits to upload", async () => {
    const row = makeParkedRow(DAMAGE, "offline-heal");
    fileIsPresentFor(row);
    setOnline(false);

    const adapter = makeFakeAdapter(DAMAGE, row);
    adapters.push(adapter);

    const { client, upload } = makeSpyingSupabaseClient();
    const service = createPhotoUploadService(client);
    await service.triggerFast();

    // The sweep is local-only, so it does its job on a plane...
    expect(adapter.current().last_error).toBeNull();
    expect(adapter.current().upload_status).toBe("pending");
    expect(adapter.current().attempts).toBe(row.attempts);
    // ...but nothing is sent until there is a connection to send it over.
    expect(upload).not.toHaveBeenCalled();

    setOnline(true);
    await service.triggerFast();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(adapter.current().upload_status).toBe("uploaded");
  });

  it("keeps re-arming the pass loop while a permanently-parked row remains", async () => {
    // Decision: the loop's re-arm gate is `countUnresolved`, not
    // `countActionable` — otherwise the only rows that need the sweep are
    // exactly the rows whose presence stops it from ever running again.
    const row = makeParkedRow(DAMAGE, "forever-parked");
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false }));

    const adapter = makeFakeAdapter(DAMAGE, row);
    adapters.push(adapter);

    const service = createPhotoUploadService(makeFakeSupabaseClient());
    await service.triggerBackoff();

    await expect(adapter.countActionable()).resolves.toBe(0);
    expect(jest.getTimerCount()).toBe(1);

    // ...and the pass it schedules re-checks the file and re-arms again.
    mockFs.getInfoAsync.mockClear();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockFs.getInfoAsync).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);
  });

  it("stops re-arming once every row is uploaded", async () => {
    const row = makeRow(DAMAGE, "drains-row");
    fileIsPresentFor(row);

    const adapter = makeFakeAdapter(DAMAGE, row);
    adapters.push(adapter);

    const service = createPhotoUploadService(makeFakeSupabaseClient());
    await service.triggerFast();

    expect(adapter.current().upload_status).toBe("uploaded");
    expect(jest.getTimerCount()).toBe(0);
  });
});

/**
 * The launch race between the pass loop and §15's driver context.
 *
 * `SystemProvider` publishes the two ids from a reactive chain (Clerk user →
 * `Users` → `Drivers`), so they do not exist for the first render or two after
 * launch or a reconnect. Until they do, every scoped adapter method returns its
 * empty answer, and `countUnresolved` reports 0 no matter how many rows are
 * sitting there — the count is not wrong so much as unavailable.
 *
 * The loop's re-arm gate used to read that 0 as "queue empty" and simply not
 * schedule another pass. Nothing else arms that timer, so a single mistimed
 * pass took the retry loop down for the whole session while real `pending` rows
 * waited — the failure mode these two tests pin down from both sides.
 *
 * Note that a fake adapter which ignores the context (`makeFakeAdapter`) cannot
 * express this at all, which is exactly why the suite did not catch it: it is
 * the *interaction* between the gate and the gate's consumer that breaks, not
 * either one alone.
 */
describe("driver-context race on launch (§15)", () => {
  const DAMAGE = REAL_ADAPTER_METADATA[0];

  const fileIsPresentFor = (row: PhotoUploadRow) => {
    const canonicalUri = localUriForPath(row.photo_path);
    mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === canonicalUri,
    }));
  };

  it("keeps the pass loop armed when unresolved=0 only because no driver context is established yet", async () => {
    clearDriverScope();

    const row = makeRow(DAMAGE, "launch-race-row");
    fileIsPresentFor(row);

    const adapter = makeDriverScopedAdapter(DAMAGE, row);
    adapters.push(adapter);

    const { client, upload } = makeSpyingSupabaseClient();
    const service = createPhotoUploadService(client);
    await service.triggerFast();

    // The row is genuinely there and genuinely unresolved...
    expect(adapter.current().upload_status).toBe("pending");
    expect(adapter.current().attempts).toBe(0);
    // ...but §15 gates every count to 0 while no driver is established, so this
    // pass ended looking identical to an empty queue.
    await expect(service.countUnresolved()).resolves.toBe(0);
    expect(upload).not.toHaveBeenCalled();

    // The regression: that 0 stopped the timer, and nothing ever re-armed it.
    // The loop has to outlive the race instead.
    expect(jest.getTimerCount()).toBe(1);

    // Still nothing to go on one pass later — still armed, still cheap.
    await jest.advanceTimersByTimeAsync(4_000);
    expect(upload).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);

    // `SystemProvider`'s Users→Drivers chain resolves; because the loop was
    // still alive, the very next scheduled pass sees the real row and drains
    // it, with no save, foreground or driver tap needed to restart anything.
    publishDriverScope(SIGNED_IN_DRIVER.userUuid, SIGNED_IN_DRIVER.driverUuid);
    await jest.advanceTimersByTimeAsync(4_000);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(adapter.current().upload_status).toBe("uploaded");
    // And once the count is both real and zero, the loop stands down.
    expect(jest.getTimerCount()).toBe(0);
  });

  it("still stops re-arming on a zero that was counted against an established driver", async () => {
    // The other half of the fix: only an *unverifiable* zero may keep the timer
    // alive. A real one still ends the loop, so this cannot become a wakeup
    // every 60s for the lifetime of the app.
    const row = makeRow(DAMAGE, "context-ready-row");
    fileIsPresentFor(row);

    const adapter = makeDriverScopedAdapter(DAMAGE, row);
    adapters.push(adapter);

    const service = createPhotoUploadService(makeFakeSupabaseClient());
    await service.triggerFast();

    expect(adapter.current().upload_status).toBe("uploaded");
    await expect(service.countUnresolved()).resolves.toBe(0);
    expect(getDriverScope()).not.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §10 bounded concurrency, §14 persist resilience, §5.1 timeout verification
//
// Everything below drives the REAL `runPass`/`claimNextPendingRow`/`uploadRow`
// through the service's public API, with only the adapter layer, the
// filesystem and the Supabase client replaced — same approach as the suites
// above.
// ───────────────────────────────────────────────────────────────────────────

const DAMAGE = REAL_ADAPTER_METADATA[0];
const INSPECTION = REAL_ADAPTER_METADATA[1];
const DOCUMENTS = REAL_ADAPTER_METADATA[2];

/** A fresh queue row with a per-id bucket path, so files can be mocked apart. */
function queueRow(
  meta: Pick<PhotoQueueTableAdapter, "table">,
  id: string,
): PhotoUploadRow {
  return {
    id,
    photo_path: `${meta.table}/${id}.jpg`,
    upload_status: "pending",
    gallery_asset_id: "asset-1",
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
  };
}

/** Only the listed bucket paths are "on disk". */
function filesOnDisk(...bucketPaths: string[]): void {
  const uris = new Set(bucketPaths.map(localUriForPath));
  mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
    exists: uris.has(uri),
  }));
}

/** Supabase client whose Storage `upload`/`list` the test controls. */
function clientWith(overrides: { upload?: jest.Mock; list?: jest.Mock } = {}): {
  client: SupabaseClient;
  upload: jest.Mock;
  list: jest.Mock;
} {
  const upload =
    overrides.upload ?? jest.fn(async () => ({ data: { path: "ok" }, error: null }));
  const list = overrides.list ?? jest.fn(async () => ({ data: [], error: null }));
  return {
    upload,
    list,
    client: { storage: { from: () => ({ upload, list }) } } as unknown as SupabaseClient,
  };
}

/** A `list` response in which the object at `photoPath` is present. */
function bucketHolds(photoPath: string): jest.Mock {
  const name = photoPath.slice(photoPath.lastIndexOf("/") + 1);
  return jest.fn(async () => ({ data: [{ name }], error: null }));
}

/** Replaces an adapter's `persist` with one that fails while `shouldFail` says so. */
function failPersistWhile(
  adapter: PhotoQueueTableAdapter,
  shouldFail: (row: PhotoUploadRow) => boolean,
): jest.Mock {
  const original = adapter.persist.bind(adapter);
  const spy = jest.fn(async (row: PhotoUploadRow) => {
    if (shouldFail(row)) {
      throw new Error("database is locked");
    }
    await original(row);
  });
  (adapter as { persist: PhotoQueueTableAdapter["persist"] }).persist = spy;
  return spy;
}

/**
 * An adapter whose writes can never land: `persist` always rejects, so the row
 * never changes and `claimNext` keeps offering it. Exactly the shape that would
 * spin forever if the service released its claim on a row whose outcome it
 * could not record. (It honours the reservation ledger like every other fake —
 * that is precisely the mechanism under test.)
 */
function makeUnwritableAdapter(
  meta: Pick<PhotoQueueTableAdapter, "table" | "bucket" | "upsert">,
  row: PhotoUploadRow,
): PhotoQueueTableAdapter & { claimNext: jest.Mock; persist: jest.Mock } {
  return {
    ...meta,
    claimNext: jest.fn(
      async (
        _mode: unknown,
        _nowMs: unknown,
        isReserved?: (rowId: string) => boolean,
      ) => (isReserved?.(row.id) ? null : { ...row }),
    ),
    persist: jest.fn(async () => {
      throw new Error("database is locked");
    }),
    countUnresolved: jest.fn(async () => 1),
    countActionable: jest.fn(async () => 1),
    countParked: jest.fn(async () => 0),
    listUnresolved: jest.fn(async () => [{ ...row }]),
    listStaleUploading: jest.fn(async () => []),
  };
}

/**
 * The lifecycle guarantee behind the memory-retention fix.
 *
 * `runPass` re-arms `scheduleNextPass` for as long as anything is unresolved,
 * and that timer chain is completely independent of whether React still holds a
 * reference to the service. A superseded instance therefore ran forever —
 * claiming rows through a stale Supabase client and keeping its whole retained
 * graph alive — which is why RAM stayed elevated long after every visible
 * upload had finished. `dispose()` is what makes an instance mortal, and this
 * is the test that proves the timer chain actually dies.
 */
describe("dispose — a retired service acquires no new work (lifecycle)", () => {
  /** An upload that always fails, so the row stays unresolved and claimable. */
  const alwaysFailingUpload = () =>
    jest.fn(async () => ({ data: null, error: { message: "network down" } }));

  it("cancels the armed pass and never re-arms it — the memory-retention regression", async () => {
    // The row fails, so the queue still has work: this is exactly the state in
    // which the loop re-arms itself indefinitely, which is what kept an
    // orphaned instance (and its Supabase client, lanes and closures) alive for
    // the rest of the session.
    const row = queueRow(DAMAGE, "after-dispose");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    const claimSpy = jest.spyOn(adapter, "claimNext");
    const gate = createDeferred<void>();
    const { client, upload } = clientWith({
      upload: jest.fn(async () => {
        await gate.promise;
        return { data: null, error: { message: "network down" } };
      }),
    });
    const service = createPhotoUploadService(client);

    // Disposed *while a pass is in flight* — the case that matters. A dispose
    // between passes only has to cancel one pending timer; a dispose mid-pass
    // has to stop the pass from arming the next one on its way out.
    const pass = service.triggerFast();
    await flushMicrotasks();
    expect(upload).toHaveBeenCalledTimes(1);

    service.dispose();
    gate.resolve();
    await pass;

    // The attempt still recorded its outcome (§5 — dispose never loses a row)…
    expect(adapter.find("after-dispose")!.upload_status).toBe("failed");
    await expect(service.countUnresolved()).resolves.toBe(1);
    // …but the pass did not schedule its successor, so the chain ends here.
    expect(jest.getTimerCount()).toBe(0);

    claimSpy.mockClear();
    upload.mockClear();
    // Well past both the fast (4s) and backoff (60s) cadences.
    await jest.advanceTimersByTimeAsync(120_000);

    expect(claimSpy).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("stops handing out rows the moment it is disposed, mid-drain", async () => {
    // Five rows, three lanes: the last two can only be reached by a claim made
    // *after* dispose. They must never be.
    const rows = ["r1", "r2", "r3", "r4", "r5"].map((id) => queueRow(DAMAGE, id));
    const adapter = makeMultiRowAdapter(DAMAGE, rows);
    adapters.push(adapter);
    filesOnDisk(...rows.map((r) => r.photo_path));

    const gate = createDeferred<void>();
    const { client, upload } = clientWith({
      upload: jest.fn(async (path: string) => {
        await gate.promise;
        return { data: { path }, error: null };
      }),
    });

    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await flushMicrotasks();

    expect(upload).toHaveBeenCalledTimes(MAX_CONCURRENT_UPLOADS);

    service.dispose();
    gate.resolve();
    await pass;

    // The three already claimed finished; nothing new was claimed after that.
    expect(upload).toHaveBeenCalledTimes(MAX_CONCURRENT_UPLOADS);
    expect(
      adapter.rows().filter((r) => r.upload_status === "uploaded"),
    ).toHaveLength(MAX_CONCURRENT_UPLOADS);
    expect(
      adapter.rows().filter((r) => r.upload_status === "pending"),
    ).toHaveLength(rows.length - MAX_CONCURRENT_UPLOADS);
  });

  it("ignores triggers that arrive after dispose", async () => {
    const row = queueRow(DAMAGE, "trigger-after-dispose");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    const claimSpy = jest.spyOn(adapter, "claimNext");
    const { client, upload } = clientWith();
    const service = createPhotoUploadService(client);

    service.dispose();
    await service.triggerFast();
    await service.triggerBackoff();

    expect(claimSpy).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(adapter.find("trigger-after-dispose")!.upload_status).toBe("pending");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("is idempotent", async () => {
    const service = createPhotoUploadService(clientWith().client);

    expect(() => {
      service.dispose();
      service.dispose();
    }).not.toThrow();
  });

  it("lets an in-flight upload finish and record its outcome", async () => {
    // §5's "never lose a row": dispose stops the service acquiring new work, it
    // does not interrupt an attempt that is already talking to the bucket.
    const row = queueRow(DAMAGE, "in-flight-at-dispose");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    const gate = createDeferred<void>();
    const { client, upload } = clientWith({
      upload: jest.fn(async (path: string) => {
        await gate.promise;
        return { data: { path }, error: null };
      }),
    });

    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await flushMicrotasks();

    expect(upload).toHaveBeenCalledTimes(1);
    service.dispose();

    gate.resolve();
    await pass;

    expect(adapter.find("in-flight-at-dispose")!.upload_status).toBe("uploaded");
  });
});

describe("bounded concurrency and claim exclusivity (§10)", () => {
  it("uploads a report's three photos in one concurrent pass, each exactly once", async () => {
    const rows = ["p1", "p2", "p3"].map((id) => queueRow(DAMAGE, id));
    const adapter = makeMultiRowAdapter(DAMAGE, rows);
    adapters.push(adapter);
    filesOnDisk(...rows.map((row) => row.photo_path));

    const gate = createDeferred<void>();
    const inFlight: string[] = [];
    const { client, upload } = clientWith({
      upload: jest.fn(async (path: string) => {
        inFlight.push(path);
        await gate.promise;
        return { data: { path }, error: null };
      }),
    });

    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await flushMicrotasks();

    // All three are in flight together — the whole point of the change.
    expect(inFlight).toHaveLength(3);
    expect([...inFlight].sort()).toEqual(rows.map((row) => row.photo_path).sort());
    // Every row was reserved before any upload started, so no lane could ever
    // be handed a row another lane already holds — and the reservation is the
    // service's in-memory ledger (§10), not a `uploading` status write, so the
    // rows themselves are untouched in the database while they upload. That is
    // the whole point: a mid-flight photo costs zero synced writes.
    for (const row of adapter.rows()) {
      expect(row.upload_status).toBe("pending");
      expect(service.isRowInFlight(DAMAGE.table, row.id)).toBe(true);
    }

    gate.resolve();
    await pass;

    expect(upload).toHaveBeenCalledTimes(3);
    expect(adapter.rows().map((row) => row.upload_status)).toEqual([
      "uploaded",
      "uploaded",
      "uploaded",
    ]);
  });

  it("never exceeds MAX_CONCURRENT_UPLOADS, however many rows are eligible", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => queueRow(DAMAGE, `p${i}`));
    const adapter = makeMultiRowAdapter(DAMAGE, rows);
    adapters.push(adapter);
    filesOnDisk(...rows.map((row) => row.photo_path));

    let active = 0;
    let maxActive = 0;
    const { client, upload } = clientWith({
      upload: jest.fn(async (path: string) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return { data: { path }, error: null };
      }),
    });

    await createPhotoUploadService(client).triggerFast();

    expect(upload).toHaveBeenCalledTimes(8);
    expect(maxActive).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
    expect(
      adapter.rows().every((row) => row.upload_status === "uploaded"),
    ).toBe(true);
  });

  it("fills the lanes from the highest-priority table first, spilling over only when it runs dry", async () => {
    const damageRows = ["d1", "d2"].map((id) => queueRow(DAMAGE, id));
    const inspectionRows = ["i1", "i2"].map((id) => queueRow(INSPECTION, id));
    const damage = makeMultiRowAdapter(DAMAGE, damageRows);
    const inspection = makeMultiRowAdapter(INSPECTION, inspectionRows);
    // Priority order is `PHOTO_QUEUE_ADAPTERS`' own order (§10).
    adapters.push(damage, inspection);
    filesOnDisk(
      ...[...damageRows, ...inspectionRows].map((row) => row.photo_path),
    );

    const gate = createDeferred<void>();
    const started: string[] = [];
    const { client } = clientWith({
      upload: jest.fn(async (path: string) => {
        started.push(path);
        await gate.promise;
        return { data: { path }, error: null };
      }),
    });

    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await flushMicrotasks();

    // Both damage photos plus one spillover — the third lane only reaches
    // InspectionPhotos because DamageReportPhotos had nothing left.
    expect([...started].sort()).toEqual([
      damageRows[0].photo_path,
      damageRows[1].photo_path,
      inspectionRows[0].photo_path,
    ].sort());
    expect(inspection.find("i2")!.upload_status).toBe("pending");

    gate.resolve();
    await pass;

    expect(started).toHaveLength(4);
    expect(
      [...damage.rows(), ...inspection.rows()].every(
        (row) => row.upload_status === "uploaded",
      ),
    ).toBe(true);
  });
});

/**
 * The single most important correctness property of the concurrency work: a row
 * whose outcome cannot be written must cost a bounded number of attempts and
 * then be left alone — never re-uploaded in a loop.
 *
 * The shape of the guard changed with the reservation. It used to protect the
 * *claim*: the claim persisted `uploading`, that write could fail, and retrying
 * it across three tables in one call would have spun. There is no claim write
 * any more, so that failure mode is gone at the source. What remains is the
 * terminal write, and the danger there is the mirror image: with the row
 * unchanged in the database and the reservation released, the very next lane
 * would claim it again and re-upload the same photo forever, with backoff never
 * advancing because nothing can record an attempt. The service therefore keeps
 * its claim on a row whose outcome §14's retries AND its guaranteed-`failed`
 * fallback both failed to write.
 */
describe("unrecordable-outcome guard (§10/§14)", () => {
  it("attempts the row once, then holds its claim instead of re-uploading it", async () => {
    const row = queueRow(DAMAGE, "unwritable");
    const broken = makeUnwritableAdapter(DAMAGE, row);
    // Two more tables behind it, to prove nothing spills into them either.
    const second = makeMultiRowAdapter(INSPECTION, []);
    const third = makeMultiRowAdapter(DOCUMENTS, []);
    adapters.push(broken, second, third);
    filesOnDisk(row.photo_path);

    const { client, upload } = clientWith();
    const service = createPhotoUploadService(client);

    const pass = service.triggerFast();
    // `persistWithRetry`'s 100ms/300ms pauses have to elapse for the pass to end.
    await jest.advanceTimersByTimeAsync(3_000);
    await pass;

    // One upload, and one bounded write cycle: 3 retries of the real outcome
    // plus the single guaranteed-`failed` fallback shot.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(broken.persist).toHaveBeenCalledTimes(PERSIST_RETRY_ATTEMPTS + 1);
    // The row is exactly as it was — nothing about it was lost or corrupted.
    expect(row.upload_status).toBe("pending");
    expect(row.attempts).toBe(0);
    // Neither follower was written to.
    expect(second.persistCalls()).toEqual([]);
    expect(third.persistCalls()).toEqual([]);

    // The claim is still held, which is what makes the row unclaimable...
    expect(service.isRowInFlight(DAMAGE.table, row.id)).toBe(true);
    // ...so the next scheduled pass finds nothing to do rather than starting
    // the same upload over again. Deferred, not abandoned: a relaunch drops the
    // ledger and the row is ordinary work again.
    expect(jest.getTimerCount()).toBe(1);
    broken.persist.mockClear();
    await jest.advanceTimersByTimeAsync(4_000 + 3_000);

    expect(upload).toHaveBeenCalledTimes(1);
    expect(broken.persist).not.toHaveBeenCalled();
  });
});

describe("persist resilience for terminal writes (§14)", () => {
  it("retries a flaky terminal write and still records the real outcome", async () => {
    const row = queueRow(DAMAGE, "flaky");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    let failures = 0;
    const persist = failPersistWhile(
      adapter,
      (next) => next.upload_status === "uploaded" && failures++ < 2,
    );

    const { client, upload } = clientWith();
    const service = createPhotoUploadService(client);

    const pass = service.triggerFast();
    await jest.advanceTimersByTimeAsync(3_000);
    await pass;

    expect(upload).toHaveBeenCalledTimes(1);
    expect(adapter.find("flaky")!.upload_status).toBe("uploaded");
    expect(adapter.find("flaky")!.last_error).toBeNull();
    // 2 rejected confirms + the one that landed. There is no reservation write
    // any more, so this is the whole of the row's database traffic.
    expect(persist).toHaveBeenCalledTimes(3);
  });

  it("falls back to failed — never leaves the row stuck uploading — when a terminal write cannot land", async () => {
    const row = queueRow(DAMAGE, "unpersistable");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    // Only the success write is rejected; the fallback `failed` write lands.
    failPersistWhile(adapter, (next) => next.upload_status === "uploaded");

    const { client, upload } = clientWith();
    const service = createPhotoUploadService(client);

    const pass = service.triggerFast();
    await jest.advanceTimersByTimeAsync(3_000);
    await pass;

    expect(upload).toHaveBeenCalledTimes(1);
    const current = adapter.find("unpersistable")!;
    // `failed` is retryable, counted and banner-visible; `uploading` is none of
    // those, which is why the guarantee is worth a redundant later attempt.
    expect(current.upload_status).toBe("failed");
    expect(current.last_error).toBe(PERSIST_FALLBACK_ERROR);
    await expect(adapter.countUnresolved()).resolves.toBe(1);
  });
});

describe("stale-uploading reclaim through a real pass (§14)", () => {
  it("reclaims a row stranded in `uploading` by a previous session and makes it visible again", async () => {
    // Exactly the shape found on a real device: `uploading`, hours old, and
    // invisible to everything.
    const stranded: PhotoUploadRow = {
      ...queueRow(DAMAGE, "stranded"),
      upload_status: "uploading",
      attempts: 1,
      last_attempt_at: new Date(
        Date.now() - STALE_UPLOADING_THRESHOLD_MS - 60_000,
      ).toISOString(),
    };
    const adapter = makeMultiRowAdapter(DAMAGE, [stranded]);
    adapters.push(adapter);
    filesOnDisk(stranded.photo_path);

    // The bug, stated as an assertion: nothing sees the row while it sits in
    // `uploading` — not the queue's counts, and not the banner query, which
    // filters on the same `pending`/`failed` set.
    await expect(adapter.countUnresolved()).resolves.toBe(0);
    await expect(adapter.claimNext("fast", Date.now())).resolves.toBeNull();

    const { client } = clientWith();
    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await jest.advanceTimersByTimeAsync(3_000);
    await pass;

    const reclaimed = adapter.find("stranded")!;
    expect(reclaimed.upload_status).toBe("failed");
    expect(reclaimed.last_error).toBe(STALE_UPLOADING_ERROR);
    expect(reclaimed.attempts).toBe(stranded.attempts + 1);
    // Visible again — to the queue and to the driver.
    await expect(adapter.countUnresolved()).resolves.toBe(1);
    await expect(adapter.countActionable()).resolves.toBe(1);
  });

  it("leaves a fresh `uploading` row alone", async () => {
    const fresh: PhotoUploadRow = {
      ...queueRow(DAMAGE, "fresh"),
      upload_status: "uploading",
      attempts: 1,
      last_attempt_at: new Date(Date.now() - UPLOAD_TIMEOUT_MS).toISOString(),
    };
    const adapter = makeMultiRowAdapter(DAMAGE, [fresh]);
    adapters.push(adapter);

    const { client } = clientWith();
    await createPhotoUploadService(client).triggerFast();

    expect(adapter.find("fresh")!.upload_status).toBe("uploading");
    expect(adapter.find("fresh")!.last_error).toBeNull();
  });
});

/**
 * §5.1 + §14 together: a timeout does not cancel the request, so the row can be
 * legitimately mid-verification long past the staleness threshold. The sweep
 * must not yank it — and the verification must not waste a second upload.
 */
describe("timeout verification, and the in-flight exclusion it needs (§5.1/§14)", () => {
  it("resolves a timed-out upload that actually landed to `uploaded`, with no second upload", async () => {
    const row = queueRow(DAMAGE, "landed-late");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    // A request that never answers — the §5 deadline is what ends the attempt.
    const { client, upload, list } = clientWith({
      upload: jest.fn(() => new Promise(() => {})),
      list: bucketHolds(row.photo_path),
    });

    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1_000);
    await pass;

    // The orphaned request landed, the lookup found it, and the row is done —
    // in this same pass, without a duplicate upload burning another attempt.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(adapter.find("landed-late")!.upload_status).toBe("uploaded");
  });

  it("keeps a timed-out upload retryable when the bucket says the object is absent", async () => {
    const row = queueRow(DAMAGE, "really-lost");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    const { client, list } = clientWith({
      upload: jest.fn(() => new Promise(() => {})),
      list: jest.fn(async () => ({ data: [], error: null })),
    });

    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1_000);
    await pass;

    expect(list).toHaveBeenCalledTimes(1);
    const current = adapter.find("really-lost")!;
    expect(current.upload_status).toBe("failed");
    expect(current.attempts).toBe(1);
    expect(current.last_error).toContain("Upload timed out");
  });

  it("never calls a timed-out upload successful when the lookup itself could not run", async () => {
    const row = queueRow(DAMAGE, "unknowable");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    // Offline / auth expired / rate limited — `unknown`, which must never be
    // downgraded to "present" (nor to a confident "absent").
    const { client } = clientWith({
      upload: jest.fn(() => new Promise(() => {})),
      list: jest.fn(async () => ({ data: null, error: { message: "offline" } })),
    });

    const service = createPhotoUploadService(client);
    const pass = service.triggerFast();
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1_000);
    await pass;

    expect(adapter.find("unknowable")!.upload_status).toBe("failed");
  });

  it("does not let a concurrent pass's stale sweep reclaim a row that is still being verified", async () => {
    const row = queueRow(DAMAGE, "verifying");
    const adapter = makeMultiRowAdapter(DAMAGE, [row]);
    adapters.push(adapter);
    filesOnDisk(row.photo_path);

    const lookupGate = createDeferred<{ data: { name: string }[]; error: null }>();
    const { client, upload, list } = clientWith({
      upload: jest.fn(() => new Promise(() => {})),
      list: jest.fn(() => lookupGate.promise),
    });

    const service = createPhotoUploadService(client);

    // Pass A: the upload times out and the §5.1 bucket lookup starts...
    const passA = service.triggerFast();
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1_000);
    expect(list).toHaveBeenCalledTimes(1);
    // Untouched in the database — the claim is a ledger entry (§10), so to SQL
    // this row still looks like ordinary `pending` work.
    expect(adapter.find("verifying")!.upload_status).toBe("pending");
    expect(service.isRowInFlight(DAMAGE.table, "verifying")).toBe(true);

    // ...and hangs there, long past the staleness threshold.
    await jest.advanceTimersByTimeAsync(STALE_UPLOADING_THRESHOLD_MS * 2);

    // Pass B runs while pass A's lane is still holding the row.
    const passB = service.triggerBackoff();
    await flushMicrotasks();

    // Two ways pass B could damage it, and the ledger is what stops both: the
    // §14 sweep (moot here — the row was never written to `uploading`), and a
    // fresh claim, which would start a second upload of a photo that may be
    // landing server-side as we speak (§5.1).
    const duringSweep = adapter.find("verifying")!;
    expect(duringSweep.upload_status).toBe("pending");
    expect(duringSweep.last_error).not.toBe(STALE_UPLOADING_ERROR);
    expect(upload).toHaveBeenCalledTimes(1);

    // The lookup finally answers, and the row finishes on its own terms.
    lookupGate.resolve({
      data: [{ name: row.photo_path.slice(row.photo_path.lastIndexOf("/") + 1) }],
      error: null,
    });
    await Promise.all([passA, passB]);

    expect(adapter.find("verifying")!.upload_status).toBe("uploaded");
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
