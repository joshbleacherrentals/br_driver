/**
 * Whether the Driver Satisfaction survey is due, and which one to ask.
 *
 * Pure, and deliberately so: the decision to put an undismissable modal in
 * front of a driver is worth having under test in isolation, away from React
 * and away from the database.
 *
 * The cadence is personal, not calendar-based. There are no cycle rows, no
 * scheduler and no cron: a survey is due when the driver has never answered
 * it, or when `interval_days` have passed since their last submission. That is
 * why a six-month absence produces exactly one prompt rather than six — there
 * are no missed periods to catch up on, only a last answer that is old.
 *
 * Every ambiguous case resolves to "not due". Asking a day late costs one data
 * point; asking wrongly blocks a driver who is trying to start work.
 */

import type { SurveyQuestion } from "./surveyValidation";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Used when a survey row somehow carries no interval of its own. */
export const DEFAULT_INTERVAL_DAYS = 30;

export type SurveyDefinition = {
  id: string;
  title: string | null;
  /** 30 today, 7 from next quarter — a column, not a constant. */
  interval_days: number | null;
  sort_order: number | null;
};

export type SurveySubmission = {
  survey_uuid: string | null;
  submitted_at: string | null;
};

export type PickDueSurveyInput = {
  surveys: readonly SurveyDefinition[];
  /** Every submission this driver has ever made, across all surveys. */
  submissions: readonly SurveySubmission[];
  /**
   * Whether the driver has ever finished a trip. A driver still onboarding has
   * no experience of the app to rate, and a forced survey during setup buys a
   * number that means nothing.
   */
  hasCompletedTrip: boolean;
  now: number;
};

function intervalMs(survey: SurveyDefinition): number {
  const days =
    typeof survey.interval_days === "number" && survey.interval_days > 0
      ? survey.interval_days
      : DEFAULT_INTERVAL_DAYS;
  return days * DAY_MS;
}

/**
 * Whether `survey` is due, given every timestamp at which this driver has
 * submitted *that* survey.
 *
 * Unreadable timestamps are not ignored the way they are elsewhere in the app:
 * a row that exists is proof the driver answered, so if none of the rows can be
 * parsed the survey is treated as recently answered. Ignoring them would reopen
 * the modal on every launch with no way to close it — the one failure mode
 * worth trading a data point to avoid.
 */
export function isSurveyDue(
  survey: SurveyDefinition,
  submittedAts: readonly (string | null | undefined)[],
  now: number,
): boolean {
  if (submittedAts.length === 0) return true;

  let latest: number | null = null;
  for (const submittedAt of submittedAts) {
    if (!submittedAt) continue;
    const ms = Date.parse(submittedAt);
    if (Number.isNaN(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }

  // Rows exist but none of them are readable — assume answered.
  if (latest === null) return false;

  // A timestamp in the future means a wrong device clock, on this device or on
  // the one that wrote it. Wait it out rather than prompt.
  if (latest > now) return false;

  return now - latest >= intervalMs(survey);
}

/**
 * The one survey to ask about right now, or `null`.
 *
 * One at a time, always. When two are due the lower `sort_order` wins and the
 * other waits for the next launch: two forced modals back to back is how a
 * survey turns into an obstacle. Ties break on `id` so the choice cannot
 * flicker between renders.
 */
export function pickDueSurvey({
  surveys,
  submissions,
  hasCompletedTrip,
  now,
}: PickDueSurveyInput): SurveyDefinition | null {
  if (!hasCompletedTrip) return null;

  const bySurvey = new Map<string, string[]>();
  for (const submission of submissions) {
    if (!submission.survey_uuid) continue;
    const list = bySurvey.get(submission.survey_uuid);
    if (list) list.push(submission.submitted_at ?? "");
    else bySurvey.set(submission.survey_uuid, [submission.submitted_at ?? ""]);
  }

  const due = surveys.filter((survey) =>
    isSurveyDue(survey, bySurvey.get(survey.id) ?? [], now),
  );
  if (due.length === 0) return null;

  return [...due].sort((a, b) => {
    const orderA = a.sort_order ?? 0;
    const orderB = b.sort_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * A question as it comes out of the local database: everything
 * {@link SurveyQuestion} needs, plus the two columns that place it — which
 * survey it belongs to and where in the order it sits.
 *
 * Written out flat rather than as `SurveyQuestion & { ... }` on purpose:
 * `useTypedQuery`'s `Equal<>` check compares an intersection and its flattened
 * equivalent as *different* types, so an intersection here fails the exactness
 * check that makes these queries worth writing.
 */
export type SurveyQuestionRow = {
  id: string;
  survey_uuid: string | null;
  prompt: string | null;
  kind: string | null;
  follow_up_max_score: number | null;
  follow_up_prompt: string | null;
  is_required: number | null;
  sort_order: number | null;
};

/** The questions belonging to one survey, in the order they are asked. */
export function questionsForSurvey(
  questions: readonly SurveyQuestionRow[],
  surveyId: string,
): SurveyQuestionRow[] {
  return questions
    .filter(
      (question) =>
        question.survey_uuid === surveyId &&
        (question.prompt ?? "").trim() !== "",
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}
