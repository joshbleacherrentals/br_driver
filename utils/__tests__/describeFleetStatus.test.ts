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
    expect(describeFleetStatus("accepted").label).toBe("Not Started");
  });

  it("says the driver is picking the bleacher up while driving to it", () => {
    expect(describeFleetStatus("dest_pickup").label).toBe("Picking up Bleacher");
  });

  it("says the driver is picking the bleacher up while loading it", () => {
    expect(describeFleetStatus("pickup_inspection").label).toBe(
      "Picking up Bleacher",
    );
  });

  it("says the bleacher has arrived at the drop off", () => {
    expect(describeFleetStatus("dropoff_inspection").label).toBe("Arrived");
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

  describe("on its way (dest_dropoff)", () => {
    const LEFT = "2026-09-21T14:00:00Z"; // an hour before NOW
    const at = (driveMinutes: number | null, statusChangedAt = LEFT, now = NOW) =>
      describeFleetStatus("dest_dropoff", { statusChangedAt, driveMinutes, now });

    it("counts the planned drive down from when the driver left", () => {
      // 6h 32m drive, 1h gone
      expect(at(392).label).toBe("On Its Way! - ETA: 5h 32m");
    });

    it("shrinks by a minute every minute", () => {
      expect(at(392, LEFT, NOW + 60_000).label).toBe("On Its Way! - ETA: 5h 31m");
    });

    it("drops the hours once under an hour", () => {
      expect(at(100).label).toBe("On Its Way! - ETA: 40m");
    });

    it("drops the minutes on a whole number of hours", () => {
      expect(at(180).label).toBe("On Its Way! - ETA: 2h");
    });

    it("rounds a part minute up so it never reads 0m while still going", () => {
      expect(at(61, LEFT, NOW + 30_000).label).toBe("On Its Way! - ETA: 1m");
    });

    it("keeps the full drive when the clock says they have not left yet", () => {
      expect(at(60, "2026-09-21T15:05:00Z").label).toBe("On Its Way! - ETA: 1h");
    });

    it.each([0, null])("gives the departure time, no ETA, for drive_minutes %s", (drive) => {
      const label = at(drive).label;
      expect(label).toMatch(/^On Its Way! - Left at /);
      expect(label).not.toContain("ETA");
    });

    it("says it will be here soon once the drive time has run out", () => {
      expect(at(60).label).toBe("Bleacher will be here soon");
      expect(at(30).label).toBe("Bleacher will be here soon");
    });

    it("falls back to the plain label with no usable timestamp", () => {
      expect(at(60, "whenever").label).toBe("On Its Way!");
      expect(describeFleetStatus("dest_dropoff").label).toBe("On Its Way!");
    });

    it("stays active tone in every case", () => {
      expect(at(30).tone).toBe("active");
      expect(at(0).tone).toBe("active");
    });
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
