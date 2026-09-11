import { formatAddress, mapsQuery } from "@/utils/formatAddress";

const stPete = {
  street: "7901 4th St N 25767",
  city: "St. Petersburg",
  state_province: "FL",
  zip_postal: "33702",
  country: "United States",
  latitude: 27.8619,
  longitude: -82.6396,
};

describe("formatAddress", () => {
  it("writes the address the way it is put on an envelope", () => {
    expect(formatAddress(stPete)).toBe(
      "7901 4th St N 25767, St. Petersburg, FL 33702",
    );
  });

  it("names the country only when the stop is not domestic", () => {
    expect(formatAddress({ ...stPete, country: "Canada" })).toBe(
      "7901 4th St N 25767, St. Petersburg, FL 33702, Canada",
    );
  });

  it("leaves out the parts an address row does not have", () => {
    expect(
      formatAddress({
        ...stPete,
        zip_postal: null,
        country: null,
      }),
    ).toBe("7901 4th St N 25767, St. Petersburg, FL");
    expect(
      formatAddress({
        ...stPete,
        city: "",
        state_province: "",
        zip_postal: "",
      }),
    ).toBe("7901 4th St N 25767");
  });

  it("has nothing to show without an address", () => {
    expect(formatAddress(null)).toBeNull();
    expect(
      formatAddress({
        street: null,
        city: null,
        state_province: null,
        zip_postal: null,
      }),
    ).toBeNull();
  });
});

describe("mapsQuery", () => {
  it("sends the driver to the geocoded point when the office has one", () => {
    // A geocode beats a string a maps app has to guess at — the same street
    // name exists in every county in Florida.
    expect(mapsQuery(stPete)).toBe("27.8619,-82.6396");
  });

  it("falls back to the written address when there is no geocode", () => {
    expect(mapsQuery({ ...stPete, latitude: null, longitude: null })).toBe(
      "7901 4th St N 25767, St. Petersburg, FL 33702",
    );
  });

  it("has nowhere to send the driver without an address", () => {
    expect(mapsQuery(null)).toBeNull();
  });
});

describe("a street that is already a whole address", () => {
  // Every address the office app saved before it started splitting Google's
  // result kept the entire suggestion in `street`. Adding the city and state
  // back on printed them twice — "303 York St, Kingston, Frontenac County, ON
  // K7K 4M4, Canada, Kingston, Ontario K7K 4M4" on the pending-trips card.
  const legacyKingston = {
    street: "303 York St, Kingston, Frontenac County, ON K7K 4M4, Canada",
    city: "Kingston",
    state_province: "Ontario",
    zip_postal: "K7K 4M4",
    country: "CA",
  };

  it("is shown as it stands, with nothing appended", () => {
    expect(formatAddress(legacyKingston)).toBe(
      "303 York St, Kingston, Frontenac County, ON K7K 4M4, Canada",
    );
  });

  it("does not repeat a country the street already names", () => {
    expect(
      formatAddress({
        street: "Woodbridge Fairground, Porter Ave, Woodbridge, ON, Canada",
        city: "Vaughan",
        state_province: "Ontario",
        zip_postal: "L4L 8W8",
        country: "CA",
      }),
    ).toBe("Woodbridge Fairground, Porter Ave, Woodbridge, ON, Canada");
  });

  it("is recognised by having more than one comma", () => {
    // Two commas is the line between a street and a whole address: a street
    // line may carry one ("Apt 5, 123 Main St"), never two.
    expect(
      formatAddress({
        street: "Apt 5, 123 Main St",
        city: "Springfield",
        state_province: "IL",
        zip_postal: "62701",
      }),
    ).toBe("Apt 5, 123 Main St, Springfield, IL 62701");

    expect(
      formatAddress({
        street: "123 Main St",
        city: "Springfield",
        state_province: "IL",
        zip_postal: "62701",
      }),
    ).toBe("123 Main St, Springfield, IL 62701");
  });

  it("still hands a maps app the geocode when there is one", () => {
    // The heuristic is about what is printed, not about where the driver is
    // sent — coordinates still win.
    expect(
      mapsQuery({ ...legacyKingston, latitude: 44.23, longitude: -76.48 }),
    ).toBe("44.23,-76.48");
    expect(mapsQuery(legacyKingston)).toBe(
      "303 York St, Kingston, Frontenac County, ON K7K 4M4, Canada",
    );
  });
});
