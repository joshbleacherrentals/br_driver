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
  accepted: { label: "Not Started", tone: "active" },
  dest_pickup: { label: "Picking up Bleacher", tone: "active" },
  pickup_inspection: { label: "Picking up Bleacher", tone: "active" },
  dest_dropoff: { label: "On Its Way!", tone: "active" },
  dropoff_inspection: { label: "Arrived", tone: "active" },
  completed: { label: "Delivered", tone: "done" },
};

export type FleetStatusContext = {
  /** When the tracker reached its current status. */
  statusChangedAt?: string | null;
  /** `WorkTrackers.drive_minutes` — the planned length of the drive; 0 or null when unknown. */
  driveMinutes?: number | null;
  /** Injected so the label can be recomputed every minute (and tested). */
  now?: number;
};

const ON_ITS_WAY = "On Its Way!";

/** "5h 32m", "5h", "12m" — the time left, as someone says it out loud. */
export function formatEta(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * The drop-off drive is the one status with a promise attached: the trip's own
 * planned drive time, counted down from the moment the driver set off.
 *
 * - No planned drive time (0 / null): say when they left, promise nothing.
 * - Time left: "ETA: 5h 32m", rounded up so it never reads 0m while still going.
 * - Time ran out and the status never changed: the driver is late or has not
 *   pressed the button, so the honest answer is "soon", not a negative ETA.
 */
function describeOnItsWay(context: FleetStatusContext): string {
  const changedAt = context.statusChangedAt
    ? Date.parse(context.statusChangedAt)
    : Number.NaN;
  if (Number.isNaN(changedAt)) return ON_ITS_WAY;

  const drive = context.driveMinutes ?? 0;
  if (drive <= 0) {
    const left = new Date(changedAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${ON_ITS_WAY} - Left at ${left}`;
  }

  const elapsedMs = Math.max(0, (context.now ?? Date.now()) - changedAt);
  const remaining = Math.ceil(drive - elapsedMs / (60 * 1000));

  return remaining > 0
    ? `${ON_ITS_WAY} - ETA: ${formatEta(remaining)}`
    : "Bleacher will be here soon";
}

export function describeFleetStatus(
  status: string | null | undefined,
  context: FleetStatusContext = {},
): FleetStatusDescription {
  if (!status) return { label: OFFICE, tone: "unknown" };

  if (status === "dest_dropoff") {
    return { label: describeOnItsWay(context), tone: "active" };
  }

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
