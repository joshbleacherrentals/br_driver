/**
 * Covers: design doc §7 — the progress-bar modal counts "how many of N photos
 * are `uploaded`".
 *
 * The point of the spec is that progress tracks the *bucket*, not local work:
 * `pending`, `uploading` and `failed` are all "not there yet". A modal that
 * counted local queueing would close while photos were still missing remotely —
 * exactly the false confidence this feature exists to remove.
 */

import { deriveUploadProgress } from "@/library/photoUploadQueue/uploadProgress";

describe("upload progress for the §7 modal", () => {
  it("counts only photos confirmed in the bucket", () => {
    const progress = deriveUploadProgress([
      "uploaded",
      "uploading",
      "pending",
      "failed",
    ]);

    expect(progress.total).toBe(4);
    expect(progress.uploaded).toBe(1);
    expect(progress.ratio).toBeCloseTo(0.25);
    expect(progress.complete).toBe(false);
  });

  // §7 — "the modal closes itself once all of this report's photos are uploaded".
  it("reports complete only when every photo has landed", () => {
    expect(deriveUploadProgress(["uploaded", "uploaded"]).complete).toBe(true);
    expect(deriveUploadProgress(["uploaded", "failed"]).complete).toBe(false);
    expect(deriveUploadProgress(["uploading"]).complete).toBe(false);
  });

  // A row mid-flight is not progress: it has not been confirmed in the bucket.
  it("does not count an in-flight upload as done", () => {
    expect(deriveUploadProgress(["uploading", "uploading"]).uploaded).toBe(0);
  });

  it("treats an empty report as complete so the modal can never pin open", () => {
    const progress = deriveUploadProgress([]);

    expect(progress.total).toBe(0);
    expect(progress.uploaded).toBe(0);
    expect(progress.ratio).toBe(0);
    expect(progress.complete).toBe(true);
  });

  it("tolerates a null status from a row written before upload_status existed", () => {
    const progress = deriveUploadProgress([null, "uploaded"]);

    expect(progress.total).toBe(2);
    expect(progress.uploaded).toBe(1);
    expect(progress.complete).toBe(false);
  });
});
