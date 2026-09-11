/**
 * Stepping away from a tracker.
 *
 * Two different acts, deliberately kept apart so the office can tell them
 * apart on the board: a driver *declines* work they were offered and never
 * took on, and *abandons* work they took on and cannot finish. Both end the
 * tracker for the driver — it leaves their app the same way a completed one
 * does — but only one of them means a driver walked out mid-job.
 */

import type { WorkTrackerKind } from "@/utils/workTrackerKind";

/** The one withdrawal a driver may make from a given status, if any. */
export type WithdrawalAction = "decline" | "abandon";

/**
 * Statuses the driver has taken on and can still walk away from: acceptance
 * and every leg after it. `completed` is absent — there is nothing left to
 * abandon once the work is done.
 */
const ABANDONABLE_STATUSES: ReadonlySet<string> = new Set([
  "accepted",
  "dest_pickup",
  "pickup_inspection",
  "dest_dropoff",
  "dropoff_inspection",
]);

/**
 * Which way out this tracker offers the driver, or `null` for none.
 *
 * An unknown status yields `null`: a build that cannot classify a tracker has
 * no business drawing a destructive button on it.
 */
export function withdrawalActionFor(
  status: string | null | undefined,
): WithdrawalAction | null {
  if (!status) return null;
  if (status === "released") return "decline";

  return ABANDONABLE_STATUSES.has(status) ? "abandon" : null;
}

/** What a confirmation dialog says, for one action on one kind of work. */
export type WithdrawalCopy = {
  /** The button on the card. */
  button: string;
  /** Dialog title. */
  title: string;
  /** Dialog body — says what happens next, because nothing here is undoable. */
  message: string;
  /** The destructive button in the dialog. */
  confirm: string;
};

/**
 * The words for a withdrawal.
 *
 * The noun follows the kind of work: a repair or a site visit is not a "trip",
 * and asking a driver to confirm abandoning a trip they never had reads as a
 * bug in the app. The message names the office deliberately — a driver cannot
 * undo this from the phone, and the only way the work comes back is somebody
 * reassigning it.
 */
export function withdrawalCopy(
  action: WithdrawalAction,
  kind: WorkTrackerKind,
): WithdrawalCopy {
  const noun = kind === "trip" ? "Trip" : "Job";
  const lower = noun.toLowerCase();

  if (action === "decline") {
    return {
      button: "Decline",
      title: `Decline ${noun}`,
      message: `Are you sure you want to decline this ${lower}? It goes back to the office and leaves your list.`,
      confirm: "Decline",
    };
  }

  return {
    button: "Abandon",
    title: `Abandon ${noun}`,
    message: `Are you sure you want to abandon this ${lower}? It goes back to the office and leaves your list — only they can give it back to you.`,
    confirm: "Abandon",
  };
}

/**
 * What a withdrawn tracker is called once it is history — or `null` for work
 * that was simply done, which needs no label because it is the norm.
 */
export function withdrawnOutcomeLabel(
  status: string | null | undefined,
): string | null {
  if (status === "declined") return "Declined";
  if (status === "abandoned") return "Abandoned";

  return null;
}
