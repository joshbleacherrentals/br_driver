/**
 * §15 driver scoping — public surface.
 *
 * Design doc: docs/custom-photo-upload-queue.en.md §15.
 *
 * A leaf of the dependency graph: it knows `db` and `AppSchema` and nothing
 * else from the app. `library/photoUploadQueue/runtime`, `hooks/db` and the
 * feature screens all consume it; none of them is imported back.
 */

export * from "./driverScope";
export * from "./ownership";
export * from "./scopedFrom";
