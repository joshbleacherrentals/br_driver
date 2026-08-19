/**
 * Driver-facing copy for photos that could not be saved to the device.
 *
 * One place, because both surfaces that create a damage report (the standalone
 * screen and the inspection widget) have to say the same thing, and because the
 * two cases must not be worded alike: a partial save has produced a real report
 * and is informational, while a total failure has produced nothing and is a
 * blocking error the driver has to act on.
 */

import type { PhotoPrepFailure } from "./preparePhoto";

export type FailureAlert = { title: string; message: string };

/** Every photo failed — nothing was created, and the driver must retry. */
export function describeAllPhotosFailed(
  failures: PhotoPrepFailure[],
): FailureAlert {
  const allMissing =
    failures.length > 0 && failures.every((f) => f.reason === "file_missing");

  return {
    title: "Report Not Saved",
    message: allMissing
      ? "None of the selected photos are still on this device, so the damage " +
        "report was not created. Please add the photos again and resubmit."
      : "The selected photos could not be saved to this device, so the damage " +
        "report was not created. Please try again, or re-add the photos.",
  };
}

/** Some photos landed, some did not. The report exists; say what is missing. */
export function describePartialPhotoFailure(
  savedCount: number,
  failures: PhotoPrepFailure[],
): FailureAlert {
  const failed = failures.length;

  return {
    title: "Some Photos Not Saved",
    message:
      `${savedCount} photo${savedCount === 1 ? "" : "s"} saved, but ${failed} ` +
      `could not be read from this device and ${failed === 1 ? "is" : "are"} ` +
      `not on the report. You can add ${failed === 1 ? "it" : "them"} again ` +
      `from the report if you still have ${failed === 1 ? "it" : "them"}.`,
  };
}
