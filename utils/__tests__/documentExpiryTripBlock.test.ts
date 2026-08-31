import {
  blocksTripDate,
  formatExpiryDate,
  tripBlockLabel,
} from "@/utils/documentExpiry";

describe("blocksTripDate", () => {
  it("blocks a document that runs out before the trip", () => {
    expect(blocksTripDate("2026-09-27", "2026-10-22")).toBe(true);
  });

  it("allows a document that is still valid on the trip day itself", () => {
    expect(blocksTripDate("2026-10-22", "2026-10-22")).toBe(false);
    expect(blocksTripDate("2027-01-01", "2026-10-22")).toBe(false);
  });

  it("blocks when there is no expiry date at all", () => {
    expect(blocksTripDate(null, "2026-10-22")).toBe(true);
  });

  it("blocks nothing when there is no trip to check against", () => {
    expect(blocksTripDate("2026-09-27", null)).toBe(false);
    expect(blocksTripDate(null, null)).toBe(false);
  });
});

describe("tripBlockLabel", () => {
  it("names both dates so the gap is obvious", () => {
    const label = tripBlockLabel("2026-09-27", "2026-10-22");
    expect(label).toContain(formatExpiryDate("2026-09-27"));
    expect(label).toContain(formatExpiryDate("2026-10-22"));
    expect(label).toContain("this trip");
  });

  it("asks for the date when the document has none", () => {
    expect(tripBlockLabel(null, "2026-10-22")).toBe(
      "Expiration date required to accept this trip",
    );
  });
});
