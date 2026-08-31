/**
 * The last gate before an undismissable modal reaches the screen.
 *
 * Four of the five clauses are ordinary "not yet"s. The fifth, `hasSynced`, is
 * the one that matters: a freshly installed or freshly signed-in phone has an
 * EMPTY local database, and an empty database reads exactly like "this driver
 * has never answered". Prompting before the first sync completes would force
 * the survey on someone who answered yesterday and put a duplicate in the
 * report. After that first sync the check is free on every later launch, and
 * the feature stays entirely offline — the answer is already on the device.
 */

import type { SurveyDefinition } from "./surveyDue";

export type SurveyGateInput = {
  isSignedIn: boolean;
  /** PowerSync has completed its first full sync on this install. */
  hasSynced: boolean;
  /** §15 — the Clerk → Users → Drivers scope has resolved. */
  scopeReady: boolean;
  /** The local reads behind `due` have not answered yet. */
  dataLoading: boolean;
  /**
   * A forced app update is on screen. It outranks the survey: a driver whose
   * build is blocked cannot act on anything the app shows, and two stacked
   * modals leave the survey behind an update wall.
   */
  blockedByVersionGate: boolean;
  due: SurveyDefinition | null;
};

export function shouldAskSurvey({
  isSignedIn,
  hasSynced,
  scopeReady,
  dataLoading,
  blockedByVersionGate,
  due,
}: SurveyGateInput): boolean {
  if (!isSignedIn) return false;
  if (!hasSynced) return false;
  if (!scopeReady) return false;
  if (dataLoading) return false;
  if (blockedByVersionGate) return false;
  return due !== null;
}
