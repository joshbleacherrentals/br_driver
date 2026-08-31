/**
 * The manifest half of the Play policy fix (see
 * `utils/__tests__/pickPhotosPermissions.test.ts` for the runtime half).
 *
 * `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` got the app rejected. They reach the
 * manifest from two directions, so both have to be shut:
 *
 *  1. The `expo-media-library` config plugin adds all three granular
 *     permissions unless `granularPermissions` says otherwise — `[]` here,
 *     because the only thing the app does with the media library is *save* a
 *     camera copy, which needs no read access at all.
 *  2. `READ_MEDIA_VISUAL_USER_SELECTED` is declared by the library's own
 *     `AndroidManifest.xml`, which Gradle merges in afterwards and no plugin
 *     option can suppress. It only means anything alongside the two rejected
 *     permissions, so it is removed with `tools:node="remove"`, which survives
 *     the merge.
 *
 * A permission is a native declaration: this can only ever be fixed by a new
 * build, never by an OTA update.
 */

import appJson from "../../app.json";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scrubMediaReadPermissions } = require("../withMediaPermissionScrub");

const FORBIDDEN = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
];

type UsesPermission = { $: Record<string, string> };
type AndroidManifest = {
  manifest: { $: Record<string, string>; "uses-permission"?: UsesPermission[] };
};

const permission = (name: string, extra: Record<string, string> = {}) => ({
  $: { "android:name": name, ...extra },
});

describe("app.json — expo-media-library options", () => {
  const mediaLibraryPlugin = (appJson.expo.plugins as unknown[]).find(
    (entry): entry is [string, Record<string, unknown>] =>
      Array.isArray(entry) && entry[0] === "expo-media-library",
  );

  it("requests no granular read permissions", () => {
    expect(mediaLibraryPlugin).toBeDefined();
    expect(mediaLibraryPlugin?.[1].granularPermissions).toEqual([]);
  });

  /**
   * Keeping the save-side string is the point: it is the one media-library
   * thing the app actually does, and iOS still prompts for it.
   */
  it("keeps only the save-side permission string", () => {
    expect(mediaLibraryPlugin?.[1].savePhotosPermission).toEqual(
      expect.any(String),
    );
    expect(mediaLibraryPlugin?.[1]).not.toHaveProperty("photosPermission");
  });

  it("registers the manifest scrub plugin after expo-media-library", () => {
    const plugins = appJson.expo.plugins as unknown[];
    const indexOf = (match: (entry: unknown) => boolean) =>
      plugins.findIndex(match);

    const mediaLibraryAt = indexOf(
      (entry) => Array.isArray(entry) && entry[0] === "expo-media-library",
    );
    const scrubAt = indexOf(
      (entry) => entry === "./plugins/withMediaPermissionScrub",
    );

    expect(scrubAt).toBeGreaterThan(mediaLibraryAt);
  });
});

describe("scrubMediaReadPermissions", () => {
  it("drops every media read permission and blocks it from being merged back", () => {
    const manifest: AndroidManifest = {
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
        "uses-permission": [
          permission("android.permission.INTERNET"),
          permission("android.permission.READ_MEDIA_IMAGES"),
          permission("android.permission.READ_MEDIA_VIDEO"),
          permission("android.permission.READ_MEDIA_AUDIO"),
          permission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"),
        ],
      },
    };

    const result = scrubMediaReadPermissions(manifest) as AndroidManifest;
    const entries = result.manifest["uses-permission"] ?? [];

    for (const name of FORBIDDEN) {
      const matching = entries.filter((e) => e.$["android:name"] === name);
      expect(matching).toHaveLength(1);
      expect(matching[0].$["tools:node"]).toBe("remove");
    }
  });

  it("declares the tools namespace the removal markers depend on", () => {
    const manifest: AndroidManifest = {
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      },
    };

    const result = scrubMediaReadPermissions(manifest) as AndroidManifest;

    expect(result.manifest.$["xmlns:tools"]).toBe(
      "http://schemas.android.com/tools",
    );
  });

  /**
   * The storage pair is declared `maxSdkVersion="32"`, so it is never requested
   * on the Android versions the policy covers — and `WRITE_EXTERNAL_STORAGE` is
   * exactly what still lets the gallery copy work on Android 12 and below.
   * Scrubbing it would break that backup for no policy gain.
   */
  it("leaves unrelated permissions alone", () => {
    const manifest: AndroidManifest = {
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
        "uses-permission": [
          permission("android.permission.INTERNET"),
          permission("android.permission.CAMERA"),
          permission("android.permission.WRITE_EXTERNAL_STORAGE", {
            "android:maxSdkVersion": "32",
          }),
        ],
      },
    };

    const result = scrubMediaReadPermissions(manifest) as AndroidManifest;
    const kept = (result.manifest["uses-permission"] ?? [])
      .filter((e) => e.$["tools:node"] !== "remove")
      .map((e) => e.$["android:name"]);

    expect(kept).toEqual([
      "android.permission.INTERNET",
      "android.permission.CAMERA",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ]);
  });

  it("is idempotent across repeated prebuilds", () => {
    const manifest: AndroidManifest = {
      manifest: {
        $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
        "uses-permission": [permission("android.permission.READ_MEDIA_IMAGES")],
      },
    };

    const once = scrubMediaReadPermissions(manifest) as AndroidManifest;
    const twice = scrubMediaReadPermissions(once) as AndroidManifest;

    expect(twice.manifest["uses-permission"]).toEqual(
      once.manifest["uses-permission"],
    );
  });
});
