/**
 * What the driver sees while a big selection is being imported.
 *
 * The bug this pins down: picking thirty photos handed back one array at the
 * very end. Between "Accept" in the OS picker and the grid filling in there
 * were tens of seconds of a screen that looked like nothing had happened — no
 * counter, no spinner, no tiles. Drivers reasonably concluded the pick had been
 * lost and picked again.
 *
 * So the import now reports itself: a total as soon as the picker returns, a
 * photo at a time as each one lands on disk, and a running count in between.
 *
 * The trim against the photo cap moved in here too, because it has to happen
 * *before* photos start streaming into the grid — otherwise tiles appear and
 * are then taken away again.
 *
 * The filesystem side (`persistPickerPhoto`, `makePreview`) is mocked: what is
 * under test is the loop's reporting, not theirs.
 */

import {
  pickDamagePhotosFromCamera,
  pickDamagePhotosFromLibrary,
} from "@/features/damage-report/utils/pickDamagePhotos";
import type { PhotoImportProgress } from "@/features/damage-report/utils/pickDamagePhotos";
import type { DocumentPhoto } from "@/features/damage-report/types";
import { pickPhotosFromCamera, pickPhotosFromLibrary } from "@/utils/pickPhotos";
import { persistPickerPhoto } from "@/utils/persistPickerPhoto";
import { makePreview } from "@/utils/makePreview";
import { describePhotoLimit } from "@/utils/photoLimit";
import { Alert } from "react-native";

jest.mock("@/utils/pickPhotos", () => ({
  __esModule: true,
  pickPhotosFromCamera: jest.fn(),
  pickPhotosFromLibrary: jest.fn(),
}));

jest.mock("@/utils/persistPickerPhoto", () => ({
  __esModule: true,
  persistPickerPhoto: jest.fn(),
}));

jest.mock("@/utils/makePreview", () => ({
  __esModule: true,
  makePreview: jest.fn(),
}));

const mockPickLibrary = pickPhotosFromLibrary as jest.MockedFunction<
  typeof pickPhotosFromLibrary
>;
const mockPickCamera = pickPhotosFromCamera as jest.MockedFunction<
  typeof pickPhotosFromCamera
>;
const mockPersist = persistPickerPhoto as jest.MockedFunction<
  typeof persistPickerPhoto
>;
const mockPreview = makePreview as jest.MockedFunction<typeof makePreview>;

/** `n` library picks, named `0.jpg`, `1.jpg`, … */
function picks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    uri: `file:///tmp/${i}.jpg`,
    ext: "jpg",
    source: "library" as const,
  }));
}

beforeEach(() => {
  mockPersist.mockImplementation(async (uri) => uri.replace("/tmp/", "/kept/"));
  mockPreview.mockResolvedValue(null);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("pickDamagePhotosFromLibrary", () => {
  it("announces the size of the selection before any photo is on disk", async () => {
    mockPickLibrary.mockResolvedValue(picks(3));
    const progress: PhotoImportProgress[] = [];

    await pickDamagePhotosFromLibrary({
      onProgress: (p) => progress.push(p),
    });

    // The first report is what turns the indicator on, so it has to carry the
    // total and a zero count — not wait for the first photo to finish.
    expect(progress[0]).toEqual({ done: 0, total: 3 });
    expect(progress[progress.length - 1]).toEqual({ done: 3, total: 3 });
  });

  it("hands over each photo as it lands, not the batch at the end", async () => {
    mockPickLibrary.mockResolvedValue(picks(3));
    const streamed: DocumentPhoto[] = [];
    const seenCounts: number[] = [];

    mockPersist.mockImplementation(async (uri) => {
      // Every photo already streamed is on screen by the time the next one
      // starts being copied — that is what "the grid fills in" means.
      seenCounts.push(streamed.length);
      return uri.replace("/tmp/", "/kept/");
    });

    const all = await pickDamagePhotosFromLibrary({
      onPhoto: (photo) => streamed.push(photo),
    });

    expect(seenCounts).toEqual([0, 1, 2]);
    expect(streamed.map((p) => p.uri)).toEqual([
      "file:///kept/0.jpg",
      "file:///kept/1.jpg",
      "file:///kept/2.jpg",
    ]);
    // The returned batch stays the whole selection, for callers that do not
    // stream.
    expect(all).toHaveLength(3);
  });

  it("skips a photo it cannot copy without stopping the rest", async () => {
    mockPickLibrary.mockResolvedValue(picks(3));
    mockPersist.mockImplementation(async (uri) => {
      if (uri.includes("1.jpg")) throw new Error("copy failed");
      return uri.replace("/tmp/", "/kept/");
    });
    const progress: PhotoImportProgress[] = [];
    const streamed: DocumentPhoto[] = [];

    const all = await pickDamagePhotosFromLibrary({
      onProgress: (p) => progress.push(p),
      onPhoto: (photo) => streamed.push(photo),
    });

    expect(all.map((p) => p.uri)).toEqual([
      "file:///kept/0.jpg",
      "file:///kept/2.jpg",
    ]);
    expect(streamed).toHaveLength(2);
    // The counter tracks photos attempted, so it always reaches the total the
    // driver was shown rather than stalling short of it.
    expect(progress[progress.length - 1]).toEqual({ done: 3, total: 3 });
  });

  it("trims to the remaining headroom before anything reaches the grid", async () => {
    mockPickLibrary.mockResolvedValue(picks(5));
    const limit = describePhotoLimit(28, 30);
    const streamed: DocumentPhoto[] = [];
    const progress: PhotoImportProgress[] = [];

    const kept = await pickDamagePhotosFromLibrary({
      limit,
      onPhoto: (photo) => streamed.push(photo),
      onProgress: (p) => progress.push(p),
    });

    // Two slots left: three picks are refused, and refused picks are never
    // copied, never streamed and never counted.
    expect(kept).toHaveLength(2);
    expect(streamed).toHaveLength(2);
    expect(mockPersist).toHaveBeenCalledTimes(2);
    expect(progress[0]).toEqual({ done: 0, total: 2 });
    expect(Alert.alert).toHaveBeenCalled();
  });

  it("asks the picker for no more than the headroom", async () => {
    mockPickLibrary.mockResolvedValue([]);

    await pickDamagePhotosFromLibrary({ limit: describePhotoLimit(28, 30) });

    expect(mockPickLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ selectionLimit: 2 }),
    );
  });

  it("reports nothing when the driver cancels the picker", async () => {
    mockPickLibrary.mockResolvedValue([]);
    const onProgress = jest.fn();

    const photos = await pickDamagePhotosFromLibrary({ onProgress });

    expect(photos).toEqual([]);
    // An indicator that flashes on for an empty selection is worse than none.
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("pickDamagePhotosFromCamera", () => {
  it("streams its single capture the same way", async () => {
    mockPickCamera.mockResolvedValue([
      { uri: "file:///tmp/shot.jpg", ext: "jpg", source: "camera" },
    ]);
    const streamed: DocumentPhoto[] = [];

    const photos = await pickDamagePhotosFromCamera({
      onPhoto: (photo) => streamed.push(photo),
    });

    expect(photos.map((p) => p.uri)).toEqual(["file:///kept/shot.jpg"]);
    expect(streamed).toHaveLength(1);
    expect(streamed[0].source).toBe("camera");
  });
});
