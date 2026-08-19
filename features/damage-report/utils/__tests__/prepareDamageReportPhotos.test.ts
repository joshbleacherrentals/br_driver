/**
 * Phase 1 of a damage report save: what the driver is told, and when the save
 * is refused outright.
 *
 * Two behaviours this pins down, both of which were wrong before:
 *
 * 1. **Progress counted the loop, not the photos.** The old callback reported
 *    `(i + 1, total)`, so the modal read "5 of 5 saved" whether five photos had
 *    been written or none had. `attempted` and `saved` are now separate numbers
 *    and the modal shows the second one.
 *
 * 2. **A report could end up with no photos at all.** The report row was
 *    written first and the photos afterwards, so a selection whose files had
 *    all disappeared produced a damage report carrying no evidence — visually
 *    indistinguishable from a complete one. Nothing is written now unless at
 *    least one photo is on disk.
 *
 * `preparePhoto` is mocked: it is a thin wrapper over the filesystem, the image
 * manipulator and the gallery, and what is under test here is the loop's
 * bookkeeping, not theirs.
 */

import { prepareDamageReportPhotos } from "@/features/damage-report/utils/prepareDamageReportPhotos";
import { preparePhoto } from "@/features/damage-report/utils/preparePhoto";
import type { DocumentPhoto } from "@/features/damage-report/types";

jest.mock("@/features/damage-report/utils/preparePhoto", () => ({
  __esModule: true,
  preparePhoto: jest.fn(),
}));

jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => "damage-id",
}));

const mockPreparePhoto = preparePhoto as jest.MockedFunction<
  typeof preparePhoto
>;

const photo = (name: string): DocumentPhoto => ({
  uri: `file:///cache/${name}.jpg`,
  isNew: true,
  ext: "jpg",
});

/** `preparePhoto` succeeds for the listed uris and fails for everything else. */
function succeedFor(...names: string[]): void {
  const ok = new Set(names.map((name) => `file:///cache/${name}.jpg`));
  mockPreparePhoto.mockImplementation(async (candidate, damageId, index) =>
    ok.has(candidate.uri ?? "")
      ? {
          ok: true,
          prepared: {
            photoPath: `${damageId}/photo_${index}.jpg`,
            thumbnail: null,
          },
        }
      : {
          ok: false,
          failure: { reason: "file_missing", uri: candidate.uri ?? "" },
        },
  );
}

describe("prepareDamageReportPhotos", () => {
  it("refuses the save when not one photo could be written", async () => {
    succeedFor();

    const result = await prepareDamageReportPhotos({
      photos: [photo("a"), photo("b")],
    });

    expect(result).toMatchObject({ ok: false, reason: "all_photos_failed" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "all_photos_failed") {
      expect(result.failures).toHaveLength(2);
    }
  });

  it("keeps going when only some photos fail, and reports both numbers", async () => {
    succeedFor("a", "c");

    const progress: { attempted: number; saved: number; total: number }[] = [];
    const result = await prepareDamageReportPhotos({
      photos: [photo("a"), photo("b"), photo("c")],
      onPhotoProgress: (p) => progress.push(p),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.photos).toHaveLength(2);
    expect(result.draft.failures).toEqual([
      { reason: "file_missing", uri: "file:///cache/b.jpg" },
    ]);

    // The distinction the modal depends on: three attempted, two saved.
    expect(progress[progress.length - 1]).toEqual({
      attempted: 3,
      saved: 2,
      total: 3,
    });
    // `saved` never advances for a photo that failed.
    expect(progress.map((p) => p.saved)).toEqual([0, 1, 1, 2]);
  });

  it("stops at the driver's cancel, having written nothing to the database", async () => {
    succeedFor("a", "b", "c");
    let cancelled = false;

    const result = await prepareDamageReportPhotos({
      photos: [photo("a"), photo("b"), photo("c")],
      shouldAbort: () => cancelled,
      // Cancelled after the first photo is done — the loop opens with an
      // `attempted: 0` progress event before it has prepared anything.
      onPhotoProgress: (p) => {
        if (p.attempted >= 1) cancelled = true;
      },
    });

    expect(result).toEqual({ ok: false, reason: "aborted" });
    // The first photo is prepared before the first progress callback fires;
    // nothing after it is even attempted.
    expect(mockPreparePhoto).toHaveBeenCalledTimes(1);
  });

  it("treats a report with no new photos as nothing to prepare, not as a failure", async () => {
    succeedFor();

    // Re-opening an existing report and re-saving it: every photo is already
    // recorded, so there is nothing for this phase to do.
    const result = await prepareDamageReportPhotos({
      photos: [{ uri: "file:///cache/old.jpg", isNew: false }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.photos).toEqual([]);
    expect(result.draft.failures).toEqual([]);
  });
});
