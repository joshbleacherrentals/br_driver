/**
 * The bleachers due at one end of a trip, and how far along the drivers
 * bringing them are — the data behind the PICKUP / DROP-OFF sheet.
 *
 * Everything here is local: three narrow global tables (`Events`,
 * `BleacherEvents`, `FleetTrackers`) keep the whole roster on the phone, so a
 * driver standing in a field with no signal can still answer "when are the
 * others coming?". See docs/specs/event-bleacher-roster.md.
 *
 * Which event this leg belongs to is no longer inferred here — it is
 * computed server-side and read straight off the caller's own tracker row
 * (`pickup_event_uuid` / `dropoff_event_uuid`, section 4 of the spec). This
 * hook only has to look up that event's own details, everything booked into
 * it, and who else is bringing it.
 */

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import {
  buildEventRoster,
  type FleetTracker,
  type RosterEvent,
  type RosterRow,
  type TripLeg,
} from "@/utils/eventRoster/buildEventRoster";
import { useMemo } from "react";

type EventRow = {
  id: string;
  eventName: string | null;
  eventStart: string | null;
  eventEnd: string | null;
};

type EventBleacherRow = {
  bleacherUuid: string | null;
  bleacherNumber: string | null;
  linxupDeviceId: string | null;
};

export type EventRosterEntry = RosterRow & {
  /** `Bleachers.bleacher_number` — text in this schema, shown as written. */
  bleacherNumber: string | null;
  /** The GPS unit on the trailer, when it has one. */
  linxupDeviceId: string | null;
};

export type EventRoster = {
  /** The event this leg serves, or null when the trip has none. */
  event: RosterEvent | null;
  /** One entry per bleacher booked into the event, ordered by number. */
  entries: EventRosterEntry[];
};

/** Bleacher numbers are text, so "12" must not sort after "3". */
function numericOrNull(value: string | null): number | null {
  const parsed = Number(value);
  return value !== null && value.trim() !== "" && !Number.isNaN(parsed) ? parsed : null;
}

function eventByIdQuery(eventUuid: string) {
  return db
    .selectFrom("Events")
    .select([
      "id",
      "event_name as eventName",
      "event_start as eventStart",
      "event_end as eventEnd",
    ])
    .where("id", "=", eventUuid)
    .compile();
}

function eventBleachersQuery(eventUuid: string) {
  return db
    .selectFrom("BleacherEvents as be")
    .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
    .select([
      "be.bleacher_uuid as bleacherUuid",
      "b.bleacher_number as bleacherNumber",
      "b.linxup_device_id as linxupDeviceId",
    ])
    .where("be.event_uuid", "=", eventUuid)
    .where("b.deleted", "=", 0)
    .compile();
}

/** Which of a tracker's two resolved-event columns this leg reads. */
function legEventColumn(leg: TripLeg) {
  return leg === "pickup" ? ("pickup_event_uuid" as const) : ("dropoff_event_uuid" as const);
}

function trackersQuery(eventUuid: string, leg: TripLeg) {
  return db
    .selectFrom("FleetTrackers")
    .select([
      "id",
      "bleacher_uuid as bleacherUuid",
      "date",
      "status",
      "status_changed_at as statusChangedAt",
      "drive_minutes as driveMinutes",
      "pickup_event_uuid as pickupEventUuid",
      "dropoff_event_uuid as dropoffEventUuid",
    ])
    .where(legEventColumn(leg), "=", eventUuid)
    .compile();
}

/**
 * @param eventUuid    the tracker's own `pickup_event_uuid` / `dropoff_event_uuid`
 *                     for this leg — `null` means no event resolved (a run to
 *                     storage), and the sheet never opens for it
 * @param myTrackerId  the tracker the sheet was opened from
 */
export function useEventRoster(
  leg: TripLeg,
  eventUuid: string | null,
  myTrackerId: string,
): EventRoster {
  // ── 1. The event's own name and dates, for the sheet header ───────────────
  const eventRows = useTypedQuery(
    useMemo(() => (eventUuid ? eventByIdQuery(eventUuid) : null), [eventUuid]),
    expect<EventRow>(),
  );

  const event = useMemo<RosterEvent | null>(() => {
    const row = eventRows.data?.[0];
    if (!row || !row.eventStart) return null;

    return {
      id: row.id,
      eventName: row.eventName,
      eventStart: row.eventStart,
      eventEnd: row.eventEnd,
    };
  }, [eventRows.data]);

  // ── 2. Everything the office booked into that event ───────────────────────
  const eventBleachers = useTypedQuery(
    useMemo(() => (event ? eventBleachersQuery(event.id) : null), [event]),
    expect<EventBleacherRow>(),
  );

  const bleacherUuids = useMemo(
    () =>
      (eventBleachers.data ?? [])
        .map((row) => row.bleacherUuid)
        .filter((uuid): uuid is string => !!uuid),
    [eventBleachers.data],
  );

  // ── 3. Every tracker already resolved to this event on this leg ───────────
  const trackers = useTypedQuery(
    useMemo(() => (event ? trackersQuery(event.id, leg) : null), [event, leg]),
    expect<FleetTracker>(),
  );

  return useMemo(() => {
    if (!event) return { event: null, entries: [] };

    const bleachersByUuid = new Map(
      (eventBleachers.data ?? []).map((row) => [row.bleacherUuid, row]),
    );

    const rows = buildEventRoster({
      leg,
      event,
      bleachers: bleacherUuids.map((uuid) => ({
        uuid,
        number: numericOrNull(bleachersByUuid.get(uuid)?.bleacherNumber ?? null),
      })),
      trackers: [...(trackers.data ?? [])],
      myTrackerId,
    });

    return {
      event,
      entries: rows.map((row) => ({
        ...row,
        bleacherNumber: bleachersByUuid.get(row.bleacherUuid)?.bleacherNumber ?? null,
        linxupDeviceId: bleachersByUuid.get(row.bleacherUuid)?.linxupDeviceId ?? null,
      })),
    };
  }, [event, leg, myTrackerId, bleacherUuids, eventBleachers.data, trackers.data]);
}
