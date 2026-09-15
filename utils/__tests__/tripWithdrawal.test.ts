/**
 * Which way out of a tracker the driver is offered, if any.
 *
 * A driver can step away from a tracker at two different moments, and they are
 * not the same act:
 *
 *  - *Decline* — the office offered the trip and the driver never took it on.
 *    Only `released` trackers are in that state; they live in Pending Trips.
 *  - *Abandon* — the driver took it on and cannot finish it. That covers
 *    everything from `accepted` through the last leg, whether or not they have
 *    already driven anywhere.
 *
 * Everything else offers no way out: a `draft` is not the driver's to see, a
 * `completed` trip is done, and a trip already `cancelled`, `declined` or
 * `abandoned` has nothing left to withdraw from. Returning `null` there is
 * what keeps the button off those cards.
 */

import { withdrawalActionFor } from "@/utils/tripWithdrawal";

describe("withdrawalActionFor", () => {
  it("offers Decline only while the trip is still an unaccepted offer", () => {
    expect(withdrawalActionFor("released")).toBe("decline");
  });

  it("offers Abandon from acceptance through every leg of the work", () => {
    expect(withdrawalActionFor("accepted")).toBe("abandon");
    expect(withdrawalActionFor("dest_pickup")).toBe("abandon");
    expect(withdrawalActionFor("pickup_inspection")).toBe("abandon");
    expect(withdrawalActionFor("dest_dropoff")).toBe("abandon");
    expect(withdrawalActionFor("dropoff_inspection")).toBe("abandon");
  });

  it("offers nothing on a tracker the driver cannot step away from", () => {
    expect(withdrawalActionFor("draft")).toBeNull();
    expect(withdrawalActionFor("completed")).toBeNull();
    expect(withdrawalActionFor("cancelled")).toBeNull();
    expect(withdrawalActionFor("declined")).toBeNull();
    expect(withdrawalActionFor("abandoned")).toBeNull();
  });

  // A status this build has never heard of is not a licence to draw a
  // destructive button on the card.
  it("offers nothing on an unknown or absent status", () => {
    expect(withdrawalActionFor(null)).toBeNull();
    expect(withdrawalActionFor(undefined)).toBeNull();
    expect(withdrawalActionFor("some_future_status")).toBeNull();
  });
});
