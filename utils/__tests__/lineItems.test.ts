import {
  formatCents,
  lineItemLabel,
  lineItemTotalCents,
} from "@/utils/lineItems";

describe("lineItemLabel", () => {
  it("maps every known work_tracker_line_item_type", () => {
    expect(lineItemLabel("hauling")).toBe("Hauling");
    expect(lineItemLabel("deadhead")).toBe("Deadhead");
    expect(lineItemLabel("setup")).toBe("Setup");
    expect(lineItemLabel("teardown")).toBe("Teardown");
    expect(lineItemLabel("maintenance")).toBe("Maintenance");
    expect(lineItemLabel("per_diem")).toBe("Per Diem");
  });

  it("title-cases a type the app has not shipped a label for yet", () => {
    expect(lineItemLabel("fuel_surcharge")).toBe("Fuel Surcharge");
  });

  it("falls back to Other for a missing type", () => {
    expect(lineItemLabel(null)).toBe("Other");
  });
});

describe("formatCents", () => {
  it("renders cents as dollars with two decimals", () => {
    expect(formatCents(45000)).toBe("$450.00");
    expect(formatCents(5)).toBe("$0.05");
  });

  it("treats a missing amount as zero, not as unknown", () => {
    expect(formatCents(null)).toBe("$0.00");
    expect(formatCents(undefined)).toBe("$0.00");
  });

  it("keeps a negative adjustment negative", () => {
    expect(formatCents(-2500)).toBe("-$25.00");
  });
});

describe("lineItemTotalCents", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineItemTotalCents({ qty_decimal: 3, unit_amt_cents: 1500 })).toBe(
      4500,
    );
  });

  it("bills a fractional quantity — 2.5 hours at $19.99 is $49.98", () => {
    expect(lineItemTotalCents({ qty_decimal: 2.5, unit_amt_cents: 1999 })).toBe(
      4998,
    );
  });

  it("rounds float dust out of the cents total", () => {
    // 0.3 * 1000 is 299.99999999999994 in IEEE 754.
    expect(lineItemTotalCents({ qty_decimal: 0.3, unit_amt_cents: 1000 })).toBe(
      300,
    );
  });

  it("is zero when either side is missing", () => {
    expect(
      lineItemTotalCents({ qty_decimal: null, unit_amt_cents: 1500 }),
    ).toBe(0);
    expect(lineItemTotalCents({ qty_decimal: 3, unit_amt_cents: null })).toBe(
      0,
    );
  });
});
