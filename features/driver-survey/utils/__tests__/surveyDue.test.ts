/**
 * When the Driver Satisfaction survey is due.
 *
 * The cadence is personal, not calendar-based, and the product rule it encodes
 * is short: ask on the first launch that follows a completed trip, then again
 * once `interval_days` have passed since the driver's last submission. A driver
 * who vanishes for six months is asked ONCE on their return — a queue of missed
 * months would be six forced modals in a row, which is how a satisfaction
 * survey becomes the thing drivers are least satisfied with.
 *
 * Two directions of failure are not symmetric here, and every rule below leans
 * the same way. Asking a beat late costs a data point. Asking wrongly puts an
 * undismissable modal in front of a driver who is trying to start work — so
 * every ambiguous case (unreadable timestamp, clock in the future) resolves to
 * "not due".
 */

import {
  DEFAULT_INTERVAL_DAYS,
  isSurveyDue,
  pickDueSurvey,
  type SurveyDefinition,
  type SurveySubmission,
} from "@/features/driver-survey/utils/surveyDue";

const NOW = Date.parse("2026-08-27T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

const APP_SURVEY: SurveyDefinition = {
  id: "survey-app",
  title: "Mobile App Satisfaction",
  interval_days: 30,
  sort_order: 0,
};

const submission = (
  surveyUuid: string,
  submittedAt: string | null,
): SurveySubmission => ({ survey_uuid: surveyUuid, submitted_at: submittedAt });

describe("isSurveyDue", () => {
  it("is due for a driver who has never answered it", () => {
    expect(isSurveyDue(APP_SURVEY, [], NOW)).toBe(true);
  });

  it("is not due five days after answering a 30-day survey", () => {
    expect(isSurveyDue(APP_SURVEY, [daysAgo(5)], NOW)).toBe(false);
  });

  it("is due again once the interval has fully elapsed", () => {
    expect(isSurveyDue(APP_SURVEY, [daysAgo(30)], NOW)).toBe(true);
  });

  it("is not due one day short of the interval", () => {
    expect(isSurveyDue(APP_SURVEY, [daysAgo(29)], NOW)).toBe(false);
  });

  /**
   * The case the whole design exists for: away for six months, asked once.
   * `pickDueSurvey` answers with a single survey and the gate closes on a
   * single submission — there is no backlog of missed periods to work through.
   */
  it("is due exactly once after a six-month absence", () => {
    expect(isSurveyDue(APP_SURVEY, [daysAgo(180)], NOW)).toBe(true);
  });

  it("measures from the most recent submission, not the first", () => {
    const answers = [daysAgo(200), daysAgo(3), daysAgo(90)];
    expect(isSurveyDue(APP_SURVEY, answers, NOW)).toBe(false);
  });

  it("follows the survey's own interval, so a weekly survey returns weekly", () => {
    const weekly: SurveyDefinition = { ...APP_SURVEY, interval_days: 7 };
    expect(isSurveyDue(weekly, [daysAgo(8)], NOW)).toBe(true);
    expect(isSurveyDue(weekly, [daysAgo(6)], NOW)).toBe(false);
  });

  it("falls back to the default interval when the survey has none", () => {
    const noInterval: SurveyDefinition = { ...APP_SURVEY, interval_days: null };
    expect(isSurveyDue(noInterval, [daysAgo(DEFAULT_INTERVAL_DAYS - 1)], NOW)).toBe(
      false,
    );
    expect(isSurveyDue(noInterval, [daysAgo(DEFAULT_INTERVAL_DAYS)], NOW)).toBe(
      true,
    );
  });

  /**
   * A submission the device cannot read is still proof the driver answered.
   * Treating it as "never answered" would reopen the modal on every launch
   * with no way out, so an unreadable row silently defers instead.
   */
  it("treats an unreadable timestamp as answered rather than as never answered", () => {
    expect(isSurveyDue(APP_SURVEY, ["not-a-date"], NOW)).toBe(false);
    expect(isSurveyDue(APP_SURVEY, [null], NOW)).toBe(false);
  });

  it("still reads the good timestamps when one row is unreadable", () => {
    expect(isSurveyDue(APP_SURVEY, ["not-a-date", daysAgo(40)], NOW)).toBe(true);
  });

  it("does not ask when the last submission is dated in the future", () => {
    const tomorrow = new Date(NOW + DAY).toISOString();
    expect(isSurveyDue(APP_SURVEY, [tomorrow], NOW)).toBe(false);
  });
});

describe("pickDueSurvey", () => {
  const base = {
    surveys: [APP_SURVEY],
    submissions: [] as SurveySubmission[],
    hasCompletedTrip: true,
    now: NOW,
  };

  it("returns the survey a new driver has never answered", () => {
    expect(pickDueSurvey(base)?.id).toBe("survey-app");
  });

  /**
   * A driver with no completed trip has nothing to have an opinion about yet,
   * and asking during onboarding buys a number that means nothing. The survey
   * catches up with them after their first trip.
   */
  it("asks nothing of a driver who has never completed a trip", () => {
    expect(pickDueSurvey({ ...base, hasCompletedTrip: false })).toBeNull();
  });

  it("returns nothing when every survey was answered inside its interval", () => {
    const submissions = [submission("survey-app", daysAgo(2))];
    expect(pickDueSurvey({ ...base, submissions })).toBeNull();
  });

  it("ignores surveys that are not due when another one is", () => {
    const pay: SurveyDefinition = {
      id: "survey-pay",
      title: "Job & Pay",
      interval_days: 7,
      sort_order: 1,
    };
    const result = pickDueSurvey({
      ...base,
      surveys: [APP_SURVEY, pay],
      submissions: [
        submission("survey-app", daysAgo(1)),
        submission("survey-pay", daysAgo(10)),
      ],
    });
    expect(result?.id).toBe("survey-pay");
  });

  /**
   * Two due at once is one modal, not two: the lower `sort_order` goes first
   * and the other waits for the next launch.
   */
  it("asks the lowest sort_order first when several are due", () => {
    const pay: SurveyDefinition = {
      id: "survey-pay",
      title: "Job & Pay",
      interval_days: 7,
      sort_order: 1,
    };
    const result = pickDueSurvey({ ...base, surveys: [pay, APP_SURVEY] });
    expect(result?.id).toBe("survey-app");
  });

  it("breaks a sort_order tie by id, so the choice never flickers between renders", () => {
    const a: SurveyDefinition = { ...APP_SURVEY, id: "aaa", sort_order: 0 };
    const b: SurveyDefinition = { ...APP_SURVEY, id: "bbb", sort_order: 0 };
    expect(pickDueSurvey({ ...base, surveys: [b, a] })?.id).toBe("aaa");
  });

  it("does not let one survey's submission silence another", () => {
    const submissions = [submission("survey-pay", daysAgo(1))];
    expect(pickDueSurvey({ ...base, submissions })?.id).toBe("survey-app");
  });

  it("returns nothing when there are no surveys at all", () => {
    expect(pickDueSurvey({ ...base, surveys: [] })).toBeNull();
  });
});
