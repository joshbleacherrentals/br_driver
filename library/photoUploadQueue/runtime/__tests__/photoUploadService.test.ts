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

import { localUriForPath } from "@/library/photoUploadQueue/runtime/localFile";
import { createPhotoUploadService } from "@/library/photoUploadQueue/runtime/photoUploadService";
import { PHOTO_QUEUE_ADAPTERS } from "@/library/photoUploadQueue/runtime/tableAdapters";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import {
  MISSING_LOCAL_FILE_ERROR,
  type PhotoUploadRow,
} from "@/library/photoUploadQueue/types";

// The service only ever talks to its adapters through `PHOTO_QUEUE_ADAPTERS`
// (never to `db`/`SystemProvider` directly), so replacing that export with an
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
  readAsStringAsync: jest.fn(async () => "AAAA"),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

const mockFs = FileSystem as unknown as {
  documentDirectory: string;
  getInfoAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
};

const CONTAINER_BEFORE = "file:///container-A/Documents/";
const CONTAINER_AFTER = "file:///container-B-after-rebuild/Documents/";

/** Same array reference the mocked module exports — mutated per test. */
const adapters = PHOTO_QUEUE_ADAPTERS as unknown as PhotoQueueTableAdapter[];

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
 * Minimal stand-in for a real `PhotoQueueTableAdapter` — an in-memory single
 * row instead of a real Kysely/PowerSync-backed table. Mirrors the real
 * adapters' `claimNext`/`persist`/`countActionable` semantics (see
 * `tableAdapters.ts`: a row with `last_error === MISSING_LOCAL_FILE_ERROR` is
 * parked — never claimed, never counted as actionable) closely enough to
 * drive `uploadRow` through a realistic single pass.
 */
function makeFakeAdapter(
  meta: Pick<PhotoQueueTableAdapter, "table" | "bucket" | "upsert">,
  initialRow: PhotoUploadRow,
): PhotoQueueTableAdapter & { current: () => PhotoUploadRow } {
  let row: PhotoUploadRow = { ...initialRow };
  return {
    ...meta,
    current: () => row,
    async claimNext() {
      if (row.upload_status === "uploaded") return null;
      if (row.last_error === MISSING_LOCAL_FILE_ERROR) return null;
      return { ...row };
    },
    async persist(next) {
      row = { ...next };
    },
    async countUnresolved() {
      return row.upload_status === "uploaded" ? 0 : 1;
    },
    async countActionable() {
      if (row.upload_status === "uploaded") return 0;
      if (row.last_error === MISSING_LOCAL_FILE_ERROR) return 0;
      return 1;
    },
    async listUnresolved() {
      return row.upload_status === "uploaded" ? [] : [{ ...row }];
    },
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
  adapters.length = 0;
  mockFs.documentDirectory = CONTAINER_BEFORE;
  mockFs.getInfoAsync.mockReset();
  mockFs.readAsStringAsync.mockReset();
  mockFs.readAsStringAsync.mockResolvedValue("AAAA");
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
      expect(mockFs.readAsStringAsync).toHaveBeenCalledWith(
        canonicalUri,
        expect.anything(),
      );
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
        expect(mockFs.readAsStringAsync).toHaveBeenCalledWith(
          canonicalUriAfterDrift,
          expect.anything(),
        );
        expect(mockFs.readAsStringAsync).not.toHaveBeenCalledWith(
          canonicalUriBeforeDrift,
          expect.anything(),
        );
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
      expect(mockFs.readAsStringAsync).not.toHaveBeenCalled();
    });
  },
);
