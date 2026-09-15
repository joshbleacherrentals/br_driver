import {
  parseGoogleAddressComponents,
  type GoogleAddressComponent,
} from "@/utils/parseGoogleAddress";

const comp = (
  long_name: string,
  types: string[],
  short_name = long_name,
): GoogleAddressComponent => ({ long_name, short_name, types });

const springfield: GoogleAddressComponent[] = [
  comp("123", ["street_number"]),
  comp("Main Street", ["route"]),
  comp("Springfield", ["locality", "political"]),
  comp("Illinois", ["administrative_area_level_1"], "IL"),
  comp("62701", ["postal_code"]),
  comp("United States", ["country", "political"], "US"),
];

describe("parseGoogleAddressComponents", () => {
  it("saves the street line alone, not the whole formatted address", () => {
    // `street` is one part of an address now — formatAddress() adds the city,
    // state and zip back on. Storing the full suggestion here would print
    // them twice.
    expect(parseGoogleAddressComponents(springfield, "ignored").address).toBe(
      "123 Main Street",
    );
  });

  it("pulls out city, state and postal code", () => {
    const parsed = parseGoogleAddressComponents(springfield, "ignored");
    expect(parsed.city).toBe("Springfield");
    expect(parsed.state).toBe("Illinois");
    expect(parsed.postalCode).toBe("62701");
  });

  it("takes country as the ISO-2 short name, not the long one", () => {
    expect(parseGoogleAddressComponents(springfield, "x").country).toBe("US");
    expect(
      parseGoogleAddressComponents(
        [comp("Canada", ["country", "political"], "CA")],
        "x",
      ).country,
    ).toBe("CA");
  });

  it("falls back to the suggestion text when a place has no street number and route", () => {
    // A park, a business, a named property — better the full suggestion than
    // an empty street.
    const park = [
      comp("Lincoln Park", ["park", "establishment"]),
      comp("Chicago", ["locality"]),
    ];
    expect(
      parseGoogleAddressComponents(park, "Lincoln Park, Chicago, IL, USA")
        .address,
    ).toBe("Lincoln Park, Chicago, IL, USA");
  });

  it("falls through coarser components rather than leaving city blank", () => {
    // A rural or business-only result may carry no `locality`; saving a county
    // as the city is how this went wrong before.
    const rural = [
      comp("1", ["street_number"]),
      comp("County Road 5", ["route"]),
      comp("Ashford", ["postal_town"]),
    ];
    expect(parseGoogleAddressComponents(rural, "x").city).toBe("Ashford");

    const sub = [comp("Brooklyn", ["sublocality", "political"])];
    expect(parseGoogleAddressComponents(sub, "x").city).toBe("Brooklyn");
  });

  it("leaves out what the place does not have", () => {
    const parsed = parseGoogleAddressComponents([], "12 Nowhere Rd");
    expect(parsed.address).toBe("12 Nowhere Rd");
    expect(parsed.city).toBeUndefined();
    expect(parsed.state).toBeUndefined();
    expect(parsed.postalCode).toBeUndefined();
    expect(parsed.country).toBeUndefined();
  });
});
