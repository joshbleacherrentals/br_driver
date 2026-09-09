/**
 * What the `+` button on the Damage Reports screen should do next.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * A rule rather than a branch buried in an onPress, because it is the second
 * half of the deduplication: the inspection shows a driver what is already
 * reported before they describe damage, and so must this entry point.
 * Filing something new is never blocked — it just stops being the first thing
 * that happens.
 */

export type PlusAction = "pick-bleacher" | "review-existing" | "file-new";

export function resolvePlusAction(state: {
  bleacherUuid: string | null;
  openReportCount: number;
}): PlusAction {
  if (!state.bleacherUuid) return "pick-bleacher";
  if (state.openReportCount > 0) return "review-existing";
  return "file-new";
}
