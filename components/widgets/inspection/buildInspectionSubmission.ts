import {
  BLEACHER_CHANGE_REASONS,
  type BleacherChangeReason,
} from "@/constants/bleacherChangeReasons";

/**
 * Turns the state of the inspection form into the rows it wants written, and
 * refuses the submissions that must not reach the database.
 *
 * It writes nothing itself. The widget executes the result in one transaction,
 * which is also what keeps the inspection row and the work tracker pointing at
 * it from ever drifting apart.
 */

type InspectionType = "pickup" | "dropoff";

export type InspectionSubmissionInput = {
  workTrackerId: string;
  inspectionId: string;
  inspectionType: InspectionType;
  /** ISO timestamp, passed in so the result is reproducible. */
  now: string;
  /** What the manager put on the work tracker. */
  assignedBleacherUuid: string | null;
  /** What the driver has picked in the form. */
  selectedBleacherUuid: string | null;
  /** `WorkTrackers.actual_bleacher_uuid` as it stands — null until confirmed. */
  confirmedBleacherUuid: string | null;
  changeReason: string | null;
  walkAroundComplete: boolean;
  damageFound: boolean;
  answersPayload: Record<string, unknown>;
};

export type InspectionSubmissionError =
  | "no_bleacher_selected"
  | "reason_required"
  | "unknown_reason";

export type InspectionSubmission =
  | { ok: false; error: InspectionSubmissionError }
  | {
      ok: true;
      inspectionRow: {
        id: string;
        created_at: string;
        walk_around_complete: number;
        issues_found: number;
        issue_description: null;
        answers_json: string;
        bleacher_uuid: string;
      };
      /**
       * Fields to set on the work tracker. The confirmation keys are absent —
       * not null — when the bleacher was already confirmed, so executing this
       * cannot overwrite it.
       */
      workTrackerUpdate: {
        updated_at: string;
        pre_inspection_uuid?: string;
        post_inspection_uuid?: string;
        actual_bleacher_uuid?: string;
        bleacher_change_reason?: string | null;
      };
      /** Bleacher a damage report from this inspection belongs to. */
      damageBleacherUuid: string;
    };

function isKnownReason(code: string): code is BleacherChangeReason {
  return BLEACHER_CHANGE_REASONS.some((r) => r.code === code);
}

/**
 * The bleacher rules on their own, so the form can refuse a submission before
 * it writes anything — photo rows are saved on the way to building the answers,
 * and finding out afterwards would leave them orphaned.
 */
export function checkBleacherSelection(input: {
  assignedBleacherUuid: string | null;
  selectedBleacherUuid: string | null;
  confirmedBleacherUuid: string | null;
  changeReason: string | null;
}): InspectionSubmissionError | null {
  if (!input.selectedBleacherUuid) return "no_bleacher_selected";

  const confirming = input.confirmedBleacherUuid === null;
  const swapped =
    confirming && input.selectedBleacherUuid !== input.assignedBleacherUuid;

  if (swapped && !input.changeReason) return "reason_required";
  if (swapped && !isKnownReason(input.changeReason!)) return "unknown_reason";
  return null;
}

export function buildInspectionSubmission(
  input: InspectionSubmissionInput,
): InspectionSubmission {
  const error = checkBleacherSelection(input);
  if (error) return { ok: false, error };

  const bleacherUuid = input.selectedBleacherUuid!;

  // Confirmation happens once. A dropoff inspection reports which bleacher it
  // covered, but it does not get to re-answer what pickup already settled —
  // only a manager can correct that, from the web.
  const confirming = input.confirmedBleacherUuid === null;
  const swapped = confirming && bleacherUuid !== input.assignedBleacherUuid;

  // A reason only means anything alongside a swap. Reverting to the assigned
  // bleacher without clearing the picked reason is a normal thing to do in the
  // form, so drop it rather than refusing.
  const reason = swapped ? input.changeReason : null;

  const inspectionSlot =
    input.inspectionType === "pickup"
      ? { pre_inspection_uuid: input.inspectionId }
      : { post_inspection_uuid: input.inspectionId };

  const confirmation = confirming
    ? { actual_bleacher_uuid: bleacherUuid, bleacher_change_reason: reason }
    : {};

  return {
    ok: true,
    inspectionRow: {
      id: input.inspectionId,
      created_at: input.now,
      walk_around_complete: input.walkAroundComplete ? 1 : 0,
      issues_found: input.damageFound ? 1 : 0,
      issue_description: null,
      answers_json: JSON.stringify(input.answersPayload),
      bleacher_uuid: bleacherUuid,
    },
    workTrackerUpdate: {
      ...inspectionSlot,
      ...confirmation,
      updated_at: input.now,
    },
    damageBleacherUuid: bleacherUuid,
  };
}
