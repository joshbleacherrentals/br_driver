import { formatReleaseDate } from "./formatReleaseDate";

describe("formatReleaseDate", () => {
  it("renders the day that was written, regardless of local timezone", () => {
    expect(formatReleaseDate("2026-09-02")).toBe("September 2, 2026");
  });

  it("returns the raw value when it cannot be parsed", () => {
    expect(formatReleaseDate("not a date")).toBe("not a date");
  });
});
