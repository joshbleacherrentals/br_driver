import {
  isSingleLeg,
  resolveWorkTrackerKind,
  tripHasInspections,
  workTrackerKind,
} from "@/utils/workTrackerKind";

describe("workTrackerKind", () => {
  it("reads the three kinds off the type row's code", () => {
    expect(workTrackerKind("trip")).toBe("trip");
    expect(workTrackerKind("repair_maintenance")).toBe("repair_maintenance");
    expect(workTrackerKind("site_visit_cleaning_other")).toBe(
      "site_visit_cleaning_other",
    );
  });

  it("treats a tracker with no type as a trip", () => {
    // Rows created before WorkTrackerTypes existed, and rows whose type row
    // has not reached the phone yet, still have to render as something. A
    // trip is the two-leg shape the app has always drawn.
    expect(workTrackerKind(null)).toBe("trip");
    expect(workTrackerKind(undefined)).toBe("trip");
  });

  it("treats a code the app does not know as a trip", () => {
    expect(workTrackerKind("deadhead")).toBe("trip");
  });
});

describe("isSingleLeg", () => {
  it("is two legs for a trip — a pick up and a drop off", () => {
    expect(isSingleLeg("trip")).toBe(false);
  });

  it("is one leg for repair and site-visit work", () => {
    expect(isSingleLeg("repair_maintenance")).toBe(true);
    expect(isSingleLeg("site_visit_cleaning_other")).toBe(true);
  });
});

describe("resolveWorkTrackerKind", () => {
  const types = [
    { id: "type-trip", code: "trip" },
    { id: "type-repair", code: "repair_maintenance" },
    { id: "type-site", code: "site_visit_cleaning_other" },
    { id: "type-retired", code: null },
  ];

  it("looks the tracker's type up by uuid and reads its code", () => {
    expect(resolveWorkTrackerKind("type-repair", types)).toBe(
      "repair_maintenance",
    );
    expect(resolveWorkTrackerKind("type-site", types)).toBe(
      "site_visit_cleaning_other",
    );
  });

  it("is a trip when the type row has no code of its own", () => {
    // The retired types ("Deadhead", "Hotel/ Per Diem", …) were never given a
    // code. A tracker still pointing at one is drawn the way it always was.
    expect(resolveWorkTrackerKind("type-retired", types)).toBe("trip");
  });

  it("is a trip while the types table has not reached the phone", () => {
    expect(resolveWorkTrackerKind("type-repair", [])).toBe("trip");
    expect(resolveWorkTrackerKind("type-repair", undefined)).toBe("trip");
    expect(resolveWorkTrackerKind(null, types)).toBe("trip");
  });
});

describe("tripHasInspections", () => {
  it("inspects a trip at both ends", () => {
    expect(tripHasInspections("trip")).toBe(true);
  });

  it("does not inspect a repair or a site visit at all", () => {
    // Nothing is being hauled: the driver goes to the bleacher where it
    // stands, works on it, and leaves. There is no handover to document.
    expect(tripHasInspections("repair_maintenance")).toBe(false);
    expect(tripHasInspections("site_visit_cleaning_other")).toBe(false);
  });
});

describe("resolveWorkTrackerKind — before the types table arrives", () => {
  // The three live type rows, from production. A phone that has the trackers
  // but not yet the tiny reference table they point at would otherwise draw
  // every repair and site visit as a two-leg haul with an inspection.
  it("knows the three live types by uuid alone", () => {
    expect(
      resolveWorkTrackerKind("42726bce-e191-45b1-8082-c297a9ca128a", []),
    ).toBe("repair_maintenance");
    expect(
      resolveWorkTrackerKind("cbffa6a5-d397-48d3-8bda-c50c6dfe0151", null),
    ).toBe("site_visit_cleaning_other");
    expect(
      resolveWorkTrackerKind("e3c00371-897d-4a80-93da-66f374deaa2d", []),
    ).toBe("trip");
  });

  it("lets the synced row win over the built-in fallback", () => {
    expect(
      resolveWorkTrackerKind("42726bce-e191-45b1-8082-c297a9ca128a", [
        { id: "42726bce-e191-45b1-8082-c297a9ca128a", code: "trip" },
      ]),
    ).toBe("trip");
  });
});
