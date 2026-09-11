/**
 * The stops on a trip card.
 *
 * A trip has two: a pick up and a drop off, each with its own time, address,
 * POC, flag and instructions. Repair / Maintenance and Site Visit / Cleaning /
 * Other work has one — where the bleacher has to be, when, and what to do
 * there — so its card shows a single stop with none of the pick up / drop off
 * vocabulary, and no teardown or set up flag: there is no trailer being moved.
 *
 * The office writes that single leg into the `dropoff_*` columns, which is
 * also the leg the tracker's one inspection follows.
 *
 * The same shape drives the trip card and the trip-history row, so a driver
 * reading a finished job sees the stops they worked, laid out the way they
 * were laid out on the day.
 */
import { formatAddress, mapsQuery } from "@/utils/formatAddress";
import type { FormattableAddress } from "@/utils/formatAddress";
import { isSingleLeg, type WorkTrackerKind } from "@/utils/workTrackerKind";
import { formatWorkTrackerTime } from "@/utils/workTrackerTime";

/** Shown where a stop has no address on file. */
export const NO_ADDRESS_LABEL = "Address not set";

export type TripStop = {
  /** Stable key — also says which leg's columns the stop was read from. */
  key: "pickup" | "dropoff" | "single";
  /** Section heading, e.g. `PICKUP`. */
  title: string;
  time: string;
  address: string;
  /** What to hand a maps app, or null when there is no stop to open. */
  mapsQuery: string | null;
  poc: string | null;
  contactUuid: string | null;
  /** `Tear Down Required` / `Set Up Required`, when the office asked for it. */
  flag: string | null;
  instructionsLabel: string;
  instructions: string | null;
};

export type TripStopsWorkTracker = {
  pickup_time?: string | null;
  pickup_time_mode?: string | null;
  pickup_time_start?: string | null;
  pickup_time_end?: string | null;
  pickup_poc?: string | null;
  pickup_poc_contact_uuid?: string | null;
  pickup_instructions?: string | null;
  teardown_required?: number | null;
  dropoff_time?: string | null;
  dropoff_time_mode?: string | null;
  dropoff_time_start?: string | null;
  dropoff_time_end?: string | null;
  dropoff_poc?: string | null;
  dropoff_poc_contact_uuid?: string | null;
  dropoff_instructions?: string | null;
  setup_required?: number | null;
};

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildTripStops(input: {
  kind: WorkTrackerKind;
  workTracker: TripStopsWorkTracker;
  pickupAddress: FormattableAddress | null | undefined;
  dropoffAddress: FormattableAddress | null | undefined;
}): TripStop[] {
  const { kind, workTracker, pickupAddress, dropoffAddress } = input;

  const dropoffTime = formatWorkTrackerTime(
    {
      mode: workTracker.dropoff_time_mode,
      start: workTracker.dropoff_time_start,
      end: workTracker.dropoff_time_end,
    },
    workTracker.dropoff_time,
  );

  const dropoffStop = {
    time: dropoffTime,
    address: formatAddress(dropoffAddress) ?? NO_ADDRESS_LABEL,
    mapsQuery: mapsQuery(dropoffAddress),
    poc: text(workTracker.dropoff_poc),
    contactUuid: workTracker.dropoff_poc_contact_uuid ?? null,
    instructions: text(workTracker.dropoff_instructions),
  };

  if (isSingleLeg(kind)) {
    return [
      {
        key: "single",
        title: "LOCATION",
        ...dropoffStop,
        flag: null,
        instructionsLabel: "Instructions",
      },
    ];
  }

  return [
    {
      key: "pickup",
      title: "PICKUP",
      time: formatWorkTrackerTime(
        {
          mode: workTracker.pickup_time_mode,
          start: workTracker.pickup_time_start,
          end: workTracker.pickup_time_end,
        },
        workTracker.pickup_time,
      ),
      address: formatAddress(pickupAddress) ?? NO_ADDRESS_LABEL,
      mapsQuery: mapsQuery(pickupAddress),
      poc: text(workTracker.pickup_poc),
      contactUuid: workTracker.pickup_poc_contact_uuid ?? null,
      flag: workTracker.teardown_required === 1 ? "Tear Down Required" : null,
      instructionsLabel: "Pickup Instructions",
      instructions: text(workTracker.pickup_instructions),
    },
    {
      key: "dropoff",
      title: "DROP-OFF",
      ...dropoffStop,
      flag: workTracker.setup_required === 1 ? "Set Up Required" : null,
      instructionsLabel: "Drop-off Instructions",
    },
  ];
}
