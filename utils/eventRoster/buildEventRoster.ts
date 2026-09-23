/**
 * The bleachers due at one leg's event, and who is bringing each of them.
 *
 * The office books bleachers into an event (`BleacherEvents`); which event a
 * tracker itself belongs to is resolved server-side and arrives on
 * `pickupEventUuid` / `dropoffEventUuid` (docs/specs/event-bleacher-roster.md
 * section 4) — this module only groups trackers by that id, one bleacher at a
 * time, and hands the sheet a row per booked bleacher, including the ones
 * nobody has been assigned to yet.
 */

export type TripLeg = "pickup" | "dropoff";

export type RosterEvent = {
  id: string;
  eventName: string | null;
  /** `Events.event_start` — a date, or a timestamp whose time is meaningless. */
  eventStart: string;
  /** `Events.event_end`; null falls back to the start date. */
  eventEnd: string | null;
};

/**
 * The narrow slice of another driver's tracker that reaches a phone — see the
 * `FleetTrackers` rule in br_powersync/config/sync_rules.yaml. No pay, no
 * addresses, no notes.
 */
export type FleetTracker = {
  id: string;
  /**
   * The ASSIGNED bleacher. An event is booked against this one, so this is
   * what the roster matches on — never `actual_bleacher_uuid`, which is the
   * equivalent unit a driver grabbed when they could not hitch the assigned
   * one. That substitute has its own calendar and would answer the organiser
   * with a different event's bleachers.
   */
  bleacherUuid: string | null;
  date: string | null;
  status: string | null;
  statusChangedAt: string | null;
  /** `WorkTrackers.pickup_event_uuid` / `FleetTrackers.pickup_event_uuid` — computed server-side, never inferred on the phone. */
  pickupEventUuid: string | null;
  /** `WorkTrackers.dropoff_event_uuid` / `FleetTrackers.dropoff_event_uuid` — computed server-side, never inferred on the phone. */
  dropoffEventUuid: string | null;
};

export type RosterBleacher = {
  uuid: string;
  number: number | null;
};

export type RosterRow = {
  bleacherUuid: string;
  number: number | null;
  tracker: FleetTracker | null;
  isMine: boolean;
};

export type EventRosterInput = {
  leg: TripLeg;
  event: RosterEvent;
  /** Every bleacher booked into the event. */
  bleachers: RosterBleacher[];
  /** Fleet trackers on those bleachers; anything else is ignored. */
  trackers: FleetTracker[];
  /** The tracker the driver opened the sheet from. */
  myTrackerId: string;
};

/** Work the driver handed back — it happened, but it is not happening. */
const WITHDRAWN = new Set(["declined", "abandoned"]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** How far the trip sits from the event, for picking the one doing the job. */
function distanceToEvent(tracker: FleetTracker, event: RosterEvent, leg: TripLeg): number {
  const trip = Date.parse(`${(tracker.date ?? "").slice(0, 10)}T00:00:00Z`);
  const edge = Date.parse(
    `${(leg === "pickup" ? (event.eventEnd ?? event.eventStart) : event.eventStart).slice(0, 10)}T00:00:00Z`,
  );
  if (Number.isNaN(trip) || Number.isNaN(edge)) return Number.POSITIVE_INFINITY;

  return Math.abs(edge - trip) / MS_PER_DAY;
}

/**
 * The tracker doing this bleacher's job for this event: closest to the event,
 * with live work always beating work that was handed back.
 */
function pickServingTracker(
  candidates: FleetTracker[],
  event: RosterEvent,
  leg: TripLeg,
): FleetTracker | null {
  let best: FleetTracker | null = null;
  let bestKey: [number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];

  for (const candidate of candidates) {
    const key: [number, number] = [
      WITHDRAWN.has(candidate.status ?? "") ? 1 : 0,
      distanceToEvent(candidate, event, leg),
    ];

    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = candidate;
      bestKey = key;
    }
  }

  return best;
}

export function buildEventRoster(input: EventRosterInput): RosterRow[] {
  const { leg, event, bleachers, trackers, myTrackerId } = input;

  const rows = bleachers.map<RosterRow>((bleacher) => {
    const candidates = trackers.filter(
      (candidate) =>
        candidate.bleacherUuid === bleacher.uuid &&
        (leg === "pickup" ? candidate.pickupEventUuid : candidate.dropoffEventUuid) === event.id,
    );

    const tracker = pickServingTracker(candidates, event, leg);

    return {
      bleacherUuid: bleacher.uuid,
      number: bleacher.number,
      tracker,
      isMine: tracker?.id === myTrackerId,
    };
  });

  // Numbered bleachers in order, then the ones the office has not numbered —
  // sorting those to the top would read as bleacher "0".
  return rows.sort((a, b) => {
    if (a.number === null) return b.number === null ? 0 : 1;
    if (b.number === null) return -1;
    return a.number - b.number;
  });
}
