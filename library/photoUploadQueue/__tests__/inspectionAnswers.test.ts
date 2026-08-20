/**
 * Covers: keeping an inspection's `answers_json` in step with its
 * `InspectionPhotos` rows during a repair.
 *
 * The inspection UI renders from `answers_json`, so the two representations
 * must never diverge: a pruned row that stays in the JSON renders as a broken
 * photo, and an inserted row missing from the JSON is invisible to the driver —
 * indistinguishable from the loss the queue exists to prevent (§3).
 */

import {
  applyPhotoChangesToAnswers,
  findQuestionForPhoto,
  firstPhotoQuestion,
} from "@/library/photoUploadQueue/inspectionAnswers";

const ANSWERS = JSON.stringify({
  q1: {
    question_text: "Walk around",
    question_type: "checkbox",
    required: true,
    answer_boolean: true,
  },
  q2: {
    question_text: "Photos of the frame",
    question_type: "photo",
    required: true,
    photos: [{ storage_path: "insp/q2/a.jpg" }, { storage_path: "insp/q2/b.jpg" }],
  },
  q3: {
    question_text: "Photos of the deck",
    question_type: "photo",
    required: false,
    photos: [{ storage_path: "insp/q3/c.jpg" }],
  },
});

const paths = (json: string, questionId: string) =>
  JSON.parse(json)[questionId].photos.map(
    (p: { storage_path: string }) => p.storage_path,
  );

describe("locating the question a photo belongs to", () => {
  it("finds the owning question", () => {
    expect(findQuestionForPhoto(ANSWERS, "insp/q3/c.jpg")).toBe("q3");
    expect(findQuestionForPhoto(ANSWERS, "insp/q2/b.jpg")).toBe("q2");
  });

  it("returns null for a path no question lists", () => {
    expect(findQuestionForPhoto(ANSWERS, "insp/q9/z.jpg")).toBeNull();
    expect(findQuestionForPhoto(null, "insp/q2/a.jpg")).toBeNull();
  });

  it("falls back to the first photo question", () => {
    expect(firstPhotoQuestion(ANSWERS)).toBe("q2");
    expect(firstPhotoQuestion("not json")).toBeNull();
  });
});

describe("applying repair changes to the answers blob", () => {
  it("prunes the paths of deleted rows", () => {
    const next = applyPhotoChangesToAnswers(ANSWERS, {
      removedPaths: ["insp/q2/a.jpg"],
    });

    expect(next).not.toBeNull();
    expect(paths(next!, "q2")).toEqual(["insp/q2/b.jpg"]);
    expect(paths(next!, "q3")).toEqual(["insp/q3/c.jpg"]);
  });

  it("appends new paths to the question they belong to", () => {
    const next = applyPhotoChangesToAnswers(ANSWERS, {
      addedPathsByQuestion: { q3: ["insp/q3/new.jpg"] },
    });

    expect(paths(next!, "q3")).toEqual(["insp/q3/c.jpg", "insp/q3/new.jpg"]);
    expect(paths(next!, "q2")).toEqual(["insp/q2/a.jpg", "insp/q2/b.jpg"]);
  });

  it("prunes and appends in one pass", () => {
    const next = applyPhotoChangesToAnswers(ANSWERS, {
      removedPaths: ["insp/q2/a.jpg", "insp/q2/b.jpg"],
      addedPathsByQuestion: { q2: ["insp/q2/fresh.jpg"] },
    });

    expect(paths(next!, "q2")).toEqual(["insp/q2/fresh.jpg"]);
  });

  it("leaves non-photo answers untouched", () => {
    const next = applyPhotoChangesToAnswers(ANSWERS, {
      removedPaths: ["insp/q2/a.jpg"],
    });

    expect(JSON.parse(next!).q1).toEqual(JSON.parse(ANSWERS).q1);
  });

  // Reused rows keep their storage_path, so a pure 1:1 replace changes nothing
  // here — and must not rewrite the row for no reason.
  it("reports no change when nothing was added or removed", () => {
    expect(applyPhotoChangesToAnswers(ANSWERS, {})).toBeNull();
    expect(
      applyPhotoChangesToAnswers(ANSWERS, { removedPaths: ["insp/q9/z.jpg"] }),
    ).toBeNull();
  });

  // A blob we cannot read is left exactly as it is: overwriting it with a guess
  // would destroy the inspection's answers.
  it("refuses to rewrite an unparseable blob", () => {
    expect(
      applyPhotoChangesToAnswers("{not json", { removedPaths: ["a"] }),
    ).toBeNull();
    expect(applyPhotoChangesToAnswers(null, { removedPaths: ["a"] })).toBeNull();
    expect(
      applyPhotoChangesToAnswers("[1,2]", { removedPaths: ["a"] }),
    ).toBeNull();
  });
});
