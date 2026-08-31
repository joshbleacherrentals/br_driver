/**
 * Covers: the trip-closed boundary used to decide whether an inspection's
 * photos may still be edited.
 *
 * The values are the Postgres `worktracker_status` enum; only `completed` is
 * terminal for this boundary — `cancelled` trips must remain editable so a
 * driver can still repair a lost photo.
 */

import {
  isTripAccepted,
  isWorkTrackerClosed,
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
