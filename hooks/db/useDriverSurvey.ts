/**
 * The local reads behind the Driver Satisfaction gate.
 *
 * All three are ordinary reactive PowerSync queries over data the device
 * already holds, which is what lets the survey be asked — and answered — with
 * no connection at all. Nothing here touches the network.
 */

import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo, useState } from "react";

import {
  pickDueSurvey,
  questionsForSurvey,
  type SurveyDefinition,
  type SurveyQuestionRow,
  type SurveySubmission,
} from "@/features/driver-survey/utils/surveyDue";

export type { SurveyDefinition, SurveyQuestionRow };

/** Every active survey, lowest `sort_order` first. */
export function useActiveSurveys(): {
  surveys: SurveyDefinition[];
  isLoading: boolean;
} {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("DriverSurveys")
        .select(["id", "title", "interval_days", "sort_order"])
        // PowerSync mirrors Postgres booleans as 0/1. The sync rule already
        // filters to active surveys; this repeats it so a row that arrived
        // before a rule change cannot start prompting again.
        .where("is_active", "=", 1)
        .orderBy("sort_order", "asc")
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<SurveyDefinition>());
  return { surveys: data ?? [], isLoading: data === undefined };
}

/** Every active question, across surveys. Small enough to read in one go. */
export function useActiveSurveyQuestions(): {
  questions: SurveyQuestionRow[];
  isLoading: boolean;
} {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("DriverSurveyQuestions")
        .select([
          "id",
          "survey_uuid",
          "prompt",
          "kind",
          "follow_up_max_score",
          "follow_up_prompt",
          "is_required",
          "sort_order",
        ])
        .where("is_active", "=", 1)
        .orderBy("sort_order", "asc")
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<SurveyQuestionRow>());
  return { questions: data ?? [], isLoading: data === undefined };
}

/**
 * This driver's own submissions — all of them, never filtered by date.
 *
 * This is the app's entire memory of when it last asked. A `where` on recency
 * here would make a driver whose last answer fell outside the window look like
 * one who has never answered, and they would be prompted every launch.
 *
 * One row per question answered, so a multi-question survey contributes
 * several rows with the same `submitted_at`. `pickDueSurvey` only ever reads
 * the newest per survey, so the repetition costs nothing and no grouping by
 * `submission_uuid` is needed here.
 */
export function useMySurveySubmissions(): {
  submissions: SurveySubmission[];
  isLoading: boolean;
} {
  const scope = useDriverScope();

  const compiled = useMemo(() => {
    if (!scope) return null;
    return db
      .selectFrom("DriverSurveyResponses")
      .select(["survey_uuid", "submitted_at"])
      .where("driver_uuid", "=", scope.driverUuid)
      .compile();
  }, [scope]);

  const { data, isDisabled } = useTypedQuery(compiled, expect<SurveySubmission>());
  return {
    submissions: data ?? [],
    isLoading: isDisabled || data === undefined,
  };
}

/**
 * Whether this driver has ever finished a trip.
 *
 * A driver still onboarding has no experience of the app to rate yet, so the
 * survey waits for their first completed trip rather than meeting them during
 * setup. One `id` column, not the row: this runs on every launch.
 */
export function useHasCompletedTrip(): {
  hasCompletedTrip: boolean;
  isLoading: boolean;
} {
  const scope = useDriverScope();

  const compiled = useMemo(() => {
    if (!scope) return null;
    return db
      .selectFrom("WorkTrackers")
      .select(["id"])
      .where("driver_uuid", "=", scope.driverUuid)
      .where("status", "=", "completed")
      .limit(1)
      .compile();
  }, [scope]);

  const { data, isDisabled } = useTypedQuery(compiled, expect<{ id: string }>());
  return {
    hasCompletedTrip: (data?.length ?? 0) > 0,
    isLoading: isDisabled || data === undefined,
  };
}

export type DueSurvey = {
  survey: SurveyDefinition;
  questions: SurveyQuestionRow[];
};

/**
 * The one survey to ask about right now, with its questions — or `null`.
 *
 * `now` is captured once, when the hook first mounts, rather than ticking: the
 * decision is made at launch, and a clock that advanced mid-session must not be
 * able to raise a modal over a driver in the middle of an inspection.
 */
export function useDueSurvey(): { due: DueSurvey | null; isLoading: boolean } {
  const [now] = useState(() => Date.now());
  const { surveys, isLoading: surveysLoading } = useActiveSurveys();
  const { questions, isLoading: questionsLoading } = useActiveSurveyQuestions();
  const { submissions, isLoading: submissionsLoading } = useMySurveySubmissions();
  const { hasCompletedTrip, isLoading: tripsLoading } = useHasCompletedTrip();

  const isLoading =
    surveysLoading || questionsLoading || submissionsLoading || tripsLoading;

  const due = useMemo(() => {
    if (isLoading) return null;

    const survey = pickDueSurvey({
      surveys,
      submissions,
      hasCompletedTrip,
      now,
    });
    if (!survey) return null;

    const surveyQuestions = questionsForSurvey(questions, survey.id);
    // A survey whose questions have not arrived yet is not askable. Nothing to
    // recover from — the next launch, after the next sync, will have them.
    if (surveyQuestions.length === 0) return null;

    return { survey, questions: surveyQuestions };
  }, [isLoading, surveys, questions, submissions, hasCompletedTrip, now]);

  return { due, isLoading };
}
