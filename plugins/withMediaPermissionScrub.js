/**
 * Keeps the media *read* permissions out of the Android manifest.
 *
 * Google Play rejected the app under the Photo and Video Permissions policy:
 * an app targeting Android 13+ may not request READ_MEDIA_IMAGES /
 * READ_MEDIA_VIDEO when the system photo picker would do. Ours would — and
 * does: `expo-image-picker` already launches `PickVisualMedia`, which needs no
 * permission. The permissions were never used; `expo-media-library` is only
 * ever asked to *save* a camera copy (`saveToGalleryIfCamera`), and on
 * Android 13+ that needs no runtime permission at all.
 *
 * Setting `granularPermissions: []` on the `expo-media-library` plugin removes
 * three of the four. The fourth, READ_MEDIA_VISUAL_USER_SELECTED, is declared
 * in the library's own AndroidManifest.xml and merged in by Gradle after every
 * config plugin has run, so it cannot be dropped by editing our manifest — it
 * has to be marked `tools:node="remove"`, which is an instruction to the merger
 * itself. The other three are marked too: belt and braces, so a future library
 * that declares one cannot quietly re-break the listing.
 *
 * Must be registered *after* `expo-media-library` in app.json — plugins run in
 * order, and this one exists to undo part of what that one does.
 */

const { withAndroidManifest } = require("expo/config-plugins");

const TOOLS_NAMESPACE = "http://schemas.android.com/tools";

/** Read access to the user's media, in every form Play's policy names. */
const MEDIA_READ_PERMISSIONS = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
];

/**
 * Replaces any declaration of the media read permissions with a removal marker.
 *
 * Exported on its own so the rule can be tested without a prebuild.
 *
 * @param {{ manifest: { $: Record<string, string>, "uses-permission"?: { $: Record<string, string> }[] } }} androidManifest
 */
function scrubMediaReadPermissions(androidManifest) {
  const manifest = androidManifest.manifest;

  // The removal markers are only meaningful if the merger knows the namespace.
  manifest.$ = { ...manifest.$, "xmlns:tools": TOOLS_NAMESPACE };

  const declared = manifest["uses-permission"] ?? [];
  const untouched = declared.filter(
    (entry) => !MEDIA_READ_PERMISSIONS.includes(entry.$?.["android:name"]),
  );

  manifest["uses-permission"] = [
    ...untouched,
    ...MEDIA_READ_PERMISSIONS.map((name) => ({
      $: { "android:name": name, "tools:node": "remove" },
    })),
  ];

  return androidManifest;
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withMediaPermissionScrub = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = scrubMediaReadPermissions(config.modResults);
    return config;
  });

module.exports = withMediaPermissionScrub;
module.exports.default = withMediaPermissionScrub;
module.exports.scrubMediaReadPermissions = scrubMediaReadPermissions;
module.exports.MEDIA_READ_PERMISSIONS = MEDIA_READ_PERMISSIONS;
