/**
 * Recording a survey submission: one row per question answered, written
 * locally and replayed to Postgres whenever the phone next has a connection.
 *
 * There is no parent submission row — see the migration header in
 * bleacher_rentals. `submission_uuid` is the same on every row written here,
 * which is all the grouping a report needs, and it means each answer crosses
 * the sync boundary as an independent write: nothing to sequence, and no
 * child left pointing at a parent the server refused. Everything about the
 * submission (driver, survey, timestamp, build) rides on the row itself.
 *
 * Two more things are deliberate.
 *
 * `submitted_at` is written by the client rather than left to the Postgres
 * default. The default stamps the moment of *sync*: an answer given offline on
 * the 1st and synced on the 4th would push the driver's next prompt three days
 * out and land in the wrong month on the report.
 *
 * Every row carries `prompt_snapshot`, the wording the driver was actually
 * shown. Questions become editable in the web app next quarter, and a report
 * that joined live question text would re-label every historical answer with a
 * question nobody was asked.
 *
 * The rows still commit in one local transaction. Not for referential safety
 * any more, but so a half-written submission cannot exist on the device: with
 * several questions, either the whole opinion is recorded or none of it is and
 * the driver is asked again.
 */

import { db } from "@/library/powersync/db";
import type { DriverScope } from "@/library/powersync/scoping/driverScope";
import { executeTypedTransaction } from "@/library/powersync/typedMutation";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";

import {
  validateAnswer,
  type AnswerRejection,
  type SurveyDraftAnswer,
  type SurveyQuestion,
} from "./surveyValidation";

export type SubmitSurveyInput = {
  surveyId: string;
  questions: readonly SurveyQuestion[];
  /** Keyed by question id, as the modal holds them. */
  drafts: Readonly<Record<string, SurveyDraftAnswer>>;
  /**
   * §15 — the branded scope, not two strings. `driver_uuid` is what the RLS
   * policy, the sync rule and the web report all key off; an answer attributed
   * to anything else would be refused on arrival and dropped in silence.
   */
  scope: DriverScope;
  /** Injected so one render's clock is used once, and so this is testable. */
  now: number;
};

export type SubmitSurveyResult =
  | { ok: true; submissionId: string }
  | { ok: false; reason: AnswerRejection; questionId: string };

function appVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

export async function submitSurveyResponse({
  surveyId,
  questions,
  drafts,
  scope,
  now,
}: SubmitSurveyInput): Promise<SubmitSurveyResult> {
  // Validated once more here and not only on the button: the modal's copy can
  // be a render stale, and a write the server refuses is a write nobody sees
  // again.
  const validated: {
    questionId: string;
    score: number | null;
    reason: string | null;
    prompt: string;
  }[] = [];

  for (const question of questions) {
    const draft = drafts[question.id] ?? { score: null, reason: "" };
    const result = validateAnswer(question, draft);
    if (!result.ok) {
      return { ok: false, reason: result.reason, questionId: question.id };
    }
    validated.push({ questionId: question.id, ...result.value });
  }

  const submissionId = randomUUID();
  const submittedAt = new Date(now).toISOString();
  const platform = Platform.OS === "ios" ? "ios" : "android";
  // The first question is about the app itself, so "4.2 scores worse than 4.1"
  // is exactly the finding this makes possible.
  const version = appVersion();

  await executeTypedTransaction(async (tx) => {
    for (const answer of validated) {
      await tx.run(
        db
          .insertInto("DriverSurveyResponses")
          .values({
            id: randomUUID(),
            submission_uuid: submissionId,
            survey_uuid: surveyId,
            question_uuid: answer.questionId,
            driver_uuid: scope.driverUuid,
            user_uuid: scope.userUuid,
            score: answer.score,
            reason_text: answer.reason,
            prompt_snapshot: answer.prompt,
            submitted_at: submittedAt,
            app_version: version,
            app_platform: platform,
            created_at: submittedAt,
          })
          .compile(),
      );
    }
  });

  return { ok: true, submissionId };
}
