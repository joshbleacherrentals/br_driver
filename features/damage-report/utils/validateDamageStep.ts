/**
 * The damage step of an inspection, once "select all that apply" exists.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * `damage = yes` used to mean exactly one thing — fill in a report — and that
 * is what produced three to five reports about one split plank. It can now be
 * answered two ways, and this decides that it was answered at least one of
 * them: either the driver pointed at reports that already describe the damage,
 * or they wrote a new one.
 *
 * The one state that must stay unreachable is `yes` with neither: an
 * inspection asserting that damage was found while leaving no record of what
 * it was.
 *
 * Pure and separate from the screen because it is a rule, not a rendering
 * concern — and because the screen it lives on is 1000 lines of camera,
 * filesystem and transaction handling that a rule should not have to be tested
 * through.
 */

export type DamageStepState = {
  damageFound: boolean | null;
  /** Existing reports the driver ticked as describing what they see. */
  acknowledgedIds: string[];
  /** Whether the new-report form is open and being filled in. */
  filingNewReport: boolean;
  note: string;
  photoCount: number;
};

export function validateDamageStep(state: DamageStepState): string | null {
  if (state.damageFound === null) return "Please indicate if damage was found";
  if (state.damageFound === false) return null;

  if (state.filingNewReport) {
    // Unchanged requirements for a new report: a note and evidence. What
    // changed is that they no longer apply to a driver who is confirming
    // someone else's report, which already carries both.
    if (!state.note.trim()) return "Damage notes are required";
    if (state.photoCount === 0) return "At least one damage photo is required";
    return null;
  }

  if (state.acknowledgedIds.length === 0) {
    return "Select an existing damage report or file a new one";
  }

  return null;
}
