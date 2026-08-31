/**
 * When the undismissable modal is allowed on screen.
 *
 * Every clause here is a "not yet", and one of them is the reason this function
 * exists at all: **`hasSynced`**. A phone that has just been signed in, or
 * reinstalled, has an EMPTY local database — and an empty database is
 * indistinguishable from "this driver has never answered". Ask before the first
 * sync completes and the driver who answered yesterday is forced through the
 * survey again, and the report gains a duplicate that never happened. Once the
 * first sync has landed the check costs nothing on every later launch, and the
 * feature stays fully offline: the data is already on the device.
 *
 * The version gate outranks this one. A driver whose build is force-blocked
 * cannot act on anything the app shows, and stacking two modals leaves them
 * looking at a survey behind an update wall.
 */

import { shouldAskSurvey } from "@/features/driver-survey/utils/surveyGateState";

const DUE = {
  id: "survey-app",
  title: "Mobile App Satisfaction",
  interval_days: 30,
  sort_order: 0,
};

const READY = {
  isSignedIn: true,
  hasSynced: true,
  scopeReady: true,
  dataLoading: false,
  blockedByVersionGate: false,
  due: DUE,
};

describe("shouldAskSurvey", () => {
  it("asks once everything has settled and a survey is due", () => {
    expect(shouldAskSurvey(READY)).toBe(true);
  });

  it("asks nothing when no survey is due", () => {
    expect(shouldAskSurvey({ ...READY, due: null })).toBe(false);
  });

  it("asks nothing before sign-in", () => {
    expect(shouldAskSurvey({ ...READY, isSignedIn: false })).toBe(false);
  });

  /** The duplicate-submission trap — see the header. */
  it("waits for the first sync rather than trusting an empty local database", () => {
    expect(shouldAskSurvey({ ...READY, hasSynced: false })).toBe(false);
  });

  it("waits for the driver scope to resolve", () => {
    expect(shouldAskSurvey({ ...READY, scopeReady: false })).toBe(false);
  });

  it("waits while the local queries are still resolving", () => {
    expect(shouldAskSurvey({ ...READY, dataLoading: true })).toBe(false);
  });

  it("yields to a forced app update", () => {
    expect(shouldAskSurvey({ ...READY, blockedByVersionGate: true })).toBe(false);
  });
});
