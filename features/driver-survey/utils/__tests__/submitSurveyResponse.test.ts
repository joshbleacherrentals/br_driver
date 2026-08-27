/**
 * The write path: what actually lands in the local database when a driver
 * submits.
 *
 * The pure rules around it are already covered (`surveyValidation`,
 * `surveyDue`, `surveyGateState`). What was not covered is the step that turns
 * a validated draft into rows — and that step carries the properties the whole
 * feature leans on:
 *
 *  * one `submission_uuid` shared by every row of one submission, because that
 *    is the only thing grouping them without a parent table;
 *  * `submitted_at` taken from the injected `now`, not from the Postgres
 *    default, so an answer given offline keeps the date it was given on;
 *  * `prompt_snapshot` carrying the wording actually shown;
 *  * one write transaction, so a half-submission cannot exist on the device;
 *  * nothing written at all when a draft would be refused by the server.
 *
 * The last one is the one with teeth: PowerSync drops a server-rejected write
 * from its outbox in silence, so a row this function lets through wrongly is a
 * driver's answer deleted without anyone being told.
 */

import type { SurveyQuestion } from "../surveyValidation";

const mockRun = jest.fn();
const mockTransaction = jest.fn(
  async (callback: (tx: { run: typeof mockRun }) => Promise<unknown>) =>
    callback({ run: mockRun }),
);

jest.mock("@/library/powersync/typedMutation", () => ({
  __esModule: true,
  executeTypedTransaction: (callback: never) => mockTransaction(callback),
}));

// The real Kysely builder would need the PowerSync native half. The insert is
// captured as a plain object instead, which is what these assertions are about.
jest.mock("@/library/powersync/db", () => ({
  __esModule: true,
  db: {
    insertInto: (table: string) => ({
      values: (row: Record<string, unknown>) => ({
        compile: () => ({ table, row }),
      }),
    }),
  },
}));

let mockUuidCounter = 0;
jest.mock("expo-crypto", () => ({
  __esModule: true,
  randomUUID: () => `uuid-${++mockUuidCounter}`,
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "9.9.9" } },
}));

import { submitSurveyResponse } from "../submitSurveyResponse";

const scale: SurveyQuestion = {
  id: "q-scale",
  prompt: "How satisfied are you overall with the mobile app?",
  kind: "scale_1_10",
  follow_up_max_score: 6,
  follow_up_prompt: "What would make it better?",
  is_required: 1,
};

const second: SurveyQuestion = {
  id: "q-second",
  prompt: "How is the pay?",
  kind: "scale_1_10",
  follow_up_max_score: null,
  follow_up_prompt: null,
  is_required: 1,
};

const scope = {
  driverUuid: "driver-1",
  userUuid: "user-1",
} as unknown as Parameters<typeof submitSurveyResponse>[0]["scope"];

// 2026-08-27T12:00:00.000Z
const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);

const rowsWritten = () =>
  mockRun.mock.calls.map(([compiled]) => compiled.row as Record<string, unknown>);

beforeEach(() => {
  mockUuidCounter = 0;
});

describe("submitSurveyResponse", () => {
  it("writes one row carrying the answer, the driver and the build", async () => {
    const result = await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale],
      drafts: { "q-scale": { score: 9, reason: "" } },
      scope,
      now: NOW,
    });

    expect(result).toEqual({ ok: true, submissionId: expect.any(String) });

    const rows = rowsWritten();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      survey_uuid: "survey-1",
      question_uuid: "q-scale",
      driver_uuid: "driver-1",
      user_uuid: "user-1",
      score: 9,
      reason_text: null,
      prompt_snapshot: "How satisfied are you overall with the mobile app?",
      app_version: "9.9.9",
    });
  });

  it("stamps submitted_at from the injected clock, not from the server default", async () => {
    await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale],
      drafts: { "q-scale": { score: 8, reason: "" } },
      scope,
      now: NOW,
    });

    expect(rowsWritten()[0].submitted_at).toBe("2026-08-27T12:00:00.000Z");
  });

  it("gives every row of one submission the same submission_uuid", async () => {
    await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale, second],
      drafts: {
        "q-scale": { score: 8, reason: "" },
        "q-second": { score: 7, reason: "" },
      },
      scope,
      now: NOW,
    });

    const rows = rowsWritten();
    expect(rows).toHaveLength(2);
    expect(rows[0].submission_uuid).toBe(rows[1].submission_uuid);
    // ...while still being distinct rows.
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it("writes the whole submission inside a single transaction", async () => {
    await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale, second],
      drafts: {
        "q-scale": { score: 8, reason: "" },
        "q-second": { score: 7, reason: "" },
      },
      scope,
      now: NOW,
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it("carries the wording the driver was shown, not the live question text", async () => {
    const reworded: SurveyQuestion = { ...scale, prompt: "OLD WORDING" };

    await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [reworded],
      drafts: { "q-scale": { score: 10, reason: "" } },
      scope,
      now: NOW,
    });

    expect(rowsWritten()[0].prompt_snapshot).toBe("OLD WORDING");
  });

  it("trims the reason and keeps one volunteered with a high score", async () => {
    await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale],
      drafts: { "q-scale": { score: 10, reason: "  all good  " } },
      scope,
      now: NOW,
    });

    expect(rowsWritten()[0].reason_text).toBe("all good");
  });

  it("writes NOTHING when a low score has no reason — the server would refuse it", async () => {
    const result = await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale],
      drafts: { "q-scale": { score: 3, reason: "" } },
      scope,
      now: NOW,
    });

    expect(result).toEqual({
      ok: false,
      reason: "reason_required",
      questionId: "q-scale",
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("writes NOTHING when a low score's reason is only whitespace", async () => {
    const result = await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale],
      drafts: { "q-scale": { score: 3, reason: "   " } },
      scope,
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, reason: "reason_required" });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("writes NOTHING when a required question was left unanswered", async () => {
    const result = await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale],
      drafts: {},
      scope,
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, reason: "score_missing" });
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("refuses the whole submission when only the second question is invalid", async () => {
    const result = await submitSurveyResponse({
      surveyId: "survey-1",
      questions: [scale, { ...second, follow_up_max_score: 6 }],
      drafts: {
        "q-scale": { score: 9, reason: "" },
        "q-second": { score: 2, reason: "" },
      },
      scope,
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, questionId: "q-second" });
    // No partial submission reached the database.
    expect(mockRun).not.toHaveBeenCalled();
  });
});
