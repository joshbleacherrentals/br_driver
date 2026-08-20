/**
 * The one app-wide photo-upload banner, as a state machine.
 *
 * It replaces two banners that used to say overlapping things in different
 * places: `PhotoUploadIssueBanner` (global, red, "photos are lost") and the
 * upload half of `SubmitProgressBanner` (damage-report screen only, "X of Y
 * uploaded"). A driver who left the report screen lost sight of progress
 * entirely, and a driver who stayed on it could see both at once. Now there is
 * one banner, floating over every screen, with three mutually exclusive states.
 *
 * Pure and dependency-free so the precedence rules — which are the part that is
 * easy to get subtly wrong — can be asserted without a database or a render.
 */

import {
  PHOTO_UPLOAD_BANNER_TITLE,
  photoUploadBannerSubtitle,
} from "./banner";
import type { BannerState } from "./types";
import type { UploadActivity } from "./uploadActivity";

export type PhotoUploadOverlayState =
  | { kind: "hidden" }
  /** Calm, non-blocking, no tap target — this is information, not an alarm. */
  | {
      kind: "uploading";
      title: string;
      subtitle: string;
      uploaded: number;
      total: number;
      /** 0…1, for the progress track. */
      ratio: number;
    }
  /** Brief, self-dismissing acknowledgement that the batch landed. */
  | { kind: "success"; title: string; subtitle: string }
  /** Persistent; taps through to the newest report with a lost photo (§6). */
  | {
      kind: "failed";
      title: string;
      subtitle: string;
      targetReportUuid: string;
    };

export const UPLOAD_SUCCESS_TITLE = "All photos uploaded";
export const UPLOAD_SUCCESS_SUBTITLE = "Everything reached the server.";
export const UPLOADING_SUBTITLE = "This continues in the background.";

/** `Uploading photos — 2 of 5`. */
export function uploadingTitle(uploaded: number, total: number): string {
  return `Uploading photos — ${uploaded} of ${total}`;
}

/**
 * Combines the two live inputs and the one local one into the single state the
 * overlay renders.
 *
 * Precedence, and why:
 *
 * 1. **failed** — a photo the bucket confirmed it does not have is the only
 *    state that needs the driver to do something, and it never auto-dismisses.
 *    It outranks progress because a batch can legitimately be uploading *and*
 *    contain a lost photo, and "uploading" would read as reassurance.
 * 2. **uploading** — work is genuinely in flight.
 * 3. **success** — the celebration only ever shows when there is nothing left
 *    to say, so it can never contradict either state above it.
 */
export function derivePhotoUploadOverlayState(input: {
  activity: UploadActivity;
  failure: BannerState;
  /** The completion edge the hook detected and has not yet finished showing. */
  celebrating: boolean;
}): PhotoUploadOverlayState {
  const { activity, failure, celebrating } = input;

  if (failure.visible && failure.targetReportUuid) {
    return {
      kind: "failed",
      title: PHOTO_UPLOAD_BANNER_TITLE,
      subtitle: photoUploadBannerSubtitle(failure.count),
      targetReportUuid: failure.targetReportUuid,
    };
  }

  if (activity.inFlight > 0 && activity.total > 0) {
    return {
      kind: "uploading",
      title: uploadingTitle(activity.uploaded, activity.total),
      subtitle: UPLOADING_SUBTITLE,
      uploaded: activity.uploaded,
      total: activity.total,
      ratio: Math.min(1, activity.uploaded / activity.total),
    };
  }

  if (celebrating) {
    return {
      kind: "success",
      title: UPLOAD_SUCCESS_TITLE,
      subtitle: UPLOAD_SUCCESS_SUBTITLE,
    };
  }

  return { kind: "hidden" };
}
