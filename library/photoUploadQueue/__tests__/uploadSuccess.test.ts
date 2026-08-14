/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §9 ("How 'success' is determined": explicit confirmation
 * from the API response, not a text match on an error message), §10
 * ("Success verification" + "Insert-only bucket") and §5.1 ("Timeout does not
 * mean cancelled — verify, don't just retry").
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
  timedOutSignal: false,
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

/**
 * §5.1 — the storage SDK never forwards our `AbortSignal` to the underlying
 * request, so hitting the §5 deadline does NOT mean the upload was cancelled;
 * it may well be landing server-side right now. That makes a timeout exactly
 * the same *kind* of evidence as a duplicate-path error: enough to demand a
 * bucket lookup, never enough to decide anything on its own.
 */
describe("timeout as an ambiguous signal (§5.1)", () => {
  it("asks for a bucket lookup after a timeout, since the request was never really cancelled", () => {
    expect(
      needsBucketVerification(
        evidence({ timedOutSignal: true, bucketObjectExists: null }),
      ),
    ).toBe(true);
  });

  it("does not ask again once the bucket has answered", () => {
    for (const answer of [true, false]) {
      expect(
        needsBucketVerification(
          evidence({ timedOutSignal: true, bucketObjectExists: answer }),
        ),
      ).toBe(false);
    }
  });

  // The whole point of keeping it out of `isUploadSuccessful`: an upload that
  // timed out and was never found is not an upload.
  it("never calls a bare timeout a success", () => {
    expect(isUploadSuccessful(evidence({ timedOutSignal: true }))).toBe(false);
  });

  it("accepts a timed-out attempt the bucket proves landed", () => {
    expect(
      isUploadSuccessful(
        evidence({ timedOutSignal: true, bucketObjectExists: true }),
      ),
    ).toBe(true);
  });

  it("rejects a timed-out attempt the bucket says is absent", () => {
    expect(
      isUploadSuccessful(
        evidence({ timedOutSignal: true, bucketObjectExists: false }),
      ),
    ).toBe(false);
  });
});
