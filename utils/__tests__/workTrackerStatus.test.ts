/**
 * Covers: the trip-closed boundary used to decide whether an inspection's
 * photos may still be edited.
 *
 * The values are the Postgres `worktracker_status` enum; only `completed` is
 * terminal for this boundary — `cancelled` trips must remain editable so a
 * driver can still repair a lost photo.
 */

import {
  isDriverActiveTracker,
  isTripAccepted,
  isWorkTrackerClosed,
  startingStatusFor,
} from "@/utils/workTrackerStatus";

describe("trip closed boundary", () => {
  it.each(["completed"])("treats %s as closed", (status) => {
    expect(isWorkTrackerClosed(status)).toBe(true);
  });

  it.each([
    "draft",
    "released",
    "accepted",
    "dest_pickup",
    "pickup_inspection",
    "dest_dropoff",
    "dropoff_inspection",
    "cancelled",
  ])("treats %s as still open", (status) => {
    expect(isWorkTrackerClosed(status)).toBe(false);
  });

  // A status we cannot classify is not evidence the trip ended — defaulting to
  // "closed" would silently withdraw the driver's only way to fix a lost photo.
  it("treats an unknown or absent status as open", () => {
    expect(isWorkTrackerClosed(null)).toBe(false);
    expect(isWorkTrackerClosed(undefined)).toBe(false);
    expect(isWorkTrackerClosed("something_new")).toBe(false);
  });
});

/**
 * `isTripAccepted` — the gate on driver-visible contact details.
 *
 * A trip's contact is a customer's personal phone number, so it is shown only
 * once the driver has taken the trip on. That is not the single `accepted`
 * status: acceptance moves the trip along the pickup/dropoff chain, and the
 * contact has to stay reachable the whole way through, including after the
 * trip is `completed` and the driver is reviewing it in history.
 *
 * `released` is the pending-trips state — offered but not taken — so it stays
 * shut. `cancelled` stays shut by product decision: there is no trip left to
 * call about. Note this differs from `isWorkTrackerClosed` above, which treats
 * `cancelled` as open because a cancelled trip's photos remain repairable.
 *
 * `accepted_at` is the second witness. Status and timestamp are written by
 * different paths, and a timestamp is the harder evidence that a driver took
 * the trip; if it is set, the gate opens regardless of what status says.
 */
describe("isTripAccepted", () => {
  it("is shut before the driver takes the trip on", () => {
    expect(isTripAccepted("draft", null)).toBe(false);
    expect(isTripAccepted("released", null)).toBe(false);
  });

  it("is open from acceptance through every stage of the trip", () => {
    expect(isTripAccepted("accepted", null)).toBe(true);
    expect(isTripAccepted("dest_pickup", null)).toBe(true);
    expect(isTripAccepted("pickup_inspection", null)).toBe(true);
    expect(isTripAccepted("dest_dropoff", null)).toBe(true);
    expect(isTripAccepted("dropoff_inspection", null)).toBe(true);
  });

  it("stays open on a completed trip, for review in history", () => {
    expect(isTripAccepted("completed", null)).toBe(true);
  });

  it("is shut on a cancelled trip — there is nothing left to call about", () => {
    expect(isTripAccepted("cancelled", null)).toBe(false);
    expect(isTripAccepted("cancelled", "2026-08-25T10:00:00Z")).toBe(false);
  });

  it("opens on an accepted_at timestamp even if status lags behind", () => {
    expect(isTripAccepted("released", "2026-08-25T10:00:00Z")).toBe(true);
  });

  it("is shut on a status it cannot classify", () => {
    expect(isTripAccepted(null, null)).toBe(false);
    expect(isTripAccepted(undefined, undefined)).toBe(false);
    expect(isTripAccepted("some_future_status", null)).toBe(false);
  });
});

describe("startingStatusFor", () => {
  it("sends a trip to its pick up first", () => {
    expect(startingStatusFor("trip")).toBe("dest_pickup");
  });

  it("sends a repair or a site visit straight to the one place it happens", () => {
    // There is nothing to collect: the driver drives to where the bleacher is,
    // works, and inspects once. Walking them through an empty pick-up leg
    // would ask for an inspection of a trailer they never hitched.
    expect(startingStatusFor("repair_maintenance")).toBe("dest_dropoff");
    expect(startingStatusFor("site_visit_cleaning_other")).toBe("dest_dropoff");
  });
});

/**
 * The two statuses a driver can put a tracker into themselves: `declined` (an
 * offer they never took) and `abandoned` (work they took on and walked away
 * from). Both are terminal for the driver — the tracker leaves their app the
 * same way a completed one does — so every boundary in this file has to treat
 * them as shut, and the shared list filter has to drop them.
 */
describe("driver-withdrawn trackers", () => {
  it.each(["declined", "abandoned"])(
    "treats %s as closed to further edits",
    (status) => {
      expect(isWorkTrackerClosed(status)).toBe(true);
    },
  );

  // `accepted_at` is set on an abandoned trip — the driver did accept it once —
  // so the timestamp witness has to lose to the later fact, exactly as it does
  // on a cancelled trip. Otherwise a walked-away trip keeps leaking a
  // customer's personal phone number.
  it("is shut for contact details, timestamp or not", () => {
    expect(isTripAccepted("declined", null)).toBe(false);
    expect(isTripAccepted("abandoned", null)).toBe(false);
    expect(isTripAccepted("abandoned", "2026-09-11T10:00:00Z")).toBe(false);
  });
});

/**
 * `isDriverActiveTracker` — the one rule for "is this still on the driver's
 * plate", replacing the copies that used to sit in the trips list, the pending
 * list and the trip card. A `draft` has not been released to anyone, and
 * `completed`, `declined` and `abandoned` are all finished business.
 */
describe("isDriverActiveTracker", () => {
  it.each([
    "released",
    "accepted",
    "dest_pickup",
    "pickup_inspection",
    "dest_dropoff",
    "dropoff_inspection",
    // Unchanged by this feature: a cancelled trip still shows, carrying its
    // CANCELLED badge, so the driver learns the office called it off.
    "cancelled",
  ])("keeps %s on the driver's plate", (status) => {
    expect(isDriverActiveTracker(status)).toBe(true);
  });

  it.each(["draft", "completed", "declined", "abandoned"])(
    "drops %s from the driver's lists",
    (status) => {
      expect(isDriverActiveTracker(status)).toBe(false);
    },
  );

  // A tracker whose status this build cannot name is still the driver's work;
  // hiding it would strand a trip nobody can see.
  it("keeps a tracker it cannot classify", () => {
    expect(isDriverActiveTracker(null)).toBe(true);
    expect(isDriverActiveTracker("some_future_status")).toBe(true);
  });
});
