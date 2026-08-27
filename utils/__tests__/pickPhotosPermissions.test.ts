/**
 * Google Play's Photo and Video Permissions policy, at the level where we can
 * actually break it again.
 *
 * The app was rejected for declaring `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`
 * while never reading the media library: `launchImageLibraryAsync` already goes
 * through the Android system photo picker, which needs no permission at all.
 * Once those permissions leave the manifest, any surviving
 * `requestMediaLibraryPermissionsAsync()` gate resolves to `denied` on
 * Android 13+ — the picker would stay shut and the driver could not attach a
 * single photo. So the manifest change and the removal of the gate are one
 * change, and this is the test that keeps them together.
 *
 * Camera capture is untouched: `CAMERA` is not a media permission and its gate
 * must stay.
 */

import {
  pickPhotosFromCamera,
  pickPhotosFromLibrary,
} from "@/utils/pickPhotos";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock("@/utils/downscalePhoto", () => ({
  downscalePhotoIfNeeded: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/utils/convertToJpeg", () => ({
  convertToJpegIfNeeded: jest
    .fn()
    .mockImplementation((uri: string) => Promise.resolve({ uri, ext: "jpg" })),
}));

const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockLaunchCamera = ImagePicker.launchCameraAsync as jest.Mock;
const mockRequestCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const mockRequestMediaLibrary =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;

describe("pickPhotosFromLibrary", () => {
  it("opens the system photo picker without asking for a media-library permission", async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///pick.jpg", width: 800, height: 600 }],
    });

    const photos = await pickPhotosFromLibrary();

    expect(mockRequestMediaLibrary).not.toHaveBeenCalled();
    expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
    expect(photos).toEqual([
      { uri: "file:///pick.jpg", ext: "jpg", source: "library" },
    ]);
  });

  /**
   * A driver backing out of the picker is the ordinary case, and it must not be
   * confused with a permission failure now that there is no permission.
   */
  it("returns nothing and warns about nothing when the driver cancels", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickPhotosFromLibrary()).resolves.toEqual([]);
    expect(alert).not.toHaveBeenCalled();
  });
});

describe("pickPhotosFromCamera", () => {
  it("still gates on the camera permission", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockRequestCamera.mockResolvedValue({ status: "denied" });

    await expect(pickPhotosFromCamera()).resolves.toEqual([]);
    expect(mockLaunchCamera).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });

  it("captures once the camera permission is granted", async () => {
    mockRequestCamera.mockResolvedValue({ status: "granted" });
    mockLaunchCamera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///shot.jpg", width: 800, height: 600 }],
    });

    await expect(pickPhotosFromCamera()).resolves.toEqual([
      { uri: "file:///shot.jpg", ext: "jpg", source: "camera" },
    ]);
  });
});

/**
 * The gate is gone from the two surfaces that had it; this is what stops a
 * third one from bringing it back. Once `READ_MEDIA_IMAGES` is out of the
 * manifest, any call to this API is a locked picker on Android 13+, not a
 * prompt — there is nothing left for it to ask for.
 */
describe("no surface asks for a media-library permission", () => {
  it("has no remaining call to requestMediaLibraryPermissionsAsync", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync } = require("child_process") as typeof import("child_process");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");

    const repoRoot = path.resolve(__dirname, "../..");
    let hits = "";
    try {
      hits = execFileSync(
        "grep",
        [
          "-rn",
          "--include=*.ts",
          "--include=*.tsx",
          "--exclude-dir=node_modules",
          "--exclude-dir=__tests__",
          "requestMediaLibraryPermissionsAsync",
          ".",
        ],
        { cwd: repoRoot, encoding: "utf8" },
      );
    } catch {
      // grep exits 1 when it finds nothing, which is the passing case.
    }

    expect(hits.trim()).toBe("");
  });
});
