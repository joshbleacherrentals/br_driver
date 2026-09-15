import { buildBolSections } from "@/utils/bolSections";

const pickupAddress = {
  street: "100 Origin Rd",
  city: "Tampa",
  state_province: "FL",
  zip_postal: "33601",
};

const dropoffAddress = {
  street: "7901 4th St N",
  city: "St. Petersburg",
  state_province: "FL",
  zip_postal: "33702",
};

const tracker = {
  date: "2026-09-09",
  pickup_time: "8am",
  pickup_time_mode: "exact",
  pickup_time_start: "08:00:00",
  pickup_time_end: "08:00:00",
  pickup_poc: "Origin POC",
  pickup_instructions: "Gate code 1234",
  teardown_required: 1,
  dropoff_time: "Any Time",
  dropoff_time_mode: "any_time",
  dropoff_time_start: null,
  dropoff_time_end: null,
  dropoff_poc: "Site POC",
  dropoff_instructions: "Park behind the field house",
  setup_required: 0,
};

const labelsOf = (fields: { label: string; value: string }[]) =>
  fields.map((f) => f.label);

describe("buildBolSections — a trip", () => {
  const sections = buildBolSections({
    kind: "trip",
    workTracker: tracker,
    pickupAddress,
    dropoffAddress,
  });

  it("has an origin and a destination", () => {
    expect(sections.map((s) => s.title)).toEqual([
      "PICKUP INFORMATION (Trailer Origin)",
      "DELIVERY INFORMATION (Trailer Destination)",
    ]);
  });

  it("keeps both legs' own times, addresses and instructions", () => {
    const [pickup, delivery] = sections;
    expect(pickup.fields).toContainEqual({
      label: "Pick up time:",
      value: "08:00 AM",
    });
    expect(pickup.fields).toContainEqual({
      label: "Pick up address:",
      value: "100 Origin Rd, Tampa, FL 33601",
    });
    expect(pickup.fields).toContainEqual({
      label: "Tear Down Required:",
      value: "Yes",
    });
    expect(delivery.fields).toContainEqual({
      label: "Delivery time:",
      value: "Any Time",
    });
    expect(delivery.fields).toContainEqual({
      label: "Set Up Required:",
      value: "No",
    });
  });
});

describe.each(["repair_maintenance", "site_visit_cleaning_other"] as const)(
  "buildBolSections — %s",
  (kind) => {
    const sections = buildBolSections({
      kind,
      workTracker: tracker,
      pickupAddress,
      dropoffAddress,
    });

    it("is one shipment, not a pick up and a drop off", () => {
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe("SHIPMENT INFORMATION");
    });

    it("asks for the date, time, address, POC and instructions — once", () => {
      expect(labelsOf(sections[0].fields)).toEqual([
        "Date:",
        "Time:",
        "Address:",
        "POC:",
        "Instructions:",
      ]);
    });

    it("takes that one leg from where the office writes it — the drop off", () => {
      expect(sections[0].fields).toContainEqual({
        label: "Address:",
        value: "7901 4th St N, St. Petersburg, FL 33702",
      });
      expect(sections[0].fields).toContainEqual({
        label: "POC:",
        value: "Site POC",
      });
      expect(sections[0].fields).toContainEqual({
        label: "Instructions:",
        value: "Park behind the field house",
      });
    });

    it("never asks a repair or a site visit about teardown or set up", () => {
      const labels = labelsOf(sections[0].fields).join(" ");
      expect(labels).not.toMatch(/Tear Down|Set Up/);
    });
  },
);

describe("buildBolSections — missing data", () => {
  it("dashes anything the tracker does not have", () => {
    const [shipment] = buildBolSections({
      kind: "repair_maintenance",
      workTracker: {
        ...tracker,
        date: null,
        dropoff_poc: null,
        dropoff_instructions: null,
      },
      pickupAddress: null,
      dropoffAddress: null,
    });

    expect(shipment.fields).toContainEqual({ label: "Date:", value: "—" });
    expect(shipment.fields).toContainEqual({ label: "Address:", value: "—" });
    expect(shipment.fields).toContainEqual({ label: "POC:", value: "—" });
    expect(shipment.fields).toContainEqual({
      label: "Instructions:",
      value: "—",
    });
  });
});
