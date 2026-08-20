/**
 * ============================================================================
 * SPECIFICATION-FIRST TESTS — READ THIS FIRST
 * ============================================================================
 *
 * WHAT THESE TESTS ARE
 * The suite in this folder is an executable specification for the custom photo
 * upload queue described in `docs/custom-photo-upload-queue.en.md` (Ukrainian
 * original: `docs/custom-photo-upload-queue.md`). The queue does NOT exist yet.
 * Every assertion is transcribed from a numbered section of that document, and
 * the section is cited in a comment next to the test.
 *
 * WHY THEY ARE RED
 * This is a deliberate TDD red state. The tests are a fixed target the future
 * implementation has to hit — they must NOT be edited to match whatever gets
 * built. If a future implementation disagrees with one of these tests, either
 * the implementation is wrong or the design doc changed; in both cases the doc
 * is amended first and the test follows the doc, never the code.
 *
 * HOW THE "MODULE DOESN'T EXIST YET" PROBLEM IS HANDLED
 * `library/photoUploadQueue/*.ts` is a CONTRACT: real exported names, real
 * TypeScript signatures, real doc-derived constants — and deliberately wrong
 * function bodies. Two alternatives were rejected:
 *   - mocking the module with `jest.mock` — the tests would then assert against
 *     a fake, proving nothing about the eventual implementation;
 *   - importing a non-existent path — every test would fail with the same
 *     module-resolution error, which tells you nothing and hides regressions.
 * With a typed stub instead, `tsc --noEmit` passes, the suite runs, and each
 * failure is a genuine assertion diff against documented behaviour.
 *
 * The placeholder bodies were chosen to be the *documented anti-patterns*
 * wherever one exists — `resolveContentType` returns the `image/jpeg` hardcode
 * (§10), `isUploadSuccessful` trusts the "already exists" duplicate signal
 * alone (§9/§10), `decideRecovery` banners without verifying (§6),
 * `uploadWithTimeout` applies no deadline (§5). So the current red output is
 * also a description of the bugs this feature exists to remove.
 *
 * IMPLEMENTING AGAINST THIS SUITE
 * Replace the bodies in `library/photoUploadQueue/*.ts`; do not touch the
 * signatures or the exported constants without amending the design doc.
 * ============================================================================
 */

import type { PhotoUploadRow } from "@/library/photoUploadQueue/types";

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

/** A promise whose settlement the test controls, for gating a fake upload. */
export function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drains the microtask queue so promise chains can advance. */
export async function flushMicrotasks(iterations = 100): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    await Promise.resolve();
  }
}

/**
 * Yields to the real event loop so both microtask- and macrotask-scheduled
 * work gets a chance to run. Only used in specs that do not use fake timers.
 */
export function settle(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls until `predicate` holds or the budget runs out. Bounded, so a stub
 * that never does the work fails on the following assertion rather than
 * hanging the suite.
 */
export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await settle(1);
  }
}

/** A `DamageReportPhotos`-shaped queue row (design doc §3). */
export function makeRow(overrides: Partial<PhotoUploadRow> = {}): PhotoUploadRow {
  return {
    id: "photo-1",
    photo_path: "damage-report-uuid/photo-1.jpg",
    upload_status: "pending",
    gallery_asset_id: "asset-1",
    attempts: 0,
    last_attempt_at: null,
    last_error: null,
    ...overrides,
  };
}
