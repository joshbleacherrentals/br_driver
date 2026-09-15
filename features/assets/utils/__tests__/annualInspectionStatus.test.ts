/**
 * Where a bleacher stands on its annual inspection.
 *
 * A bleacher whose inspection has lapsed should not be on the road, and the
 * driver hitching it is the last person who can notice. So the status is
 * phrased as a countdown rather than a date — "Overdue by 5 days" is something
 * you act on; "Due 2026-09-09" is something you have to do arithmetic on in a
 * yard, in the rain.
 */

import { annualInspectionStatus } from "@/features/assets/utils/annualInspectionStatus";

const TODAY = "2026-09-14";

describe("annualInspectionStatus", () => {
  it("says so plainly when there is no inspection on record", () => {
    const status = annualInspectionStatus(null, TODAY);

    expect(status.tone).toBe("missing");
    expect(status.headline).toBe("Not on file");
    expect(status.dueLabel).toBe("—");
    expect(status.inspectedLabel).toBe("—");
  });

  it("counts down the days while the inspection is still comfortably in hand", () => {
    const status = annualInspectionStatus(
      { inspected_on: "2025-12-01", next_due_on: "2026-12-01" },
      TODAY,
    );

    expect(status.tone).toBe("ok");
    expect(status.headline).toBe("Due in 78 days");
  });

  it("raises its voice inside the last month", () => {
    const status = annualInspectionStatus(
      { inspected_on: "2025-10-01", next_due_on: "2026-10-01" },
      TODAY,
    );

    expect(status.tone).toBe("due_soon");
    expect(status.headline).toBe("Due in 17 days");
  });

  it("calls the last day the last day", () => {
    const status = annualInspectionStatus(
      { inspected_on: "2025-09-14", next_due_on: TODAY },
      TODAY,
    );

    expect(status.tone).toBe("due_soon");
    expect(status.headline).toBe("Due today");
  });

  it("says how far past due a lapsed inspection is", () => {
    const status = annualInspectionStatus(
      { inspected_on: "2025-09-09", next_due_on: "2026-09-09" },
      TODAY,
    );

    expect(status.tone).toBe("overdue");
    expect(status.headline).toBe("Overdue by 5 days");
  });

  it("counts a single day as a day, not as days", () => {
    expect(
      annualInspectionStatus(
        { inspected_on: null, next_due_on: "2026-09-13" },
        TODAY,
      ).headline,
    ).toBe("Overdue by 1 day");

    expect(
      annualInspectionStatus(
        { inspected_on: null, next_due_on: "2026-09-15" },
        TODAY,
      ).headline,
    ).toBe("Due in 1 day");
  });

  it("is missing, not overdue, when the record carries no due date at all", () => {
    const status = annualInspectionStatus(
      { inspected_on: "2025-09-09", next_due_on: null },
      TODAY,
    );

    expect(status.tone).toBe("missing");
    expect(status.headline).toBe("Not on file");
  });

  it("still reports the date it was last inspected when one is known", () => {
    const status = annualInspectionStatus(
      { inspected_on: "2025-09-09", next_due_on: null },
      TODAY,
    );

    expect(status.inspectedLabel).not.toBe("—");
    expect(status.dueLabel).toBe("—");
  });
});
