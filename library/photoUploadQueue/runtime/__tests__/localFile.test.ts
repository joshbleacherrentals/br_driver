/**
 * Regression coverage for `runtime/localFile.ts` — the on-device path helpers
 * every photo-queue consumer, including `uploadRow` (photoUploadService.ts),
 * relies on.
 *
 * Why this matters: on iOS the app's container UUID can rotate (reinstall /
 * `expo prebuild --clean` / native rebuild) even on the same day a photo row
 * was written, which would silently invalidate any absolute `file://…` URI
 * captured and persisted at write time. That is exactly why no such column
 * exists on any photo table — `local_uri` was removed from the schema
 * entirely, and the on-device path is never stored anywhere. The photo file
 * itself survives a container rotation — it is migrated into the new
 * container under the same *relative* path. `localUriForPath`/
 * `localPhotoExists` are the only way to locate it: they recompute the
 * absolute path from `FileSystem.documentDirectory` fresh on every call
 * instead of trusting a value stored earlier. These tests prove that
 * guarantee holds by mutating the mocked `documentDirectory` between calls,
 * in-process, and asserting the resolved path (and existence check) tracks
 * the change immediately.
 *
 * See `./photoUploadService.test.ts` for the end-to-end proof that `uploadRow`
 * itself is safe under the same kind of container drift, now that it too goes
 * through these helpers instead of a stored path.
 */

import * as FileSystem from "expo-file-system/legacy";

import {
  copyLocalPhoto,
  localPhotoExists,
  localUriForPath,
} from "@/library/photoUploadQueue/runtime/localFile";

jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  documentDirectory:
    "file:///var/mobile/Containers/Data/Application/CONTAINER-A/Documents/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
}));

const CONTAINER_A =
  "file:///var/mobile/Containers/Data/Application/CONTAINER-A/Documents/";
const CONTAINER_B =
  "file:///var/mobile/Containers/Data/Application/CONTAINER-B-AFTER-REBUILD/Documents/";

/** The mocked module, typed loosely so the test can mutate its plain fields. */
const mockFs = FileSystem as unknown as {
  documentDirectory: string;
  getInfoAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
  writeAsStringAsync: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  copyAsync: jest.Mock;
};

afterEach(() => {
  mockFs.documentDirectory = CONTAINER_A;
  mockFs.getInfoAsync.mockReset();
  mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false }));
});

describe("localUriForPath", () => {
  it("derives the path from the current documentDirectory plus the bucket path", () => {
    mockFs.documentDirectory = CONTAINER_A;

    expect(localUriForPath("damage-report-uuid/photo-1.jpg")).toBe(
      `${CONTAINER_A}photo-upload-queue/damage-report-uuid/photo-1.jpg`,
    );
  });

  // The core guarantee: no memoization, no caching of a URI computed earlier —
  // every call re-reads `FileSystem.documentDirectory` live. This is precisely
  // what protects every consumer (resolvePhotoUri, requeuePhotoRows,
  // inspectionSummaryWidget, EditProfileDocs, and now uploadRow itself) from
  // container drift — there is no stored path anywhere left to go stale.
  it("recomputes fresh on every call — a changed documentDirectory changes the result immediately, with no stale caching", () => {
    mockFs.documentDirectory = CONTAINER_A;
    const beforeRotation = localUriForPath("driver-uuid/license.jpg");

    // Simulates the app's container UUID rotating (native rebuild/reinstall)
    // between two calls, with the same relative bucket path underneath.
    mockFs.documentDirectory = CONTAINER_B;
    const afterRotation = localUriForPath("driver-uuid/license.jpg");

    expect(beforeRotation).toBe(
      `${CONTAINER_A}photo-upload-queue/driver-uuid/license.jpg`,
    );
    expect(afterRotation).toBe(
      `${CONTAINER_B}photo-upload-queue/driver-uuid/license.jpg`,
    );
    expect(afterRotation).not.toBe(beforeRotation);
  });
});

describe("localPhotoExists", () => {
  it("checks existence against the path recomputed under the CURRENT documentDirectory", async () => {
    mockFs.documentDirectory = CONTAINER_A;
    const staleCanonicalPath = localUriForPath("report-uuid/photo-1.jpg");

    // Container rotates; the file migrates to the same relative path under the
    // new container root.
    mockFs.documentDirectory = CONTAINER_B;
    const currentCanonicalPath = localUriForPath("report-uuid/photo-1.jpg");
    expect(currentCanonicalPath).not.toBe(staleCanonicalPath);

    mockFs.getInfoAsync.mockImplementation(async (uri: string) => ({
      exists: uri === currentCanonicalPath,
    }));

    await expect(localPhotoExists("report-uuid/photo-1.jpg")).resolves.toBe(
      true,
    );
    expect(mockFs.getInfoAsync).toHaveBeenCalledWith(currentCanonicalPath);
    expect(mockFs.getInfoAsync).not.toHaveBeenCalledWith(staleCanonicalPath);
  });

  it("reports false once the current container no longer has the file at the recomputed path", async () => {
    mockFs.documentDirectory = CONTAINER_A;
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false }));

    await expect(localPhotoExists("missing/photo.jpg")).resolves.toBe(false);
  });
});

/**
 * The damage-report save loop used to reach the queue's directory by reading
 * each photo into a base64 string and writing that string back out — a plain
 * file copy performed as a multi-megabyte JS-heap round-trip, once per photo,
 * while the driver waited. What matters here is that the copy is a copy: no
 * `readAsStringAsync`, no `writeAsStringAsync`, and the destination is still
 * the path recomputed live from `photo_path`.
 */
describe("copyLocalPhoto", () => {
  it("copies the file directly, without routing its bytes through the JS heap", async () => {
    mockFs.documentDirectory = CONTAINER_A;
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: true }));

    const uri = await copyLocalPhoto(
      "file:///cache/damage-photos/pick.jpg",
      "report-1/photo_0.jpg",
    );

    expect(uri).toBe(`${CONTAINER_A}photo-upload-queue/report-1/photo_0.jpg`);
    expect(mockFs.copyAsync).toHaveBeenCalledWith({
      from: "file:///cache/damage-photos/pick.jpg",
      to: uri,
    });
    expect(mockFs.readAsStringAsync).not.toHaveBeenCalled();
    expect(mockFs.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("creates the destination directory when it does not exist yet", async () => {
    mockFs.documentDirectory = CONTAINER_A;
    mockFs.getInfoAsync.mockImplementation(async () => ({ exists: false }));

    await copyLocalPhoto("file:///cache/pick.jpg", "report-2/photo_0.jpg");

    expect(mockFs.makeDirectoryAsync).toHaveBeenCalledWith(
      `${CONTAINER_A}photo-upload-queue/report-2`,
      { intermediates: true },
    );
  });
});
