/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §9 ("How 'success' is determined": explicit confirmation
 * from the API response, not a text match on an error message) and §10
 * ("Success verification" + "Insert-only bucket").
 */

import type { UploadEvidence } from "@/library/photoUploadQueue/types";
import {
  isUploadSuccessful,
  needsBucketVerification,
} from "@/library/photoUploadQueue/uploadSuccess";

/**
 * What the insert-only `damage-report-photos` bucket actually returns when an
 * object already sits at the path. The old queue called `isAlreadyInStorageError`
 * on this and marked the attachment SYNCED — the false positive §9 calls out.
 */
const DUPLICATE_PATH_ERROR = {
  statusCode: "409",
  error: "Duplicate",
  message: "The resource already exists",
};

const evidence = (overrides: Partial<UploadEvidence> = {}): UploadEvidence => ({
  apiConfirmed: false,
  duplicatePathSignal: false,
  bucketObjectExists: null,
  ...overrides,
});

describe("success determination (§9, §10)", () => {
  it("accepts an explicit confirmation from the upload API", () => {
    expect(isUploadSuccessful(evidence({ apiConfirmed: true }))).toBe(true);
  });

  // §10 — "don't rely on a text match on an error message ('already exists' ⇒
  // success)". The duplicate signal on its own must never flip a row to uploaded.
  it("refuses to call a duplicate-path error a success on its own", () => {
    expect(DUPLICATE_PATH_ERROR.message).toMatch(/already exists/i);

    const duplicateOnly = evidence({
      duplicatePathSignal: true,
      bucketObjectExists: null,
    });

    expect(isUploadSuccessful(duplicateOnly)).toBe(false);
  });

  // §10 — the duplicate signal is "a secondary sign, not the sole one": its
  // job is to trigger the bucket lookup, not to decide the outcome.
  it("uses the duplicate signal only to request a bucket lookup", () => {
    expect(
      needsBucketVerification(
        evidence({ duplicatePathSignal: true, bucketObjectExists: null }),
      ),
    ).toBe(true);
  });

  it("accepts the upload once the bucket lookup finds the object", () => {
    expect(
      isUploadSuccessful(
        evidence({ duplicatePathSignal: true, bucketObjectExists: true }),
      ),
    ).toBe(true);
    expect(
      isUploadSuccessful(
        evidence({ duplicatePathSignal: false, bucketObjectExists: true }),
      ),
    ).toBe(true);
  });

  it("rejects a duplicate signal the bucket contradicts", () => {
    expect(
      isUploadSuccessful(
        evidence({ duplicatePathSignal: true, bucketObjectExists: false }),
      ),
    ).toBe(false);
  });

  it("rejects an attempt with no positive evidence at all", () => {
    expect(isUploadSuccessful(evidence())).toBe(false);
    expect(isUploadSuccessful(evidence({ bucketObjectExists: false }))).toBe(
      false,
    );
  });

  it("does not ask for a lookup once the question is already answered", () => {
    expect(needsBucketVerification(evidence({ apiConfirmed: true }))).toBe(
      false,
    );
    expect(
      needsBucketVerification(
        evidence({ duplicatePathSignal: true, bucketObjectExists: true }),
      ),
    ).toBe(false);
    expect(
      needsBucketVerification(
        evidence({ duplicatePathSignal: true, bucketObjectExists: false }),
      ),
    ).toBe(false);
  });

  it("does not ask for a lookup when nothing suggests the object landed", () => {
    expect(needsBucketVerification(evidence())).toBe(false);
  });
});
