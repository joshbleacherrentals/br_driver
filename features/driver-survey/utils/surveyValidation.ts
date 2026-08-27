/**
 * What counts as an answer to one survey question.
 *
 * The product rule is one line — a score at or below the question's threshold
 * needs a written reason — but it is enforced twice, here and by the Postgres
 * trigger `enforce_driver_survey_answer`. The two must agree exactly, and this
 * side must never be the looser one: PowerSync treats a constraint violation as
 * fatal (`FATAL_RESPONSE_CODES` in BackendConnector.ts) and drops the write from
 * its outbox without telling anyone. A driver forced through a modal they could
 * not dismiss would end up having said nothing at all.
 *
 * The threshold itself is read from the question row (`follow_up_max_score`)
 * rather than written here as `6`. It is a product decision that will be
 * retuned, and retuning it must not require an App Store release.
 */

export const SCORE_MIN = 1;
export const SCORE_MAX = 10;

export type SurveyQuestion = {
  id: string;
  /**
   * Nullable because every PowerSync column is. A question with no text is
   * unaskable and `questionsForSurvey` drops it before it can reach the modal;
   * the `?? ""` below is the second half of that guard, and a blank snapshot is
   * back-filled from the live question by the Postgres trigger rather than
   * refused.
   */
  prompt: string | null;
  /** `scale_1_10` today; `text` exists for next quarter's questions. */
  kind: string | null;
  /** At or below this score the reason becomes mandatory. `null` = never. */
  follow_up_max_score: number | null;
  follow_up_prompt: string | null;
  /** Postgres boolean, mirrored by PowerSync as 0/1. */
  is_required: number | null;
};

export type SurveyDraftAnswer = {
  score: number | null;
  reason: string;
};

export type AnswerRejection =
  | "score_missing"
  | "score_out_of_range"
  | "reason_required";

export type ValidatedAnswer = {
  score: number | null;
  reason: string | null;
  /**
   * The wording the driver was actually shown, carried to the answer row as
   * `prompt_snapshot`. Once questions are editable in the web app, a report
   * that joined live question text would re-label old answers with a question
   * nobody was ever asked.
   */
  prompt: string;
};

export type AnswerValidation =
  | { ok: true; value: ValidatedAnswer }
  | { ok: false; reason: AnswerRejection };

const isTextQuestion = (question: SurveyQuestion) => question.kind === "text";

/**
 * Whether this score obliges the driver to write something.
 *
 * `false` while no score is chosen — the reason field appears in response to a
 * tap, not before it.
 */
export function isReasonRequired(
  question: SurveyQuestion,
  score: number | null,
): boolean {
  if (score === null) return false;
  if (question.follow_up_max_score === null) return false;
  return score <= question.follow_up_max_score;
}

export function validateAnswer(
  question: SurveyQuestion,
  draft: SurveyDraftAnswer,
): AnswerValidation {
  const required = question.is_required !== 0;
  const reason = draft.reason.trim();

  if (isTextQuestion(question)) {
    if (required && reason === "") {
      return { ok: false, reason: "reason_required" };
    }
    return {
      ok: true,
      value: {
        score: null,
        reason: reason || null,
        prompt: question.prompt ?? "",
      },
    };
  }

  if (draft.score === null) {
    if (required) return { ok: false, reason: "score_missing" };
    return {
      ok: true,
      value: {
        score: null,
        reason: reason || null,
        prompt: question.prompt ?? "",
      },
    };
  }

  if (
    !Number.isInteger(draft.score) ||
    draft.score < SCORE_MIN ||
    draft.score > SCORE_MAX
  ) {
    return { ok: false, reason: "score_out_of_range" };
  }

  if (isReasonRequired(question, draft.score) && reason === "") {
    return { ok: false, reason: "reason_required" };
  }

  // A reason volunteered with a high score is kept: nothing asked for it, and
  // it is usually the most useful sentence in the dataset.
  return {
    ok: true,
    value: {
      score: draft.score,
      reason: reason || null,
      prompt: question.prompt ?? "",
    },
  };
}

/** Whether every question in the survey has a submittable answer right now. */
export function isSubmittable(
  questions: readonly SurveyQuestion[],
  drafts: Readonly<Record<string, SurveyDraftAnswer>>,
): boolean {
  return questions.every((question) => {
    const draft = drafts[question.id] ?? { score: null, reason: "" };
    return validateAnswer(question, draft).ok;
  });
}
