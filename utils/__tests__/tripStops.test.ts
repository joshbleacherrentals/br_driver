import { buildTripStops } from "@/utils/tripStops";

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
  latitude: 27.8619,
  longitude: -82.6396,
};

const tracker = {
  pickup_time: "8am",
  pickup_time_mode: "exact",
  pickup_time_start: "08:00:00",
  pickup_time_end: "08:00:00",
  pickup_poc: "Origin POC",
  pickup_poc_contact_uuid: "contact-pickup",
  pickup_instructions: "Gate code 1234",
  teardown_required: 1,
  dropoff_time: "Any Time",
  dropoff_time_mode: "flexible",
  dropoff_time_start: "13:00:00",
  dropoff_time_end: "15:00:00",
  dropoff_poc: "Site POC",
  dropoff_poc_contact_uuid: "contact-dropoff",
  dropoff_instructions: "Park behind the field house",
  setup_required: 1,
};

const args = { workTracker: tracker, pickupAddress, dropoffAddress };

describe("buildTripStops — a trip", () => {
  const stops = buildTripStops({ kind: "trip", ...args });

  it("is a pick up and a drop off", () => {
    expect(stops.map((s) => s.title)).toEqual(["PICKUP", "DROP-OFF"]);
  });

  it("gives each leg its own time, address, POC and instructions", () => {
    const [pickup, dropoff] = stops;
    expect(pickup.time).toBe("08:00 AM");
    expect(pickup.address).toBe("100 Origin Rd, Tampa, FL 33601");
    expect(pickup.poc).toBe("Origin POC");
    expect(pickup.contactUuid).toBe("contact-pickup");
    expect(pickup.instructionsLabel).toBe("Pickup Instructions");
    expect(dropoff.time).toBe("01:00 PM - 03:00 PM");
    expect(dropoff.address).toBe("7901 4th St N, St. Petersburg, FL 33702");
    expect(dropoff.instructionsLabel).toBe("Drop-off Instructions");
  });

  it("flags the teardown at the pick up and the set up at the drop off", () => {
    expect(stops[0].flag).toBe("Tear Down Required");
    expect(stops[1].flag).toBe("Set Up Required");
  });
});

describe.each(["repair_maintenance", "site_visit_cleaning_other"] as const)(
  "buildTripStops — %s",
  (kind) => {
    const stops = buildTripStops({ kind, ...args });

    it("is one stop, named after neither leg", () => {
      expect(stops).toHaveLength(1);
      expect(stops[0].title).toBe("LOCATION");
      expect(stops[0].instructionsLabel).toBe("Instructions");
    });

    it("is where the bleacher has to be — the drop-off columns", () => {
      expect(stops[0].time).toBe("01:00 PM - 03:00 PM");
      expect(stops[0].address).toBe("7901 4th St N, St. Petersburg, FL 33702");
      expect(stops[0].poc).toBe("Site POC");
      expect(stops[0].contactUuid).toBe("contact-dropoff");
      expect(stops[0].instructions).toBe("Park behind the field house");
    });

    it("has no trailer to tear down or set up", () => {
      expect(stops[0].flag).toBeNull();
    });
  },
);

describe("buildTripStops — opening the stop in maps", () => {
  it("hands maps the geocode when the office picked the stop off a map", () => {
    const [, dropoff] = buildTripStops({ kind: "trip", ...args });
    expect(dropoff.mapsQuery).toBe("27.8619,-82.6396");
  });

  it("says so when a stop has no address at all", () => {
    const [pickup] = buildTripStops({
      kind: "trip",
      workTracker: tracker,
      pickupAddress: null,
      dropoffAddress: null,
    });
    expect(pickup.address).toBe("Address not set");
    expect(pickup.mapsQuery).toBeNull();
  });
});
