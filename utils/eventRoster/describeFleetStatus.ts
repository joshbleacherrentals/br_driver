/**
 * One other bleacher's line in the event roster: what its driver is doing,
 * and how long ago that changed.
 *
 * The wording is the driver's answer to an organiser standing in front of
 * them, so it describes the physical work rather than the tracker's enum. A
 * status that is not work in progress — an offer nobody took, a withdrawal, a
 * cancellation, or anything this build does not recognise — deliberately
 * promises nothing and points at the office instead.
 */

const OFFICE = "Ask the office for an update";

export type FleetStatusTone = "active" | "done" | "unknown";

export type FleetStatusDescription = {
  label: string;
  tone: FleetStatusTone;
};

const DESCRIPTIONS: Record<string, FleetStatusDescription> = {
  accepted: { label: "Waiting for the driver to start", tone: "active" },
  dest_pickup: { label: "On the way to pick it up", tone: "active" },
  pickup_inspection: { label: "Loading the bleacher", tone: "active" },
  dest_dropoff: { label: "On the way to drop it off", tone: "active" },
  dropoff_inspection: { label: "Unloading on site", tone: "active" },
  completed: { label: "Delivered", tone: "done" },
};

export function describeFleetStatus(
  status: string | null | undefined,
): FleetStatusDescription {
  if (!status) return { label: OFFICE, tone: "unknown" };

  return DESCRIPTIONS[status] ?? { label: OFFICE, tone: "unknown" };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Elapsed time since the status changed, rounded the way someone says it out
 * loud. A clock skew that puts the change in the future reads as "just now" —
 * the alternative is a negative count that looks like a bug.
 */
export function formatSinceChange(
  changedAt: string | null | undefined,
  now: number,
): string | null {
  if (!changedAt) return null;

  const at = Date.parse(changedAt);
  if (Number.isNaN(at)) return null;

  const elapsed = now - at;
  if (elapsed < MINUTE) return "just now";

  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    const minutes = Math.floor((elapsed % HOUR) / MINUTE);
    return minutes === 0 ? `${hours} h ago` : `${hours} h ${minutes} min ago`;
  }

  const days = Math.floor(elapsed / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
