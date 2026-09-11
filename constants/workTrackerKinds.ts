/**
 * How each kind of work presents itself — one name, one colour, one icon,
 * used everywhere a tracker is drawn (trip card, pending trips, history).
 *
 * The names match what an office user picks in the web app, so a driver
 * phoning in about "a site visit" and the person looking at the same tracker
 * on a screen are talking about the same word.
 */
import type { ThemeColors } from "@/constants/theme";
import type { WorkTrackerKind } from "@/utils/workTrackerKind";
import type { Ionicons } from "@expo/vector-icons";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export const WORK_TRACKER_KIND_LABEL: Record<WorkTrackerKind, string> = {
  trip: "Trip",
  repair_maintenance: "Repair / Maintenance",
  site_visit_cleaning_other: "Site Visit / Cleaning / Other",
};

export const WORK_TRACKER_KIND_ICON: Record<WorkTrackerKind, IoniconName> = {
  trip: "car-outline",
  repair_maintenance: "construct-outline",
  site_visit_cleaning_other: "sparkles-outline",
};

/** The kind's colour in the current theme. */
export function workTrackerKindColor(
  kind: WorkTrackerKind,
  theme: ThemeColors,
): string {
  switch (kind) {
    case "repair_maintenance":
      return theme.trackerRepair;
    case "site_visit_cleaning_other":
      return theme.trackerSiteVisit;
    case "trip":
      return theme.trackerTrip;
  }
}

/**
 * The words on a tracker's buttons.
 *
 * A repair or a site visit is not a "trip" and has no "dropoff": the driver
 * goes to one place, works, and inspects once. Only the two-leg kind gets the
 * pick up / drop off vocabulary.
 */
export type WorkTrackerActionLabels = {
  accept: string;
  start: string;
  arrived: string;
  inspectionTitle: string;
  viewInspection: string;
};

export function workTrackerActionLabels(
  kind: WorkTrackerKind,
): WorkTrackerActionLabels {
  if (kind === "trip") {
    return {
      accept: "Accept Trip",
      start: "Start Trip",
      arrived: "Arrived at Dropoff",
      inspectionTitle: "Dropoff Inspection",
      viewInspection: "View Dropoff Inspection",
    };
  }

  return {
    accept: "Accept Job",
    start: "Start",
    arrived: "Arrived on Site",
    inspectionTitle: "Inspection",
    viewInspection: "View Inspection",
  };
}
