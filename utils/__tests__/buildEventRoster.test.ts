/**
 * The list behind PICKUP / DROP-OFF: every bleacher due at that leg's event,
 * and who is bringing it.
 *
 * A row exists for every bleacher the office booked into the event, whether or
 * not anyone is hauling it yet — "no tracker" is an answer the organiser needs
 * ("nobody is assigned to that one yet"), and dropping the row would silently
 * shorten the list they are counting.
 *
 * Where a bleacher has more than one tracker pointing at the event — a run to
 * storage and then the real delivery — the one closest to the event is the one
 * doing the job. A tracker the driver handed back never beats one that is
 * still live, no matter how close it sits.
 *
 * Bleachers are matched on the ASSIGNED bleacher throughout. The office books
 * an event against `bleacher_uuid`; `actual_bleacher_uuid` is what a driver
 * who could not hitch that trailer grabbed instead — an equivalent unit with
 * its own, unrelated calendar. Matching on it would answer the organiser with
 * a different event's bleachers.
 *
 * Which event a tracker belongs to is no longer resolved here — it is read
 * straight off `pickupEventUuid` / `dropoffEventUuid`, computed server-side
 * (docs/specs/event-bleacher-roster.md section 4). This module only groups
 * and picks among trackers that already carry that answer.
 */

import { buildEventRoster } from "@/utils/eventRoster/buildEventRoster";
import type { FleetTracker, RosterEvent } from "@/utils/eventRoster/buildEventRoster";

const EVENT: RosterEvent = {
  id: "event-1",
  eventName: "County Fair",
  eventStart: "2026-09-20",
  eventEnd: "2026-09-23",
};

const OTHER_EVENT: RosterEvent = {
  id: "event-2",
  eventName: "Rodeo",
  eventStart: "2026-10-30",
  eventEnd: "2026-10-31",
};

const tracker = (over: Partial<FleetTracker> & { id: string }): FleetTracker => ({
  bleacherUuid: "b1",
  date: "2026-09-19",
  status: "dest_dropoff",
  statusChangedAt: "2026-09-19T12:00:00Z",
  pickupEventUuid: null,
  dropoffEventUuid: null,
  ...over,
});

const build = (over: Partial<Parameters<typeof buildEventRoster>[0]> = {}) =>
  buildEventRoster({
    leg: "dropoff",
    event: EVENT,
    bleachers: [{ uuid: "b1", number: 12 }],
    trackers: [],
    myTrackerId: "mine",
    ...over,
  });

describe("buildEventRoster", () => {
  it("lists a bleacher nobody is hauling yet", () => {
    expect(build()).toEqual([{ bleacherUuid: "b1", number: 12, tracker: null, isMine: false }]);
  });

  it("puts the tracker delivering into this event on its bleacher's row", () => {
    const delivery = tracker({ id: "t1", dropoffEventUuid: EVENT.id });

    expect(build({ trackers: [delivery] })[0].tracker).toBe(delivery);
  });

  it("leaves out a tracker that belongs to a different event", () => {
    const elsewhere = tracker({ id: "t1", date: "2026-10-29", dropoffEventUuid: OTHER_EVENT.id });

    const rows = build({ trackers: [elsewhere] });

    expect(rows[0].tracker).toBeNull();
  });

  it("leaves out a tracker with no resolved event at all (a run to storage)", () => {
    const storageRun = tracker({ id: "t1", dropoffEventUuid: null });

    const rows = build({ trackers: [storageRun] });

    expect(rows[0].tracker).toBeNull();
  });

  it("prefers the trip closest to the event over an earlier one", () => {
    const toStorage = tracker({ id: "storage", date: "2026-09-10", dropoffEventUuid: EVENT.id });
    const delivery = tracker({ id: "delivery", date: "2026-09-19", dropoffEventUuid: EVENT.id });

    expect(build({ trackers: [toStorage, delivery] })[0].tracker).toBe(delivery);
  });

  it("prefers a live tracker over one the driver handed back", () => {
    const abandoned = tracker({
      id: "gone",
      date: "2026-09-19",
      status: "abandoned",
      dropoffEventUuid: EVENT.id,
    });
    const reassigned = tracker({
      id: "live",
      date: "2026-09-18",
      status: "accepted",
      dropoffEventUuid: EVENT.id,
    });

    expect(build({ trackers: [abandoned, reassigned] })[0].tracker).toBe(reassigned);
  });

  it("still shows a handed-back tracker when it is all there is", () => {
    const declined = tracker({ id: "gone", status: "declined", dropoffEventUuid: EVENT.id });

    expect(build({ trackers: [declined] })[0].tracker).toBe(declined);
  });

  it("marks the driver's own trip so the sheet can say which row is theirs", () => {
    const mine = tracker({ id: "mine", dropoffEventUuid: EVENT.id });

    expect(build({ trackers: [mine] })[0].isMine).toBe(true);
  });

  it("keys a row on the bleacher the office assigned", () => {
    // The event is booked against b1, so b1's row is answered by the trip
    // assigned to b1 — whatever trailer that driver ends up hitching. The
    // substitute in `actual_bleacher_uuid` sits on another event's calendar
    // and never reaches this seam at all.
    const assigned = tracker({ id: "t1", bleacherUuid: "b1", dropoffEventUuid: EVENT.id });
    const elsewhere = tracker({ id: "t2", bleacherUuid: "b9", dropoffEventUuid: EVENT.id });

    expect(build({ trackers: [elsewhere, assigned] })[0].tracker).toBe(assigned);
  });

  it("ignores a tracker on a bleacher this event never booked", () => {
    const stranger = tracker({ id: "t1", bleacherUuid: "b7", dropoffEventUuid: EVENT.id });

    expect(build({ trackers: [stranger] })[0].tracker).toBeNull();
  });

  it("orders the list by bleacher number, unnumbered ones last", () => {
    const rows = build({
      bleachers: [
        { uuid: "b3", number: null },
        { uuid: "b2", number: 30 },
        { uuid: "b1", number: 12 },
      ],
    });

    expect(rows.map((row) => row.bleacherUuid)).toEqual(["b1", "b2", "b3"]);
  });

  it("collects after the event on a pick-up leg", () => {
    const collection = tracker({ id: "t1", date: "2026-09-24", pickupEventUuid: EVENT.id });

    const rows = build({ leg: "pickup", trackers: [collection] });

    expect(rows[0].tracker).toBe(collection);
  });

  it("does not confuse a tracker's drop-off event with its pick-up event", () => {
    // A tracker resolved to this event on drop-off must not also show up on a
    // pick-up leg lookup for the same event id, and vice versa.
    const dropoffOnly = tracker({ id: "t1", dropoffEventUuid: EVENT.id, pickupEventUuid: null });

    const rows = build({ leg: "pickup", trackers: [dropoffOnly] });

    expect(rows[0].tracker).toBeNull();
  });
});
