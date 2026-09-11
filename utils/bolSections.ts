/**
 * The stop information on a bill of lading.
 *
 * A trip's BOL has two of them side by side: where the trailer comes from and
 * where it goes. Repair / Maintenance and Site Visit / Cleaning / Other work
 * has neither — there is one place the bleacher has to be, at one time, with
 * one set of instructions, so their BOL carries a single **SHIPMENT
 * INFORMATION** block instead, and never asks about teardown or set up.
 *
 * Both the printed PDF and the on-screen sheet render from this one shape, so
 * a driver cannot be shown one thing and hand the customer another.
 */
import { formatAddress, type FormattableAddress } from "@/utils/formatAddress";
import { formatWorkTrackerTime } from "@/utils/workTrackerTime";
import type { WorkTrackerKind } from "@/utils/workTrackerKind";
import { isSingleLeg } from "@/utils/workTrackerKind";

/** What a BOL prints where it has nothing to print. */
export const BOL_BLANK = "—";

export type BolField = { label: string; value: string };
export type BolSection = {
  /** Which block this is, for picking an icon or a heading per surface. */
  key: "pickup" | "dropoff" | "shipment";
  /** The heading as printed on the PDF. */
  title: string;
  fields: BolField[];
};

/** The `WorkTrackers` columns a stop block is built from. */
export type BolWorkTracker = {
  date?: string | null;
  pickup_time?: string | null;
  pickup_time_mode?: string | null;
  pickup_time_start?: string | null;
  pickup_time_end?: string | null;
  pickup_poc?: string | null;
  pickup_instructions?: string | null;
  teardown_required?: number | null;
  dropoff_time?: string | null;
  dropoff_time_mode?: string | null;
  dropoff_time_start?: string | null;
  dropoff_time_end?: string | null;
  dropoff_poc?: string | null;
  dropoff_instructions?: string | null;
  setup_required?: number | null;
};

function text(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : BOL_BLANK;
}

function yesNo(value: number | null | undefined): string {
  if (value === null || value === undefined) return BOL_BLANK;
  return value ? "Yes" : "No";
}

function pickupTime(workTracker: BolWorkTracker): string {
  return formatWorkTrackerTime(
    {
      mode: workTracker.pickup_time_mode,
      start: workTracker.pickup_time_start,
      end: workTracker.pickup_time_end,
    },
    workTracker.pickup_time,
  );
}

function dropoffTime(workTracker: BolWorkTracker): string {
  return formatWorkTrackerTime(
    {
      mode: workTracker.dropoff_time_mode,
      start: workTracker.dropoff_time_start,
      end: workTracker.dropoff_time_end,
    },
    workTracker.dropoff_time,
  );
}

export function buildBolSections(input: {
  kind: WorkTrackerKind;
  workTracker: BolWorkTracker;
  pickupAddress: FormattableAddress | null | undefined;
  dropoffAddress: FormattableAddress | null | undefined;
}): BolSection[] {
  const { kind, workTracker, pickupAddress, dropoffAddress } = input;

  // One leg: the office writes it into the dropoff columns — that is where the
  // bleacher has to be, and the single inspection follows the same leg.
  if (isSingleLeg(kind)) {
    return [
      {
        key: "shipment",
        title: "SHIPMENT INFORMATION",
        fields: [
          { label: "Date:", value: text(workTracker.date) },
          { label: "Time:", value: dropoffTime(workTracker) },
          {
            label: "Address:",
            value: text(formatAddress(dropoffAddress)),
          },
          { label: "POC:", value: text(workTracker.dropoff_poc) },
          {
            label: "Instructions:",
            value: text(workTracker.dropoff_instructions),
          },
        ],
      },
    ];
  }

  return [
    {
      key: "pickup",
      title: "PICKUP INFORMATION (Trailer Origin)",
      fields: [
        { label: "Pick up date:", value: text(workTracker.date) },
        { label: "Pick up time:", value: pickupTime(workTracker) },
        {
          label: "Pick up address:",
          value: text(formatAddress(pickupAddress)),
        },
        {
          label: "On site POC at pick up:",
          value: text(workTracker.pickup_poc),
        },
        {
          label: "Tear Down Required:",
          value: yesNo(workTracker.teardown_required),
        },
        {
          label: "Pick up Instructions:",
          value: text(workTracker.pickup_instructions),
        },
      ],
    },
    {
      key: "dropoff",
      title: "DELIVERY INFORMATION (Trailer Destination)",
      fields: [
        { label: "Delivery date:", value: text(workTracker.date) },
        { label: "Delivery time:", value: dropoffTime(workTracker) },
        {
          label: "Delivery address:",
          value: text(formatAddress(dropoffAddress)),
        },
        {
          label: "On site POC at delivery (Consignee):",
          value: text(workTracker.dropoff_poc),
        },
        {
          label: "Set Up Required:",
          value: yesNo(workTracker.setup_required),
        },
        {
          label: "Delivery Instructions:",
          value: text(workTracker.dropoff_instructions),
        },
      ],
    },
  ];
}
