import { EnrichedWorkTracker, WorkTrackerStatus } from "@/types/workTracker";
import { getTodayAtMidnight, parseLocalDate } from "./dateUtils";

/**
 * Check if a work tracker should be visible to the driver
 * Drafts are never visible
 */
export function isWorkTrackerVisible(tracker: EnrichedWorkTracker): boolean {
  return tracker.status !== "draft";
}

/**
 * Check if a work tracker can be accepted by the driver
 */
export function canAcceptTrip(tracker: EnrichedWorkTracker): boolean {
  return tracker.status === "released";
}

/**
 * Check if a work tracker can be started by the driver
 * Can only start if:
 * 1. Status is 'accepted'
 * 2. Today matches the trip date
 */
export function canStartTrip(tracker: EnrichedWorkTracker): boolean {
  if (tracker.status !== "accepted") return false;
  if (!tracker.date) return false;

  const today = getTodayAtMidnight();
  const tripDate = parseLocalDate(tracker.date);

  return tripDate.getTime() === today.getTime();
}

/**
 * Check if a work tracker is currently in progress
 */
export function isTripInProgress(tracker: EnrichedWorkTracker): boolean {
  return tracker.status === "in_progress";
}

/**
 * Check if the driver is locked into a trip (in trip mode)
 */
export function getActiveTripMode(trackers: EnrichedWorkTracker[]): EnrichedWorkTracker | null {
  return trackers.find(isTripInProgress) || null;
}

/**
 * Format address for display and maps
 */
export function formatAddress(address?: {
  street: string;
  city: string;
  state_province: string;
  zip_postal: string | null;
}): string {
  if (!address) return "";
  return `${address.street}, ${address.city}, ${address.state_province}${
    address.zip_postal ? " " + address.zip_postal : ""
  }`;
}

/**
 * Format payment amount
 */
export function formatPayment(payCents?: number | null): string {
  if (typeof payCents !== "number") return "";
  return `$${(payCents / 100).toFixed(2)}`;
}

/**
 * Get status label for display
 */
export function getStatusLabel(status: WorkTrackerStatus): string {
  const labels: Record<WorkTrackerStatus, string> = {
    draft: "Draft",
    released: "New Trip",
    accepted: "Accepted",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[status];
}

/**
 * Get status color
 */
export function getStatusColor(status: WorkTrackerStatus): string {
  const colors: Record<WorkTrackerStatus, string> = {
    draft: "#999",
    released: "#007AFF",
    accepted: "#34C759",
    in_progress: "#FF9500",
    completed: "#888",
    cancelled: "#FF3B30",
  };
  return colors[status];
}
