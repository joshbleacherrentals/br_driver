/**
 * What counts as an answer.
 *
 * The rule the product cares about is one line — a score of 6 or below needs a
 * written reason — and it is enforced in two places: here, and by a Postgres
 * trigger with the same threshold (`enforce_driver_survey_answer` in
 * bleacher_rentals/supabase/migrations). That symmetry is load-bearing, and it
 * is why this side must never be the more permissive of the two: PowerSync
 * classifies a constraint violation as fatal (`FATAL_RESPONSE_CODES` in
 * BackendConnector), so an answer the client accepts and the server refuses is
 * dropped from the outbox in silence. The driver was made to fill in a modal
 * they could not escape, and the answer would exist nowhere.
 *
 * The threshold is read from the question row rather than hardcoded: it is
 * `follow_up_max_score` in Postgres precisely so it can be retuned without an
 * App Store release.
 */

import {
  SCORE_MAX,
  SCORE_MIN,
  isReasonRequired,
  validateAnswer,
  type SurveyQuestion,
} from "@/features/driver-survey/utils/surveyValidation";

const SCALE_QUESTION: SurveyQuestion = {
  id: "q-app",
  prompt: "How satisfied are you overall with the mobile app?",
  kind: "scale_1_10",
  follow_up_max_score: 6,
  follow_up_prompt: "What would make it better?",
  is_required: 1,
};

describe("isReasonRequired", () => {
  it("is false before a score has been chosen", () => {
    expect(isReasonRequired(SCALE_QUESTION, null)).toBe(false);
  });

  it("is true at the threshold and below", () => {
    expect(isReasonRequired(SCALE_QUESTION, 6)).toBe(true);
    expect(isReasonRequired(SCALE_QUESTION, 1)).toBe(true);
  });

  it("is false above the threshold", () => {
    expect(isReasonRequired(SCALE_QUESTION, 7)).toBe(false);
    expect(isReasonRequired(SCALE_QUESTION, 10)).toBe(false);
  });

  it("follows the question's threshold rather than a hardcoded 6", () => {
    const strict: SurveyQuestion = { ...SCALE_QUESTION, follow_up_max_score: 8 };
    expect(isReasonRequired(strict, 8)).toBe(true);
    expect(isReasonRequired(strict, 9)).toBe(false);
  });

  it("never asks for a reason when the question has no threshold", () => {
    const open: SurveyQuestion = { ...SCALE_QUESTION, follow_up_max_score: null };
    expect(isReasonRequired(open, 1)).toBe(false);
  });
});

describe("validateAnswer", () => {
  it("accepts a high score with no reason", () => {
    const result = validateAnswer(SCALE_QUESTION, { score: 9, reason: "" });
    expect(result).toEqual({
      ok: true,
      value: { score: 9, reason: null, prompt: SCALE_QUESTION.prompt },
    });
  });

  it("refuses a required question with no score", () => {
    const result = validateAnswer(SCALE_QUESTION, { score: null, reason: "" });
    expect(result).toEqual({ ok: false, reason: "score_missing" });
  });

  it("refuses a score outside 1-10", () => {
    expect(validateAnswer(SCALE_QUESTION, { score: 0, reason: "x" })).toEqual({
      ok: false,
      reason: "score_out_of_range",
    });
    expect(validateAnswer(SCALE_QUESTION, { score: 11, reason: "x" })).toEqual({
      ok: false,
      reason: "score_out_of_range",
    });
    expect(SCORE_MIN).toBe(1);
    expect(SCORE_MAX).toBe(10);
  });

  it("refuses a fractional score", () => {
    expect(validateAnswer(SCALE_QUESTION, { score: 7.5, reason: "" })).toEqual({
      ok: false,
      reason: "score_out_of_range",
    });
  });

  it("refuses a low score with no reason", () => {
    expect(validateAnswer(SCALE_QUESTION, { score: 6, reason: "" })).toEqual({
      ok: false,
      reason: "reason_required",
    });
  });

  /** Whitespace is not an opinion — and the Postgres trigger agrees. */
  it("refuses a low score whose reason is only whitespace", () => {
    expect(
      validateAnswer(SCALE_QUESTION, { score: 3, reason: "   \n  " }),
    ).toEqual({ ok: false, reason: "reason_required" });
  });

  it("accepts a low score with a written reason, trimmed", () => {
    const result = validateAnswer(SCALE_QUESTION, {
      score: 4,
      reason: "  the map is slow  ",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        score: 4,
        reason: "the map is slow",
        prompt: SCALE_QUESTION.prompt,
      },
    });
  });

  /**
   * A reason volunteered alongside a high score is kept. Nothing asked for it,
   * and it is the most useful sentence in the dataset when it appears.
   */
  it("keeps a reason offered with a high score", () => {
    const result = validateAnswer(SCALE_QUESTION, {
      score: 10,
      reason: "inspections are quick now",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        score: 10,
        reason: "inspections are quick now",
        prompt: SCALE_QUESTION.prompt,
      },
    });
  });

  it("allows an optional question to be left blank", () => {
    const optional: SurveyQuestion = { ...SCALE_QUESTION, is_required: 0 };
    expect(validateAnswer(optional, { score: null, reason: "" })).toEqual({
      ok: true,
      value: { score: null, reason: null, prompt: optional.prompt },
    });
  });

  it("takes text-only questions as text, with no score", () => {
    const textQuestion: SurveyQuestion = {
      ...SCALE_QUESTION,
      kind: "text",
      follow_up_max_score: null,
    };
    expect(
      validateAnswer(textQuestion, { score: null, reason: "more bleachers" }),
    ).toEqual({
      ok: true,
      value: { score: null, reason: "more bleachers", prompt: textQuestion.prompt },
    });
    expect(validateAnswer(textQuestion, { score: null, reason: " " })).toEqual({
      ok: false,
      reason: "reason_required",
    });
  });
});
