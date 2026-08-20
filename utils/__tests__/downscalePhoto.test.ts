/**
 * The 1080×1920 size cap, at the level where the decision actually lives.
 *
 * `planDownscale` is the whole rule — orientation-agnostic, one-directional,
 * and a strict no-op below the cap — so its edges are the cap's edges. The
 * async wrapper is tested only for the two things that are not the rule: that a
 * downscale reaches the manipulator as JPEG, and that every failure path hands
 * back the untouched original rather than losing the photo.
 */

import {
  MAX_LONG_EDGE,
  MAX_SHORT_EDGE,
  downscalePhotoIfNeeded,
  planDownscale,
} from "@/utils/downscalePhoto";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));

const mockManipulate = manipulateAsync as jest.MockedFunction<
  typeof manipulateAsync
>;

describe("planDownscale", () => {
  it("caps at 1080×1920", () => {
    expect(MAX_SHORT_EDGE).toBe(1080);
    expect(MAX_LONG_EDGE).toBe(1920);
  });

  it("leaves a photo that is exactly the cap untouched, in either orientation", () => {
    expect(planDownscale(1080, 1920)).toBeNull();
    expect(planDownscale(1920, 1080)).toBeNull();
  });

  it("leaves a low-resolution photo untouched rather than re-encoding it", () => {
    expect(planDownscale(640, 480)).toBeNull();
    expect(planDownscale(800, 600)).toBeNull();
  });

  /**
   * The short edge is the binding constraint for a normal phone capture: 4032
   * scaled by 1920/4032 would still be 3024 wide, well over 1080.
   */
  it("fits a 4:3 portrait capture inside the cap via its short edge", () => {
    expect(planDownscale(3024, 4032)).toEqual({ width: 1080 });
  });

  it("fits the same capture in landscape, mirrored", () => {
    // 4032×3024 → width scaled by 1080/3024, i.e. 1440×1080.
    expect(planDownscale(4032, 3024)).toEqual({ width: 1440 });
  });

  it("fits a square capture to the short edge", () => {
    expect(planDownscale(3000, 3000)).toEqual({ width: 1080 });
  });

  /** A panorama is bound by its long edge, not its short one. */
  it("fits a panorama via its long edge", () => {
    expect(planDownscale(4000, 400)).toEqual({ width: 1920 });
  });

  it("is a no-op one pixel below the cap and acts one pixel above it", () => {
    expect(planDownscale(1080, 1919)).toBeNull();
    expect(planDownscale(1080, 1921)).not.toBeNull();
    expect(planDownscale(1081, 1920)).not.toBeNull();
  });

  /**
   * A pathologically thin image must not round down to a zero-width picture —
   * that would turn "too big" into "no photo at all".
   */
  it("never plans a zero-width resize", () => {
    const plan = planDownscale(8000, 2);
    expect(plan).not.toBeNull();
    expect(plan!.width).toBeGreaterThan(0);
  });

  it("treats missing or nonsensical dimensions as nothing to do", () => {
    expect(planDownscale(0, 0)).toBeNull();
    expect(planDownscale(-1, 100)).toBeNull();
    expect(planDownscale(NaN, 4000)).toBeNull();
    expect(planDownscale(4000, Infinity)).toBeNull();
  });
});

describe("downscalePhotoIfNeeded", () => {
  it("resizes an over-large photo and returns it as JPEG", async () => {
    mockManipulate.mockResolvedValue({
      uri: "file:///cache/small.jpg",
      width: 1080,
      height: 1440,
    } as never);

    const result = await downscalePhotoIfNeeded("file:///cache/big.heic", {
      width: 3024,
      height: 4032,
    });

    expect(result).toEqual({ uri: "file:///cache/small.jpg", ext: "jpg" });
    expect(mockManipulate).toHaveBeenCalledWith(
      "file:///cache/big.heic",
      [{ resize: { width: 1080 } }],
      expect.objectContaining({ format: SaveFormat.JPEG }),
    );
  });

  it("does not touch the manipulator at all for a photo within the cap", async () => {
    const result = await downscalePhotoIfNeeded("file:///cache/small.jpg", {
      width: 1080,
      height: 1920,
    });

    expect(result).toBeNull();
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it("skips the cap when the picker reported no dimensions", async () => {
    expect(
      await downscalePhotoIfNeeded("file:///cache/x.jpg", undefined),
    ).toBeNull();
    expect(await downscalePhotoIfNeeded("file:///cache/x.jpg", {})).toBeNull();
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  /**
   * The failure that matters: an unreadable format must cost us the size
   * saving, never the evidence photo.
   */
  it("falls back to the original when the manipulator throws", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockManipulate.mockRejectedValue(new Error("unsupported format"));

    const result = await downscalePhotoIfNeeded("file:///cache/big.jpg", {
      width: 4032,
      height: 3024,
    });

    expect(result).toBeNull();
  });
});
