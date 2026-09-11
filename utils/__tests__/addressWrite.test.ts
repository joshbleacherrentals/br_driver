import { addressFieldsFor } from "@/utils/addressWrite";

const pick = {
  address: "123 Main Street",
  formatted: "123 Main Street, Springfield, IL 62701, USA",
  city: "Springfield",
  state: "Illinois",
  postalCode: "62701",
  country: "US",
  lat: 39.7817,
  lng: -89.6501,
  placeId: "place-abc",
};

describe("addressFieldsFor", () => {
  it("writes every column for a place picked off the dropdown", () => {
    expect(addressFieldsFor(pick, pick.formatted)).toEqual({
      street: "123 Main Street",
      city: "Springfield",
      state_province: "Illinois",
      zip_postal: "62701",
      country: "US",
      latitude: 39.7817,
      longitude: -89.6501,
      place_id: "place-abc",
    });
  });

  it("stores the street line, never the full formatted address", () => {
    // formatAddress() puts the city, state and zip back on at render time.
    expect(addressFieldsFor(pick, pick.formatted)?.street).toBe(
      "123 Main Street",
    );
  });

  it("nulls the parts a picked place genuinely lacks", () => {
    expect(
      addressFieldsFor({ address: "Lincoln Park" }, "Lincoln Park"),
    ).toEqual({
      street: "Lincoln Park",
      city: null,
      state_province: null,
      zip_postal: null,
      country: null,
      latitude: null,
      longitude: null,
      place_id: null,
    });
  });

  it("keeps a zero coordinate rather than reading it as missing", () => {
    const nullIsland = { ...pick, lat: 0, lng: 0 };
    const fields = addressFieldsFor(nullIsland, nullIsland.formatted);
    expect(fields?.latitude).toBe(0);
    expect(fields?.longitude).toBe(0);
  });

  describe("text typed without ever picking a place", () => {
    // There is no city, country or geocode to be had — and the columns that
    // already hold one must not be blanked, so only `street` is written.
    it("writes the street line alone", () => {
      expect(addressFieldsFor(null, "42 Some Road")).toEqual({
        street: "42 Some Road",
      });
    });

    it("trims it", () => {
      expect(addressFieldsFor(null, "  42 Some Road  ")).toEqual({
        street: "42 Some Road",
      });
    });
  });

  describe("an address the driver never touched", () => {
    // Null means "write nothing": editing only a phone number must leave the
    // stored address, and its geocode, exactly as they are.
    it("is null for empty or whitespace-only text with no pick", () => {
      expect(addressFieldsFor(null, "")).toBeNull();
      expect(addressFieldsFor(null, "   ")).toBeNull();
    });
  });

  it("prefers the pick over the text still sitting in the field", () => {
    expect(addressFieldsFor(pick, "half-typed nonsense")?.street).toBe(
      "123 Main Street",
    );
  });
});
