/**
 * The 30-photo cap, at the level where the decision actually lives.
 *
 * `describePhotoLimit` is what the grid (to disable the add controls), the
 * damage-report form and the inspection photo questions (to size the picker's
 * `selectionLimit` and trim an over-large result) all read, so its edges are the
 * cap's edges.
 */

import {
  DAMAGE_REPORT_PHOTO_SUBJECT,
  INSPECTION_QUESTION_PHOTO_SUBJECT,
  MAX_PHOTOS,
  admitPickedPhotos,
  describePhotoLimit,
  photoLimitReachedAlert,
  photoSelectionTrimmedAlert,
} from "@/utils/photoLimit";

describe("describePhotoLimit", () => {
  it("caps a photo set at 30 photos", () => {
    expect(MAX_PHOTOS).toBe(30);
  });

  it("reports headroom below the cap", () => {
    const limit = describePhotoLimit(12);

    expect(limit.remaining).toBe(18);
    expect(limit.atLimit).toBe(false);
    expect(limit.notice).toBeNull();
  });

  it("blocks adding once the cap is reached exactly", () => {
    const limit = describePhotoLimit(MAX_PHOTOS);

    expect(limit.remaining).toBe(0);
    expect(limit.atLimit).toBe(true);
    expect(limit.notice).toContain("Maximum 30 photos per report");
  });

  it("leaves one slot at 29, so the last photo is still addable", () => {
    expect(describePhotoLimit(29).remaining).toBe(1);
    expect(describePhotoLimit(29).atLimit).toBe(false);
  });

  /**
   * A report created before the cap existed may already hold more than 30. It
   * must read as "no headroom", never as a negative number — a negative
   * `remaining` would flow into `selectionLimit` and `Array.slice`, where it
   * means something else entirely.
   */
  it("clamps a legacy over-cap report to zero headroom rather than going negative", () => {
    const limit = describePhotoLimit(47);

    expect(limit.remaining).toBe(0);
    expect(limit.atLimit).toBe(true);
    expect(limit.current).toBe(47);
    expect(limit.notice).not.toBeNull();
  });

  it("treats an empty report as fully open", () => {
    const limit = describePhotoLimit(0);

    expect(limit.remaining).toBe(MAX_PHOTOS);
    expect(limit.atLimit).toBe(false);
  });

  it("honours an explicit non-default cap", () => {
    expect(describePhotoLimit(4, 5).remaining).toBe(1);
    expect(describePhotoLimit(5, 5).atLimit).toBe(true);
    expect(describePhotoLimit(5, 5).notice).toContain("Maximum 5 photos");
  });

  /**
   * The same cap now guards two different surfaces, so the copy has to be able
   * to name which one the driver is looking at — "per report" is wrong on an
   * inspection question.
   */
  it("names the inspection question rather than a report when asked to", () => {
    const limit = describePhotoLimit(
      MAX_PHOTOS,
      MAX_PHOTOS,
      INSPECTION_QUESTION_PHOTO_SUBJECT,
    );

    expect(limit.notice).toContain("Maximum 30 photos per question");
    expect(limit.notice).not.toContain("report");
  });
});

describe("limit copy", () => {
  const atLimit = describePhotoLimit(MAX_PHOTOS);

  it("explains the block in plain, non-technical language", () => {
    const { title, message } = photoLimitReachedAlert(atLimit);

    expect(title).toBe("Photo limit reached");
    expect(message).toContain("A damage report");
    expect(message).toContain("30 photos");
    expect(message).toContain("Remove a photo");
  });

  it("names the surface the driver is actually on", () => {
    const { message } = photoLimitReachedAlert(
      describePhotoLimit(
        MAX_PHOTOS,
        MAX_PHOTOS,
        INSPECTION_QUESTION_PHOTO_SUBJECT,
      ),
    );

    expect(message).toContain("An inspection question can hold up to 30");
  });

  it("names the shortfall when a bulk selection is trimmed", () => {
    const { message } = photoSelectionTrimmedAlert(3, 5, atLimit);

    expect(message).toContain("3 photos were added");
    expect(message).toContain("5 were left out");
  });

  it("uses singular wording for a single kept or dropped photo", () => {
    const { message } = photoSelectionTrimmedAlert(1, 1, atLimit);

    expect(message).toContain("1 photo was added");
    expect(message).toContain("1 was left out");
  });

  it("defaults to the damage report subject, unchanged from before the move", () => {
    expect(describePhotoLimit(MAX_PHOTOS).subject).toBe(
      DAMAGE_REPORT_PHOTO_SUBJECT,
    );
  });
});

/**
 * The trim decision both add-photo surfaces share. A platform picker that
 * ignores `selectionLimit` is the case it exists for: what fits is kept, the
 * rest is refused out loud, and nothing is silently dropped.
 */
describe("admitPickedPhotos", () => {
  it("keeps everything when the selection fits", () => {
    const limit = describePhotoLimit(25);
    const result = admitPickedPhotos(["a", "b", "c"], limit);

    expect(result.kept).toEqual(["a", "b", "c"]);
    expect(result.dropped).toBe(0);
    expect(result.alert).toBeNull();
  });

  it("trims to the headroom and explains the shortfall", () => {
    const limit = describePhotoLimit(28);
    const result = admitPickedPhotos(["a", "b", "c", "d"], limit);

    expect(result.kept).toEqual(["a", "b"]);
    expect(result.dropped).toBe(2);
    expect(result.alert?.message).toContain("2 photos were added");
    expect(result.alert?.message).toContain("2 were left out");
  });

  it("keeps nothing at all once the set is full", () => {
    const result = admitPickedPhotos(["a"], describePhotoLimit(MAX_PHOTOS));

    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(1);
  });
});
