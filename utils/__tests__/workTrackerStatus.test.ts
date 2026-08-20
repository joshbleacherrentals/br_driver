/**
 * Covers: the trip-closed boundary used to decide whether an inspection's
 * photos may still be edited.
 *
 * The values are the Postgres `worktracker_status` enum; only `completed` is
 * terminal for this boundary — `cancelled` trips must remain editable so a
 * driver can still repair a lost photo.
 */

import { isWorkTrackerClosed } from "@/utils/workTrackerStatus";

describe("trip closed boundary", () => {
  it.each(["completed"])("treats %s as closed", (status) => {
    expect(isWorkTrackerClosed(status)).toBe(true);
  });

  it.each([
    "draft",
    "released",
    "accepted",
    "dest_pickup",
    "pickup_inspection",
    "dest_dropoff",
    "dropoff_inspection",
    "cancelled",
  ])("treats %s as still open", (status) => {
    expect(isWorkTrackerClosed(status)).toBe(false);
  });

  // A status we cannot classify is not evidence the trip ended — defaulting to
  // "closed" would silently withdraw the driver's only way to fix a lost photo.
  it("treats an unknown or absent status as open", () => {
    expect(isWorkTrackerClosed(null)).toBe(false);
    expect(isWorkTrackerClosed(undefined)).toBe(false);
    expect(isWorkTrackerClosed("something_new")).toBe(false);
  });
});
