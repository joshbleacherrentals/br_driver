/**
 * Precedence between the app-wide banner's three states.
 *
 * The states are mutually exclusive on purpose — two banners saying different
 * things about the same photos is the problem this replaced — so the only thing
 * worth pinning down is which one wins when more than one input is live, and
 * that the reassuring ones can never contradict the alarming one.
 */

import {
  derivePhotoUploadOverlayState,
  UPLOAD_SUCCESS_TITLE,
  uploadingTitle,
} from "@/library/photoUploadQueue/overlayState";
import {
  PHOTO_UPLOAD_BANNER_TITLE,
  photoUploadBannerSubtitle,
} from "@/library/photoUploadQueue/banner";
import { EMPTY_UPLOAD_ACTIVITY } from "@/library/photoUploadQueue/uploadActivity";
import type { BannerState } from "@/library/photoUploadQueue/types";

const NO_FAILURE: BannerState = {
  visible: false,
  count: 0,
  title: "",
  subtitle: "",
  targetReportUuid: null,
};

const FAILURE: BannerState = {
  visible: true,
  count: 2,
  title: PHOTO_UPLOAD_BANNER_TITLE,
  subtitle: photoUploadBannerSubtitle(2),
  targetReportUuid: "report-newest",
};

const BUSY = { total: 5, uploaded: 2, inFlight: 3 };

describe("derivePhotoUploadOverlayState", () => {
  it("shows nothing when there is nothing to say", () => {
    expect(
      derivePhotoUploadOverlayState({
        activity: EMPTY_UPLOAD_ACTIVITY,
        failure: NO_FAILURE,
        celebrating: false,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("reports real progress while photos are in flight", () => {
    const state = derivePhotoUploadOverlayState({
      activity: BUSY,
      failure: NO_FAILURE,
      celebrating: false,
    });

    expect(state).toEqual({
      kind: "uploading",
      title: uploadingTitle(2, 5),
      subtitle: expect.any(String),
      uploaded: 2,
      total: 5,
      ratio: 0.4,
    });
    expect(uploadingTitle(2, 5)).toContain("2 of 5");
  });

  it("celebrates only once nothing is left in flight", () => {
    expect(
      derivePhotoUploadOverlayState({
        activity: EMPTY_UPLOAD_ACTIVITY,
        failure: NO_FAILURE,
        celebrating: true,
      }),
    ).toEqual({
      kind: "success",
      title: UPLOAD_SUCCESS_TITLE,
      subtitle: expect.any(String),
    });
  });

  /**
   * The one that matters: a batch can be uploading *and* contain a photo the
   * bucket has confirmed it does not have. Showing "uploading" there reads as
   * reassurance about a photo that is already lost.
   */
  it("lets a confirmed-missing photo outrank progress", () => {
    const state = derivePhotoUploadOverlayState({
      activity: BUSY,
      failure: FAILURE,
      celebrating: false,
    });

    expect(state).toEqual({
      kind: "failed",
      title: PHOTO_UPLOAD_BANNER_TITLE,
      subtitle: photoUploadBannerSubtitle(2),
      targetReportUuid: "report-newest",
    });
  });

  it("never congratulates the driver while a photo is lost", () => {
    expect(
      derivePhotoUploadOverlayState({
        activity: EMPTY_UPLOAD_ACTIVITY,
        failure: FAILURE,
        celebrating: true,
      }).kind,
    ).toBe("failed");
  });

  it("carries the tap target the failed state navigates to", () => {
    const state = derivePhotoUploadOverlayState({
      activity: EMPTY_UPLOAD_ACTIVITY,
      failure: FAILURE,
      celebrating: false,
    });

    expect(state).toMatchObject({ targetReportUuid: "report-newest" });
  });

  /**
   * `deriveBannerState` cannot produce this, but a visible banner with no
   * target would be an untappable red bar the driver could do nothing with, so
   * the overlay declines to show it rather than trusting its caller.
   */
  it("ignores a visible failure with no report to open", () => {
    expect(
      derivePhotoUploadOverlayState({
        activity: EMPTY_UPLOAD_ACTIVITY,
        failure: { ...FAILURE, targetReportUuid: null },
        celebrating: false,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("never divides by zero on an empty batch", () => {
    expect(
      derivePhotoUploadOverlayState({
        activity: { total: 0, uploaded: 0, inFlight: 1 },
        failure: NO_FAILURE,
        celebrating: false,
      }),
    ).toEqual({ kind: "hidden" });
  });
});
