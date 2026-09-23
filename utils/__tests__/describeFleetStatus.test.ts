/**
 * What one other bleacher's driver is doing, in words an organiser accepts.
 *
 * The driver reads this line out loud to whoever asked "when are the others
 * coming?", so it says what is physically happening — not the enum name, and
 * not a promise the company has not made. A tracker that is nobody's work
 * right now (declined, abandoned, cancelled, still on offer) says so by
 * sending them to the office; inventing "on the way" for it would be worse
 * than saying nothing.
 *
 * The elapsed time is the other half of the answer: "loading" from four hours
 * ago means something very different from "loading" from four minutes ago.
 */

import {
  describeFleetStatus,
  formatSinceChange,
} from "@/utils/eventRoster/describeFleetStatus";

const NOW = Date.parse("2026-09-21T15:00:00Z");

describe("describeFleetStatus", () => {
  it("says the driver has the work but has not set off", () => {
    expect(describeFleetStatus("accepted").label).toBe(
      "Waiting for the driver to start",
    );
  });

  it("says the driver is driving to the pick up", () => {
    expect(describeFleetStatus("dest_pickup").label).toBe(
      "On the way to pick it up",
    );
  });

  it("says the bleacher is being loaded", () => {
    expect(describeFleetStatus("pickup_inspection").label).toBe(
      "Loading the bleacher",
    );
  });

  it("says the driver is driving to the drop off", () => {
    expect(describeFleetStatus("dest_dropoff").label).toBe(
      "On the way to drop it off",
    );
  });

  it("says the bleacher is being unloaded on site", () => {
    expect(describeFleetStatus("dropoff_inspection").label).toBe(
      "Unloading on site",
    );
  });

  it("says a finished trip delivered the bleacher", () => {
    expect(describeFleetStatus("completed").label).toBe("Delivered");
  });

  it.each(["released", "declined", "abandoned", "cancelled", "draft"])(
    "sends the driver to the office for %s",
    (status) => {
      expect(describeFleetStatus(status).label).toBe(
        "Ask the office for an update",
      );
    },
  );

  it("sends the driver to the office when no tracker exists at all", () => {
    expect(describeFleetStatus(null).label).toBe("Ask the office for an update");
  });

  it("sends the driver to the office for a status this build cannot name", () => {
    expect(describeFleetStatus("teleported").label).toBe(
      "Ask the office for an update",
    );
  });

  it("marks work under way apart from work that is nobody's", () => {
    expect(describeFleetStatus("dest_dropoff").tone).toBe("active");
    expect(describeFleetStatus("completed").tone).toBe("done");
    expect(describeFleetStatus("declined").tone).toBe("unknown");
  });
});

describe("formatSinceChange", () => {
  it("has nothing to say without a timestamp", () => {
    expect(formatSinceChange(null, NOW)).toBeNull();
  });

  it("reads a change under a minute old as just now", () => {
    expect(formatSinceChange("2026-09-21T14:59:30Z", NOW)).toBe("just now");
  });

  it("counts whole minutes within the hour", () => {
    expect(formatSinceChange("2026-09-21T14:48:00Z", NOW)).toBe("12 min ago");
  });

  it("counts hours and minutes within the day", () => {
    expect(formatSinceChange("2026-09-21T11:45:00Z", NOW)).toBe("3 h 15 min ago");
  });

  it("drops the minutes on a whole number of hours", () => {
    expect(formatSinceChange("2026-09-21T13:00:00Z", NOW)).toBe("2 h ago");
  });

  it("counts days once it is older than a day", () => {
    expect(formatSinceChange("2026-09-19T15:00:00Z", NOW)).toBe("2 days ago");
  });

  it("says one day in the singular", () => {
    expect(formatSinceChange("2026-09-20T14:00:00Z", NOW)).toBe("1 day ago");
  });

  it("treats a timestamp from the future as just now", () => {
    expect(formatSinceChange("2026-09-21T15:05:00Z", NOW)).toBe("just now");
  });

  it("has nothing to say about a timestamp it cannot read", () => {
    expect(formatSinceChange("whenever", NOW)).toBeNull();
  });
});
