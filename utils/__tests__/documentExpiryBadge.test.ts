import {
  expiryBadge,
  formatExpiryDate,
  getDocExpiryStatus,
} from "@/utils/documentExpiry";

const TODAY = "2026-08-26";

describe("expiryBadge", () => {
  it("flags a missing expiry date as danger", () => {
    const badge = expiryBadge(null, TODAY);
    expect(badge.status).toBe("missing");
    expect(badge.tone).toBe("danger");
    expect(badge.label).toBe("Expiration date required");
  });

  it("flags an expired document as danger and names the date", () => {
    const badge = expiryBadge("2026-08-12", TODAY);
    expect(badge.status).toBe("expired");
    expect(badge.tone).toBe("danger");
    expect(badge.label).toContain(formatExpiryDate("2026-08-12"));
    expect(badge.label).toMatch(/^Expired /);
  });

  it("counts days for a document expiring inside the warning window", () => {
    const badge = expiryBadge("2026-09-01", TODAY);
    expect(badge.status).toBe("expiring_soon");
    expect(badge.tone).toBe("warning");
    expect(badge.label).toContain("6 days");
    expect(badge.label).toContain(formatExpiryDate("2026-09-01"));
  });

  it("says today / tomorrow instead of a day count at the edges", () => {
    expect(expiryBadge(TODAY, TODAY).label).toContain("Expires today");
    expect(expiryBadge("2026-08-27", TODAY).label).toContain(
      "Expires tomorrow",
    );
  });

  it("stays neutral for a document far from expiring", () => {
    const badge = expiryBadge("2028-08-26", TODAY);
    expect(badge.status).toBe("ok");
    expect(badge.tone).toBe("neutral");
    expect(badge.label).toBe(`Expires ${formatExpiryDate("2028-08-26")}`);
  });

  it("keeps the 30-day warning window boundary", () => {
    expect(getDocExpiryStatus("2026-09-25", TODAY)).toBe("expiring_soon");
    expect(getDocExpiryStatus("2026-09-26", TODAY)).toBe("ok");
  });
});
