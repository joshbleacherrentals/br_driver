import { formatWorkTrackerTime } from "@/utils/workTrackerTime";

describe("formatWorkTrackerTime", () => {
  it("shows the one time an exact leg is booked for", () => {
    expect(
      formatWorkTrackerTime({
        mode: "exact",
        start: "10:00:00",
        end: "10:00:00",
      }),
    ).toBe("10:00 AM");
  });

  it("shows both ends of a flexible window", () => {
    expect(
      formatWorkTrackerTime({
        mode: "flexible",
        start: "10:00:00",
        end: "12:00:00",
      }),
    ).toBe("10:00 AM - 12:00 PM");
  });

  it("says Any Time when no time was picked", () => {
    expect(
      formatWorkTrackerTime({ mode: "any_time", start: null, end: null }),
    ).toBe("Any Time");
  });

  it("reads midnight and noon the way a clock does", () => {
    expect(
      formatWorkTrackerTime({ mode: "exact", start: "00:15:00", end: null }),
    ).toBe("12:15 AM");
    expect(
      formatWorkTrackerTime({ mode: "exact", start: "12:30:00", end: null }),
    ).toBe("12:30 PM");
    expect(
      formatWorkTrackerTime({ mode: "exact", start: "13:05:00", end: null }),
    ).toBe("01:05 PM");
  });

  it("says Any Time when the mode promises times the row does not have", () => {
    expect(
      formatWorkTrackerTime({ mode: "exact", start: null, end: null }),
    ).toBe("Any Time");
    expect(
      formatWorkTrackerTime({ mode: "flexible", start: "10:00:00", end: null }),
    ).toBe("Any Time");
  });

  it("falls back to the free text a pre-migration row still carries", () => {
    // Rows saved before the structured columns existed have no mode. Their
    // `pickup_time` / `dropoff_time` text is all there is, and it is whatever
    // an office user once typed — "8am", "-", a name.
    expect(
      formatWorkTrackerTime({ mode: null, start: null, end: null }, "8am"),
    ).toBe("8am");
    expect(formatWorkTrackerTime({ mode: null, start: null, end: null })).toBe(
      "Any Time",
    );
  });

  it("prefers the structured columns over the text mirror", () => {
    expect(
      formatWorkTrackerTime(
        { mode: "exact", start: "07:00:00", end: "07:00:00" },
        "stale text",
      ),
    ).toBe("07:00 AM");
  });
});
